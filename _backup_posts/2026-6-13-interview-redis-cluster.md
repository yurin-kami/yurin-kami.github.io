---
title: "面试笔记：Redis主从、哨兵和Cluster集群怎么选"
date: "2026-6-13"
tags: ["Redis", "集群", "主从复制", "哨兵", "面试", "八股文"]
excerpt: "kami works"
---

### 前情提要

单机 Redis 扛得住高并发读写，但一旦进程挂了或者机器宕机，整个服务就断了。生产环境不可能接受单点故障，所以需要集群方案。Redis 提供了三种递进的集群架构：主从复制、哨兵模式、Cluster 集群，分别解决数据冗余、自动故障转移和水平扩展三个层次的问题。面试中经常一轮追问到底："主从怎么同步数据的？哨兵怎么选主？Cluster 的 16384 个槽什么意思？"这篇笔记把三种方案一次打通。

### 问题

面试官常见的问法：

- "Redis 的集群方案有哪些，各有什么优缺点？"
- "主从复制的全量同步和增量同步是怎么工作的？"
- "哨兵是怎么检测故障并完成选举的？"
- "Cluster 模式为什么要用 16384 个哈希槽，而不是直接 hash 到节点？"

考察的核心是：你是否理解数据同步机制、故障转移流程、以及 Cluster 分片路由的设计思路。

### 回答

#### 1. 主从复制（Replication）

最基础的集群形态。一个 Master 负责读写，多个 Slave 从 Master 同步数据，Slave 可以提供读服务。

```conf
# Slave 配置
replicaof 192.168.1.100 6379
masterauth password
```

**全量同步（SYNC）：** Slave 第一次连接 Master 时触发。Master 执行 `BGSAVE` 在后台生成 RDB 快照，快照期间新的写命令写入 replication buffer。RDB 生成完毕后发送给 Slave，Slave 加载后再重放 buffer 中的增量命令，完成数据对齐。

**增量同步（PSYNC）：** 全量同步完成后进入增量阶段。Master 把每条写命令的 offset 记录在 repl_backlog（一个环形缓冲区）里，Slave 断线重连时发送自己的 offset，Master 判断这个 offset 之后的数据是否还在 backlog 中：在就只补发增量（部分重同步），不在就只能重新全量同步。

```
Master ──写命令──→ repl_backlog（环形缓冲区，默认 1MB）
                    ↑
Slave 断线重连，带上 offset
                    ↓
          offset 还在 → PSYNC 增量补发
          offset 已过 → SYNC 全量重来
```

**特点：**
- 读写分离，Slave 分担读压力
- 数据有副本，可以做灾备
- 不能自动故障转移，Master 挂了需要人工介入

#### 2. 哨兵模式（Sentinel）

在主从复制的基础上加一组 Sentinel 进程，解决"Master 挂了谁来接管"的问题。

```conf
# sentinel.conf
sentinel monitor mymaster 192.168.1.100 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
```

**故障检测：** 每个 Sentinel 每秒向 Master、Slave 和其他 Sentinel 发 PING。如果某个 Sentinel 在 `down-after-milliseconds` 内没收到 Master 的有效回复，就标记为主观下线（SDOWN）。当足够数量（配置中的 quorum）的 Sentinel 都报告 SDOWN，就升级为客观下线（ODOWN）。

**选举与故障转移：** ODL 触发后，Sentinel 之间通过 Raft 类似的方式选举出一个 Leader Sentinel 来执行故障转移。Leader 从 Slave 中选一个提升为新 Master，依据是：优先级 > 复制偏移量最大（数据最新）> runid 字典序最小。选完之后通知其他 Slave 切换到新 Master，旧 Master 恢复后降级为 Slave。

**特点：**
- 自动故障转移，不需要人工干预
- 客户端先连 Sentinel 获取当前 Master 地址，Master 切换后客户端自动感知
- 适合中小规模，一般 3-5 个 Sentinel 节点

#### 3. Cluster 模式

哨兵解决了高可用，但数据还是全量存在每个节点上，内存和写入能力受限于单机。Cluster 模式引入了数据分片。

```bash
# 创建集群（至少 3 主 3 从，6 个节点）
redis-cli --cluster create \
  192.168.1.101:6379 192.168.1.102:6379 192.168.1.103:6379 \
  192.168.1.104:6379 192.168.1.105:6379 192.168.1.106:6379 \
  --cluster-replicas 1
```

**哈希槽（Hash Slot）：** Cluster 把整个 keyspace 分成 16384 个 slot，每个 Master 负责一部分。写入时先对 key 计算 `CRC16(key) % 16384` 得到 slot 编号，再路由到负责该 slot 的节点。如果客户端发到了错误的节点，该节点返回 `MOVED` 重定向，客户端据此更新本地的 slot 映射表。

```go
// key 的 slot 计算
func keyHashSlot(key string) int {
    // 如果 key 包含 {}，只对 {} 内的内容计算 hash（hash tag）
    if start := strings.Index(key, "{"); start != -1 {
        if end := strings.Index(key[start:], "}"); end != -1 {
            key = key[start+1 : start+end]
        }
    }
    return crc16(key) % 16384
}
```

