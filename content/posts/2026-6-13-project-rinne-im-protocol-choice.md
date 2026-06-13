---
title: "项目笔记：IM系统选什么通信协议"
date: "2026-6-13"
tags: ["Go", "gRPC", "WebSocket", "协议选型", "项目实战"]
excerpt: "kami works"
---

# IM 系统选什么通信协议

### 前情提要

Rinne-IM 是我从零搭建的全栈即时通讯系统，后端用 Go + gRPC 双向流 + PostgreSQL + Redis + Kafka，客户端用 Electron + React + TypeScript，部署走 Docker Compose 六容器编排。项目目的不是造产品，而是把分布式系统的核心概念在真实代码里走一遍。在动手写第一行代码之前，首先要回答一个根本问题：客户端和服务端之间用什么协议通信？

### 问题

IM 系统的通信协议选型直接决定了整个项目的技术走向。主流的长连接方案有三种：WebSocket、HTTP 长轮询、gRPC 双向流。每种方案都有明确的适用场景，但也各有代价。

WebSocket 是浏览器原生支持的全双工协议，生态最成熟，几乎所有 IM 产品的 Web 端都用的它。HTTP 长轮询兼容性最好（任何浏览器都能跑），但效率最低——客户端不断发请求问"有新消息吗"，大量请求是废的。gRPC 双向流基于 HTTP/2，强类型、自动生成代码、支持多路复用，但浏览器端不原生支持。

我想做的不是一个"能用就行"的 demo，而是认真走一遍工业级的技术决策流程。所以选型的标准不只是"哪个能跑"，还包括：学到的东西有多少？对以后做分布式项目有没有帮助？

### 解决

最终选了 gRPC 双向流。核心理由是：**学习目的优先**。

gRPC 的 Protobuf 协议定义机制意味着你先写一份 `.proto` 文件，然后 `protoc` 编译器自动生成 Go、TypeScript、Java 等多语言的类型安全代码。服务端和客户端共享同一份协议定义，任何一方改了字段类型，编译阶段就会报错。这比手动维护 JSON 的字段约定靠谱得多。

浏览器不支持 gRPC 的问题通过 Electron 绕开。Electron 的 Main Process 是一个完整的 Node.js 环境，可以原生运行 gRPC 客户端（`@grpc/grpc-js`），不依赖浏览器。Renderer Process（React 前端）通过 Electron 的 IPC 机制与 Main Process 通信，间接使用 gRPC。

先用 Protobuf 定义协议。`Chat` 方法是核心的双向流 RPC：

```protobuf
service ChatService {
  // 双向流：客户端和服务端可以同时发送消息
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
  rpc Login(LoginRequest) returns (LoginResponse);
  rpc Register(RegisterRequest) returns (RegisterResponse);
}

message ChatMessage {
  int64 msg_id = 1;
  int64 sender_id = 2;
  int64 receiver_id = 3;
  string content = 4;
  int64 timestamp = 5;
  int32 msg_type = 6;
  bool is_group_msg = 8;
  string group_id = 9;
}
```

`protoc` 编译后生成 Go 代码，服务端和客户端共享同一份协议，类型安全。字段编号（`= 1`, `= 2`...）是 Protobuf 的二进制编码标识，一旦定义不要随意修改，否则会导致新旧版本不兼容。

### 分析

三种协议各有所长，选型要看具体场景：

**WebSocket** 适合 Web 端 IM。浏览器原生支持，`new WebSocket(url)` 就能建立连接。双向通信，延迟低。缺点是没有内置的序列化规范——你发 JSON 也行，发自定义二进制也行，需要自己定义应用层协议。多人协作时容易出现"你加的字段我没处理"的问题。

**gRPC 双向流** 适合桌面客户端和微服务间通信。强类型、自动代码生成、HTTP/2 多路复用（一个 TCP 连接上跑多个流）。代价是浏览器不能直接调用（需要用 gRPC-Web 做转换），学习曲线比 WebSocket 陡。

**SSE（Server-Sent Events）** 是单向推送——只能服务端往客户端发。基于 HTTP，实现简单。适合通知推送、股票行情这种"服务端持续推数据，客户端只读"的场景。IM 需要双向通信，所以 SSE 不合适。

关于 Electron 的安全模型，这里值得多说两句。Electron 把进程分成 Main Process 和 Renderer Process。Main Process 有完整的 Node.js 能力和系统权限；Renderer Process 本质是一个浏览器沙箱，不应该直接接触 Node.js API。两者之间通过 IPC（`ipcMain` / `ipcRenderer`）通信。安全最佳实践是用 Preload 脚本的 `contextBridge` 暴露类型安全的 API 给 Renderer，而不是直接暴露 `ipcRenderer`——后者相当于给 XSS 攻击开了后门。

