---
title: "项目笔记：MySQL死锁了怎么办"
date: "2026-6-13"
tags: ["Go", "MySQL", "死锁", "重试机制", "项目实战"]
excerpt: "kami works"
---

# MySQL 死锁了怎么办

### 前情提要

CloudKaho 是一个 Go 后端云盘系统，使用 Gin + GORM + MySQL + Redis + S3 构建。在前一篇文章中，我们为秒传功能引入了 `SELECT ... FOR UPDATE` 行锁来保证并发安全。但上线压测后，日志里开始频繁出现一个令人不安的错误：`Error 1213: Deadlock found when trying to get lock; try restarting transaction`。MySQL 的死锁检测机制主动回滚了事务，而我们的程序直接把这个错误抛给了用户。

### 问题

死锁的根因并不复杂。当多个事务以不同顺序锁定相同资源时，就可能形成循环等待：事务 A 持有行 X 的锁并等待行 Y，事务 B 持有行 Y 的锁并等待行 X。InnoDB 的死锁检测器会发现这种情况，选择"代价最小"的事务进行回滚，返回 error 1213。

在云盘场景中，秒传请求的并发量很高，多个用户上传相同文件时会竞争同一行的 `FOR UPDATE` 锁。虽然单次死锁的概率不大，但在每秒数百请求的压测下，死锁变成了常态而非异常。问题变成了：如何优雅地处理死锁，而不是让用户看到 500 错误？

### 解决

答案是实现一个通用的事务重试机制。死锁的本质是"临时性冲突"——回滚后重新执行，大概率就能成功。我们设计了一个 `withRetry` 方法，封装了事务执行和死锁重试逻辑：

```go
func (s *BaseService) withRetry(fn func(tx *gorm.DB) error) error {
    for attempt := 0; attempt <= 3; attempt++ {
        err := s.db.Transaction(fn)
        if err == nil {
            return nil
        }

        if !isDeadlockError(err) {
            return err
        }

        if attempt == 3 {
            return fmt.Errorf("重试 %d 次后仍然失败: %w", 3, err)
        }

        backoff := time.Duration(50*(attempt+1)) * time.Millisecond
        time.Sleep(backoff)
    }
    return nil
}

func isDeadlockError(err error) bool {
    var mysqlErr *mysql.MySQLError
    if errors.As(err, &mysqlErr) {
        return mysqlErr.Number == 1213
    }
    return false
}
```

使用方式非常简洁——所有需要事务保护的操作都传入 `withRetry`，它会自动处理重试逻辑。退避策略采用线性递增：第一次等 50ms，第二次 100ms，第三次 150ms。

### 分析

**为什么选择线性退避而不是指数退避？** 指数退避（50ms → 100ms → 200ms → 400ms）适用于网络抖动、服务过载等"需要给对时间恢复"的场景。但 MySQL 死锁不同——它是毫秒级的锁冲突窗口，当事务被回滚后，锁已经释放，对手事务也即将完成。等太久没有意义，反而增加用户延迟。线性退避提供了一个合理的"错开时间"，让多个重试请求不会同时涌入。

**错误识别用 `errors.As` 而不是 `errors.Is`。** 这是一个容易被忽视的细节。GORM 会对底层错误进行包装（wrapping），直接用 `errors.Is` 比较的是值相等性，无法穿透包装层。而 `errors.As` 会沿着 `Unwrap()` 链一路向下查找，直到找到匹配的类型。这里我们需要找到底层的 `*mysql.MySQLError` 并检查其 `Number` 字段是否为 1213。

**重试次数为什么是 3 次？** 这来自实测经验。MySQL 死锁通常在第一次重试时就能解决（因为冲突的另一方已经完成），连续 3 次都死锁的概率极低。如果 3 次仍然失败，说明存在更严重的锁竞争问题，应该报错而不是无限重试。

**`withRetry` 作为 BaseService 的方法。** 所有 Service 都嵌入 BaseService，因此所有业务逻辑都天然拥有重试能力。这是一个典型的横切关注点（cross-cutting concern）封装——业务代码不需要关心重试，只需要把事务逻辑传给 `withRetry`。

**生产环境的可观测性。** 在实际部署中，`withRetry` 内部应该添加结构化日志，记录每次重试的 attempt 编号、错误类型和退避时长。这些信息对于排查线上锁竞争热点至关重要。可以进一步将死锁次数上报到 Prometheus，配合 Grafana 面板监控死锁趋势，及时发现因业务变更导致的锁模式变化。

