---
title: "面试笔记：JWT和Session认证到底怎么选"
date: "2026-6-13"
tags: ["JWT", "Session", "认证", "OAuth2", "面试", "八股文"]
excerpt: "kami works"
---

# 面试笔记：JWT 和 Session 认证到底怎么选

> 准备后端面试的过程中，认证安全这块几乎必问。从 Session 到 JWT 再到 OAuth2，面试官喜欢层层递进地追问。我把这块知识从头到尾梳理了一遍，踩了一些坑，也弄明白了一些之前模棱两可的概念。这篇笔记适合正在准备面试、或者刚做完 CRUD 想搞清楚"登录到底发生了什么"的同学。

### 前情提要

认证（Authentication）解决的是"你是谁"的问题，授权（Authorization）解决的是"你能干什么"的问题。面试中这两块经常绑在一起问，但底层逻辑完全不同。Session 是最经典的方案，JWT 是前后端分离时代的宠儿，OAuth2 则是第三方登录的行业标准。理解它们的演进关系，比死记硬背强得多。

---

### 问题 1：Session 是怎么工作的？有什么优缺点？

最早做 Web 应用的时候，用户登录成功后服务端会在内存或 Redis 中创建一个 Session 对象，包含用户 ID、登录时间等信息，然后把 Session ID 通过 `Set-Cookie` 响应头塞给浏览器。之后浏览器每次请求都会自动携带这个 Cookie，服务端拿着 Session ID 去查对应的 Session 数据，确认身份。

**优点很明确**：服务端掌控一切。想注销？直接删掉 Session 就行。想限制同时在线设备数？数一下 Session 个数就好。安全性方面，配合 Cookie 的 `HttpOnly`（防 XSS 读取）、`Secure`（仅 HTTPS 传输）、`SameSite`（防 CSRF）属性，防御体系比较完善。

**问题也很明显**：Session 存在服务端，横向扩展就麻烦了。你部署了三个服务节点，用户的 Session 在节点 A 上，请求被负载均衡到节点 B，B 查不到 Session 就会拒绝。解决办法要么搞 Sticky Session（绑定用户到固定节点），要么搞 Session 共享（Redis 集中存储），都增加了运维复杂度。另外 Cookie 有跨域限制，前后端分离部署在不同域名下就很头疼。

---

### 问题 2：JWT 的三段结构和无状态验证是怎么回事？

JWT（JSON Web Token）由三部分组成，用 `.` 分隔：

**Header**：声明算法类型，比如 `{"alg": "HS256", "typ": "JWT"}`，Base64URL 编码。

**Payload**：存放声明（Claims），包括标准字段（`iss` 签发者、`exp` 过期时间、`sub` 用户标识）和自定义字段（userId、role 等）。同样 Base64URL 编码。这里有个关键点：**Payload 不是加密的**，任何人拿到 token 都能解码看到内容，所以绝对不能放密码之类的敏感信息。

**Signature**：对 Header 和 Payload 的签名。服务端用密钥计算 `HMACSHA256(base64UrlEncode(header) + "." + base64UrlEncode(payload), secret)`，后续验证时重新计算并比对，判断 token 是否被篡改。

验证流程非常简洁：客户端在请求头中带上 `Authorization: Bearer <token>`，服务端提取 token，验证签名，检查过期时间，解析 Payload 拿到用户信息。全程不查数据库，所以叫**无状态**。这让它在微服务和多节点部署中如鱼得水——任意节点拿到 token 都能独立验证。

---

### 问题 3：JWT 的致命伤是什么？怎么解决？

JWT 最大的问题是**无法主动失效**。token 一旦签发，在过期之前就一直有效。你点了"退出登录"，客户端删掉了本地存储的 token，但如果有人在这之前截获了那个 token，他依然可以用到过期为止。

这引出了一个设计上的矛盾：过期时间设短了，用户频繁被踢出要重新登录，体验极差；设长了，token 泄露后的攻击窗口就很大。

**双 Token 机制**是目前的主流方案。Access Token 短命（15 分钟到 2 小时），用于日常 API 调用；Refresh Token 长寿（7 到 30 天），用于换取新的 Access Token。流程是这样的：客户端用 Access Token 请求，服务端返回 401 表示过期，客户端自动拿 Refresh Token 去 `/auth/refresh` 接口换新 token，然后重试原请求。整个过程对用户透明。

Refresh Token 和 Access Token 不同，它是**有状态**的——存在数据库里，可以主动删除（实现真正的注销）。更安全的做法是加上**旋转机制（Rotation）**：每次用 Refresh Token 换新 token 时，同时签发新的 Refresh Token 并作废旧的。如果检测到旧 Refresh Token 被重复使用，说明可能被盗用，立刻注销该用户的所有 token。

