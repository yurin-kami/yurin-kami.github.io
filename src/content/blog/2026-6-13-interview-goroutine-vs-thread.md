---
title: "面试笔记：Goroutine和线程到底有什么区别"
date: "2026-6-13"
tags: ["Go", "并发编程", "面试", "八股文"]
excerpt: "kami works"
---

# 面试笔记：Goroutine 和线程到底有什么区别

### 前情提要

Go 并发几乎是后端面试的必考项，而"Goroutine 和线程的区别"往往是面试官抛出的第一个热身问题。看似基础，但要答得有条理、有深度并不容易。这篇笔记把这个问题单独拆出来，从表面对比到底层原理做一次完整的梳理。

### 问题

面试中常见的问法：

> "Goroutine 和操作系统线程有什么区别？Go 是怎么做到高并发的？"

这个问题表面上在问两者的差异，实际上考察的是你对 **Go runtime 调度机制**的理解深度。面试官期望听到的不只是"轻量级"三个字，而是你能从栈管理、调度方式、线程复用等维度展开说明。

### 回答

#### 一句话概括

Goroutine 是 Go runtime 管理的**用户态轻量级协程**，而线程是操作系统内核管理的执行单元。Goroutine 的创建、销毁和调度都不需要陷入内核态，这是它"轻"的根本原因。

#### 对比表格

| 特性 | Goroutine | OS Thread |
|------|-----------|-----------|
| 初始栈大小 | 2KB | 1-8MB（通常固定） |
| 栈增长 | 动态增长，最大 1GB，可收缩 | 固定大小 |
| 创建开销 | ~0.3us | ~10-100us |
| 上下文切换 | ~100ns（用户态） | ~1-10us（内核态） |
| 调度方 | Go runtime（GMP 模型） | 操作系统内核 |
| 并发数量 | 轻松百万级 | 通常几千到几万 |

#### 为什么 Goroutine 更轻量

有四个关键机制在支撑：

**1. 动态栈管理**

Goroutine 的栈从 2KB 起步，按需增长，空闲时还能收缩。这意味着启动一个 goroutine 几乎不占什么内存，而线程上来就要分配 MB 级别的固定栈空间。

**2. 用户态调度**

Goroutine 的调度完全在用户空间完成，不涉及系统调用。Go runtime 通过 GMP 模型自行管理哪些 goroutine 在哪些线程上运行。

**3. 复用线程（M:N 调度）**

多个 Goroutine 复用同一批 OS 线程。当某个 G 因系统调用阻塞时，runtime 会将 M（线程）和 P（逻辑处理器）解绑，让 P 去绑定空闲的 M 继续执行其他 G，保证并发度不下降。

**4. 内存池化**

Goroutine 的 `g` 结构体在退出后不会立即释放，而是放入池中复用，避免频繁分配和回收。

#### GMP 调度模型速览

GMP 是 Go scheduler 的核心，三个组件各司其职：

- **G（Goroutine）**：包含栈、指令指针、状态等，存放在 P 的本地队列或全局队列中。
- **M（Machine）**：对应一个 OS 线程，负责执行 G 中的代码。
- **P（Processor）**：逻辑处理器，维护一个本地 G 队列。P 的数量默认等于 CPU 核数，由 `GOMAXPROCS` 控制。

```go
// 查看当前 P 的数量
fmt.Println(runtime.GOMAXPROCS(0))

// 每个 P 维护本地队列，M 从 P 中取 G 执行
// 当本地队列为空时，P 会从全局队列或其他 P 的队列中"窃取"任务
```

调度器还有一个重要的机制——**工作窃取（work stealing）**：当某个 P 的本地队列空了，它会从其他 P 的队列中偷一半 G 过来执行，保证各 CPU 核负载均衡。

#### 代码示例

```go
// 启动 goroutine 极其简单
go func() {
    fmt.Println("hello from goroutine")
}()

// 轻松启动 10 万个 goroutine
for i := 0; i < 100000; i++ {
    go func(id int) {
        // 每个 goroutine 只占 2KB 初始栈
        time.Sleep(time.Second)
    }(i)
}
```

如果用 OS 线程做同样的事，10 万个线程 x 2MB 栈 = 200GB 内存，根本不现实。

