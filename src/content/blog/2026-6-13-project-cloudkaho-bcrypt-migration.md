---
title: "项目笔记：密码哈希升级不能让用户重新注册"
date: "2026-6-13"
tags: ["Go", "bcrypt", "安全", "密码存储", "项目实战"]
excerpt: "kami works"
---

# 密码哈希升级不能让用户重新注册

### 前情提要

CloudKaho 是一个基于 Go 的云盘系统，使用 Gin + GORM + MySQL + Redis + S3 构建。项目早期为了快速上线，密码存储使用了简单的 SHA-256 哈希。随着安全审计的推进，团队决定将密码哈希算法升级为 bcrypt——一个专为密码设计的慢哈希函数。但问题来了：数据库里已经有数千条 SHA-256 格式的密码哈希，不可能让所有用户重新注册或强制重置密码。

### 问题

这是一个典型的"在线迁移"问题——系统必须在不停服、不中断用户体验的前提下，完成底层安全机制的升级。具体挑战包括：如何区分新旧两种哈希格式？旧格式的密码验证通过后，如何无缝切换到新格式？整个过程对用户完全透明，不能弹出任何"请重新设置密码"的提示。

直接使用 bcrypt 验证旧用户的 SHA-256 哈希会失败，因为 bcrypt 期望的输入是明文密码，而不是另一个哈希值。如果先把密码做 SHA-256 再喂给 bcrypt（即 bcrypt(sha256(password))），虽然技术上可行，但会让密码验证链路变得诡异，后续维护成本高，而且偏离了 bcrypt 的标准用法。

### 解决

采用惰性迁移（Lazy Migration）策略：在登录时检测密码哈希的类型，如果是旧格式，用 SHA-256 验证；验证通过后，异步地将密码重新哈希为 bcrypt 格式并更新数据库。

```go
func (s *AuthService) Login(ctx context.Context, username, password string) (*TokenResponse, error) {
    var user models.User
    s.db.Where("username = ?", username).First(&user)

    var authenticated, needsRehash bool

    if isBcryptHash(user.PasswordHash) {
        // 新格式：直接 bcrypt 验证
        authenticated = bcrypt.CompareHashAndPassword(
            []byte(user.PasswordHash), []byte(password),
        ) == nil
    } else {
        // 旧格式：SHA-256 验证
        sha256Hash := fmt.Sprintf("%x", sha256.Sum256([]byte(password)))
        authenticated = sha256Hash == user.PasswordHash
        needsRehash = authenticated
    }

    if !authenticated {
        return nil, ErrInvalidCredentials
    }

    if needsRehash {
        // 异步升级，不阻塞登录响应
        go s.rehashPassword(user.ID, password)
    }

    return s.generateToken(&user)
}

func isBcryptHash(hash string) bool {
    return len(hash) >= 4 && (hash[:4] == "$2a$" || hash[:4] == "$2b$")
}
```

`rehashPassword` 方法在后台 goroutine 中执行，用 bcrypt 对明文密码重新哈希并更新数据库：

```go
func (s *AuthService) rehashPassword(userID uint, password string) {
    hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    if err != nil {
        log.Printf("bcrypt rehash failed for user %d: %v", userID, err)
        return
    }
    s.db.Model(&models.User{}).
        Where("id = ?", userID).
        Update("password_hash", string(hash))
}
```

### 分析

**bcrypt 哈希的识别。** bcrypt 生成的哈希字符串有固定格式：`$2a$10$...` 或 `$2b$10$...`，其中 `$2a$` / `$2b$` 是算法标识，后面的数字是 cost factor。这使得格式判断非常简单——只需检查前 4 个字符即可。

**异步重哈希的设计权衡。** 使用 `go s.rehashPassword(...)` 启动 goroutine 执行重哈希，好处是不影响登录接口的响应速度（bcrypt 的计算本身就要几十到几百毫秒）。风险在于，如果 goroutine 执行期间服务重启，这次重哈希就丢失了。但这个问题是可以接受的——用户下次登录时会再次触发重哈希，最终所有活跃用户都会完成迁移。

**为什么不用 `bcrypt(sha256(password))` 方案？** 这种"哈希套哈希"的做法虽然能让旧用户直接通过 bcrypt 验证，但有几个问题：第一，bcrypt 的输入变成了固定长度的 64 字符十六进制字符串，而非原始密码，这偏离了 bcrypt 的设计初衷。第二，SHA-256 的弱点（无 salt、计算快）仍然存在于整个链路中。第三，验证逻辑变得晦涩，新人接手时容易踩坑。惰性迁移方案更清晰、更安全。

