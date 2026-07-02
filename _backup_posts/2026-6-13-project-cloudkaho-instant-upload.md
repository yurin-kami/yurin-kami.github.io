---
title: "项目笔记：云盘秒传是怎么实现的"
date: "2026-6-13"
tags: ["Go", "MySQL", "并发控制", "内容寻址", "项目实战"]
excerpt: "kami works"
---

# 云盘秒传是怎么实现的

### 前情提要

CloudKaho 是一个基于 Go 构建的云盘系统，技术栈包括 Gin + GORM + MySQL + Redis + S3。在一次产品评审中，有人提出：用户上传一个 2GB 的视频，如果服务器上已经有了完全相同的文件，为什么还要傻等半小时？秒传——这个看似简单的需求，背后涉及哈希计算、并发安全、存储去重等多个工程问题。

### 问题

核心问题有两个层面。第一，如何判断两个文件"完全相同"？文件名可以被随意修改，但内容不变，系统需要识别出这种等价性。第二，当两个用户几乎在同一时刻上传相同文件时，如何保证不会重复写入 S3，也不会出现引用计数错误的并发安全问题？

如果仅用文件名做判重，同名不同内容的文件会被错误命中；如果用时间戳做判重，完全无法识别内容相同的文件。而在并发场景下，两个请求同时查询发现"文件不存在"，然后各自上传一份到 S3，不仅浪费存储，还会造成引用计数不一致。

### 解决

方案分三步走：用 SHA-256 计算文件哈希作为唯一指纹，用 `SELECT ... FOR UPDATE` 行锁解决并发竞争，用 `ReferenceCount` 引用计数管理文件生命周期。

```go
func (s *FileService) UploadFile(ctx context.Context, req UploadRequest) (*File, error) {
    hash := sha256.Sum256(req.FileData)
    hashStr := hex.EncodeToString(hash[:])

    var file *File
    err := s.withRetry(func(tx *gorm.DB) error {
        var existing File
        err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
            Where("sha256_hash = ?", hashStr).
            First(&existing).Error

        if err == nil {
            // 文件已存在，秒传：引用计数 +1
            return tx.Model(&existing).
                Update("reference_count", gorm.Expr("reference_count + 1")).Error
        }

        if !errors.Is(err, gorm.ErrRecordNotFound) {
            return err
        }

        // 文件不存在，真正上传 S3
        s3Key := generateS3Key(hashStr, req.FileName)
        if err := s.s3Client.Upload(ctx, s3Key, req.FileData); err != nil {
            return fmt.Errorf("S3 上传失败: %w", err)
        }

        file = &File{
            UserID:         req.UserID,
            FileName:       req.FileName,
            S3Key:          s3Key,
            SHA256Hash:     hashStr,
            ReferenceCount: 1,
        }
        return tx.Create(file).Error
    })
    return file, err
}
```

整个逻辑运行在一个数据库事务中。`FOR UPDATE` 对查询到的行加排他锁，保证同一时刻只有一个事务能修改同一哈希对应的记录。如果查到已有记录，直接引用计数加一，跳过 S3 上传；如果记录不存在，则上传到 S3 并创建新记录。

### 分析

**为什么用悲观锁而不是乐观锁？** 秒传场景的特殊性在于，冲突不是小概率事件——热门文件可能同时有几十个人上传。乐观锁（版本号 + CAS 更新）在低冲突场景下性能更好，但在高冲突场景下会导致大量重试，反而不如悲观锁直接排队来得高效。

**删除文件的引用计数机制。** 当用户删除文件时，不是直接删 S3 对象，而是将 `ReferenceCount` 减一。只有当引用计数降到零时，才真正从 S3 删除对象。这保证了多用户共享同一份物理存储的安全性。

**本质是内容寻址存储（CAS）。** 这个思路并不新鲜。Git 的 `.git/objects` 目录就是典型的内容寻址——用文件内容的哈希值作为存储路径，天然去重。Docker 镜像层、IPFS 也都采用同一范式。CloudKaho 只是将这个思想应用到了云盘场景。

### 知识点总结

- **CAS（Content-Addressable Storage）内容寻址存储**：以内容的哈希值作为唯一标识和寻址依据，天然实现数据去重。
- **悲观锁（Pessimistic Lock）**：`SELECT ... FOR UPDATE` 在读取时加排他锁，适用于冲突频繁的场景，避免大量重试开销。
- **引用计数（Reference Counting）**：多个逻辑文件指向同一物理对象时，通过计数器管理生命周期，计数归零时回收资源。
- **SHA-256 文件指纹**：将任意大小的文件映射为固定 32 字节的哈希值，碰撞概率极低（2^128 级别），可作为文件唯一性判断依据。

### 相关知识扩展

**更快的哈希算法。** SHA-256 在安全性上是黄金标准，但在纯粹用于文件去重（而非密码学）的场景下，可以考虑 xxHash 或 BLAKE3。xxHash 的速度比 SHA-256 快一个数量级，BLAKE3 则在保持密码学安全的同时接近内存带宽极限。如果系统规模达到 PB 级别，哈希计算本身就会成为瓶颈。

**分布式锁方案。** 当系统扩展到多实例部署时，单机的 `FOR UPDATE` 仍然有效（因为锁在数据库层），但如果想减轻数据库压力，可以考虑 Redis 的 Redlock 算法——通过多个 Redis 节点达成共识来实现分布式互斥。

**纠删码（Erasure Coding）。** 在引用计数之上，大规模存储系统通常还会使用纠删码来提高数据可靠性。将数据分成多个片段并计算冗余校验块，即使部分节点故障也能恢复完整数据。MinIO 就采用了这种策略。

**参考系统。** Seafile 是一个开源云盘，同样使用内容寻址去重；MinIO 是兼容 S3 协议的开源对象存储，可以深入学习其去重和高可用设计。

### 学习路线与建议

1. 先理解哈希函数的基本性质（确定性、抗碰撞性、雪崩效应），动手用 Go 的 `crypto/sha256` 包计算文件哈希。
2. 学习 MySQL 的锁机制，重点理解 InnoDB 的行锁、间隙锁、临键锁，以及 `FOR UPDATE` 与 `FOR SHARE` 的区别。
3. 在本地搭建一个最小化的秒传 demo：一个 Gin 接口 + MySQL 表 + 本地文件系统，体验完整的"哈希查重→加锁→引用计数"流程。
4. 进阶阅读 Git 内部原理（Pro Git 第十章），理解 content-addressable storage 的设计哲学。
5. 如果想深入分布式存储，可以研究 IPFS 的 Merkle DAG 和 CID（Content Identifier）规范。

### 参考文章与延伸阅读

- [Pro Git - Git Internals](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain) — Git 内容寻址存储的权威解释
- [MySQL InnoDB Locking](https://dev.mysql.com/doc/refman/8.0/en/innodb-locks-table.html) — InnoDB 锁机制官方文档
- [Seafile 架构设计](https://manual.seafile.com/setup/design/) — 开源云盘的去重与分块策略
- [BLAKE3 官方仓库](https://github.com/BLAKE3-team/BLAKE3) — 新一代密码学哈希，速度远超 SHA-256
- [MinIO Erasure Coding](https://min.io/docs/minio/linux/operations/concepts/erasure-coding.html) — 对象存储的纠删码实现
