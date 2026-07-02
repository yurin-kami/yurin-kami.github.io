---
title: "项目笔记：gRPC双向流怎么同时处理上行和下行"
date: "2026-6-13"
tags: ["Go", "gRPC", "并发编程", "双向流", "项目实战"]
excerpt: "kami works"
---

# gRPC 双向流怎么同时处理上行和下行

### 前情提要

Rinne-IM 是一个 Go + gRPC 双向流 + PostgreSQL + Redis + Kafka 的全栈 IM 系统，客户端用 Electron + React + TypeScript。协议层选了 gRPC 双向流，用 Protobuf 定义了 `Chat` 方法——客户端和服务端可以同时发送消息。协议定义好了，接下来的挑战是：**在服务端怎么同时处理两个方向的数据流**？

### 问题

`Chat` 方法的服务端实现需要同时做两件事：

1. **上行（Uplink）**：不断从客户端 `Recv()` 接收消息，持久化到 PostgreSQL，再发到 Kafka
2. **下行（Downlink）**：监听 Redis Pub/Sub 频道，把服务端要推送的消息通过 `Send()` 下发给客户端

这两个操作都是阻塞的——`Recv()` 等客户端发消息，`pubsub.Channel()` 等 Redis 推送。不能串行执行，否则一条消息进来时另一条推送就卡住了。

Go 的解法很自然：用 goroutine 把两个方向拆开并发执行。但问题来了——如果下推 goroutine 里 `stream.Send()` 失败了（比如客户端断连），上推主循环怎么知道？两个 goroutine 之间需要一种**跨 goroutine 的错误传播机制**。

### 解决

核心思路是上下行拆成两个 goroutine，通过一个带缓冲的 `errChan` 传递错误。下推 goroutine 遇到错误时写入 channel，上推主循环在每次 `Recv()` 后检查这个 channel：

```go
func (s *ChatService) Chat(stream pb.ChatService_ChatServer) error {
    // 第一条消息做认证（客户端连接后先发自带 token 的消息）
    firstMsg, _ := stream.Recv()
    claims, _ := utils.ParseToken(firstMsg.GetToken())
    userID := claims.UserID

    // 设置在线状态，Redis TTL 10 分钟
    s.redis.SetOnlineStatus(userID, true)
    defer s.redis.SetOnlineStatus(userID, false)

    // 订阅该用户的 Redis Pub/Sub 推送频道
    pubsub := s.redis.Subscribe(fmt.Sprintf("user::%d::push", userID))
    defer pubsub.Close()

    // 跨 goroutine 错误传播通道，缓冲为 2
    errChan := make(chan error, 2)

    // 下推 goroutine：Redis Pub/Sub → gRPC Stream → 客户端
    go func() {
        for msg := range pubsub.Channel() {
            var chatMsg pb.ChatMessage
            proto.Unmarshal([]byte(msg.Payload), &chatMsg)
            if err := stream.Send(&chatMsg); err != nil {
                errChan <- err
                return
            }
        }
    }()

    // 上推主循环：客户端 → gRPC Stream → PostgreSQL + Kafka
    for {
        msg, err := stream.Recv()
        if err == io.EOF { return nil }
        if err != nil { return err }

        // 检查下推侧是否有错误
        select {
        case e := <-errChan: return e
        default:
        }

        // 生成全局唯一 ID（Snowflake）和时间戳
        msg.MsgId = s.snowflake.Generate()
        msg.Timestamp = time.Now().UnixMilli()
        s.messageRepo.Save(msg)       // 持久化到 PostgreSQL
        s.produceToKafka(msg)         // 异步发到 Kafka
    }
}
```

这段代码的结构其实很清晰：认证 → 订阅 → 启下推 goroutine → 主循环做上推。关键在于那个 `select` + `default` 的非阻塞检查——每次收到消息后顺便看一眼下推侧有没有出问题，有就立即退出。

### 分析

几个设计细节值得展开说：

**errChan 缓冲为什么是 2？** 整个 Chat 方法里只有两个 goroutine 可能往里写错误：下推 goroutine 和上推主循环。缓冲为 2 意味着任何一个 goroutine 写入错误时都不会被阻塞。如果缓冲为 1，当两个 goroutine 几乎同时遇到错误时，第二个写入者会被阻塞在 channel 操作上，可能导致 goroutine 泄漏。缓冲为 2 保证了"写完就走"的语义。

**context 级联取消**：gRPC 的 `stream.Context()` 与流的生命周期绑定。当客户端断连时，这个 context 会被自动取消。下推 goroutine 中可以用 `select` 监听 `case <-stream.Context().Done()` 来感知流是否还活着，避免在已关闭的流上继续 Send。实际项目中我在下推循环里加了这个检查，确保 goroutine 能及时退出，不会变成孤儿进程。

**Redis TTL 做心跳续期**：在线状态设置了 10 分钟 TTL，客户端每隔几分钟发一次心跳消息来续期。这比在应用层维护一个 `map[userID]lastHeartbeat` 再开定时器扫描优雅得多。如果客户端崩溃（进程被杀、电脑断电），心跳自然停止，10 分钟后 Redis 里的在线状态自动过期。用 Redis 的 key 过期机制做了超时检测，把"谁来清理过期状态"这个问题完全交给了 Redis。

