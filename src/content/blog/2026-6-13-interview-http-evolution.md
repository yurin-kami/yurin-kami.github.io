---
title: "面试笔记：HTTP/1.1、HTTP/2和HTTP/3有什么区别"
date: "2026-6-13"
tags: ["HTTP", "网络编程", "HTTPS", "面试", "八股文"]
excerpt: "kami works"
---

## 前情提要

上一篇整理完 TCP 三次握手之后，自然就到了应用层的核心协议——HTTP。面试官问完 TCP 之后，几乎一定会追问："HTTP/1.1、HTTP/2、HTTP/3 有什么区别？HTTPS 的握手流程是什么？TLS 1.3 做了什么改进？"这三个问题串在一起，其实就是一部 Web 性能的演进史。

## 面试问题

> "请对比 HTTP/1.1、HTTP/2 和 HTTP/3 的核心区别，并说明 HTTPS 与 TLS 1.3 在安全层面上的改进。"

## 回答

### HTTP/1.1：经典但不够快

HTTP/1.1 是我们最熟悉的版本。它最大的改进是引入了 **Keep-Alive**，允许在一个 TCP 连接上发送多个请求，避免了 HTTP/1.0 每次请求都要重新建连接的开销。

但 Keep-Alive 有一个致命问题：**队头阻塞（Head-of-Line Blocking）**。虽然连接复用了，但请求是严格串行的——前一个请求的响应没回来，后面的请求就只能排队等着。

```plain
请求 1 ──────────► 响应 1
                        请求 2 ──────────► 响应 2
                                              请求 3 ──────────► 响应 3
```

为了绕过这个限制，浏览器通常会同时开 6-8 个 TCP 连接来并行请求资源，但这又带来了连接数过多、资源浪费的问题。

### HTTP/2：多路复用，一个连接搞定一切

HTTP/2 在 2015 年发布，核心思路是：**在同一个 TCP 连接上实现真正的并行**。

它引入了几个关键概念：

- **二进制分帧**：把 HTTP 消息拆成二进制帧传输，不再像 HTTP/1.1 那样用纯文本，解析更高效、更不容易出错。
- **多路复用（Multiplexing）**：多个请求和响应可以在同一个 TCP 连接上同时交错传输，彻底解决了 HTTP 层面的队头阻塞。
- **头部压缩（HPACK）**：HTTP 头部往往有大量重复字段（Cookie、User-Agent 等），HPACK 通过维护一个动态字典来压缩头部，节省带宽。
- **服务器推送（Server Push）**：服务器可以主动把客户端还没请求但大概率需要的资源推过去，比如 HTML 里引用的 CSS 文件。

```plain
          TCP 连接
┌──────────────────────────┐
│ Stream 1: 请求/响应 A     │
│ Stream 2: 请求/响应 B     │  ← 并行传输，互不阻塞
│ Stream 3: 请求/响应 C     │
└──────────────────────────┘
```

不过 HTTP/2 并没有解决 TCP 层的队头阻塞——如果底层 TCP 丢了一个包，所有 Stream 都得等这个包重传完成，这就是所谓的"TCP 队头阻塞"。

### HTTP/3（QUIC）：抛弃 TCP，拥抱 UDP

HTTP/3 做了一个激进的决定：**不再使用 TCP，转而基于 UDP 构建了一个新协议——QUIC**。

为什么这么做？因为 TCP 的可靠传输和拥塞控制是在内核实现的，改不动。QUIC 把可靠性、拥塞控制、加密全部放到了用户空间（应用层），灵活性大幅提升。

QUIC 的核心优势：

- **0-RTT 连接建立**：首次连接需要 1-RTT，但后续连接可以直接复用之前的密钥信息，实现 0-RTT，比 TCP+TLS 的 2-RTT 快得多。
- **无队头阻塞**：每个 Stream 独立进行丢包重传，Stream A 丢了包不影响 Stream B。
- **连接迁移**：用 Connection ID 标识连接而非四元组，手机从 WiFi 切到 4G 时连接不会断。

```plain
TCP + TLS 1.3 握手（2-RTT）       QUIC 握手（0/1-RTT）
─────────────────────────         ─────────────────────
Client → SYN → Server             Client → QUIC Initial → Server
Client ← SYN+ACK ← Server        Client ← Handshake ← Server
Client → ACK → Server             Client → 1-RTT Data → Server ✓
Client → TLS CH → Server
Client ← TLS SH ← Server
Client → Finished → Server
Client → 1-RTT Data → Server ✓
```

### HTTPS 与 TLS 1.3

HTTPS 就是 HTTP 跑在 TLS 之上。传统 TLS 1.2 的完整握手需要 2-RTT，而 TLS 1.3 做了大幅简化：

- **1-RTT 完整握手**：Client Hello 里直接带上密钥共享参数（Key Share），省去了 Server Hello 之后的单独密钥交换往返。
- **0-RTT 恢复**：类似 QUIC，可以在第一个报文里就带上应用数据。但需要注意防重放攻击。
- **砍掉了不安全的算法**：RSA 密钥传输、CBC 模式、SHA-1、3DES 等全部移除，只保留 AEAD 加密（如 AES-GCM、ChaCha20-Poly1305）。

