---
title: "面试笔记：Go的sync包怎么用，Mutex和RWMutex怎么选"
date: "2026-6-13"
tags: ["Go", "sync", "并发编程", "面试", "八股文"]
excerpt: "kami works"
---

# 面试笔记：Go 的 sync 包怎么用，Mutex 和 RWMutex 怎么选

准备面试的时候发现，Go 的 `sync` 包几乎是并发编程必考的基础设施。面试官不只会问"怎么用"，更喜欢追问"底层怎么实现的"、"什么场景该选哪个"。
这篇文章是我对 sync 包相关知识的系统梳理，把 Mutex、RWMutex、WaitGroup、Once、Pool、Map 这些组件的用法和原理串一遍，顺便聊聊面试中容易踩坑的地方。

### 前情提要

上一篇文章整理了 Goroutine 和 Channel 的底层原理，这篇聚焦更贴近日常编码的 `sync` 包。
实际项目里，多个 Goroutine 共享数据是家常便饭——缓存读写、计数器累加、单例初始化……这些场景都离不开 sync 包提供的同步原语。
面试中被问到 sync 的频率非常高，而且问题往往很具体，比如"Mutex 的饥饿模式是什么"、"RWMutex 为什么会导致写饥饿"、"WaitGroup 的 Add 能不能放在 goroutine 里面调"。
如果没有系统学过，临场很容易答不清楚。

### 问题

面试中关于 sync 包的典型问法：

1. sync.Mutex 的正常模式和饥饿模式有什么区别？什么时候会切换？
2. sync.RWMutex 和 Mutex 的区别？什么场景下用 RWMutex 更合适？
3. WaitGroup 的 Add、Done、Wait 分别做了什么？有什么注意事项？
4. sync.Once 怎么保证只执行一次？用在什么场景？
5. sync.Pool 的作用是什么？什么时候会清空？
6. sync.Map 和普通 map 加锁有什么区别？
7. Mutex 和 Channel 怎么选？什么情况下用锁，什么情况下用 channel？

### 回答

**sync.Mutex —— 互斥锁**

最基础的同步原语，用法很简单：

```go
var mu sync.Mutex
var count int

func increment() {
    mu.Lock()
    defer mu.Unlock()
    count++
}
```

底层结构是 `state int32` + `sema uint32`。state 的 bit 0 表示 locked，bit 1 表示 woken，bit 2 表示 starving，bit 3-31 是 waiter count。Mutex 有两种模式：**正常模式**下新来的 goroutine 会尝试自旋竞争锁，性能好但可能导致等待者饥饿；当某个 goroutine 等待超过 1ms 还没拿到锁，就切换到**饥饿模式**——新来的 goroutine 不再竞争，直接排到队列尾部，保证先来先得的公平性。拿到锁后如果队列空了，再切回正常模式。

**sync.RWMutex —— 读写锁**

读多写少场景的利器，读读之间不互斥：

```go
var rwMu sync.RWMutex
var cache = make(map[string]string)

func Get(key string) string {
    rwMu.RLock()
    defer rwMu.RUnlock()
    return cache[key]
}

func Set(key, value string) {
    rwMu.Lock()
    defer rwMu.Unlock()
    cache[key] = value
}
```

底层实现上，RWMutex 内部嵌了一个 Mutex 作为写锁，加上 `readerCount` 和 `readerWait` 两个原子计数器。获取写锁时，会把 `readerCount` 减去一个最大值来阻止新的读者进入，然后等已有的读者全部退出。

需要注意的是**写饥饿问题**：如果读操作非常频繁且耗时长，写锁会一直拿不到。Go 的做法是让新的读者在有写者等待时阻塞，以此平衡读写，但极端场景下写的延迟仍然可能较高。选用 RWMutex 前一定要确认你的场景确实是读多写少。

**sync.WaitGroup —— 等待一组任务完成**

```go
var wg sync.WaitGroup
for i := 0; i < 5; i++ {
    wg.Add(1)
    go func(id int) {
        defer wg.Done()
        fmt.Printf("Worker %d done\n", id)
    }(i)
}
wg.Wait()
```

底层是一个 64 位的 state：高 32 位是任务计数器，低 32 位是等待者数量。`Done()` 本质上就是 `Add(-1)`，计数器归零时唤醒所有等待者。

关键注意事项：`Add` 必须在 `Wait` 之前调用。可以在 goroutine 内部调 `Add`，但要保证时序正确。另外 WaitGroup 不能复制，传参时必须用指针。

**sync.Once —— 只执行一次**

典型场景是单例模式或初始化操作：

```go
var once sync.Once
var instance *Config

func GetConfig() *Config {
    once.Do(func() {
        instance = loadConfig()
    })
    return instance
}
```

内部用 `done` 标记 + Mutex 双重保障，保证无论多少个 goroutine 同时调 `Do`，`loadConfig()` 只会被执行一次，而且所有 goroutine 都能拿到同一个结果。

**sync.Pool —— 临时对象池**

用来复用频繁创建和销毁的对象，减少 GC 压力：

```go
var bufPool = sync.Pool{
    New: func() interface{} {
        return new(bytes.Buffer)
    },
}

func handleRequest() {
    buf := bufPool.Get().(*bytes.Buffer)
    defer bufPool.Put(buf)
    buf.Reset()
    // 使用 buf 处理请求
}
```

