---
title: "面试笔记：分布式锁用Redis还是ZooKeeper实现"
date: "2026-6-13"
tags: ["分布式系统", "分布式锁", "Redis", "面试", "八股文"]
excerpt: "kami works"
---

## 前情提要

在单机环境下，我们用 `sync.Mutex` 或 `sync.RWMutex` 就能解决并发资源竞争问题。但一旦系统扩展到多个实例同时运行，本地锁就彻底失效了——每个进程都有自己独立的内存空间，锁无法跨节点感知。这时候我们就需要一个"所有人都能看见"的锁机制，也就是**分布式锁**。

这篇笔记整理自我准备面试时对分布式锁的系统梳理，覆盖 Redis、ZooKeeper、etcd 三种主流实现方案，以及围绕它们的经典争论。

## 问题

> **面试官：分布式锁有哪些实现方案？各自有什么优缺点？你在项目中是怎么选的？**

这道题看似在问"有哪些"，实际上面试官希望听到你对比不同方案的取舍，最好还能聊出一些深度——比如 Redlock 的争议、锁续期的工程实践。

## 回答

### 方案一：基于 Redis 的分布式锁

最经典的实现。核心就一条命令：

```
SET lock_key unique_value NX EX 10
```

`NX` 保证"只有第一个人能成功写入"，`EX` 设置过期时间防止死锁，`unique_value` 用来确保只有锁的持有者能释放它。释放锁时必须用 **Lua 脚本**保证原子性——先比较值，再删除：

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
```

为什么不能直接 `GET` 再 `DEL`？因为如果两步之间锁恰好过期被别人拿到了，你就会误删别人的锁。Lua 脚本在 Redis 中是原子执行的，避免了这个竞态。

**优点**：性能极高，实现简单，大多数项目默认就有 Redis。
**缺点**：Redis 主从切换时可能丢锁（锁写在 master 上还没同步到 slave，master 挂了），单节点 Redis 锁在 AP 场景下并不可靠。

#### Redlock 算法

为了解决单点问题，antirez 提出了 **Redlock**：部署 5 个独立的 Redis 节点，客户端依次尝试向所有节点获取锁，只要超过半数（3 个）成功就算拿到锁。有效时间 = TTL - 获取锁花费的时间。

思路很好，但引发了分布式领域最大的争论之一（后面分析部分详聊）。

### 方案二：基于 ZooKeeper 的分布式锁

ZooKeeper 利用**临时有序节点**实现锁：

1. 在锁的父路径下创建临时顺序节点 `lock-0000000001`
2. 获取所有子节点并排序
3. 如果自己是最小序号的节点，则获取锁成功
4. 否则，对前一个节点注册 Watcher，等待它被删除

```go
nodePath, _ := zk.Create(path+"/lock-", nil, zk.FlagEphemeral|zk.FlagSequence)
children, _, _ := zk.Children(path)
sort.Strings(children)
if children[0] == filepath.Base(nodePath) {
    // 拿到锁了
}
// 否则 Watch 前一个节点
```

**关键设计**：临时节点意味着客户端崩溃后节点自动删除，不会死锁。有序节点天然实现了排队语义，避免了"羊群效应"——每个客户端只监听前一个节点，而非全部节点。

**优点**：强一致性（ZAB 协议），客户端断开自动释放锁，可靠性高。
**缺点**：性能不如 Redis（每次操作都走共识协议），运维成本高，需要额外维护 ZK 集群。

### 方案三：基于 etcd 的分布式锁

etcd 的锁基于 **Lease（租约）+ Revision（版本号）+ 事务（Txn）**：

```go
// 1. 创建 Lease
resp, _ := cli.Grant(ctx, 10) // 10 秒租约

// 2. 事务写入：如果 key 不存在则创建
txn.If(clientv3.Compare(clientv3.CreateRevision(key), "=", 0)).
    Then(clientv3.OpPut(key, "", clientv3.WithLease(resp.ID))).
    Else(clientv3.OpGet(key))
