---
title: "面试笔记：Redis的RDB和AOF持久化怎么选"
date: "2026-6-13"
tags: ["Redis", "持久化", "RDB", "AOF", "面试", "八股文"]
excerpt: "kami works"
---

### 前情提要

Redis 把数据放在内存里，读写极快，但进程一挂数据就没了。为了解决这个问题，Redis 提供了两种持久化机制：RDB 快照和 AOF 日志。面试中几乎必问"RDB 和 AOF 的区别"，而且经常追问到混合持久化和 Redis 7.0 的新变化。这篇笔记把两种持久化的原理、触发方式、优缺点一次理清，最后给出选型建议。

### 问题

面试官常见的问法：

- "Redis 的持久化机制有哪些？"
- "RDB 快照是怎么生成的，什么时候触发？"
- "AOF 的 fsync 策略有几种，分别什么场景用？"
- "RDB 和 AOF 能同时开吗？混合持久化是怎么回事？"

考察的核心是：你是否理解 RDB 的 fork + COW 机制、AOF 追加日志与重写原理、两种策略在数据安全和性能之间的取舍，以及生产环境中如何做选择。

### 回答

#### 1. RDB — 内存快照

**原理：** RDB（Redis Database）是某一时刻内存数据的完整二进制快照。生成过程是：主进程调用 `fork()` 创建子进程，子进程将内存数据写入临时文件，写完后原子替换旧的 RDB 文件。fork 之后利用操作系统的 Copy-on-Write（写时复制）机制，父进程继续处理写入，子进程拿到的是 fork 瞬间的数据副本。

**触发方式：**

```conf
# 自动触发（满足任一条件即触发）
save 900 1      # 900 秒内至少 1 个 key 变化
save 300 10     # 300 秒内至少 10 个 key 变化
save 60 10000   # 60 秒内至少 10000 个 key 变化

# 文件配置
dbfilename dump.rdb
dir ./
```

除了自动触发，还可以手动执行 `SAVE`（阻塞主进程，生产慎用）或 `BGSAVE`（后台 fork 子进程，推荐）。

**优点：**
- 文件紧凑压缩，适合备份和灾难恢复
- 恢复速度远快于 AOF，直接加载到内存
- 对主进程性能影响小，写操作无需额外磁盘 IO

**缺点：**
- 两次快照之间的数据可能丢失，最坏情况丢几分钟写入
- `fork()` 在大数据量时会导致毫秒级阻塞，内存越大 fork 越慢

#### 2. AOF — 追加写日志

**原理：** AOF（Append Only File）以 Redis 协议格式记录每一条写命令，追加到 AOF 文件末尾。重启时 Redis 重放这些命令来恢复数据。

**fsync 策略：**

```conf
appendonly yes
appendfilename "appendonly.aof"

# 三种同步策略
# appendfsync always      # 每条写命令都 fsync，最安全，最慢
appendfsync everysec       # 每秒 fsync 一次（推荐，最多丢 1 秒数据）
# appendfsync no           # 交给操作系统决定，最快，可能丢数据
```

| 策略 | 数据安全性 | 性能 | 适用场景 |
|------|-----------|------|---------|
| always | 最高，不丢数据 | 最差 | 金融级数据 |
| everysec | 最多丢 1 秒 | 很好 | 绝大多数生产环境 |
| no | 可能丢较多 | 最好 | 允许丢数据的缓存场景 |

**AOF 重写（Rewrite）：** AOF 文件会随写入不断增长。重写机制会 fork 子进程，根据当前内存数据生成一份等效的最小命令集，替换旧文件。可以手动 `BGREWRITEAOF`，也可以配置自动触发：

```conf
auto-aof-rewrite-percentage 100   # AOF 文件比上次重写后增长 100% 时触发
auto-aof-rewrite-min-size 64mb    # 且 AOF 文件至少 64MB
```

**优点：**
- 数据安全，everysec 模式最多丢 1 秒数据
- 文件是纯文本命令，可读性好，误操作时可手动编辑修复
- 支持重写压缩，控制文件体积

**缺点：**
- 文件通常比 RDB 大
- 恢复速度慢于 RDB，需要逐条重放命令
- 持续追加带来额外的磁盘 IO 开销

#### 3. 混合持久化（Redis 4.0+）

Redis 4.0 引入了混合持久化，把 RDB 和 AOF 结合起来：

```conf
aof-use-rdb-preamble yes
```

