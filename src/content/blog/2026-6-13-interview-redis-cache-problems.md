---
title: "面试笔记：缓存穿透、击穿、雪崩怎么区分和解决"
date: "2026-6-13"
tags: ["Redis", "缓存", "面试", "八股文"]
excerpt: "kami works"
---

## 前情提要

最近在准备后端面试，Redis 缓存相关的题目几乎是必考项。面试官最爱问的"缓存三兄弟"——穿透、击穿、雪崩——概念听起来相似，但触发场景和解决方案截然不同。我结合自己的项目实践和八股文资料，把这三个问题彻底梳理一遍，顺便延伸到缓存一致性的处理策略。

## 问题

面试官通常会这样问：

> 什么是缓存穿透、缓存击穿、缓存雪崩？分别怎么解决？

这道题考的不只是定义，更是你能否在实际架构中识别风险并选择合适的方案。

## 回答

### 一、三个问题的定义和区别

**缓存穿透**：客户端查询一个根本不存在的数据，缓存永远 miss，每次请求都直接打到数据库。攻击者可以用大量随机 key 发起攻击，导致数据库压力骤增。

**缓存击穿**：某个热点 key 在过期失效的瞬间，大量并发请求同时 miss 缓存，一起查数据库。它和穿透的区别是：这个数据是真实存在的，只是恰好缓存过期了。

**缓存雪崩**：大量 key 在同一时间集中过期，或者 Redis 本身宕机，导致几乎所有请求都落到数据库。雪崩是"面"的问题，击穿是"点"的问题。

一句话总结：穿透是"查无此 key"，击穿是"热点 key 刚好过期"，雪崩是"大批 key 同时过期"。

### 二、缓存穿透：布隆过滤器 + 缓存空值

**方案一：缓存空值。** 当数据库也查不到时，在缓存中写入一个空值（或特殊标记），设置较短的 TTL（比如 60 秒）。下次同样的请求直接命中缓存，返回空结果。

```go
val, err := redis.Get(key)
if err == redis.Nil {
    val, err := db.Get(key)
    if err != nil {
        redis.Set(key, "", 60*time.Second) // 缓存空值，短 TTL
        return "", nil
    }
    redis.Set(key, val, 3600*time.Second)
    return val, nil
}
```
优点是简单有效；缺点是攻击者用大量随机 key 请求时，缓存会被空值填满。

**方案二：布隆过滤器。** 在缓存前置一层布隆过滤器，将所有合法的 key 预加载进去。请求先过布隆过滤器，判断不存在的 key 直接拦截，不会到达缓存和数据库。

```go
bloom.Add("key1")
bloom.Add("key2")
func Get(key string) (string, error) {
    if !bloom.Contains(key) {
        return "", ErrKeyNotFound // 直接返回
    }
    // 正常查缓存和数据库...
}
```
布隆过滤器有一定误判率（可能把不存在的 key 判断为存在），但绝不会漏掉存在的 key。实际工程中可直接使用 Redis 的 `RedisBloom` 模块。

### 三、缓存击穿：互斥锁 + 逻辑过期

**方案一：互斥锁（SETNX）。** 当缓存 miss 时，不直接查数据库，而是先尝试获取分布式锁。只有拿到锁的那个请求去查数据库并回填缓存，其他请求等待后重试。

```go
val, err := redis.Get(key)
if err == redis.Nil {
    lockKey := "lock:" + key
    if acquireLock(lockKey) {
        defer releaseLock(lockKey)
        // Double Check：拿到锁后再查一次缓存
        val, err = redis.Get(key)
        if err == nil { return val, nil }
        // 查数据库，写缓存
        val, _ := db.Get(key)
        redis.Set(key, val, 3600*time.Second)
        return val, nil
    } else {
        time.Sleep(100 * time.Millisecond)
        return Get(key) // 重试
    }
}
```

注意拿到锁之后要做 Double Check，因为可能有其他请求已经回填了缓存。

**方案二：逻辑过期。** 不在 Redis 上设置 TTL，而是在 value 中嵌入一个逻辑过期时间。读取时发现逻辑过期了，就异步触发缓存更新，当前请求直接返回旧数据。好处是不会阻塞任何请求，代价是短时间内可能读到稍旧的数据。

```go
type CacheEntry struct {
    Value     string
    ExpireAt  time.Time
}
// 永不过期，靠 value 里的 ExpireAt 判断
redis.Set(key, entry, 0)
// 后台定时刷新热点数据
go func() {
    ticker := time.NewTicker(time.Hour)
    for range ticker.C {
        val, _ := db.Get(hotKey)
        redis.Set(hotKey, CacheEntry{val, time.Now().Add(time.Hour)}, 0)
    }
}()
```

### 四、缓存雪崩：随机 TTL + 多级缓存 + 熔断降级

**方案一：TTL 加随机偏移。** 写入缓存时，在基础 TTL 上叠加一个随机值，避免大批 key 同时过期。

```go
baseTTL := 3600
randomTTL := rand.Intn(600) // 0~600 秒
redis.Set(key, val, time.Duration(baseTTL+randomTTL)*time.Second)
```

