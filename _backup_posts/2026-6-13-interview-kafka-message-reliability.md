---
title: "面试笔记：Kafka怎么保证消息不丢失"
date: "2026-6-13"
tags: ["Kafka", "消息可靠性", "面试", "八股文"]
excerpt: "kami works"
---

### 前情提要

在分布式消息队列的面试中，Kafka 的可靠性几乎是必考的一环。很多同学能聊清楚 Partition、Consumer Group 的基本概念，但一旦被追问"消息真的不会丢吗"、"acks=all 就够了吗"、"exactly-once 是怎么做到的"，就容易说不到位。这篇笔记从生产者、Broker、消费者三端出发，把 Kafka 消息可靠性的完整链路梳理一遍。

### 问题

面试中围绕 Kafka 消息可靠性的提问，通常集中在以下几个方向：

- "Kafka 的 acks 参数有几种取值？分别代表什么？对性能和可靠性有什么影响？"
- "min.insync.replicas 是干什么的？它和 acks 怎么配合？"
- "消费者的 offset 自动提交有什么问题？为什么生产环境通常手动提交？"
- "at-least-once、at-most-once、exactly-once 三种语义有什么区别？"
- "Kafka 的幂等生产者和事务机制分别解决了什么问题？"

这些问题考察的不只是参数记忆，更是对"一条消息从生产到消费，到底经历了什么"这条链路的理解深度。

### 回答

**一、生产者端：acks 的三种选择**

`acks` 决定了生产者发送消息后，需要等待多少副本确认才算成功。这是可靠性与性能之间最直接的权衡点。

`acks=0`：发完就走，不等任何确认。性能最高，但如果 Broker 在落盘前挂了，消息直接丢失，生产者完全无感知。适合日志采集这类"丢几条无所谓"的场景。

`acks=1`：Leader 写入本地日志后即返回确认，不等 Follower 同步。这是默认值，在大多数场景下够用。但如果 Leader 在同步到 Follower 之前宕机，这条消息仍然会丢。

`acks=all`（等价于 `acks=-1`）：所有 ISR（In-Sync Replicas）中的副本都写入成功才返回确认。可靠性最高，配合重试机制，可以做到生产者端不丢消息。代价是延迟增大、吞吐量下降。

```go
// Go 示例 (sarama)
config.Producer.RequiredAcks = sarama.WaitForAll // acks=all
config.Producer.Retry.Max = 5                     // 失败重试 5 次
```

**二、Broker 端：min.insync.replicas 与副本策略**

光有 `acks=all` 还不够。如果 ISR 里只有一个副本（比如其他 Follower 都落后了），那 `acks=all` 退化成 `acks=1`，等于没有额外保护。这时候就需要 `min.insync.replicas` 登场。

`min.insync.replicas` 规定了 ISR 中至少要有多少个副本在线，否则 Broker 直接拒绝写入（抛出 `NotEnoughReplicasException`）。典型配置是 `replication.factor=3` + `min.insync.replicas=2` + `acks=all`，这三者组合在一起，保证了消息至少写入 2 个副本才算成功。

```yaml
# server.properties
default.replication.factor: 3       # Topic 默认 3 副本
min.insync.replicas: 2              # ISR 最少 2 个副本
unclean.leader.election.enable: false  # 禁止非 ISR 副本当选 Leader
```

最后一条 `unclean.leader.election.enable=false` 也很关键。如果允许非 ISR 副本当选 Leader，意味着一个落后很多的副本可能成为新 Leader，之前的消息就丢了。

**三、消费者端：手动提交 offset**

消费者端最容易丢消息的环节不是"读不到"，而是"读到了但没处理完就把 offset 提交了"。

Kafka 默认开启自动提交（`auto.commit.enable=true`），每隔一段时间（默认 5 秒）自动将消费位点提交到 `__consumer_offsets`。问题在于：如果消费者拉到消息后还没来得及处理就崩溃了，而 offset 已经被自动提交，那这批消息就永远不会被重新消费——对业务来说，等同于丢失。

解决方案是关闭自动提交，改为手动提交：

```go
config.Consumer.Offsets.AutoCommit.Enable = false

for msg := range consumer.Messages() {
    process(msg)        // 先完成业务处理
    consumer.Commit()   // 成功后再提交 offset
}
```

这样即使消费者崩溃，重启后会从上次提交的 offset 继续消费，最多重复消费，不会丢失。

**四、三种投递语义**

把上面三端的配置串起来，就涉及面试高频考点——三种消息投递语义：

**at-most-once（最多一次）**：消息可能丢失，但不会重复。对应 `acks=0` 或消费者先提交 offset 再处理消息。性能最好，但不可靠。