原理：AOF 重写时，子进程先将当前内存数据以 RDB 格式写入文件开头，再将重写期间产生的增量写命令以 AOF 格式追加到文件末尾。重启时 Redis 先快速加载 RDB 部分，再重放少量 AOF 命令。兼顾了 RDB 的恢复速度和 AOF 的数据安全性。

#### 4. 对比总结

| 维度 | RDB | AOF | 混合持久化 |
|------|-----|-----|-----------|
| 数据文件 | 二进制快照 | 文本命令日志 | RDB 头 + AOF 尾 |
| 文件大小 | 小 | 大 | 中等 |
| 恢复速度 | 快 | 慢 | 快 |
| 数据安全 | 可能丢分钟级数据 | 最多丢 1 秒 | 最多丢 1 秒 |
| 性能影响 | fork 时短暂阻塞 | 持续磁盘 IO | 重写时 fork |
| 适合场景 | 备份、冷备、灾备 | 数据安全要求高 | 生产环境首选 |

### 分析

实际选型思路：

- **只做备份、不怕丢数据**：单独开 RDB 就够了，`save` 规则按业务写入量配置。
- **数据安全优先**：开 AOF + everysec，绝大多数生产环境的标准选择。
- **既要恢复快又要安全**：开混合持久化（Redis 4.0+ 默认推荐方案），AOF 重写时自动嵌入 RDB 快照。
- **RDB + AOF 同时开**：Redis 重启时优先用 AOF 恢复（因为 AOF 数据更完整），RDB 仅用于备份。

一个常见误区是"RDB 完全没用"。实际上 RDB 在冷备份和灾难恢复场景仍然不可替代 — 一个压缩的二进制快照可以拷贝到任何机器快速恢复，而 AOF 文件大且重放慢。

### 知识点总结

1. **RDB 利用 fork + COW** 生成内存快照，恢复快但可能丢数据
2. **AOF 追加写命令**，everysec 是最常用的 fsync 策略，平衡安全与性能
3. **AOF 重写**不是追加，而是根据当前内存重新生成最小命令集
4. **混合持久化**在 AOF 重写时先写 RDB 再追加 AOF，是当前生产环境首选
5. Redis 重启恢复优先级：AOF > RDB（如果两者都有）

### 相关知识扩展

**Redis 7.0 Multi Part AOF（MP-AOF）**

Redis 7.0 对 AOF 做了一次重大重构。传统 AOF 是单个文件，重写时需要 fork 子进程生成完整的新文件，重写期间的增量命令需要额外的缓冲区，重写完成后还要做一次原子 rename。

Multi Part AOF 将 AOF 拆分为多个文件，放在一个目录下，由一个 `manifest` 文件管理：

- **base 文件**：相当于一次 RDB 快照或 AOF 重写的基础数据
- **incr 文件**：增量追加的写命令，按时间段切分

重写时不再 fork 子进程生成完整文件，而是直接开启一个新的 incr 文件继续追加，旧的 incr 文件可以后台异步压缩。这样做的好处是：重写期间不需要额外的内存缓冲区，也不会因为 fork 大进程导致阻塞。

```
aof-use-rdb-preamble yes     # 仍然支持混合持久化
aof-timestamp-enabled yes     # AOF 文件中记录时间戳，加速恢复
```

MP-AOF 让 AOF 的重写变得更轻量，也减少了磁盘 IO 的峰值。如果你的生产环境是 Redis 7.0+，建议直接开启 MP-AOF + 混合持久化。

### 学习路线与建议

1. **先动手**：本地起一个 Redis，分别配置纯 RDB、纯 AOF、混合持久化，用 `redis-cli` 写入数据后 `kill` 进程，观察恢复效果
2. **读配置**：把 `redis.conf` 里 `SNAPSHOTTING` 和 `APPEND ONLY MODE` 两节的注释读一遍，每个参数都有详细说明
3. **关注 fork 开销**：用 `info persistence` 查看 `latest_fork_usec`，了解你的环境 fork 耗时
4. **面试表达**：先说"两种机制的原理和区别"，再说"混合持久化是怎么结合的"，最后聊"Redis 7.0 的 MP-AOF 改进"，层层递进

### 参考文章与延伸阅读

- [Redis 官方文档 — Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Redis 7.0 Multi Part AOF 设计文档](https://github.com/redis/redis/issues/9727)
- 《Redis 设计与实现》— 黄健宏，第 10 章持久化
- [Redis 持久化方式对比 — 阿里云开发者社区](https://developer.aliyun.com/article/redis-persistence)