**方案二：多级缓存。** 在 Redis 前面再加一层本地缓存（进程内 LRU），作为 L1 缓存。即使 Redis 短暂不可用，本地缓存仍能挡住大部分请求。

```go
// L1：本地缓存
val, ok := localCache.Get(key)
if ok { return val, nil }
// L2：Redis
val, err := redis.Get(key)
if err == nil {
    localCache.Set(key, val, 5*time.Minute)
    return val, nil
}
// L3：数据库
val, _ = db.Get(key)
redis.Set(key, val, 3600*time.Second)
localCache.Set(key, val, 5*time.Minute)
return val, nil
```

在 Rinne-IM 项目中，我用的就是"本地 LRU + Redis"两级缓存架构，热数据命中率达到 99.2%。即使 Redis 短暂不可用，本地缓存依然可以兜底。

**方案三：熔断降级。** 当数据库压力过大或 Redis 完全宕机时，通过熔断器直接返回默认值或拒绝请求，防止数据库被彻底打垮。常用的库有 `gobreaker`（Go）和 `sentinel`。

## 分析与思考

面试时回答这三个问题，除了给出方案，最好能说清楚方案之间的取舍：

- **缓存空值 vs 布隆过滤器**：空值方案实现简单但有资源浪费风险；布隆过滤器精准但引入了额外组件和误判率。中小项目用空值就够了，大流量场景上布隆过滤器。
- **互斥锁 vs 逻辑过期**：互斥锁保证数据实时性但会阻塞部分请求；逻辑过期不阻塞但可能返回旧数据。对一致性要求高用互斥锁，对可用性要求高用逻辑过期。
- **随机 TTL 是最廉价的雪崩防御**，几乎零成本，所有项目都应该默认加上。

## 知识点总结

| 问题 | 触发条件 | 核心影响 | 推荐方案 |
|------|----------|----------|----------|
| 缓存穿透 | 查询不存在的 key | 请求全部打到 DB | 布隆过滤器、缓存空值 |
| 缓存击穿 | 热点 key 过期 | 瞬时并发打 DB | 互斥锁、逻辑过期 |
| 缓存雪崩 | 大量 key 同时过期 / Redis 宕机 | 请求全部打到 DB | 随机 TTL、多级缓存、熔断降级 |

## 相关知识扩展：缓存一致性

解决了"三兄弟"之后，面试官往往会追问：缓存和数据库之间的一致性怎么保证？

**延迟双删**：先删缓存，再更新数据库，等一小段时间（比如 500ms）后再删一次缓存。第二次删除是为了清除在更新数据库期间被其他请求回填的旧数据。

```go
func Update(key, val string) error {
    cache.Delete(key)           // 第一次删除
    db.Set(key, val)            // 更新数据库
    time.Sleep(500 * time.Millisecond)
    cache.Delete(key)           // 第二次删除
    return nil
}
```
这个方案简单但有缺陷：延迟时间不好定，太短删不干净，太长影响性能。

**Canal + Binlog 订阅**：更优雅的方案。应用程序只负责更新数据库，由 Canal 伪装成 MySQL 从节点订阅 binlog，解析出变更事件后异步删除或更新缓存。好处是业务代码完全不关心缓存同步，解耦彻底。

```plain
应用写 DB → MySQL binlog → Canal 解析 → 删除/更新 Redis 缓存
```

这也是目前大厂用得最多的方案。缺点是引入了额外的中间件，有一定的运维成本和延迟（通常毫秒级，可以接受）。

**Cache Aside Pattern（旁路模式）**：最常用的读写策略。读操作先查缓存，miss 则查数据库并回填缓存；写操作先更新数据库，再删除缓存。注意是"删除缓存"而不是"更新缓存"，因为并发写场景下更新缓存可能出现数据不一致。

## 学习路线与建议

1. **先理解 Redis 基础数据结构**，String、Hash、List、Set、ZSet 各适合什么场景。
2. **搞清楚过期策略和淘汰策略**（惰性删除 + 定期删除、allkeys-lru 等），这是缓存问题的底层基础。
3. **动手实现一遍缓存穿透和击穿的解决方案**，纸上得来终觉浅，写一遍代码比背十遍八股文有用。
4. **了解分布式锁的实现**（SETNX + Lua 脚本释放锁 + watchdog 续期），面试中经常和缓存击穿一起考。
5. **读一读 Redis 官方文档的持久化和集群章节**，对理解缓存系统的整体架构很有帮助。

## 参考文章与延伸阅读

- [Redis 官方文档 - Expire](https://redis.io/docs/latest/develop/interact/expiry/)
- [Redis 官方文档 - Keyspace Notifications](https://redis.io/docs/latest/develop/use/keyspace-notifications/)
- [美团技术团队 - 缓存一致性方案](https://tech.meituan.com/)
- [RedisBloom 模块](https://redis.io/docs/latest/develop/data-types/probabilistic/bloom-filter/)
- [Canal 项目 （GitHub）](https://github.com/alibaba/canal)
- [gobreaker 熔断器库](https://github.com/sony/gobreaker)
