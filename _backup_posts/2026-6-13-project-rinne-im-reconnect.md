---
title: "项目笔记：gRPC断连了怎么自动重连"
date: "2026-6-13"
tags: ["TypeScript", "gRPC", "断线重连", "指数退避", "项目实战"]
excerpt: "kami works"
---

# gRPC 断连了怎么自动重连

### 前情提要

Rinne-IM 是一个 Go + gRPC 双向流 + PostgreSQL + Redis + Kafka 的全栈 IM 系统，客户端用 Electron + React + TypeScript。前面几篇解决了协议选型、双向流并发、消息投递和乐观更新的问题。现在系统基本能跑了，但有一个现实问题还没处理——**网络波动导致 gRPC 流断开是常态**，WiFi 切换、信号差、服务端重启都会导致连接中断。如果没有自动重连机制，用户每次断网都要手动重启客户端。

### 问题

gRPC 双向流一旦建立，客户端和服务端就通过一个长连接持续通信。但这个连接是脆弱的——任何网络中断都会导致流断开。断连后客户端的表现是：`stream.Recv()` 抛出错误，`stream.Send()` 失败，下推 goroutine 退出，整个 Chat 方法返回错误。

对于用户来说，最直接的感知是"消息发不出去了"。如果不做重连，用户只能看到一堆错误提示，然后手动退出再登录。这在真实网络环境中完全不可接受——地铁上信号差了几秒，总不能让人重新登录吧？

重连不能简单地"断了就立刻重连"。如果服务端正在重启，100 个客户端同时断连然后同时重连，服务端刚启动就被打挂，然后再次断连、再次重连——形成恶性循环。这就是分布式系统中经典的**惊群效应**（Thundering Herd Problem）。

### 解决

采用指数退避（Exponential Backoff）策略：重连间隔从 1 秒开始，每次失败后翻倍，上限 30 秒，最多尝试 10 次：

```typescript
class ChatService {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private stream: ClientReadableStream<ChatMessage> | null = null;

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnect-failed');
      return;
    }
    // 指数退避：1s → 2s → 4s → 8s → 16s → 30s → 30s ...
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      30000
    );
    this.reconnectAttempts++;
    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      delay,
    });
    setTimeout(() => this.startChatStream(this.token), delay);
  }

  private startChatStream(token: string) {
    const stream = this.client.chat();
    // 发送认证消息
    stream.write({ token } as any);

    stream.on('data', (msg: ChatMessage) => {
      // 收到消息 → 重连成功，重置计数器
      this.reconnectAttempts = 0;
      this.emit('message', msg);
    });

    stream.on('error', (err: Error) => {
      console.error('Stream error:', err.message);
      this.scheduleReconnect();
    });

    stream.on('end', () => {
      console.log('Stream ended');
      this.scheduleReconnect();
    });

    this.stream = stream;
  }
}
```

重连成功后（收到第一条消息），`reconnectAttempts` 重置为 0。下次断连再从 1 秒开始。

### 分析

**为什么用指数退避而不是固定间隔？** 考虑服务端重启的场景：100 个客户端同时断连。如果用固定 5 秒重连间隔，5 秒后 100 个客户端同时重连，服务端可能再次被打挂。用指数退避，第一个客户端 1 秒后重连，第二个 2 秒后，第三个 4 秒后……每个客户端的重连时间自然错开，服务端有足够时间逐个处理。

但实际上，如果 100 个客户端的退避序列完全一样（1s、2s、4s、8s...），它们还是会在同一秒重连——因为它们的断连时刻可能差不多。所以需要引入 **jitter（随机抖动）**：

```typescript
// 加 jitter：实际延迟在 [delay/2, delay] 之间随机
const delay = Math.min(
  1000 * Math.pow(2, this.reconnectAttempts),
  30000
);
const jitter = delay * (0.5 + Math.random() * 0.5);
setTimeout(() => this.startChatStream(this.token), jitter);
```

加了 jitter 后，即使 100 个客户端的退避基数都是 4 秒，实际延迟分布在 2-4 秒之间的随机值，大幅降低了同时重连的概率。AWS 官方博客有一篇经典文章专门讲这个问题——"Exponential Backoff And Jitter"，是分布式系统重连策略的必读材料。

**重连次数上限为什么是 10 次？** 无限制重连会导致客户端在服务端永久下线时持续消耗资源（每 30 秒尝试一次，永不放弃）。10 次上限覆盖的时间窗口是 1s + 2s + 4s + 8s + 16s + 30s + 30s + 30s + 30s + 30s ≈ 181 秒，大约 3 分钟。如果 3 分钟都连不上，大概率是服务端真的出了问题，这时候通知用户"连接失败，请检查网络"比无限等待更合理。

**重连成功后的状态恢复**：重连后 gRPC stream 是全新的，之前的 stream 对象已经失效。需要重新发送认证消息（token）、重新建立订阅关系。断连期间对方发来的消息不会丢失——它们在服务端已经被持久化到 PostgreSQL，重连后客户端可以从数据库拉取断连期间的未读消息。