**Snowflake ID 生成**：每条消息的 ID 用 Snowflake 算法生成——64 位 = 1 位符号 + 41 位时间戳 + 10 位机器 ID + 12 位序列号。趋势递增，对数据库 B-Tree 索引友好。不依赖中心节点，每毫秒可生成 4096 个 ID，单机完全够用。

### 知识点总结

**gRPC 双向流**：客户端和服务端各持有 stream 对象，可以同时调用 `Send()` 和 `Recv()`。底层 `stream.Send()` 和 `stream.Recv()` 可以在不同 goroutine 中安全调用（gRPC 内部有锁保护），但业务逻辑的错误处理需要自己协调。

**goroutine 并发**：Go 的并发模型是 CSP（Communicating Sequential Processes），通过 channel 在 goroutine 之间传递数据，而不是共享内存。这里上推和下推各跑一个 goroutine，通过 `errChan` 传递错误信号，是典型的 CSP 风格。

**errChan 错误传播**：Go 的 goroutine 没有"返回值"的概念，错误只能通过 channel 传出来。`errChan` 是跨 goroutine 错误传播的标准模式。缓冲大小要覆盖最大并发写入者数量，否则写入者可能永久阻塞（goroutine 泄漏）。

**context 生命周期**：Go 的 `context.Context` 是级联取消的标准机制。父 context 取消时，所有子 context 自动取消。gRPC 的 stream context 与连接生命周期绑定，是管理 goroutine 生命周期的天然工具。

**Redis TTL 心跳**：利用 Redis key 的过期机制做超时检测，而不是在应用层维护定时器。客户端定期续期（EXPIRE），不续期就自然过期。这种"让基础设施帮你做清理"的思路在分布式系统中很常见。

### 相关知识扩展

**Go 并发模式：fan-in / fan-out**：fan-out 是把一个输入分发给多个 worker 并行处理（比如一个消息队列分给 10 个消费者）；fan-in 是把多个输入合并到一个 channel（比如多个 goroutine 的结果汇聚到一个结果 channel）。本文的 errChan 其实是一种简化版的 fan-in——两个 goroutine 的错误信号汇聚到一个 channel。实际项目中更复杂的风扇模式会用到 `sync.WaitGroup` 和 `context.WithCancel` 来协调生命周期。

**gRPC 拦截器（Interceptor）**：类似 HTTP 中间件，可以在 RPC 调用前后插入逻辑。UnaryInterceptor 拦截一问一答的 RPC，StreamInterceptor 拦截流式 RPC。常见用途包括：认证（验证 token）、日志记录（记录每次调用）、限流（防止某个客户端疯狂发消息）。在 Rinne-IM 中，Login/Register 的 token 验证就可以放到拦截器里，而不是在每个方法开头手动调 `ParseToken`。

**连接池管理**：gRPC 客户端连接是长连接，创建成本高（TCP 握手 + HTTP/2 协商 + 可能的 TLS）。实际生产中不会每次 RPC 都创建新连接，而是维护一个连接池。Go 的 `google.golang.org/grpc` 包本身支持连接复用——一个 `grpc.ClientConn` 上可以创建多个 stream，底层共享同一个 HTTP/2 连接（多路复用）。如果连接断了，gRPC 客户端会自动重连（可以通过 `grpc.WithDefaultServiceConfig` 配置重试策略）。

### 学习路线与建议

1. **先跑通最简单的双向流**：写一个 echo 服务，客户端发什么服务端就回什么，理解 `Recv()` 和 `Send()` 的阻塞语义
2. **加入 goroutine 并发**：把收发拆到两个 goroutine 里，体会"为什么需要并发"以及"并发带来了什么新问题"
3. **实现 errChan 模式**：故意制造错误（比如关掉客户端），观察错误如何从一个 goroutine 传到另一个
4. **研究 context 取消**：在流断开后检查 goroutine 是否正确退出，用 `runtime.NumGoroutine()` 观察是否有泄漏
5. **加入 Redis Pub/Sub**：实现"外部事件触发下推"的场景，理解为什么下推不能放在上推的循环里

### 参考文章与延伸阅读

- [gRPC 官方文档：Streaming RPCs](https://grpc.io/docs/what-is-grpc/core-concepts/#bidirectional-streaming-rpc) —— 双向流 RPC 的概念和用法说明
- [Go Concurrency Patterns: Pipelines and cancellation](https://go.dev/blog/pipelines) —— Go 官方博客，pipeline 模式和 context 取消的经典讲解
- [Go by Example: Channels](https://gobyexample.com/channels) —— 通过示例理解 Go channel 的各种用法
- [gRPC Streaming and Flow Control](https://grpc.io/blog/grpc-flow-control/) —— gRPC 的流量控制机制，理解 Send/Recv 的底层行为
- [Redis Pub/Sub](https://redis.io/docs/latest/develop/interact/pubsub/) —— Redis 发布订阅的官方文档，包含消息格式和客户端 API
- [Snowflake ID 算法详解](https://blog.twitter.com/engineering/en_us/a/2010/announcing-snowflake) —— Twitter 工程博客，Snowflake 算法原始设计文档