---

### 问题 4：OAuth2 的四种模式和授权码流程？

OAuth2 解决的是"第三方应用如何安全地获取用户资源访问权限"。它和 JWT 不冲突——OAuth2 定义获取 token 的流程，JWT 可以作为 token 的格式。

四种授权模式中，**授权码模式（Authorization Code）** 最安全也最常用，面试必问：

1. 用户点击"用 GitHub 登录"，跳转到 GitHub 授权页面
2. 用户同意授权，GitHub 回调你的应用并附带一个 authorization code
3. 你的后端拿 code + client_secret 向 GitHub 换取 Access Token
4. 用 Access Token 调 GitHub API 拿到用户信息

code 只能用一次且有效期很短（通常 10 分钟），client_secret 始终在后端使用不暴露给前端。这就是为什么授权码模式最安全——敏感凭证全程不经过浏览器。

其他三种：**简化模式（Implicit）** 直接在 URL fragment 返回 token，已不推荐；**密码模式（Password）** 让用户把密码交给第三方应用，仅适用于高度信任的官方应用；**客户端凭证模式（Client Credentials）** 应用以自己的身份获取 token，用于服务间通信，不涉及用户。

---

### 分析：实际项目中怎么选？

我的理解是：没有绝对的好坏，只有适不适合。**传统 Web 应用、需要即时注销的管理后台**用 Session 更省心。**前后端分离、微服务架构、移动端**用 JWT 更灵活。实际上很多项目两者结合——用 Session 管理登录态，用 JWT 做 API 间的无状态鉴权。

OAuth2 则是另一个维度的问题。只要涉及第三方登录或开放平台，就必须用它。而 OAuth2 颁发的 Access Token 完全可以采用 JWT 格式，兼得授权流程的安全性和无状态验证的性能优势。

---

### 知识点总结

1. **Session** 有状态，服务端存储，注销方便，但横向扩展需要额外方案
2. **JWT** 无状态，三段结构（Header.Payload.Signature），签名防篡改，但无法主动失效
3. **双 Token 机制**（Access Token + Refresh Token + Rotation）是 JWT 安全最佳实践
4. **OAuth2 授权码模式**是第三方登录的标准流程，code 一次性 + client_secret 后端保密
5. JWT 常见攻击包括 alg:none 攻击、算法替换攻击、重放攻击，防御核心是服务端固定算法 + HTTPS + 短有效期
6. Cookie 的 HttpOnly / Secure / SameSite 属性是防御 XSS 和 CSRF 的基础手段

---

### 相关知识扩展

**双 Token 的工程实现细节**：Access Token 过期后前端自动刷新需要处理并发请求的竞态问题。多个请求同时收到 401，不应该同时发起多次刷新。常见做法是用一个 Promise 或锁机制，让第一个 401 触发刷新，其他请求排队等待新 token。

**OpenID Connect（OIDC）**：在 OAuth2 之上加了一层身份认证。OAuth2 只解决"授权"，不告诉你用户是谁；OIDC 新增了 ID Token（也是 JWT 格式），包含用户身份信息， standardized 了 `/userinfo` 端点。简单说，OAuth2 + OIDC = 认证 + 授权。

**JWT 安全最佳实践**：使用 RS256 非对称签名（私钥签发、公钥验证），避免 HS256 的密钥分发问题；密钥足够长（256 位以上）并定期轮换，存在 Vault 等密钥管理服务中而非硬编码；敏感操作（如修改密码、转账）要求二次验证，不单纯依赖 token。

---

### 学习路线与建议

如果你是初学者，建议按这个顺序理解：先搞懂 HTTP 是无状态的 -> 为什么需要 Cookie/Session -> Session 的扩展性问题 -> JWT 如何解决 -> JWT 自身的问题 -> 双 Token 方案 -> OAuth2 的授权流程。这条线串下来，面试中不管怎么追问都能接住。

动手实践比看十遍文章有用。试着自己用 Go 的 `golang-jwt` 库实现一个登录签发 + 刷新 + 注销的完整流程，或者接入 GitHub OAuth2 做一次第三方登录。写完之后你会发现很多细节问题（token 存哪里、并发刷新怎么处理、密钥怎么管理）是看文档时根本想不到的。

---

### 参考文章与延伸阅读

- [JWT.io - Introduction to JSON Web Tokens](https://jwt.io/introduction)
- [OAuth 2.0 授权框架 - RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [Auth0 Blog - Refresh Tokens: What Are They and When to Use Them](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/)
- [OWASP JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
