---
title: "面试笔记：Redis五大数据结构的使用场景"
date: "2026-6-13"
tags: ["Redis", "数据结构", "面试", "八股文"]
excerpt: "kami works"
---

# 面试笔记：Redis 五大数据结构的使用场景

> 面试被问到"Redis 有几种数据类型、分别用在什么场景"，背过答案的人能脱口而出"String、Hash、List、Set、ZSet"，但面试官一追问"底层编码怎么转换"、"排行榜用哪个、消息队列用哪个"，很多人就开始含糊。这篇笔记把五大结构从使用场景到内部编码一次性串清楚。

### 前情提要

Redis 的数据结构是后端面试的必考题，几乎每一轮都会问。我之前只是记住了五种类型的名字和几个常用命令，但对"什么时候该用 Set 而不是 List"、"ZSet 底层到底怎么实现的"这些问题没有系统想过。后来在准备面试的过程中，把每种结构的场景、编码转换和典型应用做了一次完整梳理，发现面试官的追问其实都围绕着同一条线索：**数据结构决定了使用模式，而内部编码决定了性能边界**。

### 问题

面试中关于 Redis 数据结构的常见问法：

- "Redis 有哪几种数据类型？各自的使用场景是什么？"
- "String 除了存缓存还能干什么？计数器怎么实现？"
- "Hash 和 String 存对象有什么区别？"
- "List 怎么做消息队列？和 Kafka 有什么区别？"
- "Set 和 ZSet 的区别是什么？排行榜怎么实现？"
- "这些结构的底层编码是什么？什么时候会发生转换？"

这些问题看似零散，其实都围绕一个核心：**选对数据结构，就选对了一半的架构方案**。

### 回答

**1. String -- 最万能的瑞士军刀**

String 是 Redis 最基础的类型，但它的用途远不止"存个缓存"。

```bash
SET key value          # 缓存对象
INCR counter           # 原子计数器
SET session:abc "..." EX 1800  # 分布式 Session
```

典型场景：缓存（JSON 序列化后存储）、计数器（文章阅读量、点赞数）、分布式锁（`SET lock val NX EX 30`）、Session 共享。

内部编码：值较短时使用 SDS（Simple Dynamic String），如果值是纯整数则直接以整数编码存储，省去序列化开销。Redis 7.0 之后 SDS 的优化更加紧凑，小字符串的内存占用进一步降低。

**2. Hash -- 存对象的最佳选择**

当你需要存储一个"用户"或"商品"这样有多个字段的对象时，Hash 比 String 更合适。

```bash
HSET user:1001 name "Alice" age 30 city "Shanghai"
HGET user:1001 name
HGETALL user:1001
```

典型场景：用户信息缓存、商品属性存储、购物车（用户 ID 做 key，商品 ID 做 field，数量做 value）。

和 String 存 JSON 对比：Hash 可以单独修改某个字段而不需要整体覆写，网络开销和序列化开销都更小。但如果对象需要整体读取且字段很少，String 反而更简单。

内部编码转换：字段少且值短时使用 ziplist（压缩列表），字段数超过 `hash-max-ziplist-entries`（默认 128）或值超过 `hash-max-ziplist-value`（默认 64 字节）时转为 hashtable。ziplist 的优势是内存紧凑，hashtable 的优势是 O(1) 查找。

**3. List -- 轻量消息队列与时间线**

List 是一个有序的双端链表，支持从两端推入和弹出。

```bash
LPUSH queue "task1"
RPOP queue             # 简单的消息队列
BRPOP queue 0          # 阻塞式弹出，实现阻塞队列
LRANGE timeline 0 19   # 取最新 20 条
```

典型场景：消息队列（生产者 LPUSH，消费者 BRPOP）、社交时间线（新消息 LPUSH，取最新 N 条 LRANGE）、最新文章列表。

需要注意的是，List 做消息队列是"简易版"——没有消费确认（ACK）、没有消费者组、没有持久化保证。生产环境中如果需要这些能力，应该用 Redis Stream（后文会提）。

内部编码转换：元素少时使用 ziplist，元素多后转为 quicklist（快速列表）。quicklist 是 ziplist 和双向链表的混合体——将多个 ziplist 节点串成链表，兼顾内存紧凑和快速插入。

**4. Set -- 去重与集合运算**

Set 是无序的、元素唯一的集合，最大的价值在于支持集合间的交、并、差运算。

```bash
SADD followers:user1 "Alice" "Bob" "Charlie"
SADD followers:user2 "Bob" "David" "Charlie"
SINTER followers:user1 followers:user2  # 共同关注: Bob, Charlie
SUNION followers:user1 followers:user2  # 全部关注者
SDIFF  followers:user1 followers:user2  # user1 独有关注
```

典型场景：共同好友/共同关注（交集）、标签系统（用户兴趣标签集合）、去重（判断 IP 是否已访问过）、抽奖（SRANDMEMBER 随机抽取）。

内部编码转换：当所有元素都是整数且数量少于 `set-max-intset-entries`（默认 512）时使用 intset（整数集合，底层是有序数组，查找 O(log n)），否则转为 hashtable（查找 O(1)）。intset 在元素全是整数的场景下非常省内存。

**5. Sorted Set (ZSet) -- 排行榜的灵魂**

ZSet 在 Set 的基础上给每个元素加了一个 score，元素按 score 排序且唯一。

```bash
ZADD leaderboard 1580 "player:A" 2340 "player:B" 980 "player:C"
ZREVRANGE leaderboard 0 9 WITHSCORES   # Top 10 排行榜
ZRANGEBYSCORE leaderboard 1000 2000    # 分数区间查询
ZRANK leaderboard "player:B"           # 排名查询
```

