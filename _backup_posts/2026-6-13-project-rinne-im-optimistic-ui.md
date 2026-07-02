---
title: "项目笔记：IM客户端怎么做到发完消息立刻显示"
date: "2026-6-13"
tags: ["TypeScript", "React", "乐观更新", "前端", "项目实战"]
excerpt: "kami works"
---

# IM 客户端怎么做到发完消息立刻显示

### 前情提要

Rinne-IM 是一个 Go + gRPC 双向流 + PostgreSQL + Redis + Kafka 的全栈 IM 系统，客户端用 Electron + React + TypeScript。后端的协议、并发、消息投递都已经搞定，现在焦点转到客户端——用户打开聊天窗口，打了一句话点发送，消息应该**立刻**出现在聊天气泡列表里。但实际上，消息要经过 gRPC 网络传输、服务端持久化、生成 ID、发 Kafka、Redis Pub/Sub 再推回来，整个链路至少 100-200ms。

### 问题

最直觉的实现方式是：用户点发送 → 客户端调 gRPC → 等服务端返回确认 → 显示消息。问题很明显，每条消息都有 100-200ms 的"空白等待期"。用户在弱网环境下（延迟 500ms+）体验更差——点完发送半秒后消息才出现，用户会以为发送失败然后重复点击。

观察微信、Telegram、WhatsApp 这些成熟的 IM 产品，它们都是**点完发送消息立刻出现**，右下角可能有个小圈表示"发送中"，但消息本身已经显示了。这就是所谓的"乐观更新"（Optimistic UI）——假设操作大概率会成功，先乐观地把结果展示给用户，等真正的确认回来再更新状态。

### 解决

核心思路：消息发出后立刻显示在聊天列表中，状态标为 `sending`；收到服务端确认后改为 `sent`；对方已读后改为 `read`。

```typescript
const sendMessage = (content: string, receiverId: number) => {
  // 生成临时 ID，用于本地追踪这条消息
  const tempMsg = {
    msgId: Date.now(),
    senderId: currentUser.userId,
    receiverId,
    content,
    timestamp: Date.now(),
    status: 'sending',
  };
  // 立刻显示在聊天列表中——用户零等待
  setMessages(prev => [...prev, tempMsg]);
  // 通过 Electron IPC 发给 Main Process，由 gRPC 客户端发出
  window.electronAPI.chat.send({ receiverId, content });
};

// 监听服务端返回的消息（包含真实 msgId 和时间戳）
window.electronAPI.chat.onMessage((serverMsg) => {
  setMessages(prev => prev.map(msg =>
    msg.msgId === serverMsg.msgId
      ? { ...msg, status: 'sent', msgId: serverMsg.msgId }
      : msg
  ));
});
```

这里有一个关键问题：**临时 ID 和真实 ID 的映射**。客户端用 `Date.now()` 生成临时 ID（毫秒级时间戳），在正常用户操作频率下不会冲突（人不可能在一毫秒内发两条消息）。服务端收到消息后用 Snowflake 算法生成全局唯一 ID，返回给客户端时客户端用临时 ID 匹配并替换。

消息状态的完整生命周期是一个小型状态机：

```
sending → sent → read
  ↓
failed（发送失败，显示重试按钮）
```

```typescript
// 发送失败的处理：标记 failed 状态，提供重试能力
const handleSendError = (tempMsgId: number) => {
  setMessages(prev => prev.map(msg =>
    msg.msgId === tempMsgId
      ? { ...msg, status: 'failed' }
      : msg
  ));
};

// 重试：用原始内容重新发送
const retryMessage = (failedMsg: Message) => {
  setMessages(prev => prev.map(msg =>
    msg.msgId === failedMsg.msgId
      ? { ...msg, status: 'sending' }
      : msg
  ));
  window.electronAPI.chat.send({
    receiverId: failedMsg.receiverId,
    content: failedMsg.content,
  });
};
```

### 分析

**临时 ID 用 `Date.now()` 够不够？** 对于单人 IM 客户端完全够用。毫秒级精度 + 单人操作，不可能产生冲突。如果是多人协作编辑（比如 Google Docs 那种场景），就需要更复杂的 ID 策略——UUID v4（随机生成）、ULID（时间有序 + 随机后缀）、或者 CRDT（Conflict-free Replicated Data Types）。

**Electron IPC 通信**：Renderer Process（React）不能直接调用 gRPC，必须通过 Electron 的 IPC 与 Main Process 通信。Preload 脚本通过 `contextBridge.exposeInMainWorld` 暴露类型安全的 API（`window.electronAPI.chat.send` / `window.electronAPI.chat.onMessage`），Renderer 不需要知道 gRPC 的存在——它只看到一个"发消息"和"收消息"的接口。这种封装让前端逻辑与传输层解耦，如果以后想从 gRPC 换成 WebSocket，只需要改 Main Process 的实现，React 代码一行不用动。