`sync.Pool` 会在每轮 GC 时清空，所以它适合缓存临时对象（如 `bytes.Buffer`、`http.Request`），不适合做持久连接池。标准库的 `fmt` 和 `encoding/json` 内部都用了 Pool 来优化性能。

**sync.Map —— 并发安全的 map**

```go
var m sync.Map
m.Store("key", "value")
val, ok := m.Load("key")
m.Range(func(key, value interface{}) bool {
    fmt.Println(key, value)
    return true
})
```

底层采用 read-only fast path + dirty map 的双层结构。对于读多写少或者 key 集合趋于稳定的场景性能很好，但如果大量写入新 key，性能反而不如 `map + RWMutex`。Go 官方文档也建议，大部分场景优先考虑 `map + Mutex/RWMutex`。

### 分析

**Mutex vs Channel，怎么选？**

Go 社区有句名言："Don't communicate by sharing memory, share memory by communicating."但这不意味着永远不用锁。我的理解是这样的：

- **用 Mutex/RWMutex**：保护共享状态（计数器、缓存、配置），临界区短小，不需要跨 goroutine 传递数据。
- **用 Channel**：传递数据所有权、协调 goroutine 之间的执行顺序、实现生产者-消费者模型。
- 简单记法：**传数据用 channel，护状态用锁**。

**面试中常见的错误写法：**

忘记 Unlock 是最经典的问题。一定要用 `defer`：

```go
// 错误：panic 或提前 return 会导致锁永远不释放
mu.Lock()
if err != nil {
    return err // 锁没释放
}
mu.Unlock()

// 正确
mu.Lock()
defer mu.Unlock()
if err != nil {
    return err
}
```

另一个坑是**复制 Mutex**。Mutex 内含状态，值拷贝会导致锁失效。Go vet 能检查这个问题，结构体里如果包含 Mutex，传递时要用指针：

```go
// 错误
type Counter struct {
    mu    sync.Mutex
    count int
}
func (c Counter) Inc() { // 值接收者，复制了 Mutex
    c.mu.Lock()
    defer c.mu.Unlock()
    c.count++
}

// 正确
func (c *Counter) Inc() { // 指针接收者
    c.mu.Lock()
    defer c.mu.Unlock()
    c.count++
}
```

### 知识点总结

| 组件 | 核心用途 | 底层关键机制 | 典型场景 |
|------|---------|-------------|---------|
| Mutex | 互斥访问 | 正常/饥饿双模式，信号量 | 共享计数器、状态保护 |
| RWMutex | 读写分离 | readerCount 原子计数，写者阻塞读者 | 缓存、配置中心 |
| WaitGroup | 等待完成 | 64 位 state，计数器归零唤醒 | 并发任务编排 |
| Once | 单次执行 | done + Mutex 双重检查 | 单例、初始化 |
| Pool | 对象复用 | per-P 本地池 + GC 时清空 | bytes.Buffer、临时对象 |
| Map | 并发安全 map | read + dirty 双层结构 | key 稳定的并发读写 |

### 相关知识扩展

**golang.org/x/sync/errgroup**

`sync.WaitGroup` 的增强版，能收集 goroutine 中的错误并统一返回。在实际项目中非常实用：

```go
g, ctx := errgroup.WithContext(ctx)
g.Go(func() error { return fetchUser(ctx) })
g.Go(func() error { return fetchOrders(ctx) })
if err := g.Wait(); err != nil {
    log.Fatal(err)
}
```

**golang.org/x/sync/semaphore**

带权重的信号量，适合限制并发数量。比如控制最多 10 个 goroutine 同时访问某个资源，用 `semaphore.Weighted` 比手动维护 channel 更清晰。

**sync/atomic 包**

对于简单的计数器、标志位，`atomic` 比 Mutex 更高效。`atomic.AddInt64`、`atomic.LoadInt64`、`atomic.CompareAndSwap` 这些操作在底层直接用 CPU 的原子指令实现，没有锁的开销。但要注意，atomic 只保证单个操作的原子性，多个 atomic 操作之间仍然需要锁来保证一致性。

### 学习路线与建议

1. **先理解并发问题**：搞清楚什么是竞态条件（race condition），用 `go run -race` 跑一遍自己的代码。
2. **从 Mutex 开始**：把 Lock/Unlock 的语义和 defer 用法吃透，然后看源码理解正常/饥饿模式的切换。
3. **逐个击破**：WaitGroup -> Once -> RWMutex -> Pool -> Map，每学一个都写个小 demo 验证。
4. **对比学习**：把 Mutex 和 Channel 放在一起比较，弄清楚各自的最佳适用场景。
5. **读标准库源码**：Go 的 sync 包源码量不大，注释写得非常好，推荐直接通读一遍。
6. **在项目中实践**：找一个真实的并发场景（比如并发请求限流、缓存更新），动手用 sync 包的组件去实现。

### 参考文章与延伸阅读

- [Go 官方文档 - sync 包](https://pkg.go.dev/sync)
- [Go 官方博客 - Share Memory By Communicating](https://go.dev/blog/share-memory-by-communicating)
- [Go 内存模型规范](https://go.dev/ref/mem)
- [Go Mutex 源码分析（正常模式与饥饿模式）](https://github.com/golang/go/blob/master/src/sync/mutex.go)
- [errgroup - golang.org/x/sync/errgroup](https://pkg.go.dev/golang.org/x/sync/errgroup)
- [Go 并发编程实战 - 许式伟](https://book.douban.com/subject/30378095/)
