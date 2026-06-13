---
title: "面试笔记：MySQL事务隔离级别和MVCC是怎么实现的"
date: "2026-6-13"
tags: ["MySQL", "事务", "MVCC", "面试", "八股文"]
excerpt: "kami works"
---

### 前情提要

整理面试高频题——MySQL 事务隔离级别和 MVCC。这块几乎是后端面试的必考项，不管是 Go 还是 Java 方向。我把自己的理解重新梳理了一遍，算是把零散的知识点串成了一条线。

### 问题

> 面试官常见问法：
> 1. MySQL 有哪几种事务隔离级别？各自解决了什么问题？
> 2. 什么是 MVCC？InnoDB 是怎么实现的？
> 3. RR 级别下是怎么解决幻读的？

### 回答

**ACID 回顾**

事务四大特性：原子性（Atomicity）、一致性（Consistency）、隔离性（Isolation）、持久性（Durability）。其中隔离性就是我们今天要聊的核心——不同隔离级别本质上是在"并发性能"和"数据一致性"之间做取舍。

**四种隔离级别与三种读问题**

| 隔离级别 | 脏读 | 不可重复读 | 幻读 |
|----------|------|------------|------|
| Read Uncommitted | 可能 | 可能 | 可能 |
| Read Committed | 不可能 | 可能 | 可能 |
| Repeatable Read | 不可能 | 不可能 | 可能 |
| Serializable | 不可能 | 不可能 | 不可能 |

三种读问题的区别：

- **脏读**：事务 A 读到了事务 B 还没提交的数据。B 一回滚，A 手里的数据就是脏的。
- **不可重复读**：事务 A 两次读同一行，中间事务 B 更新了这行并提交，A 两次读到不同的值。侧重于"修改"。
- **幻读**：事务 A 两次用相同条件查询，中间事务 B 插入了新行，A 第二次查到了"幻影行"。侧重于"新增/删除"。

MySQL 默认隔离级别是 **Repeatable Read**。

**MVCC 实现原理**

MVCC（Multi-Version Concurrency Control）的核心思想是：读操作不加锁，通过数据的多个历史版本来实现一致性非阻塞读。

InnoDB 中每行数据有两个隐藏列：

- `DB_TRX_ID`：最近修改该行的事务 ID
- `DB_ROLL_PTR`：回滚指针，指向 undo log 中的旧版本

当一行被多次修改时，undo log 中会形成一条**版本链**，每个版本通过回滚指针串起来，从最新版本可以追溯到最初版本。

**Read View 的可见性判断**

事务执行快照读（普通 SELECT）时会生成 Read View，包含：

- `m_ids`：生成 Read View 时所有活跃（未提交）事务 ID 列表
- `min_trx_id`：活跃事务中最小的 ID
- `max_trx_id`：下一个要分配的事务 ID（即当前最大事务 ID + 1）
- `creator_trx_id`：创建这个 Read View 的事务 ID

判断某行版本是否可见的规则：

1. 如果 `DB_TRX_ID == creator_trx_id`，说明是自己修改的，可见。
2. 如果 `DB_TRX_ID < min_trx_id`，说明该事务在 Read View 创建前就提交了，可见。
3. 如果 `DB_TRX_ID >= max_trx_id`，说明该事务在 Read View 创建后才开始，不可见。
4. 如果 `DB_TRX_ID` 在 `[min_trx_id, max_trx_id)` 范围内，看它是否在 `m_ids` 中：在则不可见（事务还没提交），不在则可见（事务已经提交）。

如果当前版本不可见，就沿着版本链继续找更早的版本，直到找到可见的或到链尾。

**RC vs RR 的关键区别**

区别只有一个：**Read View 的生成时机不同**。

- **Read Committed**：每次 SELECT 都重新生成一个新的 Read View。所以能读到其他事务在本事务期间提交的变更，导致不可重复读。
- **Repeatable Read**：只在事务第一次 SELECT 时生成 Read View，之后整个事务复用同一个。所以多次读取结果一致，解决了不可重复读。

这就是为什么 RR 比 RC "看到的数据更稳定"——不是锁更多，而是快照拍得更早、用得更久。

### 分析

