---
title: "面试笔记：Go后端常考的五大设计模式"
date: "2026-6-13"
tags: ["设计模式", "Go", "面试", "八股文"]
excerpt: "kami works"
---

### 前情提要

设计模式在 Go 后端面试里的考察频率很高，但和 Java 那边不太一样——Go 没有继承、没有泛型泛滥，很多经典模式的写法更轻量。面试官一般不会让你背 23 种设计模式的 UML 图，而是挑几个在 Go 项目中真正高频使用的模式深挖：你怎么实现的、为什么这么做、有没有踩坑。这篇笔记把五个最常考的模式逐个过一遍，每个都配上可以直接跑的 Go 代码。

### 问题

面试中关于设计模式的提问通常围绕以下方向：

- "Go 里单例模式怎么保证线程安全？`sync.Once` 的原理是什么？"
- "工厂模式和策略模式的区别是什么？什么时候用哪个？"
- "如何用策略模式替代大量的 if-else？"
- "观察者模式和事件驱动有什么关系？Go 的 channel 怎么实现？"
- "中间件模式的本质是什么？Gin 中间件的执行流程是怎样的？"

这些问题考察的不是模式本身的定义，而是能否结合 Go 的语言特性把模式落地到项目中。

### 回答

**一、单例模式——`sync.Once`**

单例是最基础的模式：保证全局只有一个实例。Go 中的标准做法是 `sync.Once`，而不是加锁判断。

```go
var (
    cfg  *Config
    once sync.Once
)

func GetConfig() *Config {
    once.Do(func() {
        cfg = loadConfig()
    })
    return cfg
}
```

`sync.Once` 内部用 `atomic` + `mutex` 实现：先原子读 `done` 标志，为 0 才加锁执行。初始化完成后后续调用只是一次原子读，几乎零开销。面试常追问：为什么不用 `init()`？因为 `init()` 无法控制执行顺序，也无法传递错误。

**二、工厂方法——按条件创建对象**

工厂模式把对象的创建逻辑封装起来，调用方不需要知道具体类型，只面向接口编程。

```go
type Logger interface {
    Log(msg string)
}

type ConsoleLogger struct{}
type FileLogger struct{}

func (l *ConsoleLogger) Log(msg string) { fmt.Println(msg) }
func (l *FileLogger) Log(msg string)    { /* 写入文件 */ }

func NewLogger(t string) Logger {
    switch t {
    case "file":
        return &FileLogger{}
    default:
        return &ConsoleLogger{}
    }
}
```

工厂模式常见于消息处理器（根据 `msg_type` 创建不同 Handler）、存储驱动（根据配置创建 S3 或本地存储实例）。Go 里接口是隐式实现的，简单工厂（switch 函数）已经够用，不需要 Java 那套抽象工厂。

**三、策略模式——替代 if-else 的利器**

策略模式定义一组算法，把它们封装成接口，运行时可以互相替换。它和工厂模式经常一起出现：工厂负责创建，策略负责使用。

```go
type Uploader interface {
    Upload(ctx context.Context, data []byte) (string, error)
}

type SmallFileUploader struct{} // Base64 直传
type MultipartUploader struct{} // S3 分片上传

func (u *SmallFileUploader) Upload(ctx context.Context, data []byte) (string, error) {
    return "", nil // 小文件直接上传
}
func (u *MultipartUploader) Upload(ctx context.Context, data []byte) (string, error) {
    return "", nil // 大文件分片上传
}

func GetUploader(fileSize int64) Uploader {
    if fileSize > 10*1024*1024 {
        return &MultipartUploader{}
    }
    return &SmallFileUploader{}
}
```

面试中常问"如何用策略模式替代 if-else"：把每个分支抽成策略实现，用 map 或工厂函数分发，调用方只调接口方法。新增策略只需加实现，不改已有代码，符合开闭原则。

**四、观察者模式与事件驱动**

观察者模式定义一对多的依赖关系：当一个对象状态变化时，所有依赖者自动收到通知。Go 的 channel 天然适合实现这个模式。

```go
type EventBus struct {
    subscribers map[string][]chan string
    mu          sync.RWMutex
}

func NewEventBus() *EventBus {
    return &EventBus{subscribers: make(map[string][]chan string)}
}

func (eb *EventBus) Subscribe(event string) chan string {
    ch := make(chan string, 16)
    eb.mu.Lock()
    eb.subscribers[event] = append(eb.subscribers[event], ch)
    eb.mu.Unlock()
    return ch
}

func (eb *EventBus) Publish(event, data string) {
    eb.mu.RLock()
    defer eb.mu.RUnlock()
    for _, ch := range eb.subscribers[event] {
        select {
        case ch <- data:
        default: // 非阻塞发送，避免慢消费者拖垮系统
        }
    }
}
```

