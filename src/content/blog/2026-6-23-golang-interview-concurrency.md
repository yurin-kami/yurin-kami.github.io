---
title: "Golang 面试题：Channel、并发与同步原语"
date: "2026-6-23"
tags: ["Go", "面试", "并发", "Channel"]
excerpt: "围绕 goroutine、channel、select、锁、WaitGroup 与 context，梳理 Go 并发面试中的核心考点。"
---

# Golang 面试题：Channel、并发与同步原语

Go 并发题几乎是面试必问。答题时重点不是只会写 API，而是能说明同步关系、退出路径和资源回收。

## 1. goroutine 和线程有什么区别？

- goroutine 是用户态轻量执行单元。
- 线程是操作系统调度单位。
- Go 运行时会把大量 goroutine 调度到少量线程上执行。

## 2. channel 的作用是什么？

channel 不只是传值，它还承担：

- goroutine 之间通信
- 执行顺序同步
- 生命周期协作

## 3. 无缓冲和有缓冲 channel 怎么区分？

- 无缓冲更偏强同步。
- 有缓冲更像有限队列，用来解耦生产和消费节奏。

## 4. `select` 常用来解决什么问题？

- 多路等待
- 超时控制
- 取消控制
- 避免某一条路径永久阻塞

## 5. `Mutex`、`RWMutex`、`WaitGroup`、`context` 分别管什么？

- 锁负责共享数据安全。
- `RWMutex` 更适合读多写少。
- `WaitGroup` 负责等待一组任务完成。
- `context` 负责超时、取消和请求级生命周期控制。

## 6. 并发题怎么答得更完整？

建议按这个顺序：

1. 是否存在共享数据。
2. 是否需要顺序协作。
3. 退出条件是什么。
4. 是否有超时或取消路径。

## 速记版

- goroutine 轻量，线程重量级。
- channel 既传值，也同步。
- `select` 处理多路等待和超时取消。
- `WaitGroup` 管等待，`context` 管生命周期。