**为什么是 16384 个 slot 而不是更多？** Redis 作者 antirez 给过解释：节点间的心跳包需要携带 slot 分配信息，65536 个 slot 的心跳包会占用 8KB，而 16384 个只需要 2KB。在节点数不超过 1000 的场景下，16384 个 slot 完全够用，且压缩后心跳包开销极小。

**特点：**
- 数据分片，突破单机内存和写入瓶颈
- 自动故障转移，Slave 在 Master 宕机后自动晋升
- 支持水平扩展，加节点迁移 slot 即可
- 适合大规模生产环境

#### 4. 三种方案对比

| 维度 | 主从复制 | 哨兵模式 | Cluster |
|------|---------|---------|---------|
| 数据分布 | 全量副本 | 全量副本 | 分片（16384 slot） |
| 故障转移 | 手动 | 自动 | 自动 |
| 写入能力 | 受限于单 Master | 受限于单 Master | 多 Master 并行写入 |
| 内存利用率 | 每个 Slave 存全量 | 每个 Slave 存全量 | 各节点只存分片 |
| 扩展性 | 加 Slave 分担读 | 加 Slave 分担读 | 加 Master 分担读写 |
| 复杂度 | 低 | 中 | 高 |
| 适合规模 | 小，数据量不大 | 中小，高可用需求 | 大，海量数据和高吞吐 |

### 分析

选型思路其实很清晰：

- **数据量不大、需要简单备份**：主从复制就够了，一个 Master 两三个 Slave，配置简单运维成本低。
- **需要高可用但不想太复杂**：哨兵模式，自动故障转移，客户端用 Sentinel 客户端库就能透明切换。大多数中小型业务用哨兵就够了。
- **数据量大、写入要求高**：Cluster，多 Master 分片是真正解决扩展性问题的方案。代价是运维复杂度高，multi-key 操作有限制。

一个容易踩的坑：哨兵和主从都是全量数据复制，意味着每个节点都要能装下全部数据。如果单个 key 的数据量已经超过单机内存上限，哨兵也救不了你，只能上 Cluster 做分片。

### 知识点总结

1. **主从复制分两步**：首次全量同步（RDB + buffer），后续增量同步（PSYNC + repl_backlog）
2. **哨兵通过主观下线 + 客观下线**确认故障，选举 Leader 后执行自动故障转移
3. **Cluster 用 16384 个哈希槽**做数据分片，CRC16 计算 slot，MOVED 重定向路由
4. **Hash Tag**（`{}`）可以让多个 key 落到同一个 slot，解决 multi-key 操作的跨槽问题
5. 三种方案是递进关系：主从解决数据冗余，哨兵解决高可用，Cluster 解决扩展性

### 相关知识扩展

**Cluster 扩容与缩容**

扩容时新增一个 Master 节点，Cluster 会将部分 slot 从现有节点迁移到新节点。迁移是逐个 slot 进行的：先给目标节点发 `CLUSTER SETSLOT <slot> IMPORTING`，再给源节点发 `CLUSTER SETSLOT <slot> MIGRATING`，然后用 `MIGRATE` 命令把该 slot 下的 key 逐个迁移，迁移完成后通知所有节点更新 slot 映射。整个过程在线进行，不影响服务。

缩容是反向操作：把待下线节点的 slot 迁移到其他节点，数据搬完后移除该节点。

**跨槽 multi-key 问题**

Cluster 模式下，`MGET`、`DEL` 多个 key、`SUNION` 等涉及多个 key 的命令，要求所有 key 必须在同一个 slot 里，否则返回 `CROSSSLOT` 错误。解决方法是用 Hash Tag：

```
# 这两个 key 的 slot 由 {user} 决定，而不是整个 key
SET {user}:name "Alice"
SET {user}:age 25
MGET {user}:name {user}:age   # 同一个 slot，OK
```

业务设计 key 时提前规划好 Hash Tag，把需要一起操作的 key 路由到同一个 slot，是 Cluster 模式下最常见的实践。

### 学习路线与建议

1. **从主从开始**：本地起一主两从，观察 `info replication` 里的 offset 和 backlog 信息，手动 kill Master 看 Slave 的状态变化
2. **加哨兵**：配三个 Sentinel 节点，kill 掉 Master，观察哨兵的日志输出和 Slave 晋升过程
3. **上 Cluster**：用 `redis-cli --cluster create` 搭一个六节点集群，用 `CLUSTER NODES` 和 `CLUSTER SLOTS` 看 slot 分配
4. **面试表达**：按"主从同步原理 → 哨兵故障转移流程 → Cluster 分片路由"的顺序讲，最后提一句扩容和跨槽问题，体现深度

### 参考文章与延伸阅读

- [Redis 官方文档 — Cluster Tutorial](https://redis.io/docs/latest/operate/oss_and_stack/management/cluster-tutorial/)
- [Redis 官方文档 — Sentinel](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)
- [Redis Cluster 16384 slots 设计讨论 — antirez 博客](http://antirez.com/news/122)
- 《Redis 设计与实现》-- 黄健宏，第 17 章复制、第 22 章集群
