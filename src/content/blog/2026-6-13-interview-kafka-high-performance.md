---
title: "面试笔记：Kafka为什么这么快"
date: "2026-6-13"
tags: ["Kafka", "高性能", "零拷贝", "面试", "八股文"]
excerpt: "kami works"
---

# 面试笔记：Kafka 为什么这么快

### 前情提要

在准备 Go 后端面试的过程中，Kafka 几乎是绕不开的话题。很多面试官不会只停留在"Kafka 是什么、怎么用"，而是直接追问底层原理——"Kafka 为什么吞吐量能比 RabbitMQ 高一个数量级？"我第一反应是"零拷贝"，但被追问 sendfile 和 mmap 的区别时就卡壳了。后来在 Rinne-IM 项目中做消息中间件选型和压测调优，反复和这些机制打交道，才真正把每个点理清楚。这篇笔记专门拆解 Kafka 高性能的五个核心原因，争取面试时一次讲透。

---

### 问题

面试官常见的问法：

- "Kafka 为什么这么快？"
- "顺序写盘比随机写快多少？为什么？"
- "零拷贝是什么？sendfile 和 mmap 有什么区别？"
- "Kafka 的批量发送是怎么工作的？"
- "Page Cache 在 Kafka 里起什么作用？"

考察的核心是：你是否理解 Kafka 在 I/O 层面做了哪些极致优化，以及这些优化背后的操作系统原理。

---

### 回答

Kafka 高吞吐有五个核心原因，按重要程度排列如下。

**1. 顺序写盘（Sequential I/O）**

这是 Kafka 性能最根本的来源。Kafka 的消息写入采用 append-only 方式——每条新消息直接追加到 Partition 对应的日志文件末尾，不做任何随机寻址。

磁盘顺序写和随机写的性能差距是数量级的：

```plain
顺序写（HDD）：  ~600 MB/s
随机写（HDD）：  ~0.1 MB/s（每次 seek 约 10ms）

顺序写（SSD）：  ~数 GB/s
随机写（SSD）：  ~数百 MB/s
```

即便在 SSD 时代，顺序写的优势依然存在。Kafka 利用了磁盘最擅长的操作模式，把"写消息"这件事变成了接近内存速度的操作。很多人误以为 Kafka 是纯内存系统，其实它只是把磁盘用对了方式。

**2. 零拷贝（Zero Copy）**

消费者拉取消息时，Kafka 使用了操作系统的零拷贝技术。先看传统方式需要几次数据拷贝：

```plain
传统 read + write（4 次拷贝 + 4 次上下文切换）：

  磁盘 ──DMA──► 内核读缓冲区 ──copy──► 用户空间 ──copy──► Socket 缓冲区 ──DMA──► 网卡
                  (1)               (2)              (3)                  (4)
               内核→用户          用户→内核          内核空间              硬件

零拷贝 sendfile（2 次拷贝 + 2 次上下文切换）：

  磁盘 ──DMA──► 内核读缓冲区 ──DMA gather──► 网卡
                  (1)                          (2)
               数据全程不经过用户空间
```

Linux 提供了两种零拷贝系统调用：

- `sendfile()`：适用于文件到 socket 的传输，Kafka 消费消息时用的就是这个。数据从 Page Cache 直接发送到网卡，不经过用户态。
- `mmap()`：将文件映射到用户空间的虚拟地址，适用于需要修改数据的场景。Kafka 在生产者写入时也利用了 mmap 的思想——通过内存映射文件来加速写入。

零拷贝的意义不仅是减少 CPU 拷贝开销，更关键的是减少了用户态和内核态之间的上下文切换，这在高并发场景下影响巨大。

**3. 批量发送 + 压缩**

Kafka 的 Producer 不会来一条消息就发一次网络请求，而是将多条消息攒成一个批次（Batch）再发送。相关配置：

```plain
batch.size = 16384       # 批次大小上限（16KB）
linger.ms = 5            # 最多等待 5ms 凑批
compression.type = snappy # 批次压缩算法
```

批量发送减少了网络往返次数（RTT），配合压缩（Snappy、LZ4、Zstd）进一步降低网络带宽消耗。压缩在 Producer 端完成、Broker 端存储压缩数据、Consumer 端解压——整条链路中 Broker 不需要解压再压缩，减少了 CPU 开销。

在 Rinne-IM 中，我配置 `batch.size=16384`、`linger.ms=5`，在延迟和吞吐之间取得了平衡，实测将消息吞吐从 8k 提升到了 45k msg/s。

**4. Page Cache**

Kafka 没有自己在 JVM 内实现缓存层，而是直接依赖操作系统的 Page Cache。消息写入时先写到 Page Cache（内存），由操作系统异步刷盘；读取时如果数据还在 Page Cache 中，直接命中内存，不需要磁盘 I/O。

这种设计的好处：

- 避免 JVM 内部的 GC 压力（不用在堆上维护大量缓存对象）
- 操作系统对 Page Cache 的管理已经非常成熟（LRU 淘汰、预读机制）
- 进程重启后 Page Cache 依然可用（操作系统级别的缓存，不随进程消亡）

**5. 分区并行**

一个 Topic 被划分为多个 Partition，每个 Partition 是独立的有序日志。生产者和消费者可以并行操作不同的 Partition，Broker 也可以将不同 Partition 分布在不同磁盘上，最大化 I/O 并行度。Consumer Group 中每个消费者"独占"一个或多个 Partition，天然支持水平扩展。

