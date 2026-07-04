---
title: "面试笔记：Go的GC垃圾回收是怎么工作的"
date: "2026-6-13"
tags: ["Go", "GC", "内存管理", "面试", "八股文"]
excerpt: "kami works"
---

### 前情提要

写 Go 的人很少需要手动管理内存，这全靠运行时默默工作的垃圾回收器（GC）。面试中聊到 Go 内存管理，GC 几乎必问，而且往往从"三色标记"一路追问到 GOGC 调优。这篇笔记把 Go GC 的核心机制理清楚，争取面试时一次讲到位。

### 问题

面试官常见的问法：

- "Go 的垃圾回收是怎么工作的？"
- "讲讲三色标记算法"
- "GOGC 和 GOMEMLIMIT 分别是什么，怎么调优？"
- "Go 为什么选择并发 GC 而不是 Stop The World？"

考察的核心是：你是否理解 Go 运行时的垃圾回收算法原理、GC 的四个阶段如何衔接、写屏障解决什么问题，以及生产环境中如何通过参数控制 GC 行为。

### 回答

Go 使用的是**三色标记清除算法（Tri-color Mark and Sweep）**，配合**并发标记**和**写屏障**，在保证正确性的前提下尽量降低 STW（Stop The World）时间。

**三色标记**

GC 把堆上的每个对象看作三种颜色之一：

```plain
白色 — 未被标记，GC 结束时仍为白色的对象将被回收
灰色 — 自身已被标记，但引用的子对象还没扫描完
黑色 — 自身和所有子对象都已扫描完毕，不会再被回收
```

可以这样理解：白色是"还没查到"，灰色是"查了一半"，黑色是"查完了，确认存活"。

**GC 的四个阶段**

整个 GC 周期分为四步，其中只有短暂的 STW，大部分时间和用户程序并发执行：

```plain
阶段 1: 标记准备（Mark Setup）
  - 开启写屏障
  - 将 GC 阶段切换到 _GCmark
  - STW：暂停所有 Goroutine（极短）

阶段 2: 并发标记（Concurrent Mark）
  - GC Goroutine 和用户 Goroutine 并发执行
  - 从根对象（全局变量、栈上的局部变量等）出发
  - 白色 → 灰色 → 黑色，逐步扫描整个对象图

阶段 3: 标记终止（Mark Termination）
  - STW：再次暂停所有 Goroutine
  - 处理剩余的灰色对象，确保标记完整
  - 关闭写屏障，切换到清除阶段

阶段 4: 并发清除（Concurrent Sweep）
  - 回收所有仍为白色的对象
  - 与用户程序并发执行，不影响业务逻辑
```

用伪代码表示并发标记的核心循环：

```go
func gcMark() {
    markRoots()  // 从根对象开始标记
    for {
        obj := getGreyObject()  // 取一个灰色对象
        if obj == nil {
            break               // 没有灰色对象了，标记完成
        }
        scanObject(obj)         // 扫描它的子对象，标灰，自身标黑
    }
}
```

**写屏障（Write Barrier）**

并发标记阶段有个棘手问题：GC 和用户程序同时跑，用户程序可能修改指针引用，导致对象漏标或错标。Dijkstra 提出的写屏障方案解决了这个问题——每次程序修改指针时，先把旧值"着色"（放入灰色队列），保证不会被误回收。

```go
// 混合写屏障：赋值时自动触发
func writeBarrier(slot *unsafe.Pointer, ptr unsafe.Pointer) {
    shade(*slot)   // 将旧值标记为灰色，保护它不被回收
    *slot = ptr    // 然后写入新值
}
```

Go 1.8+ 使用的是**混合写屏障（Hybrid Write Barrier）**，结合了 Dijkstra 插入屏障和 Yuasa 删除屏障的优点，消除了重新扫描栈的需要，进一步缩短了 STW 时间。

**GC 触发条件**

GC 不是随便触发的，有三种触发方式：

```plain
1. 内存分配达到阈值 — 由 GOGC 控制，默认 100%
2. 定时触发         — 默认 2 分钟没有 GC 则强制触发
3. 手动触发         — 调用 runtime.GC()
```

**GOGC 与 GOMEMLIMIT 调优**

`GOGC` 控制 GC 触发的激进程度，含义是"堆内存增长到上次 GC 后存活对象大小的多少百分比时触发下一次 GC"：

```bash
GOGC=100   # 默认值，堆增长到存活对象的 2 倍时触发
GOGC=50    # 更频繁回收，CPU 开销增大，内存占用降低
GOGC=200   # 更少触发，CPU 开销降低，内存占用增大
GOGC=off   # 关闭 GC（危险，仅用于特殊场景）
```

Go 1.19 引入了 `GOMEMLIMIT`，这是一个**软性内存上限**。当堆内存接近这个值时，GC 会更积极地触发，避免 OOM。相比 GOGC 只控制比率，GOMEMLIMIT 直接约束绝对值，在容器环境中尤其有用：

