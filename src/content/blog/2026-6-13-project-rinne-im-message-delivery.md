---
title: "项目笔记：IM消息怎么可靠投递给在线用户"
date: "2026-6-13"
tags: ["Go", "Kafka", "Redis", "消息队列", "项目实战"]
excerpt: "kami works"
---

# IM 消息怎么可靠投递给在线用户

### 前情提要

Rinne-IM 是一个 Go + gRPC 双向流 + PostgreSQL + Redis + Kafka 的全栈 IM 系统，客户端用 Electron + React + TypeScript。前面的文章解决了协议选型和双向流并发的问题——消息能通过 gRPC 流从客户端到达服务端，服务端也能通过 Redis Pub/Sub 把消息推回给客户端。但中间少了一环：**服务端收到消息并持久化之后，怎么把它投递给目标用户？**

### 问题

消息到达服务端后，服务端做了两件事：存到 PostgreSQL、生成 Snowflake ID。接下来需要把这条消息实时推送给接收方。

最朴素的做法是轮询数据库——每个连接的服务端 goroutine 每隔几秒查一次"有没有给我的新消息"。这显然不行：10 个用户每秒查 10 次，100 个用户每秒查 100 次，数据库被无意义的 SELECT 语句淹没。

另一个想法是直接在服务端内存里维护一个 `map[userID]stream`，收到消息后直接调用目标用户的 `stream.Send()`。这在一台服务器上能跑，但一旦要水平扩展（多台服务器），用户 A 可能连在服务器 1 上，用户 B 连在服务器 2 上——服务器 1 收到 A 的消息，找不到 B 的 stream。

需要一个**解耦生产者和消费者**的中间层。

### 解决

引入 Kafka 做异步消息分发，Redis Pub/Sub 做"最后一公里"的实时推送。消息的完整生命周期变成了：

```plain
发送方 → gRPC Stream → 服务端
                          ├→ PostgreSQL（持久化，保证不丢）
                          └→ Kafka（异步队列，削峰分发）
                                └→ Consumer 消费
                                      └→ Redis Pub/Sub（推送到目标用户的频道）
                                            └→ gRPC Stream → 接收方
```

**为什么需要 Kafka，不能直接 Redis Pub/Sub？** 因为 Redis Pub/Sub 是 fire-and-forget 的——如果没有订阅者在线，消息就丢了。Kafka 有持久化日志和 offset 机制，Consumer 重启后可以从上次消费的位置继续。

**为什么需要 Redis Pub/Sub，不能直接 Kafka → gRPC？** 因为 Kafka Consumer 跑在独立进程里，它不知道用户的 gRPC stream 在哪个服务端实例上。Redis Pub/Sub 充当了一个"跨进程通信总线"——每个用户的 gRPC stream handler 都订阅了 `user::{userId}::push` 频道，Kafka Consumer 只要往这个频道发消息，目标用户的 stream handler 就能收到并调用 `stream.Send()`。

Kafka 的分区策略是把 Key 设为 `ReceiverId`，同一个接收者的消息天然落入同一分区，**保证同一会话的消息有序**：

```go
// Producer 端：指定分区 Key
msg := &sarama.ProducerMessage{
    Topic: "chat-messages",
    Key:   sarama.StringEncoder(fmt.Sprintf("%d", receiverId)),
    Value: sarama.ByteEncoder(data),
}
```

Consumer 端用手动提交 offset 实现 at-least-once 语义：

```go
func (c *KafkaConsumer) ConsumeClaim(
    session sarama.ConsumerGroupSession,
    claim sarama.ConsumerGroupClaim,
) error {
    for msg := range claim.Messages() {
        if err := c.handler(msg); err != nil {
            // 处理失败：不提交 offset，下次重新消费
            continue
        }
        // 处理成功：标记已消费
        session.MarkMessage(msg, "")
    }
    return nil
}
```

### 分析

**三层组件各管一层可靠性**：

PostgreSQL 是最底层的安全网——消息写进去就不会丢，哪怕 Kafka 和 Redis 全挂了，消息还在数据库里。用户上线时可以拉取历史消息作为兜底。

Kafka 是中间层——它从 PostgreSQL 写入后异步消费消息，负责分发给各个 Consumer。Kafka 有持久化日志，Consumer 崩溃后可以从上次提交的 offset 继续消费，不会丢消息（at-least-once）。Consumer Group 机制天然支持多实例并行消费，为水平扩展打好了基础。

Redis Pub/Sub 是最上层——它只做"在线用户的实时推送"。用户不在线？消息丢了？没关系，用户上线时会从 PostgreSQL 拉取未读消息。Redis Pub/Sub 在这里的角色是**低延迟的通知机制**，而不是可靠传输。

**at-least-once 就够了**：Kafka 的三种消费语义——at-most-once（自动提交 offset，可能丢消息）、at-least-once（手动提交 offset，可能重复处理）、exactly-once（需要事务支持，复杂度高）。IM 场景下，at-least-once 是最佳选择。重复消息怎么办？客户端用 `msgId` 去重就行了——收到一条消息时检查本地是否已有相同 `msgId`，有就丢弃。这比在分布式系统中实现 exactly-once 简单一个数量级。