```plain
Topic: messages (3 Partitions)
  ├── Partition 0 ──► Consumer 1
  ├── Partition 1 ──► Consumer 2
  └── Partition 2 ──► Consumer 3

三个消费者并行消费，吞吐量线性扩展
```

---

### 分析

把五个优化点放在一起看，会发现 Kafka 的设计哲学很清晰：**不和硬件对着干，而是顺着硬件的特性来设计系统**。

顺序写盘利用了磁盘最擅长的访问模式；零拷贝消除了用户态和内核态之间不必要的数据搬运；批量发送减少了网络 I/O 次数；Page Cache 借助操作系统已有的成熟缓存机制；分区并行让多核、多磁盘的能力得以发挥。每一个优化单独看都不是"黑科技"，但组合在一起就形成了 Kafka 百万级吞吐的基础。

面试中如果被追问"Kafka 和 RabbitMQ 为什么性能差这么多"，可以从这个角度回答：RabbitMQ 是传统的消息代理，消息 ack 后即删除，内部需要维护复杂的路由和状态机；Kafka 是分布式日志系统，消息 append-only 写入、消费后不删除，整个数据流是单向的，天然适合顺序 I/O 和批量操作。

---

### 知识点总结

| 优化手段 | 核心原理 | 性能提升 |
|---------|---------|---------|
| 顺序写盘 | append-only 追加写入，避免磁盘 seek | 顺序写比随机写快 3-4 个数量级（HDD） |
| 零拷贝 | sendfile/mmap 减少数据拷贝和上下文切换 | 拷贝次数从 4 降到 2，切换次数减半 |
| 批量发送 | 多条消息合并为一个网络请求 | 减少 RTT，配合压缩降低带宽消耗 |
| Page Cache | 借助 OS 缓存，避免 JVM GC 压力 | 读热数据接近内存速度 |
| 分区并行 | 多 Partition 独立读写，水平扩展 | 吞吐量随 Partition 数线性增长 |

---

### 相关知识扩展

**Kafka vs RocketMQ 性能对比**

RocketMQ 是阿里开源的消息中间件，在国内金融和电商领域使用广泛。两者在性能层面的对比：

| 维度 | Kafka | RocketMQ |
|------|-------|----------|
| 吞吐量 | 单节点百万级 msg/s | 单节点十万级 msg/s |
| 延迟 | 毫秒级（批量场景） | 毫秒级（支持低延迟场景） |
| 顺序写盘 | 有 | 有（CommitLog 也是顺序写） |
| 零拷贝 | sendfile | mmap（生产端）+ sendfile（消费端） |
| 消息模型 | 拉模式（Pull） | 推+拉结合 |
| 适用场景 | 大数据流处理、日志采集 | 金融交易、电商订单 |

RocketMQ 在架构上借鉴了 Kafka 的顺序写盘思想（CommitLog 也是 append-only），但在路由和消费模型上做了更多优化（如延迟消息、事务消息）。选型时：追求极致吞吐和流处理能力选 Kafka，需要丰富消息特性（延迟、事务、过滤）选 RocketMQ。

**Kafka 在大数据生态中的角色**

Kafka 在大数据架构中通常扮演"数据管道"的角色，处于数据采集层和计算层之间：

```plain
数据源（日志/指标/事件）──► Kafka ──► Flink/Spark Streaming（实时计算）
                                └──► HDFS/S3（离线存储）
                                └──► Elasticsearch（检索分析）
```

Kafka Connect 提供了与各种数据源的集成（MySQL CDC、S3 Sink、Elasticsearch Sink），Kafka Streams 和 ksqlDB 则提供了流计算能力。可以说 Kafka 不仅仅是一个消息队列，而是整个实时数据平台的核心枢纽。

---

### 学习路线与建议

**入门**：先理解 Kafka 的基本架构（Broker、Topic、Partition、Consumer Group），用 `kafka-console-producer` 和 `kafka-console-consumer` 跑通一个最简单的生产消费流程。

**进阶**：重点学习顺序 I/O 和零拷贝的操作系统原理。推荐阅读《Linux 性能优化实战》中关于 I/O 和 sendfile 的章节，以及 Kafka 官方文档的 Design 部分（讲得非常清楚）。可以用 `fio` 工具亲自测一下顺序写和随机写的差距，体感会比看书深刻得多。

**实战**：在项目中配置 `batch.size`、`linger.ms`、`compression.type` 参数，用压测工具（如 `kafka-producer-perf-test`）观察不同配置对吞吐量的影响。如果有条件，对比开启和关闭零拷贝（通过 `transfer.to.enabled` 参数）的性能差异。

**面试建议**：回答"Kafka 为什么快"时，按"顺序写盘 -> 零拷贝 -> 批量发送 -> Page Cache -> 分区并行"的顺序展开，每一点都讲清楚底层原理和操作系统机制。面试官最喜欢的追问方向是 sendfile 的具体工作流程和 Page Cache 的刷盘策略，提前准备好。

---

### 参考文章与延伸阅读

- [Kafka 官方文档 - Design](https://kafka.apache.org/documentation/#design)
- [Kafka 权威指南（Kafka: The Definitive Guide）](https://www.oreilly.com/library/view/kafka-the-definitive/9781491936153/)
- [Jay Kreps: The Log（Kafka 设计思想）](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)
- [零拷贝技术详解 - IBM Developer](https://developer.ibm.com/articles/j-zerocopy/)
- [RocketMQ 官方文档 - 架构设计](https://rocketmq.apache.org/docs/domainModel/00main)
- [数据密集型应用系统设计（Designing Data-Intensive Applications）](https://dataintensive.net/)