TLS 1.3 的握手流程非常简洁：

```plain
Client                          Server
  |--- Client Hello               |
  |    (支持的算法 + Key Share) -->|
  |                               |
  |<-- Server Hello               |
  |    (选定算法 + Key Share) -----|
  |                               |
  |<-- Finished (加密) -----------|
  |                               |
  |--- Finished (加密) ---------->|
  |                               |
  |==== 加密通信开始 ==============|
```

## 分析

从 HTTP/1.1 到 HTTP/3，本质上是在解决不同层次的"队头阻塞"问题：

| 版本 | 解决的核心问题 | 底层传输 | 握手延迟 |
|------|--------------|---------|---------|
| HTTP/1.1 | 连接复用（Keep-Alive） | TCP | 1-RTT (TCP) |
| HTTP/2 | HTTP 层多路复用 | TCP | 1-RTT (TCP) + 1~2-RTT (TLS) |
| HTTP/3 | TCP 层队头阻塞 + 快速建连 | QUIC/UDP | 0~1-RTT （含 TLS) |

每一代协议都在追求更低的延迟和更高的传输效率。值得注意的是，HTTP/2 和 HTTP/3 在应用层语义上几乎一致（都是请求/响应模型），区别主要在传输层。

## 知识点总结

1. **HTTP/1.1 Keep-Alive** 解决了连接复用，但请求仍然串行，存在应用层队头阻塞。
2. **HTTP/2 多路复用** 在同一 TCP 连接上并行传输多个请求/响应，用 HPACK 压缩头部，支持服务器推送；但受限于 TCP 层的队头阻塞。
3. **HTTP/3 基于 QUIC（UDP）** 彻底消除 TCP 队头阻塞，支持 0-RTT 建连和连接迁移。
4. **TLS 1.3** 将握手从 2-RTT 简化到 1-RTT，支持 0-RTT 恢复，移除所有遗留不安全算法。
5. **HTTPS = HTTP + TLS**，无论哪个版本的 HTTP，安全层都依赖 TLS 提供加密和身份验证。

## 相关知识扩展

### gRPC 为什么用 HTTP/2

gRPC 选择 HTTP/2 作为底层协议，原因很直接：多路复用允许在单个连接上并行发送多个 RPC 调用，二进制分帧让消息边界更清晰，头部压缩减少了重复元数据的开销。同时 gRPC 利用了 HTTP/2 的 Stream 特性来实现双向流式通信（Streaming RPC），这在 HTTP/1.1 上几乎不可能高效实现。

### WebSocket 与 SSE 的对比

当需要服务器主动向客户端推送数据时，常见的方案有三种：

| 特性 | WebSocket | SSE | HTTP/2 Server Push |
|------|-----------|-----|--------------------|
| 通信方向 | 双向 | 单向（服务器→客户端） | 单向（服务器→客户端） |
| 协议 | 独立协议（ws://） | 基于 HTTP | 基于 HTTP/2 |
| 重连机制 | 需自行实现 | 浏览器自动重连 | 无（非持久连接） |
| 适用场景 | 聊天、游戏、协作编辑 | 通知推送、日志流、股票行情 | 预加载静态资源 |

WebSocket 在建立连接后会脱离 HTTP 协议，适合需要低延迟双向通信的场景。SSE 更轻量，天然基于 HTTP，对防火墙友好，适合服务器单向推送的场景。HTTP/2 的 Server Push 主要用于预加载资源，并不能替代前两者。

## 学习路线与建议

1. **先打基础**：把 HTTP/1.1 的 RFC 7230 读一遍，理解请求/响应模型、Keep-Alive 和分块传输。
2. **理解 HTTP/2**：重点掌握二进制分帧、Stream 优先级和 HPACK 压缩算法。可以用 `curl --http2` 实际体验。
3. **上手 HTTP/3**：用 Wireshark 抓包分析 QUIC 的握手过程，理解 0-RTT 是如何实现的。
4. **安全层**：读完 TLS 1.3 的 RFC 8446，重点关注握手简化和密钥交换流程。
5. **动手实践**：用 Nginx 配置一个同时支持 HTTP/2 和 HTTP/3 的反向代理，体感最直观。

## 参考文章与延伸阅读

- [RFC 7540 - HTTP/2](https://datatracker.ietf.org/doc/html/rfc7540)
- [RFC 9000 - QUIC Transport](https://datatracker.ietf.org/doc/html/rfc9000)
- [RFC 8446 - TLS 1.3](https://datatracker.ietf.org/doc/html/rfc8446)
- [Cloudflare - HTTP/3: The past, present, and future](https://blog.cloudflare.com/http3-the-past-present-and-future/)
- [Google - QUIC Design Document](https://docs.google.com/document/d/1gY9_YNDsTFHj9QgE-vLpRfGdMm2BYTdkj5n0R1VmEYQ)
