---
title: "面试笔记：Go Context的超时控制和级联取消"
date: "2026-6-13"
tags: ["Go", "Context", "并发编程", "面试", "八股文"]
excerpt: "kami works"
---

### 前情提要

在 Go 并发编程的面试中，Context 几乎是绕不开的核心考点。很多同学在项目里用过 `context.WithTimeout`，但一旦被追问"级联取消是怎么实现的"、"context 泄漏是怎么回事"，就容易卡壳。这篇笔记把 Context 的设计思想、使用方式和常见陷阱做一次完整的梳理。

### 问题

面试中关于 Context 的提问通常围绕以下几个方向：

- "context 包有哪些创建方式？各自的使用场景是什么？"
- "什么是级联取消？父 context 取消后子 context 会怎样？"
- "`Done()` channel 的机制是怎么工作的？"
- "`WithValue` 适合传什么数据？有什么坑？"
- "context 泄漏是什么？怎么避免？"
- "为什么不把 context 存到全局变量或 struct 里？"

这些问题考察的不仅是 API 的记忆，更是对并发生命周期管理的理解深度。

### 回答

**Context 的核心接口**

`context.Context` 是一个接口，定义了四个方法：

```go
type Context interface {
    Deadline() (deadline time.Time, ok bool) // 返回截止时间
    Done() <-chan struct{}                    // 返回一个 channel，context 被取消时关闭
    Err() error                               // Done 关闭后返回取消原因
    Value(key interface{}) interface{}        // 获取绑定的值
}
```

理解这个接口的关键在于 `Done()`——它返回一个只读 channel，当 context 被取消或超时到达时，这个 channel 会被关闭。所有监听 `<-ctx.Done()` 的 goroutine 会同时收到信号，这就是"广播取消"的底层机制。

**四种创建方式**

第一组是根节点：`context.Background()` 和 `context.TODO()`。Background 是真正的根 context，通常只在 `main` 函数、请求入口或测试入口创建。TODO 是一个语义占位符，表示"这里将来会换成真正的 context，但现在还没确定"。两者在行为上完全相同，区别只在于语义表达。

第二组是派生函数，也是面试的重点：

`WithCancel` 返回一个可手动取消的 context 和一个 cancel 函数。调用 cancel 会关闭 Done channel，所有监听者立刻收到信号。最关键的规则是：**cancel 必须调用**，即使用不到也要 `defer cancel()`，否则会导致 context 泄漏。

```go
ctx, cancel := context.WithCancel(context.Background())
defer cancel()

go func() {
    select {
    case <-ctx.Done():
        fmt.Println("Cancelled:", ctx.Err())
        return
    case result := <-doWork():
        fmt.Println("Done:", result)
    }
}()
```

`WithTimeout` 和 `WithDeadline` 本质上是同一件事的两种表达。WithTimeout 是"从现在开始多久后取消"，WithDeadline 是"在某个绝对时间点取消"。事实上，WithTimeout 内部就是算出截止时间后调用了 WithDeadline。它们同样返回 cancel 函数，同样需要 defer 释放：

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

select {
case <-ctx.Done():
    fmt.Println("Timeout:", ctx.Err()) // context deadline exceeded
case result := <-fetchData():
    fmt.Println("Got:", result)
}
```

`WithValue` 创建的是一个携带键值对的 context，用于在请求链路中传递元数据——比如 traceID、userID、认证信息。它的查找是链式的：从当前节点向上遍历，直到找到匹配的 key 或到达根节点。

```go
ctx := context.WithValue(context.Background(), "userID", 123)
userID := ctx.Value("userID").(int)
```

**级联取消树**

Context 的派生关系形成了一棵树。每个子 context 都持有对父 context 的引用，当父 context 被取消时，所有后代节点会递归地收到取消信号。这就是"级联取消"：

```go
func parent(ctx context.Context) {
    ctx, cancel := context.WithCancel(ctx)
    defer cancel()

    go childA(ctx)
    go childB(ctx)

    // 如果这里 cancel() 被调用，childA 和 childB 都会收到取消信号
    // 如果 parent 的 ctx 本身也被取消，效果一样向下传递
}

func childA(ctx context.Context) {
    select {
    case <-ctx.Done():
        fmt.Println("childA cancelled")
        return
    }
}
```

需要注意的是，子 context 的取消不会向上传播。childA 自己超时或被 cancel，不会影响 parent 和 childB。这是单向的：自上而下的广播，自下而上的隔离。

**WithValue 的最佳实践和陷阱**

WithValue 的正确用法是传递请求作用域内的元数据，而不是传递函数依赖（如数据库连接、配置对象）。key 的类型应该用未导出的自定义类型，避免不同包之间的 key 冲突：

```go
type ctxKey string

const userIDKey ctxKey = "userID"

func withUserID(ctx context.Context, id int) context.Context {
    return context.WithValue(ctx, userIDKey, id)
}