IM 系统中 Redis PubSub 就是观察者模式的典型实现。面试常追问的点是 channel 缓冲设计和背压处理：上面用 `select + default` 做非阻塞发送，防止慢消费者拖垮发布者。

**五、中间件模式（责任链）**

中间件模式本质上是装饰器模式在 HTTP/RPC 框架中的应用。每个中间件在请求到达核心 Handler 前后执行通用逻辑，形成一条处理管道。

```go
func LoggerMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()
        c.Next() // 调用下一个中间件或 Handler
        log.Printf("%s %s %v", c.Request.Method, c.Request.URL.Path, time.Since(start))
    }
}

func AuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        token := c.GetHeader("Authorization")
        if token == "" {
            c.AbortWithStatusJSON(401, gin.H{"error": "unauthorized"})
            return
        }
        c.Set("userID", parseToken(token)) // 验证 token，注入 userID
        c.Next()
    }
}
```

Gin 的中间件通过 `c.Next()` 和 `c.Abort()` 控制链路。执行顺序很关键——典型顺序是 CORS -> Logger -> Auth -> Handler。CORS 最先执行保证预检请求通过，Logger 在 Auth 之前记录所有请求。gRPC 的拦截器链也是同样的思路。

### 分析

这五个模式之所以高频出现，是因为它们对应后端最核心的结构性问题：全局状态管理（单例）、对象创建解耦（工厂）、分支管理（策略）、组件通信（观察者）、横切关注点分离（中间件）。Go 的接口隐式实现、channel 原生并发、`sync.Once` 语言级保障，让这些模式的写法和 Java 有明显差异。面试官想看的不是背定义，而是能否结合 Go 特性落地。

大型项目中这些模式往往组合使用：工厂 + 策略处理多态逻辑，观察者 + channel 构建事件驱动，中间件 + 依赖注入搭建可测试框架。理解模式间的协作关系比单独掌握每个模式更重要。

### 知识点总结

| 模式 | 核心思想 | Go 中的典型实现 | 面试关键词 |
|------|---------|----------------|-----------|
| 单例 | 全局唯一实例 | `sync.Once` | atomic + mutex、线程安全、懒加载 |
| 工厂方法 | 封装创建逻辑 | switch + interface | 开闭原则、简单工厂 vs 工厂方法 |
| 策略 | 算法可替换 | interface + map 分发 | 替代 if-else、运行时切换 |
| 观察者 | 一对多通知 | channel / PubSub | 事件驱动、背压、缓冲设计 |
| 中间件 | 请求处理管道 | HandlerFunc 链 | 装饰器、c.Next/c.Abort、执行顺序 |

### 相关知识扩展

**依赖注入（DI）** 和这些模式紧密相关。Go 推崇显式 DI，主流方案是手动构造（中小项目）和 Google Wire（大型项目，编译期代码生成）。配合 interface 做隔离，测试时可以用 mock 替换，不需要真实数据库。**CQRS（命令查询职责分离）** 是策略模式的延伸——写操作（Command）和读操作（Query）分成两套模型，在 IM 系统中发消息走 Kafka 异步处理，查历史消息直接读数据库，两条路径可以独立优化。**六边形架构（Hexagonal Architecture）** 核心思想是业务逻辑位于中心，通过"端口"（接口）与外部世界交互，Go 的 interface 天然就是端口定义，HTTP Handler、gRPC Server、Kafka Consumer 都是适配器。

### 学习路线与建议

1. 手写五个模式的 Go 代码，写到能闭卷默写的程度。
2. 在自己的项目中找场景落地——给 HTTP 服务加中间件，用策略模式重构 if-else。
3. 读标准库中的模式应用：`net/http` 的 middleware 链、`zap` 的选项模式、`grpc` 的拦截器链。
4. 进阶学习 Clean Architecture 和 DDD，面试时能从模式聊到架构分层是加分项。

### 参考文章与延伸阅读

- [Go 语言设计模式 (refactoring.guru)](https://refactoringguru.cn/design-patterns/go)
- [Go Patterns - tmrts/go-patterns (GitHub)](https://github.com/tmrts/go-patterns)
- [Google Wire - Compile-time Dependency Injection for Go](https://github.com/google/wire)
- [Go 项目中的 Clean Architecture 实践](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Gin 框架中间件原理分析](https://gin-gonic.com/docs/examples/using-middleware/)