**分区 Key 的选择很重要**：Kafka 的默认分区器对 Key 做哈希取模，相同 Key 的消息一定落入相同分区，相同分区内消息严格有序。把 Key 设为 `ReceiverId` 意味着同一个用户收到的所有消息是有序的。如果把 Key 设为 `SenderId`，则同一个用户发出的消息有序，但接收端可能乱序。如果不用 Key（round-robin 分发），消息完全乱序——IM 场景下这是不可接受的。

### 知识点总结

**Kafka 分区有序性**：Kafka topic 分成多个 partition，partition 内部消息有序，partition 之间无序。通过设置消息 Key，相同 Key 的消息落入同一 partition，实现"按 Key 有序"。这是 Kafka 有序性的基本保证，也是很多系统设计的基础。

**at-least-once 语义**：Consumer 处理完消息后才提交 offset，如果处理失败或 Consumer 崩溃，下次从上次提交的 offset 重新消费。保证每条消息至少被处理一次，代价是可能重复处理，需要业务层做幂等。

**Redis Pub/Sub**：轻量级的消息发布/订阅机制。发布者发消息到频道，所有订阅者立即收到。没有持久化，没有确认机制，订阅者不在线消息就丢失。适合做实时推送的"最后一公里"，不适合需要可靠性的场景。

**消息去重**：在 at-least-once 语义下，同一条消息可能被消费多次。客户端用全局唯一的 `msgId` 做去重——维护一个已处理消息 ID 的集合，收到重复 ID 时直接丢弃。这是幂等性的一种实现方式。

### 相关知识扩展

**Kafka vs RabbitMQ vs NATS**：三者都是消息队列，但定位不同。Kafka 适合高吞吐、需要持久化和回溯的场景（日志收集、事件溯源、流处理），消息处理完不会立即删除，而是保留到日志过期。RabbitMQ 适合复杂路由逻辑（延迟队列、优先级队列、死信队列、多种 Exchange 类型），消息被确认后可以立即删除。NATS 极其轻量、低延迟，适合 IoT 和嵌入式场景，JetStream 扩展提供了持久化能力。在 IM 系统中，Kafka 是最常见的选择——消息量大、需要持久化、需要多消费者并行处理。

**Redis Streams**：Redis 5.0 引入的数据结构，可以理解为"Redis 版的 Kafka"。支持持久化（数据在 Redis 的 RDB/AOF 里）、Consumer Group、ACK 机制、消息回溯。比 Kafka 轻量得多，适合中小规模系统。如果 Rinne-IM 不需要 Kafka 那么大的吞吐量，用 Redis Streams 替代 Kafka + Redis Pub/Sub 的组合可以大幅简化架构——一个组件同时解决持久化分发和实时推送。

**exactly-once 语义**：Kafka 从 0.11 版本开始支持 exactly-once，通过幂等 Producer（`enable.idempotence=true`）+ 事务 Consumer（`isolation.level=read_committed`）实现。代价是吞吐量下降、延迟增加。在 IM 场景中，at-least-once + 客户端去重已经足够好，没必要引入 exactly-once 的复杂性。但在金融交易、订单处理等场景，exactly-once 是必须的。

### 学习路线与建议

1. **先跑通 Redis Pub/Sub**：写两个 goroutine，一个订阅频道，一个发布消息，理解"没有订阅者时消息就丢了"的行为
2. **引入 Kafka**：用 Docker 起一个单节点 Kafka，用 sarama 库写 Producer 和 Consumer，跑通"生产 → 消费"链路
3. **实验 offset 提交**：分别用自动提交和手动提交，观察 Consumer 重启后消息是否丢失或重复
4. **验证分区有序性**：往同一个 Key 发 100 条消息，确认 Consumer 收到时是有序的
5. **组装完整链路**：把 PostgreSQL 持久化、Kafka 异步分发、Redis Pub/Sub 实时推送串起来，用 `grpcurl` 手动发消息验证整条路径

### 参考文章与延伸阅读

- [Kafka: The Definitive Guide (Chapter 4: Kafka Consumers)](https://www.confluent.io/resources/kafka-the-definitive-guide/) —— Consumer Group、offset 管理、消费语义的权威讲解
- [Redis Pub/Sub vs Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/) —— 两种消息机制的对比和选型指南
- [Kafka Message Delivery Semantics](https://kafka.apache.org/documentation/#semantics) —— Kafka 官方文档，at-most-once / at-least-once / exactly-once 的定义和实现方式
- [Sarama: Go Kafka Client](https://pkg.go.dev/github.com/IBM/sarama) —— Go 生态中最主流的 Kafka 客户端库文档
- [Martin Kleppmann: Designing Data-Intensive Applications (Chapter 11)](https://dataintensive.net/) —— 流处理和消息传递章节，直接对应本项目的消息投递设计
- [NATS vs Kafka](https://nats.io/blog/kafka-vs-nats/) —— NATS 官方博客对两者的对比，适合了解不同消息队列的设计哲学