func getUserID(ctx context.Context) (int, bool) {
    id, ok := ctx.Value(userIDKey).(int)
    return id, ok
}
```

陷阱在于：WithValue 不参与取消和超时机制，数据挂在 context 上只是"捎带"，如果 context 的生命周期比数据长，这些数据会一直存活在内存中直到 context 被 GC。

### 分析

**Context 泄漏场景**

Context 泄漏是面试中的高频追问点。最常见的场景是创建了派生 context 却忘记调用 cancel 函数：

```go
// 泄漏：cancel 没有被调用
func leaky() {
    ctx, _ := context.WithTimeout(context.Background(), 10*time.Second)
    go func() {
        <-ctx.Done() // 如果超时没到，这个 goroutine 永远等不到信号
    }()
    // 函数返回，但内部的 goroutine 和 timer 还在运行
}
```

另一个场景是在循环中创建 context 但不 defer cancel，导致大量未释放的 context 堆积。还有一种隐蔽的情况是：goroutine 在 context 取消后没有正确退出（比如阻塞在一个没有 select Done 的 channel 操作上），goroutine 本身泄漏的同时也拖住了 context 的资源。

防御方式很明确：永远 `defer cancel()`，永远用 `select` + `ctx.Done()` 包裹可能阻塞的操作。

**为什么不用全局变量传 context**

这是一个设计理念层面的问题。全局变量传递 context 有几个致命缺陷：第一，无法形成树形结构，无法实现细粒度的取消——你没办法只取消某一个请求链路而保留其他链路。第二，全局 context 的生命周期和请求生命周期脱钩，请求结束了 context 还在，或者请求还没结束 context 就被取消了。第三，对测试不友好——全局变量难以 mock，难以隔离。

Context 作为函数参数显式传递，每次调用都明确知道自己在用谁的 context，树形关系清晰，生命周期可控。这就是 Go 社区强调"context as first argument"的原因。

### 知识点总结

- Context 通过 `Done() <-chan struct{}` 广播取消信号，channel 关闭即通知所有监听者
- 四种派生函数：WithCancel（手动取消）、WithTimeout（超时取消）、WithDeadline（截止时间取消）、WithValue（值传递）
- WithTimeout 内部实现就是 WithDeadline，区别只是参数形式
- 级联取消是单向的：父取消则所有后代取消，子取消不影响父和兄弟节点
- 必须调用 cancel 函数释放资源，`defer cancel()` 是铁律
- WithValue 只用于传递请求作用域的元数据，不用来传递依赖对象
- key 应该用未导出的自定义类型，防止跨包冲突
- context 应该作为函数签名第一个参数，不要存入 struct 或全局变量

### 相关知识扩展

**Context 与 goroutine 生命周期管理**：Context 解决的核心问题是"如何优雅地终止一组 goroutine"。传统的做法是用 done channel 手动协调，但当 goroutine 嵌套层级变深时，手动管理变得极其脆弱。Context 提供了标准化的取消传播机制，配合 `errgroup.Group`（来自 `golang.org/x/sync`）可以进一步简化：errgroup 自带 context，任何一个 goroutine 返回错误时自动 cancel 整个 group 的 context，其余 goroutine 收到信号后退出。这是目前 Go 社区推荐的最佳并发编排模式。

**gRPC 中的 context 传递**：gRPC 的每个 RPC 调用都自带 context。客户端调用时传入的 context 控制了请求的超时和取消——如果客户端断开连接，服务端的 context 会自动取消，服务端可以通过 `ctx.Done()` 感知并及时终止处理。中间件（interceptor）通常用 `WithValue` 在 context 中注入 traceID、认证信息等元数据，沿着 RPC 调用链逐层传递。这使得 context 成为分布式链路追踪的载体基础。

### 学习路线与建议

1. **先理解 Done channel 的语义**：动手写一个小程序，创建 WithCancel context，启动 goroutine 监听 Done，调用 cancel 观察行为。这是理解一切的基础
2. **掌握四种派生函数的使用边界**：什么时候用 WithCancel、什么时候用 WithTimeout，能脱口而出才算掌握
3. **故意制造泄漏然后修复**：写一个不调用 cancel 的函数，用 `runtime.NumGoroutine()` 观察 goroutine 泄漏，再修复它，体会 defer cancel 的必要性
4. **读标准库源码**：`src/context/context.go` 不到 800 行，核心是 `cancelCtx` 和 `timerCtx` 两个结构体的实现，看懂 cancel 的传播链和 timer 的管理方式
5. **结合 HTTP 和 gRPC 实战**：在真实项目中用 context 做请求超时控制、数据库查询超时、级联取消，体会它在工程中的完整生命周期

### 参考文章与延伸阅读

- [Go 官方文档 - context 包](https://pkg.go.dev/context)
- [Go Blog - Context](https://go.dev/blog/context)
- [Go Concurrency Patterns: Context](https://go.dev/blog/context)
- [Go 标准库源码 src/context/context.go](https://cs.opensource.google/go/go/+/refs/tags/go1.22.0:src/context/context.go)
- [Uber Go Style Guide - Context](https://github.com/uber-go/guide/blob/master/style.md#context)
- [Jack Lindamood - How to correctly use context.Context](https://medium.com/@cep21/how-to-correctly-use-context-context-in-go-1-7-8f2c0fafdf39)