```

Lease 的作用类似 Redis 的 TTL——客户端挂了，Lease 过期后 key 自动删除。Revision 是 etcd 的全局递增版本号，可以用来实现有序排队。`Txn` 操作保证"判断 key 是否存在"和"写入"是原子的。

实际上 Kubernetes 内部就用 etcd 做分布式协调，所以它的可靠性是经过大规模验证的。

**优点**：强一致性（Raft 协议），Lease 自动过期防死锁，适合已有 etcd 基础设施的场景（如 K8s 生态）。
**缺点**：性能中等，社区对 etcd 锁的关注度不如 Redis/ZK。

### 三种方案对比

| 维度 | Redis | ZooKeeper | etcd |
|------|-------|-----------|------|
| **一致性模型** | AP（最终一致） | CP（强一致） | CP（强一致） |
| **性能** | 高 | 中 | 中 |
| **可靠性** | 中（主从切换风险） | 高 | 高 |
| **锁自动释放** | TTL 过期 | 临时节点 | Lease 过期 |
| **实现复杂度** | 低 | 中 | 中 |
| **运维成本** | 低（通常已有） | 高 | 中（K8s 场景已有） |
| **排队语义** | 不支持 | 有序节点 + Watch | Revision + Watch |
| **适用场景** | 高性能、允许小概率失效 | 金融级强一致 | 云原生/K8s 生态 |

**选型建议**：如果你的业务对锁的准确性要求不是特别严格（比如缓存更新），用 Redis 就好，简单高效。如果是金融、交易场景，必须用 ZK 或 etcd 的强一致锁。如果已经在 K8s 生态里，直接用 etcd 是最自然的选择。

## 分析：Martin Kleppmann vs antirez 之争

这是分布式锁领域最著名的学术争论，面试时提一嘴绝对加分。

**Martin Kleppmann**（《DERTA》作者）在 2016 年发文质疑 Redlock，核心论点：

1. **自动过期是危险的**：如果持锁进程因 GC 停顿或网络延迟导致处理变慢，锁过期后另一个进程会同时拿到锁，造成两个进程同时操作同一资源。
2. **时钟不可信**：Redlock 假设各节点时钟大致同步，但现实中时钟跳跃是完全可能的。
3. **没有 fencing token 机制**：安全的分布式锁应该给每次获锁分配一个单调递增的 token（类似版本号），存储服务可以据此拒绝过期锁的写入请求。

**antirez**（Redis 作者）随后回应：

1. Redlock 的设计目标不是用于"保护数据安全"的场景，而是"提高效率"——避免多个 worker 重复做同一件事。
2. 如果真需要绝对安全，应该结合 fencing token，但这已经不是锁本身的问题了。
3. 自动过期是一种"安全网"，防止客户端崩溃后的死锁，不应该被视为缺陷。

**结论**：两人说的其实不矛盾。Kleppmann 从理论正确性出发，antirez 从工程实用性出发。实际生产中，**关键数据保护不能只靠锁，还要配合存储端的 fencing/乐观校验**。

## 知识点总结

1. 分布式锁的核心矛盾：**性能 vs 一致性**。Redis 选性能，ZK/etcd 选一致性。
2. 锁必须有**自动释放机制**（TTL/临时节点/Lease），否则客户端崩溃 = 全局死锁。
3. 释放锁必须**原子操作**（Lua 脚本/Txn），否则可能误删他人的锁。
4. 锁的 value 必须**唯一**（UUID），配合原子释放来防止误删。
5. Redlock 解决了单点故障问题，但无法解决时钟漂移和 GC 停顿带来的锁失效。
6. 真正安全的锁需要**存储端配合**——fencing token 是最后一道防线。

## 相关知识扩展

### 锁续期：看门狗（Watchdog）机制

自动过期时间设太短，业务没执行完锁就释放了；设太长，崩溃后其他客户端要等很久。Redisson 的解决方案是**看门狗**：后台线程每隔 `lockWatchdogTimeout / 3`（默认 10 秒）检查一次，如果持有锁的线程还在运行，就自动续期。

```
持锁线程还在跑 → 看门狗续期（重置 TTL）
持锁线程已退出 → 看门狗停止 → TTL 自然到期后锁释放
```

这优雅地解决了"过期时间设多少"的问题。

### 可重入锁实现

同一个线程可能需要多次获取同一把锁（递归调用）。实现方式是在锁的 value 中记录持有者 ID + 重入次数：

```
第一次获锁：SET lock_key {threadId:1} NX EX 30
第二次获锁：发现是自己持有 → 计数 +1 → {threadId:2}
释放锁：计数 -1 → 到 0 时才真正删除
```

Redisson 用 Hash 结构实现：field 是线程标识，value 是重入次数。ZooKeeper 的方案更简单——同一个客户端创建多个临时节点即可。

## 学习路线与建议

1. **先动手写一个 Redis 分布式锁**，把 `SET NX EX` + Lua 释放跑通，理解为什么需要原子释放。
2. **读 Redisson 源码**，看它怎么处理看门狗续期、可重入、阻塞等待（`PUB/SUB` 监听释放事件）。
3. **搭一个 3 节点 ZK 集群**，用 Curator 框架体验临时有序节点锁，对比 Redis 锁的行为差异。
4. **读 Kleppmann 和 antirez 的原文**（见下方参考链接），理解理论与实践的分歧。
5. **思考你项目的实际需求**：是防重复执行（容忍小概率并发）还是保护关键数据（绝对不允许并发）？答案决定了你的选型。

## 参考文章与延伸阅读

- Martin Kleppmann: [How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)
- antirez: [Is Redlock safe?](http://antirez.com/news/101)
- Redis 官方: [Distributed locks with Redis](https://redis.io/docs/manual/patterns/distributed-locks/)
- Apache Curator: [Shared Lock 文档](https://curator.apache.org/curator-recipes/shared-lock.html)
- etcd 官方: [Lock recipe](https://etcd.io/docs/v3.5/dev-guide/recipes/#lock)
- 《Designing Data-Intensive Applications》第 9 章：Consistency and Consensus