### 分析

**面试官为什么关心这个问题？**

这道题是一道"入口题"，面试官可以通过它判断你的知识边界在哪里。答得好，后续的 GMP 细节、channel 实现、并发模式等问题都能自然展开；答得浅，面试官可能会直接跳到下一个话题。

**容易踩的坑：**

1. **只说"轻量级"不解释原因** —— 面试官追问"为什么轻"就卡住了。至少要能说出动态栈和用户态调度两点。
2. **混淆协程和 goroutine** —— goroutine 是 Go 对协程的具体实现，不要笼统地说"协程就是轻量级线程"。不同语言的协程实现差异很大。
3. **忽略线程复用** —— 很多人只记得"goroutine 多路复用到少量线程上"，但说不清阻塞时 runtime 怎么处理 M 和 P 的解绑。
4. **GOMAXPROCS 的容器陷阱** —— 在 K8s 容器中，Go 1.21 之前需要手动根据 cgroup CPU limit 设置 `GOMAXPROCS`，否则默认会读到宿主机的核数。Go 1.21+ 会自动读取 cgroup 配额。

### 知识点总结

- **Goroutine**：Go runtime 管理的用户态协程，拥有独立的动态栈，初始 2KB，按需增长至最大 1GB。
- **GMP 模型**：Go 的 M:N 调度模型，G 是协程，M 是 OS 线程，P 是逻辑处理器。P 的数量决定并行度。
- **用户态调度**：goroutine 的创建、切换、销毁都在用户空间完成，不陷入内核，避免了系统调用的开销。
- **工作窃取**：当某个 P 的本地队列为空时，调度器会从其他 P 的队列中窃取一半任务，实现负载均衡。
- **动态栈**：goroutine 的栈可以随运行时需求增长和收缩，不同于线程的固定栈分配。

### 相关知识扩展

**1. Go 调度器的抢占式调度**

Go 1.14 引入了基于信号的异步抢占式调度。在此之前，goroutine 只能通过主动让出（如函数调用、channel 操作）来释放 CPU，一个死循环的 goroutine 会独占整个 M。1.14 之后，runtime 会周期性地通过 `SIGURG` 信号检查并抢占长时间运行的 goroutine，解决了调度饥饿问题。

**2. Goroutine 泄漏检测**

goroutine 泄漏是 Go 项目中常见的隐患——一个 goroutine 永远阻塞在某处，永远不会退出，栈内存也无法回收。可以使用 `runtime.NumGoroutine()` 做运行时监控，或者在测试中引入 `go.uber.org/goleak` 来检测泄漏的 goroutine。

**3. Goroutine vs 其他语言的协程**

Java 21 的 Virtual Thread（虚拟线程）、Kotlin 的 Coroutine、Rust 的 async/await 都是在尝试解决类似的问题。但 Go 的方案最"激进"——直接在 runtime 层面实现了完整的 M:N 调度和抢占机制，开发者几乎不需要关心底层调度细节。

### 学习路线与建议

1. **先读官方文档**：[Effective Go](https://go.dev/doc/effective_go) 中关于 goroutine 和 channel 的章节是入门必读。
2. **理解 GMP 调度器**：推荐 Dmitry Vyukov 的 [Go scheduler design doc](https://go.dev/src/runtime/proc.go)，以及 Morsing 的博客文章。
3. **动手实验**：写一个程序启动 100 万个 goroutine，观察内存占用和调度行为，用 `GODEBUG=gctrace=1` 查看 GC 表现。
4. **阅读 runtime 源码**：`runtime/proc.go` 是调度器的核心实现，结合 GDB 或 `dlv` 调试器跟踪 `schedule()` 函数。

### 参考文章与延伸阅读

- [Go goroutine 官方文档](https://go.dev/doc/effective_go#goroutines)
- [Go scheduler: M:N scheduling and work stealing](https://go.dev/src/runtime/proc.go)
- [Morsing - The Go Scheduler](https://morsmachine.dk/go-scheduler)
- [Go 1.14 Release Notes - Asynchronous Preemption](https://go.dev/doc/go1.14#runtime)
- [uber-go/goleak - Goroutine leak detector](https://github.com/uber-go/goleak)