### 知识点总结

- **MySQL 死锁检测**：InnoDB 维护一个等待图（wait-for graph），当检测到环路时，选择回滚代价最小的事务，返回 error 1213。
- **线性退避 vs 指数退避**：线性退避适合短暂的、自恢复的冲突（如数据库死锁）；指数退避适合需要长时间恢复的故障（如网络分区、服务宕机）。
- **`errors.As` vs `errors.Is`**：`errors.Is` 用于值比较（如 `errors.Is(err, gorm.ErrRecordNotFound)`），`errors.As` 用于类型匹配并能穿透 `fmt.Errorf("%w", err)` 的包装链。
- **GORM 事务管理**：`db.Transaction(fn)` 自动处理 begin/commit/rollback，配合闭包使用可以确保事务的原子性。

### 相关知识扩展

**InnoDB 死锁检测的内部机制。** InnoDB 在每次锁请求时都会检查等待图。这个图的节点是事务，边是"事务 A 等待事务 B 持有的锁"。检测到环路的算法时间复杂度为 O(V+E)，在高并发下可能成为性能瓶颈。MySQL 5.7+ 提供了 `innodb_deadlock_detect` 变量，可以关闭死锁检测转而依赖锁等待超时（`innodb_lock_wait_timeout`），但这是极端场景下的优化手段。

**MySQL 锁等待超时。** 如果关闭死锁检测，事务会在等待锁超时后返回 error 1205（Lock wait timeout exceeded）。默认超时时间为 50 秒，在高并发场景下这个值太长了。可以结合 `innodb_lock_wait_timeout` 和重试机制来实现"快速失败 + 重试"的策略。

**分布式事务中的重试。** 在微服务架构下，事务可能跨越多个服务和数据库。Saga 模式和 TCC（Try-Confirm-Cancel）模式都需要处理重试问题。核心原则是幂等性——重试操作必须能够安全地重复执行。CloudKaho 的秒传场景天然幂等（引用计数 +1 不会重复执行，因为每次重试都是完整的事务）。

**Go 中的重试库。** 除了手写重试逻辑，社区有成熟的库可以使用，如 `avast/retry-go`（支持多种退避策略和条件判断）和 `cenkalti/backoff`（专注于指数退避）。在生产项目中，建议评估是否需要引入这些库来替代手写循环。

**可重试错误的范围。** 除了 error 1213（死锁），MySQL 还有几种值得重试的临时性错误：error 1205（锁等待超时）、error 2006（MySQL server has gone away）、error 2013（Lost connection during query）。一个健壮的重试组件应该能覆盖这些场景，同时严格排除不可重试的错误（如唯一键冲突、语法错误）。

### 学习路线与建议

1. 先在 MySQL 中手动复现死锁：开两个终端，用不同的顺序 `SELECT ... FOR UPDATE` 两行数据，观察 InnoDB 如何选择牺牲者。
2. 理解 Go 的 error wrapping 机制，动手写一个包含 3 层包装的 error，分别用 `errors.Is` 和 `errors.As` 提取信息。
3. 在 CloudKaho 的 `withRetry` 基础上，尝试添加日志记录（每次重试时记录 attempt 和 error），这在生产环境排查问题时非常重要。
4. 学习 InnoDB 的 `SHOW ENGINE INNODB STATUS` 命令，它能展示最近一次死锁的详细信息，包括涉及的事务、锁和 SQL。
5. 进阶研究 CockroachDB 或 TiDB 的分布式事务实现，了解它们如何在分布式环境下处理死锁和重试。

### 参考文章与延伸阅读

- [MySQL Deadlock Detection](https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlocks.html) — InnoDB 死锁检测官方文档
- [Go errors.As 官方文档](https://pkg.go.dev/errors#As) — 理解 error wrapping 和类型断言
- [avast/retry-go](https://github.com/avast/retry-go) — Go 社区最流行的重试库
- [InnoDB Locking and Transaction Model](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-model.html) — InnoDB 事务与锁模型完整指南
- [Martin Kleppmann: Designing Data-Intensive Applications - Transactions](https://dataintensive.net/) — DDIA 中关于事务和并发控制的经典章节