**迁移覆盖率追踪。** 在生产环境中，应该添加一个指标来追踪迁移进度——例如定期查询 `password_hash NOT LIKE '$2a$%' AND password_hash NOT LIKE '$2b$%'` 的记录数。当覆盖率接近 100% 时，可以考虑移除 SHA-256 的验证分支，简化代码。对于长期不活跃的账户，可以通过邮件通知要求登录来完成最后的迁移。

### 知识点总结

- **bcrypt vs SHA-256**：SHA-256 是快速通用哈希，设计目标是数据完整性校验；bcrypt 是慢速密码哈希，内置 salt、可调节 cost factor，专门用于抵抗暴力破解和彩虹表攻击。
- **惰性迁移（Lazy Migration）**：一种数据迁移模式，不在一个批次中转换所有数据，而是在每次访问时按需转换。适合无法停服、无法通知用户的在线系统升级。
- **cost factor**：bcrypt 的复杂度参数，表示内部迭代次数为 2^cost。cost=10 意味着约 100ms 的计算时间，在安全性和用户体验之间取得平衡。随着硬件进步，可以逐步提高 cost 值。
- **salt 防彩虹表**：bcrypt 每次生成的 salt 不同，即使两个用户使用相同密码，哈希结果也完全不同。这使得预先计算的彩虹表（rainbow table）完全失效，攻击者必须对每个哈希单独暴力破解。

### 相关知识扩展

**Argon2id——当前最新的密码哈希推荐。** Argon2 是 2015 年密码哈希竞赛（PHC, Password Hashing Competition）的获胜者，Argon2id 是其混合变体，同时抵抗 GPU 加速（通过高内存消耗）和侧信道攻击（通过数据依赖的内存访问模式）。OWASP 2023 年指南已将 Argon2id 列为首选推荐。Go 中可以使用 `golang.org/x/crypto/argon2` 包来实现。

**密码哈希竞赛 PHC 的其他成果。** 除了 Argon2，PHC 还评选出了 scrypt、Catena 等算法。scrypt 是 Argon2 之前的主流选择，通过内存硬度（memory-hardness）抵抗 ASIC/GPU 攻击。理解这些算法的演进历程，有助于把握密码存储的最佳实践。

**OAuth2 渐进迁移策略。** 惰性迁移的思想不仅适用于密码哈希。在系统从"用户名+密码"迁移到 OAuth2（如 Google/GitHub 登录）时，也可以采用类似策略：用户首次通过 OAuth2 登录时，自动关联已有账户，无需用户手动操作。核心思想相同——在用户的自然交互流程中完成迁移，而非强制一次性切换。

**Go 中 bcrypt 的使用细节。** `bcrypt.GenerateFromPassword` 的 cost 参数范围是 4~31，`bcrypt.DefaultCost` 为 10。在生产环境中建议用 12~14（约 250ms~1s），具体取决于服务器性能和用户体验的平衡。可以使用 `golang.org/x/crypto/bcrypt` 包中的 `Cost()` 函数检查已有哈希的 cost 值，在需要时触发升级。

### 学习路线与建议

1. 先理解哈希函数的分类：通用哈希（MD5、SHA-256）vs 密码哈希（bcrypt、scrypt、Argon2），理解为什么"快"对于密码哈希是缺点而非优点。
2. 动手实现一个最简单的惰性迁移 demo：创建一个包含 SHA-256 哈希的用户表，实现登录时自动检测并迁移到 bcrypt，观察数据库中哈希值的逐步变化。
3. 学习 Go 的 goroutine 和并发安全：异步重哈希的 goroutine 需要注意数据库连接池的使用、错误处理和日志记录。
4. 研究 OWASP Password Storage Cheat Sheet，了解最新的密码存储最佳实践和参数推荐。
5. 进阶学习 Argon2id 的实现和参数调优（内存大小、迭代次数、并行度），在 CloudKaho 中实现从 bcrypt 到 Argon2id 的二次迁移。

### 参考文章与延伸阅读

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — 密码存储的权威安全指南
- [bcrypt 算法论文](https://www.usenix.org/legacy/events/usenix99/provos/provos.pdf) — Niels Provos 和 David Mazieres 的原始论文
- [Argon2 官方规范](https://github.com/P-H-C/phc-winner-argon2) — PHC 获胜算法的参考实现和文档
- [Go bcrypt 包文档](https://pkg.go.dev/golang.org/x/crypto/bcrypt) — Go 标准扩展库中 bcrypt 的 API 文档
- [Dropbox 密码存储演进博客](https://dropbox.tech/security/how-dropbox-securely-stores-your-passwords) — 大规模系统的密码哈希迁移实战经验