```go
// 代码中设置
debug.SetMemoryLimit(1 << 30)  // 1GB 软上限

// 或环境变量
// GOMEMLIMIT=1GiB
```

生产环境调优的一般建议：先用 GOMEMLIMIT 兜底防止 OOM，再用 GOGC 微调 CPU 与内存的平衡。

### 分析

**为什么 Go 选择并发 GC 而非纯 STW？**

纯 STW 的 GC 实现简单，但暂停时间和堆大小成正比——堆越大，暂停越久。对于追求低延迟的服务端程序（Web 服务、RPC 服务等），几百毫秒的 STW 是不可接受的。Go 的设计目标是让 GC 暂停控制在亚毫秒级别，因此选择了并发标记的方案：大部分标记工作和用户程序并行，只在关键的切换点做极短的 STW。

代价是并发 GC 会消耗一部分 CPU 资源（默认约 25%），并且需要写屏障来保证正确性。Go 团队认为这个取舍是值得的——大多数服务对延迟的敏感度远高于对吞吐的敏感度。

**GC 对延迟的影响**

GC 对延迟的影响主要来自三个方面：短暂的 STW 暂停、并发标记期间的 CPU 竞争、以及写屏障带来的赋值开销。Go 1.5 以来 GC 暂停时间从几十毫秒逐步降到亚毫秒，Go 1.19 的 GOMEMLIMIT 进一步减少了"突发大量 GC"的概率。在延迟敏感的场景下，合理设置 GOGC（比如降低到 50）和 GOMEMLIMIT 可以有效减少 GC 引起的毛刺。

### 知识点总结

- **三色标记**：白色（待回收）、灰色（扫描中）、黑色（存活确认）
- **四个阶段**：标记准备（STW）→ 并发标记 → 标记终止（STW）→ 并发清除
- **写屏障**：并发标记期间保护对象不被误回收，Go 1.8+ 使用混合写屏障
- **触发条件**：内存阈值（GOGC）、定时（2min）、手动（runtime.GC）
- **GOGC**：控制 GC 触发比率，默认 100%
- **GOMEMLIMIT**：Go 1.19 引入，软性内存上限，防止 OOM

### 相关知识扩展

**逃逸分析（Escape Analysis）**

Go 编译器在编译期分析变量的生命周期：如果一个变量的引用不会"逃逸"出当前函数，就直接分配在栈上而非堆上。栈上的变量随函数返回自动回收，不经过 GC。减少堆分配是降低 GC 压力的根本手段。可以用 `go build -gcflags="-m"` 查看逃逸分析结果。

**pprof 内存分析**

`runtime/pprof` 和 `net/http/pprof` 是 Go 自带的性能分析工具。通过 heap profile 可以看到当前堆上的内存分配情况，找出哪些函数分配了最多的内存，从而针对性地优化：

```bash
# 采集堆内存 profile
go tool pprof http://localhost:6060/debug/pprof/heap

# 查看 GC 暂停时间统计
go tool pprof http://localhost:6060/debug/pprof/gc
```

**GC 的 25% CPU 目标**

Go 的 GC 调度器会尽量把 GC 的 CPU 占用控制在 25% 以内。当分配速率过高、GC 来不及回收时，运行时会插入辅助标记（mark assist），让正在分配内存的 Goroutine 帮忙做一些标记工作，防止堆无限增长。这也是为什么高分配速率的服务有时会观察到吞吐下降。

### 学习路线与建议

1. **先搞懂三色标记**：这是 GC 的理论基础，理解白/灰/黑的状态转换
2. **记住四个阶段**：标记准备 → 并发标记 → 标记终止 → 并发清除，知道哪些阶段 STW
3. **理解写屏障**：搞清楚为什么并发标记需要写屏障，混合写屏障解决了什么问题
4. **动手调优**：用 `GODEBUG=gctrace=1` 环境变量观察 GC 行为，在测试环境调整 GOGC 看效果
5. **面试表达**：按"算法原理 → 四个阶段 → 写屏障 → 触发条件 → 调优手段"的顺序讲，层次分明

### 参考文章与延伸阅读

- [Go 语言设计与实现 - 垃圾回收](https://draveness.me/golang/docs/part3-runtime/ch07-memory/golang-garbage-collector/)
- [Go 1.5 并发 GC 设计文档](https://go.dev/design/1750-gc-elimination)
- [Getting to Go: The Journey of Go's Garbage Collector](https://go.dev/blog/ismmkeynote)
- [Go runtime 源码 - runtime/mgc.go](https://github.com/golang/go/blob/master/src/runtime/mgc.go)
- [Go 1.19 Release Notes - GOMEMLIMIT](https://go.dev/doc/go1.19#runtime)
- [A Guide to the Go Language Garbage Collector](https://tip.golang.org/doc/gc-guide)