### 知识点总结

**gRPC 双向流**：区别于 unary RPC（一问一答），双向流允许客户端和服务端同时发送消息流。底层基于 HTTP/2 多路复用，一个 TCP 连接上可以跑多个流。`.proto` 文件中 `stream` 关键字标记流式参数，客户端和服务端都可以是流式的。

**Protobuf 序列化**：Google 开发的高效序列化格式，比 JSON 小 3-10 倍，解析快 20-100 倍。`.proto` 文件既是协议定义也是文档，字段编号是二进制编码的标识符。`protoc` 编译后自动生成多语言的类型安全代码，消除了手动序列化/反序列化的 bug 源。

**WebSocket 全双工**：HTTP 协议升级后建立的全双工 TCP 连接，客户端和服务端可以随时互相发送数据。没有 gRPC 的强类型约束，应用层协议需要自己设计。

**SSE 单向推送**：基于 HTTP 的单向通信机制，服务端持续向客户端推送事件。`Content-Type: text/event-stream`，浏览器通过 `EventSource` API 接收。适合通知、监控仪表盘等场景。

### 相关知识扩展

**HTTP/2 多路复用**：HTTP/1.1 的队头阻塞问题——同一个 TCP 连接上，前一个请求没响应完，后一个请求只能等着。HTTP/2 引入 stream 和 frame 概念，一个 TCP 连接上可以并行跑多个请求/响应流，互不阻塞。gRPC 正是构建在 HTTP/2 之上的，这也是 gRPC 双向流能高效运行的底层基础。

**QUIC 协议**：Google 主导的下一代传输协议（HTTP/3 的底层），基于 UDP 实现。解决了 TCP 的队头阻塞问题（TCP 层丢包会阻塞所有 stream，QUIC 每个 stream 独立可靠传输）。建连速度快（0-RTT 或 1-RTT），内置 TLS 1.3。gRPC 社区已经有基于 QUIC 的实验性实现，未来可能替代 HTTP/2 成为 gRPC 的默认传输层。

**各协议的性能对比**：从序列化效率看，Protobuf 远优于 JSON（体积小、解析快）；从连接管理看，gRPC 的 HTTP/2 多路复用优于 WebSocket 的单连接单流；从浏览器兼容性看，WebSocket 完胜；从开发效率看，gRPC 的自动代码生成省去了大量手动序列化工作。实际项目中，很多 IM 系统会同时使用多种协议——Web 端用 WebSocket，桌面/移动端用 gRPC，后端微服务间也用 gRPC。

### 学习路线与建议

1. **先理解 Protobuf**：写几个 `.proto` 文件，用 `protoc` 生成 Go 和 TypeScript 代码，感受序列化和反序列化过程，理解字段编号的含义
2. **从 unary RPC 开始**：实现 Login/Register 这种一问一答的 RPC，跑通"客户端发请求 → 服务端处理 → 返回响应"的完整链路
3. **再上双向流**：实现 Chat 方法，先做最简单的 echo（收到什么就回传什么），确认双向通信跑通
4. **理解 Electron 进程模型**：写一个最简单的 Electron 应用，在 Main Process 里调 gRPC，通过 IPC 把结果传给 Renderer，搞清楚 Main / Renderer / Preload 三者的关系
5. **对比实验**：同一个功能分别用 WebSocket 和 gRPC 实现一遍，体会两者的差异
6. **阅读 .proto 生成的代码**：打开 `protoc` 生成的 Go 文件，看看 stream 接口是怎么定义的，理解 gRPC 框架的代码生成逻辑

### 参考文章与延伸阅读

- [gRPC 官方文档：Core Concepts](https://grpc.io/docs/what-is-grpc/core-concepts/) —— unary、server streaming、client streaming、bidirectional streaming 四种模式的完整介绍
- [Protocol Buffers Language Guide](https://protobuf.dev/programming-guides/proto3/) —— Protobuf 3 语法指南，字段编号、类型映射、默认值规则
- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) —— Electron 官方文档，Main / Renderer / Preload 进程模型的详细说明
- [HTTP/2 vs HTTP/1.1](https://http2.github.io/faq/) —— HTTP/2 常见问题解答，多路复用、流优先级、队头阻塞等核心概念
- [gRPC-Web: Moving past the limitations](https://grpc.io/blog/state-of-grpc-web/) —— gRPC-Web 的现状和浏览器端 gRPC 的替代方案
- [QUIC Protocol Overview](https://datatracker.ietf.org/doc/html/rfc9000) —— QUIC 协议 RFC 9000，理解下一代传输层协议的设计思路
