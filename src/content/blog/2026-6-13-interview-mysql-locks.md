---
title: "面试笔记：MySQL的行锁、间隙锁和死锁怎么处理"
date: "2026-6-13"
tags: ["MySQL", "行锁", "间隙锁", "死锁", "面试", "八股文"]
excerpt: "kami works"
---

# 面试笔记：MySQL 的行锁、间隙锁和死锁怎么处理

> 上一篇聊了事务隔离级别和 MVCC，但 MVCC 只管快照读，一旦涉及 `FOR UPDATE` 这种当前读，就进入锁的领地了。面试中锁和死锁经常捆绑出现，这篇把行锁、间隙锁、死锁检测与预防一次讲透。

### 前情提要

在之前的 MVCC 笔记中，我梳理了 RR 级别下 InnoDB 如何通过 Read View 实现无锁快照读。但面试官不会止步于此——"那 `SELECT ... FOR UPDATE` 加的是什么锁？""间隙锁在什么隔离级别下才会出现？""两个事务互相等对方的锁怎么办？"这些问题都指向同一个核心：**InnoDB 的锁机制**。

MVCC 解决的是"读不加锁"的问题，而锁解决的是"写要排队"的问题。两者配合，才构成 InnoDB 完整的并发控制体系。

### 问题

面试中关于锁的常见问法：

- "InnoDB 有哪些行锁类型？Record Lock、Gap Lock、Next-Key Lock 分别锁什么？"
- "间隙锁的作用是什么？为什么 RC 级别下没有间隙锁？"
- "什么是死锁？MySQL 怎么检测和处理的？"
- "实际项目中你是怎么避免死锁的？"

这些问题的底层逻辑是一条线：**锁的粒度从行到间隙再到范围，粒度越大冲突越多，死锁风险越高**。

### 回答

**InnoDB 的锁粒度与类型**

按粒度分，MySQL 有表锁和行锁。表锁锁整张表（`LOCK TABLES`），行锁只锁涉及的行。InnoDB 默认使用行锁，但如果没有走索引，行锁会退化成表锁——因为 InnoDB 的行锁是加在索引记录上的，没有索引就只能全表扫描并锁住所有行。

按类型分，行锁又分为共享锁（S Lock）和排他锁（X Lock）：

```sql
-- 共享锁：允许其他事务读，不允许写
SELECT * FROM users WHERE id = 1 LOCK IN SHARE MODE;

-- 排他锁：不允许其他事务读和写
SELECT * FROM users WHERE id = 1 FOR UPDATE;
```

**Record Lock（记录锁）**

Record Lock 锁定索引上的单行记录。`SELECT ... WHERE id = 1 FOR UPDATE` 锁住 `id=1` 这一行，其他事务无法修改这行数据，直到当前事务提交或回滚。Record Lock 是最基础的行锁，在所有隔离级别下都存在。

**Gap Lock（间隙锁）**

Gap Lock 锁定索引记录之间的间隙，不锁记录本身，只锁"空隙"。假设索引中有 `id=5` 和 `id=10` 两条记录，间隙锁会锁住 `(5, 10)` 这个开区间，阻止其他事务在这个区间内插入新行。

```sql
-- 锁定 (10, 20) 的间隙，阻止在此区间插入
SELECT * FROM users WHERE id > 10 AND id < 20 FOR UPDATE;
```

间隙锁存在的唯一目的就是**防止幻读**。正因为如此，间隙锁只在 RR（可重复读）级别下生效。降到 RC 后间隙锁自动消失，这也是为什么 RC 下无法阻止幻读。

**Next-Key Lock（临键锁）**

Next-Key Lock 是 Record Lock + Gap Lock 的组合，锁定一个左开右闭区间 `(prev, current]`。InnoDB 在 RR 级别下对索引扫描范围加 Next-Key Lock，既锁住已有记录，又锁住记录之间的间隙。

```sql
-- 对 id=1 加 Record Lock，同时对 (-∞, 1] 的范围加 Gap Lock
SELECT * FROM users WHERE id = 1 FOR UPDATE;
```

简单总结：Record Lock 锁"已有的行"，Gap Lock 锁"行之间的空"，Next-Key Lock 两个一起锁。

**死锁的产生与检测**

死锁的经典场景：两个事务互相持有对方需要的锁。

```sql
-- 事务 A
BEGIN;
UPDATE accounts SET balance = 100 WHERE id = 1;  -- 锁住 id=1
UPDATE accounts SET balance = 200 WHERE id = 2;  -- 等待 id=2 的锁

-- 事务 B
BEGIN;
UPDATE accounts SET balance = 300 WHERE id = 2;  -- 锁住 id=2
UPDATE accounts SET balance = 400 WHERE id = 1;  -- 等待 id=1 的锁
-- 死锁！A 等 B 释放 id=2，B 等 A 释放 id=1
```

死锁产生的四个必要条件：互斥、持有并等待、不可剥夺、循环等待。四个同时满足才会死锁。

InnoDB 通过 **wait-for graph（等待图）** 检测死锁。每个事务是图中的一个节点，当事务 A 等待事务 B 持有的锁时，就画一条从 A 到 B 的边。如果图中出现了环，就判定为死锁。检测到死锁后，InnoDB 会选择持有锁最少、回滚代价最小的事务作为"牺牲者"，将其回滚并抛出 `Deadlock found` 错误，让其他事务继续执行。

```sql
-- 查看最近的死锁信息
SHOW ENGINE INNODB STATUS;

-- 锁等待超时时间（默认 50 秒，非死锁场景下的等待上限）
SET innodb_lock_wait_timeout = 50;
```

**死锁预防策略**