### 知识点总结

**指数退避（Exponential Backoff）**：每次重试失败后等待时间翻倍的策略。公式：`delay = base * 2^attempt`，配合上限 cap 防止等待时间过长。广泛用于网络重试、API 限流后的等待、分布式锁重试等场景。

**惊群效应（Thundering Herd Problem）**：大量客户端在同一时刻发起相同操作，导致服务端瞬时过载。典型场景：服务端重启后所有客户端同时重连、缓存过期后大量请求同时穿透到数据库。解法包括：随机延迟（jitter）、令牌桶限流、分层缓存。

**Jitter 随机抖动**：在确定性退避策略中加入随机因素，打破多个客户端的同步性。Full Jitter 的公式是 `delay = random(0, base * 2^attempt)`，Equal Jitter 是 `delay = base * 2^attempt / 2 + random(0, base * 2^attempt / 2)`。AWS 的实验表明 Full Jitter 在大多数场景下效果最好。

**重连策略**：完整的重连机制包括——退避策略（指数退避 + jitter）、重试上限（防止无限重试）、状态通知（让 UI 显示"正在重连"）、重连后状态恢复（重新认证、拉取离线消息）。

### 相关知识扩展

**Circuit Breaker 熔断器**：当某个下游服务连续失败时，熔断器会自动"断开"——后续请求直接返回错误，不再尝试调用下游。过一段时间后进入"半开"状态，放行少量请求试探下游是否恢复。如果试探成功，熔断器关闭，恢复正常流量。这比指数退避更上层——退避是单个请求的重试策略，熔断器是系统级的保护机制。在微服务架构中，gRPC 客户端配合熔断器（比如 go-resilience 库的 circuit breaker 实现）可以避免对故障服务的无效调用雪崩。

**Health Check 健康检查**：gRPC 官方支持的健康检查协议——服务端暴露 `grpc.health.v1.Health` 服务，客户端可以定期查询服务是否可用。结合重连策略，客户端可以先做健康检查，确认服务端恢复后再建立数据流，而不是盲目重连。gRPC 的 `waitForReady` 选项也可以让 RPC 在连接不可用时排队等待，而不是立即失败。

**gRPC Keepalive 机制**：gRPC 内置了 keepalive 参数用于检测死连接。客户端可以配置 `keepalive.time`（多久发一次 keepalive ping）和 `keepalive.timeout`（ping 多久没回应就认为连接死了）。默认值通常比较保守（几分钟），在 IM 场景中可能需要调低到 20-30 秒，以便更快发现断连并触发重连。注意：keepalive 频率不能设得太高，否则会被服务端视为滥用连接并主动断开。

```typescript
// gRPC 客户端 keepalive 配置示例
const client = new ChatServiceClient(
  'localhost:50051',
  grpc.credentials.createInsecure(),
  {
    'grpc.keepalive_time_ms': 20000,      // 20 秒发一次 keepalive
    'grpc.keepalive_timeout_ms': 5000,    // 5 秒没回应就认为断开
    'grpc.keepalive_permit_without_calls': 1, // 空闲时也发 keepalive
  }
);
```

### 学习路线与建议

1. **先手动断连观察行为**：启动客户端和服务端，手动杀掉服务端进程，观察客户端的错误日志和 gRPC stream 的状态变化
2. **实现最简重连**：断了就立刻重连（没有退避），跑通"断连 → 重连 → 恢复通信"的基本流程
3. **加入指数退避**：观察重连间隔是否按 1s、2s、4s... 递增
4. **加入 jitter**：启动多个客户端同时断连，验证重连时间是否被随机错开
5. **完善 UI 反馈**：在 React 中显示重连状态（"正在重连... 第 3 次尝试"），重连失败后显示"连接断开，请检查网络"
6. **研究 keepalive**：调整 gRPC keepalive 参数，观察对断连检测速度的影响

### 参考文章与延伸阅读

- [AWS Architecture Blog: Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) —— 指数退避和 jitter 的经典文章，包含多种 jitter 策略的对比实验
- [gRPC Keepalive Documentation](https://grpc.io/docs/guides/keepalive/) —— gRPC 官方 keepalive 机制的详细说明和推荐配置
- [gRPC Connection Management](https://grpc.io/docs/guides/connection-management/) —— gRPC 连接生命周期管理，包括重连、idle 状态、keepalive
- [Martin Kleppmann: Designing Data-Intensive Applications (Chapter 8)](https://dataintensive.net/) —— 故障检测、超时、重试章节，系统性讲解分布式系统中的故障处理
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html) —— Martin Fowler 对熔断器模式的经典描述
- [The Tail at Scale](https://research.google/pubs/pub40801/) —— Google 论文，分析分布式系统中长尾延迟的成因和应对策略，重连和超时设计的重要参考