**行锁、间隙锁、Next-Key Lock 如何解决幻读**

MVCC 解决了不可重复读，但幻读还需要靠锁。在 RR 级别下，InnoDB 使用 **Next-Key Lock**（临键锁）来防止幻读，它是 Record Lock + Gap Lock 的组合：

- **Record Lock**：锁定索引上的单行记录。`SELECT ... WHERE id = 1 FOR UPDATE` 锁住 id=1 这行。
- **Gap Lock**：锁定索引记录之间的间隙，防止其他事务在间隙中插入新行。比如索引中有 id=5 和 id=10，间隙锁会锁住 (5, 10) 这个区间。
- **Next-Key Lock**：左开右闭区间，锁住 `(prev, current]`。InnoDB 在 RR 下对扫描范围加 Next-Key Lock，既锁记录又锁间隙。

举个例子：事务 A 执行 `SELECT * FROM orders WHERE order_no > 100 FOR UPDATE`，InnoDB 会对符合条件的行加 Record Lock，同时对相关间隙加 Gap Lock。此时事务 B 想 `INSERT INTO orders (order_no) VALUES (150)` 就会被阻塞，从而避免幻读。

需要注意的是，**间隙锁只在 RR 级别存在**。降到 RC 后间隙锁自动消失，这也是 RC 下幻读无法被阻止的原因。

### 知识点总结

1. 四种隔离级别从低到高，并发性能递减，数据一致性递增。
2. MVCC 通过 undo log 版本链 + Read View 实现无锁快照读，核心是可见性判断算法。
3. RC 每次 SELECT 都刷新 Read View，RR 只在第一次 SELECT 时创建并复用。
4. RR 下通过 Next-Key Lock（Record Lock + Gap Lock）解决幻读。
5. 实际项目中大部分场景用 RR 就够了；写冲突多的场景可以考虑降到 RC 减少锁竞争。

### 相关知识扩展

**分布式事务中的隔离级别**

在微服务架构中，单个服务通常使用本地事务的 RR 或 RC。但跨服务的全局隔离很难保证——2PC 性能差，TCC/Saga 模式本身就是在应用层补偿。实际工程中，跨服务一致性往往退化为"最终一致性"，全局隔离级别的概念变得模糊。选择本地隔离级别时需要考虑：如果你的服务是读多写少，RR 足够安全；如果是高并发写入场景（如库存扣减），RC + 乐观锁可能是更好的选择。

**MySQL 8.0 对 READ COMMITTED 的改进**

MySQL 8.0 之前，RC 级别有一个痛点：binlog 必须使用 ROW 格式（不能用 STATEMENT），否则主从复制可能出现数据不一致。MySQL 8.0 延续了这个要求，但在锁行为上做了优化——RC 下 `UPDATE` 语句只锁最终匹配的行（而非扫描过程中碰到的所有行），大幅减少了锁冲突。很多互联网公司将生产环境从 RR 切到 RC，就是为了更好的并发写入性能。

### 学习路线与建议

1. **先理解 ACID**，搞清楚隔离性要解决什么问题。
2. **动手实验**：开两个 MySQL 客户端，设置不同隔离级别，分别复现脏读、不可重复读、幻读。亲手操作一遍比看十遍文章都有效。
3. **读 InnoDB 源码注释**：理解 Read View 的四个字段和可见性判断逻辑，这是面试区分"背过"和"真懂"的关键。
4. **关注锁的部分**：MVCC 解决的是快照读的问题，当前读（`FOR UPDATE`、`LOCK IN SHARE MODE`）仍然走锁机制。搞清楚"快照读 vs 当前读"的边界。
5. **结合项目思考**：你的项目用了什么隔离级别？有没有遇到过锁等待或死锁？怎么排查的？面试中结合实际项目讲会比纯理论有说服力得多。

### 参考文章与延伸阅读

- [MySQL 官方文档 - InnoDB Transaction Model](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-model.html)
- [MySQL 官方文档 - InnoDB Locks and Locking Reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locks-set.html)
- 《高性能 MySQL》第 4 章：事务和并发控制
- 《MySQL 技术内幕：InnoDB 存储引擎》第 6 章：事务与 MVCC 实现细节