**at-least-once（至少一次）**：消息不会丢失，但可能重复。对应 `acks=all` + 消费者手动提交 offset（处理完再提交）。这是大多数生产环境的配置。代价是消费端必须实现幂等处理，因为消息可能被重复消费。

**exactly-once（精确一次）**：消息既不丢失也不重复。这是最理想但也最难实现的语义。Kafka 从 0.11 版本开始，通过幂等生产者和事务机制来逼近这个目标。

**五、幂等生产者与事务**

**幂等生产者**（Idempotent Producer）解决的是生产者重试导致的重复问题。开启后，Kafka 为每条消息分配一个全局唯一的 `(producerId, sequenceNumber)`，Broker 端据此去重。即使生产者因超时重试，同一条消息也只会被写入一次。

```go
config.Producer.Idempotent = true
config.Net.MaxOpenRequests = 1  // 保证消息有序发送
```

注意 `MaxOpenRequests` 需要设为 1（Kafka 3.0+ 已放宽此限制），否则乱序的请求可能导致 sequence number 不连续。

**事务**（Transaction）解决的是跨 Partition、跨 Topic 的原子写入问题。比如一个流处理应用从 Topic A 读消息、处理后写入 Topic B，需要保证"读 A + 写 B + 提交 offset"这三步要么全成功要么全回滚。Kafka 的事务机制通过两阶段提交实现了这一点，配合消费端的 `read_committed` 隔离级别，可以做到端到端的 exactly-once 语义。

### 分析

把整条链路画出来会更清晰：

```
生产者 --[acks=all]--> Broker(3副本, min.insync=2) --[手动提交offset]--> 消费者
   |                      |                              |
   v                      v                              v
 幂等生产者          unclean.leader=false            先处理再提交
 (去重)              (防止落后副本当选)              (防止丢失)
```

实际工程中，完全的 exactly-once 代价不小。大部分业务选择 at-least-once 加消费端幂等，是一个务实的折中。比如订单处理可以用订单号做幂等键，收到重复消息时直接忽略。只有对一致性要求极高的金融、审计场景，才值得上完整的事务链路。

### 知识点总结

| 知识点 | 核心要点 |
|--------|----------|
| acks=0/1/all | 不等确认 / Leader确认 / 全部ISR确认 |
| min.insync.replicas | ISR最少副本数，防止acks=all退化 |
| unclean.leader.election | 禁止落后副本当选Leader，防丢消息 |
| 手动提交offset | 处理完再提交，避免消费位点超前 |
| at-most-once | 可能丢，不重复 |
| at-least-once | 不丢，可能重复（主流选择） |
| exactly-once | 幂等生产者+事务+read_committed |
| 幂等生产者 | producerId+sequenceNumber去重 |
| Kafka事务 | 跨Partition/Topic原子写入 |

### 相关知识扩展

**消息丢失的三个场景速查**：生产者发送失败（网络抖动）通过重试+acks解决；Broker 宕机（未同步到副本）通过多副本+min.insync.replicas 解决；消费者处理失败（业务异常）通过手动提交 offset 解决。

**ISR 机制**：ISR 是"与 Leader 保持同步的副本集合"。Follower 如果落后太多（由 `replica.lag.time.max.ms` 控制），会被踢出 ISR。只有 ISR 中的副本才有资格参与 acks=all 的确认和 Leader 选举。

**Rebalance 与消息可靠性**：消费者组发生 Rebalance 时，如果 offset 提交策略不当，可能导致消息重复消费或丢失。配合手动提交和幂等处理可以规避这个问题。

### 学习路线与建议

1. 先在本地用 docker-compose 搭一个 3 节点的 Kafka 集群，亲手测试 `acks=0/1/all` 在 Kill Broker 后的表现差异。
2. 写一个简单的生产消费 Demo，分别开启和关闭自动提交，观察消费者崩溃重启后的消费行为。
3. 阅读 Kafka 官方文档中 Delivery Semantics 一节，理解 at-least-once 和 exactly-once 的设计取舍。
4. 如果时间充裕，可以研究 Kafka Streams 的 exactly-once 处理模式，看看事务在流处理中是如何落地的。

面试回答的核心思路是"三端各自保证 + 组合形成语义"，不要只背参数，要能把链路讲清楚。

### 参考文章与延伸阅读

- [Apache Kafka 官方文档 - Delivery Semantics](https://kafka.apache.org/documentation/#semantics)
- [Kafka 可靠性最佳实践：acks、副本与ISR](https://kafka.apache.org/documentation/#producerconfigs_acks)
- [Exactly-Once Semantics in Apache Kafka](https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/)
- 《Kafka 权威指南》第 4 章：Kafka 生产者 & 第 6 章：可靠的数据传输