**乐观更新的风险与回滚**：乐观更新假设操作大概率成功。如果发送失败了怎么办？上面代码中的 `handleSendError` 把状态改为 `failed`，UI 上显示红色感叹号和重试按钮。如果服务端长时间没有确认（超时），也可以主动把 `sending` 改为 `failed`。这比"等确认才显示"的策略好得多——后者在失败时用户什么都没有，前者在失败时用户能看到哪条消息出了问题并手动重试。

**消息状态机的设计**：`sending → sent → read` 是一个单向状态机，每个状态只能向前转移（失败时走 `failed` 分支）。这种单向性让 UI 逻辑非常清晰——不需要处理"从 sent 回到 sending"这种奇怪的状态跳转。WhatsApp 的单勾（已送达服务端）、双蓝勾（已读）本质上就是这种状态机的视觉表达。

### 知识点总结

**乐观更新（Optimistic UI）**：在操作完成之前就把结果展示给用户，等真正的确认后更新状态。核心假设是"操作大概率会成功"。适用于用户体验敏感的场景（IM 发消息、点赞、购物车添加）。反模式是"悲观更新"——必须等确认才展示结果，用户体验差但实现简单。

**临时 ID 策略**：客户端在本地生成临时标识符用于追踪未完成的操作，服务端确认后替换为真实 ID。常见生成方式：`Date.now()`（简单、时间有序）、UUID v4（全局唯一但无序）、ULID（时间有序 + 全局唯一）。选择取决于并发量和排序需求。

**消息状态机**：有限状态机（FSM）在 UI 中的应用。消息有明确的生命周期（sending → sent → read），每个状态对应不同的 UI 表现（转圈 / 单勾 / 双勾）。状态机保证了状态转换的合法性和可预测性。

**Electron IPC 通信**：Electron 的 Main Process 和 Renderer Process 之间通过 `ipcMain` / `ipcRenderer` 通信。安全最佳实践是用 Preload 脚本的 `contextBridge` 暴露最小化、类型安全的 API，而不是直接暴露整个 `ipcRenderer`。

### 相关知识扩展

**CRDT 冲突解决**：当多个客户端可以同时修改同一份数据时（比如协作文档），需要一种无需中心仲裁就能解决冲突的数据结构。CRDT（Conflict-free Replicated Data Types）保证所有副本最终一致，不需要锁或事务。LWW-Register（Last-Writer-Wins）是最简单的 CRDT——每个值附带时间戳，时间戳大的赢。更复杂的 CRDT 如 RGA（Replicated Growable Array）用于文本编辑场景。IM 消息天然是 append-only 的，不需要 CRDT，但了解 CRDT 对做协同类产品很有帮助。

**离线消息队列**：如果客户端在断网时用户继续发消息怎么办？可以在本地维护一个"发送队列"——消息存入 IndexedDB 或 SQLite，网络恢复后按顺序发出。Telegram 就是这么做的：断网时消息显示"等待中"，联网后自动批量发送。实现时要注意顺序保证和去重——断网期间发的消息可能已经通过另一台设备发出去了。

**WhatsApp 的双勾机制**：单灰勾 = 消息已发送到服务端（对应我们的 `sent`），双灰勾 = 消息已送达对方设备（对应一个中间的 `delivered` 状态），双蓝勾 = 对方已读（对应我们的 `read`）。这意味着 WhatsApp 的状态机比我们多了一个 `delivered` 状态。在 Rinne-IM 中可以通过"接收方收到消息后回传 ACK"来实现这个状态，但为了简化没有做。

### 学习路线与建议

1. **先实现最简单的"等确认再显示"**：感受 200ms 延迟带来的卡顿感，理解为什么需要优化
2. **加入乐观更新**：用临时 ID 先显示消息，收到服务端确认后替换 ID 和状态
3. **实现完整的状态机**：sending / sent / read / failed 四个状态，每个状态对应不同的 UI 样式
4. **加入超时和重试**：发送后 5 秒没收到确认就标 failed，点击重试按钮重新发送
5. **理解 Electron IPC**：写一个最简单的 Electron 应用，在 Main Process 里 `console.log`，在 Renderer 里通过 `contextBridge` 调用，搞清楚进程间通信的流程

### 参考文章与延伸阅读

- [Optimistic UI: A Simple, Practical Pattern](https://uxdesign.cc/optimistic-ui-a-simple-practical-pattern-b01b3ed63c61) —— 乐观更新的设计理念和实现模式
- [Electron contextBridge API](https://www.electronjs.org/docs/latest/api/context-bridge) —— Electron 官方文档，安全暴露 API 给 Renderer 的方法
- [React Optimistic Updates](https://react.dev/reference/react/useOptimistic) —— React 19 内置的 `useOptimistic` Hook，框架级别的乐观更新支持
- [State Machines in React](https://xstate.js.org/docs/) —— XState 库，用有限状态机管理复杂 UI 状态
- [ULID: Universally Unique Lexicographically Sortable Identifier](https://github.com/ulid/spec) —— ULID 规范，时间有序 + 全局唯一的 ID 生成方案
- [WhatsApp Message Info](https://faq.whatsapp.com/539178204879377) —— WhatsApp 官方对消息状态（单勾、双勾、蓝勾）的解释