典型场景：排行榜（游戏积分、商品销量、热搜排名）、延时队列（score 存时间戳，定时轮询取到期任务）、带权重的 Feed 流。

排行榜是 ZSet 最经典的面试案例。`ZADD` 插入 O(log N)，`ZRANGE` 取排名 O(log N + M)，万级排行榜取 Top 10 几乎是瞬间完成。如果用 MySQL 做 `ORDER BY score DESC LIMIT 10`，数据量大时性能会急剧下降。

内部编码转换：元素少时使用 ziplist（元素按 score 排序存储），元素多后转为 skiplist（跳跃表）+ hashtable。skiplist 负责按 score 有序查询，hashtable 负责 O(1) 查元素的 score。跳跃表是一种随机化的多层链表结构，平均查找和插入都是 O(log N)，实现比平衡树简单，且范围查询效率更高。

### 分析

把五种结构放在一起看，有一条清晰的选择逻辑：

```
需要存简单值或计数？ → String
需要存多字段对象？   → Hash
需要有序列表/队列？  → List
需要去重/集合运算？  → Set
需要按分数排序？     → ZSet
```

另一条线索是内部编码的转换规律。Redis 的设计哲学是**小数据用紧凑结构省内存，大数据用高效结构保性能**。ziplist 出现在 String、Hash、List、ZSet 的底层实现中，它是 Redis 内存优化的核心武器。面试时如果能说出"ziplist 在什么阈值下会转换成 hashtable 或 skiplist"，会显得对底层实现有真正的理解，而不只是会调 API。

### 知识点总结

| 数据结构 | 典型场景 | 小数据编码 | 大数据编码 | 关键命令 |
|---------|---------|-----------|-----------|---------|
| String | 缓存/计数器/分布式锁 | SDS/整数 | SDS | SET/GET/INCR |
| Hash | 用户信息/购物车 | ziplist | hashtable | HSET/HGET/HGETALL |
| List | 消息队列/时间线 | ziplist | quicklist | LPUSH/RPOP/BRPOP |
| Set | 共同好友/去重/标签 | intset | hashtable | SADD/SINTER/SISMEMBER |
| ZSet | 排行榜/延时队列 | ziplist | skiplist+hashtable | ZADD/ZRANGE/ZRANK |

几个容易混淆的点需要注意：

- ZSet 和 List 都能做"有序"的事，但 List 按插入顺序排列，ZSet 按 score 排序，应用场景完全不同。
- Hash 和 String 都能存对象，但 Hash 支持字段级读写，适合频繁更新部分字段的场景。
- Set 的去重能力是"天然的"，不需要业务层做判断，SISMEMBER 是 O(1) 操作。

### 相关知识扩展

除了五大基础结构，Redis 还提供了几种特殊数据结构，面试中偶尔会被提及：

**HyperLogLog** -- 基数统计利器。用固定 12KB 内存估算上亿个不重复元素的数量，误差率约 0.81%。典型场景是 UV（独立访客）统计：`PFADD uv:page:home user_001 user_002 ...`，然后用 `PFCOUNT` 获取去重后的访问人数。相比用 Set 做去重计数，HyperLogLog 在大数据量下内存开销低了几个数量级。

**Bitmap** -- 位图操作，本质是 String 的位级扩展。每个 bit 可以表示一个布尔状态，适合签到系统（用户某天是否签到）、布隆过滤器、在线状态统计。`BITCOUNT` 可以统计某段时间内的签到天数，`BITOP` 支持位运算合并多天的签到数据。

**Stream** -- Redis 5.0 引入的消息流，是 List 做消息队列的"正式版"。支持消费者组（Consumer Group）、消息确认（ACK）、按 ID 范围读取、消息堆积。如果需要在 Redis 中实现可靠的消息队列，Stream 是比 List + BRPOP 更合适的选择。它的模型类似 Kafka，但更轻量。

**Geospatial** -- 地理位置数据结构，底层用 ZSet 存储，score 是 GeoHash 编码。支持 `GEODIST`（距离计算）、`GEORADIUS`（附近搜索）。适合"附近的人"、门店距离排序等 LBS 场景。

### 学习路线与建议

如果你是第一次系统学习 Redis 数据结构，建议按这个顺序推进：

1. **先把五种基础结构的命令敲一遍**。不要只看文档，打开 redis-cli 实际操作，体会每种结构的手感和适用边界。
2. **理解内部编码转换**。这是面试加分项，也是理解 Redis 为什么"快且省"的关键。重点关注 ziplist、skiplist、intset 这三种结构的设计思路。
3. **做两到三个小项目**。比如用 String 做分布式限流器、用 Hash 做用户中心缓存、用 ZSet 做排行榜、用 List 或 Stream 做简易消息队列。
4. **扩展阅读特殊结构**。HyperLogLog 和 Bitmap 在大数据统计场景中非常实用，Stream 则是 Redis 向消息中间件领域延伸的重要一步。
5. **阅读《Redis 设计与实现》**（黄健宏著）。这本书对每种数据结构的底层实现有非常详尽的图解，是面试前最好的参考书。

面试时不需要把所有细节都倒出来，但要能做到"说出场景、给出结构、解释编码"这三步闭环。面试官追问时，能讲清楚 ziplist 为什么紧凑、skiplist 为什么比平衡树更适合范围查询，就已经超过大多数候选人了。

### 参考文章与延伸阅读

- [Redis 官方文档 - Data Types](https://redis.io/docs/data-types/)
- [Redis 命令参考](https://redis.io/commands/)
- 《Redis 设计与实现》 -- 黄健宏（数据结构章节，对 SDS、ziplist、skiplist 有详细图解）
- [Redis 内部数据结构详解（知乎专栏）](https://zhuanlan.zhihu.com/p/72840466)
- [Redis Stream 使用指南](https://redis.io/docs/data-types/streams/)