1. **固定加锁顺序**：所有事务按相同顺序访问资源。先锁用户表再锁订单表，所有事务都这么做，就不会出现交叉等待。
2. **缩短事务持有时间**：事务越短，锁持有时间越短，死锁概率越低。把非数据库操作（调外部 API、发消息、写日志文件）移到事务外面。
3. **降低隔离级别**：RC 比 RR 的锁范围小（没有间隙锁），死锁概率低。但要权衡幻读问题。
4. **合理使用索引**：没有索引时 InnoDB 会锁全表，死锁概率暴增。确保 UPDATE/DELETE 语句走索引，只锁必要的行。

### 分析

面试官问锁，真正想考察的是三个层面：你是否理解锁的类型和适用场景、能否解释死锁的成因、有没有在项目中实际处理过锁问题。

一个容易踩的坑：**乐观锁 vs 悲观锁的选择**。悲观锁（`FOR UPDATE`）假设冲突一定发生，适合写密集场景。乐观锁（version 字段）假设冲突很少，适合读多写少场景。选错了不是功能出错，而是性能雪崩。

```sql
-- 乐观锁：通过 version 字段做更新检查
UPDATE files SET name = ?, version = version + 1
WHERE id = ? AND version = ?;
-- 如果 affected rows = 0，说明被其他事务改了，需要重试
```

另一个常见追问：**为什么没有索引会导致锁升级？** 因为 InnoDB 的行锁是加在索引记录上的。如果 `WHERE` 条件没有索引，InnoDB 必须扫描全表，对扫描到的每一行都尝试加锁。虽然最终只修改符合条件的行，但锁已经加到了所有行上，效果和表锁差不多。

### 知识点总结

| 概念 | 一句话 |
|------|--------|
| Record Lock | 锁索引上的单行记录，所有隔离级别都有 |
| Gap Lock | 锁索引记录之间的间隙，只在 RR 级别存在，用于防幻读 |
| Next-Key Lock | Record Lock + Gap Lock，锁 `(prev, current]` 区间 |
| 共享锁 / 排他锁 | S Lock 允许并发读，X Lock 独占读写 |
| 死锁 | 两个事务互相等待对方持有的锁，形成循环依赖 |
| wait-for graph | InnoDB 用等待图检测死锁，发现环就回滚代价最小的事务 |
| 锁升级 | 没有索引时行锁退化为表锁，大幅增加冲突和死锁概率 |
| 乐观锁 vs 悲观锁 | 读多写少用 version 字段，写密集用 FOR UPDATE |

### 相关知识扩展

**意向锁（Intention Lock）**

InnoDB 在加行锁之前，会先给表加上意向锁。意向共享锁（IS）表示"我要给某些行加 S 锁"，意向排他锁（IX）表示"我要给某些行加 X 锁"。意向锁的作用是让表锁和行锁可以共存——当事务想对表加表锁时，只需要检查意向锁是否存在，不需要逐行检查行锁，大大提高了效率。`SHOW ENGINE INNODB STATUS` 中可以看到 `IX` 和 `IS` 锁的信息。

**自增锁（AUTO-INC Lock）**

`AUTO_INCREMENT` 列在插入时会获取自增锁。MySQL 5.1 之后默认使用 `innodb_autoinc_lock_mode = 1`（连续锁模式）：简单的 `INSERT` 语句使用轻量级互斥量分配自增值，不需要持有锁到语句结束；但 `INSERT ... SELECT` 这类不确定插入行数的语句仍然需要传统的 AUTO-INC 表锁。高并发批量插入场景下，自增锁可能成为瓶颈，值得关注。

**锁监控**

生产环境排查锁问题，常用的几个手段：`SHOW ENGINE INNODB STATUS` 查看最近的死锁信息和当前锁等待；`information_schema.INNODB_LOCKS`（MySQL 8.0 改为 `performance_schema.data_locks`）查看当前持有的锁；`information_schema.INNODB_LOCK_WAITS` 查看锁等待关系。配合慢查询日志和 `SHOW PROCESSLIST`，可以快速定位锁竞争的根源。

### 学习路线与建议

1. **先搞清锁的分类体系**：表锁 vs 行锁、S Lock vs X Lock、Record Lock vs Gap Lock vs Next-Key Lock。画出层级关系图，面试时能清晰表述。
2. **动手复现死锁**：开两个 MySQL 客户端，按上面的示例交叉 UPDATE，观察 `Deadlock found` 错误，再用 `SHOW ENGINE INNODB STATUS` 看死锁日志。亲手操作一次比看十遍文章都记得牢。
3. **理解索引与锁的关系**：同一个 UPDATE 语句，有索引和没索引时加锁范围完全不同。用 `EXPLAIN` 确认走索引，再结合 `performance_schema.data_locks` 看实际加了哪些锁。
4. **掌握乐观锁和悲观锁的选择依据**：不要只背概念，结合自己项目想想哪些场景适合乐观锁（读多写少、冲突概率低）、哪些适合悲观锁（高并发写入、强一致性）。
5. **关注 MySQL 8.0 的锁变化**：`INNODB_LOCKS` 表被移到了 `performance_schema`，RC 级别的锁行为也有优化。面试中提到这些细节会加分。

### 参考文章与延伸阅读

- [MySQL 官方文档 - InnoDB Locks and Locking Reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locks-set.html)
- [MySQL 官方文档 - InnoDB Deadlock Detection](https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlocks.html)
- [MySQL 官方文档 - InnoDB Transaction Model and Locking](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-model.html)
- 《高性能 MySQL》第 4 版，O'Reilly
- 《MySQL 技术内幕：InnoDB 存储引擎》第 2 版，姜承尧
