---
title: "项目笔记：大文件上传服务器扛不住怎么办"
date: "2026-6-13"
tags: ["Go", "S3", "对象存储", "大文件上传", "项目实战"]
excerpt: "kami works"
---

# 大文件上传服务器扛不住怎么办

### 前情提要

CloudKaho 是一个基于 Go 的云盘系统，技术栈为 Gin + GORM + MySQL + Redis + S3。在项目早期，所有文件上传都走同一条链路：客户端上传到后端服务器，后端再转发到 S3。小文件没有问题，但当用户上传几个 GB 的视频文件时，后端服务器变成了带宽瓶颈——所有数据都要经过它中转，CPU、内存、网络全部吃满，其他 API 请求的响应时间直线上升。

### 问题

问题的本质是架构上的：让一个计算节点（后端服务器）承担数据传输（data plane）的职责，是对资源的严重浪费。后端的角色应该是协调者——告诉客户端"你可以把数据放到哪里"，而不是亲自搬运每一个字节。

具体来说有三个痛点：第一，带宽瓶颈——所有文件流量都经过后端，单台服务器的网卡成为整个系统的上限。第二，超时风险——大文件上传耗时长，HTTP 连接容易超时或被中间件截断。第三，无法断点续传——网络中断后只能从头开始，用户体验极差。

### 解决

方案是 S3 Multipart Upload 配合 Presigned URL，让客户端直传数据到 S3，后端只负责控制面。整个流程分为三步：

**第一步：Init** — 客户端告诉后端"我要上传一个文件"，后端调用 S3 的 `InitiateMultipartUpload` 获取 UploadId，然后为每个分片生成预签名 URL，返回给客户端。

```go
func (s *UploadService) InitMultipartUpload(ctx context.Context, req InitUploadRequest) (*InitUploadResponse, error) {
    s3Key := generateS3Key(req.SHA256Hash, req.FileName)

    output, err := s.s3Client.InitiateMultipartUpload(ctx, &s3.InitiateMultipartUploadInput{
        Bucket: aws.String(s.bucket),
        Key:    aws.String(s3Key),
    })
    if err != nil {
        return nil, err
    }

    totalParts := int(math.Ceil(float64(req.FileSize) / float64(PartSize)))
    partURLs := make([]PresignedPart, 0, totalParts)

    for i := 1; i <= totalParts; i++ {
        presignClient := s3.NewPresignClient(s.s3Client)
        presignedReq, _ := presignClient.PresignUploadPart(ctx, &s3.UploadPartInput{
            Bucket:     aws.String(s.bucket),
            Key:        aws.String(s3Key),
            UploadId:   output.UploadId,
            PartNumber: aws.Int32(int32(i)),
        }, s3.WithPresignExpires(time.Duration(s.presignExpiry)*time.Second))

        partURLs = append(partURLs, PresignedPart{
            PartNumber: i,
            URL:        presignedReq.URL,
        })
    }

    session := MultipartSession{
        UploadID:   *output.UploadId,
        S3Key:      s3Key,
        TotalParts: totalParts,
    }
    sessionJSON, _ := json.Marshal(session)
    s.redis.Set(ctx, fmt.Sprintf("upload:session:%s", *output.UploadId), sessionJSON, 25*time.Hour)

    return &InitUploadResponse{UploadID: *output.UploadId, Parts: partURLs}, nil
}
```

**第二步：分片直传** — 客户端拿到预签名 URL 列表后，将文件切分成多个 Part（通常 5MB 一个），直接用 HTTP PUT 请求上传到 S3。这一步完全不经过后端服务器。

**第三步：Complete** — 所有分片上传完成后，客户端通知后端，后端调用 S3 的 `CompleteMultipartUpload` 将所有分片合并为一个完整对象。

### 分析

**数据面与控制面分离。** 这是网络架构中的经典思想。后端处理控制面（认证、授权、会话管理、元数据记录），S3 处理数据面（实际的字节传输）。YouTube 的视频上传、微信的文件传输、钉钉的文档共享，背后都是同样的架构模式——服务端签发"通行证"，客户端拿着通行证直连存储服务。

**Presigned URL 的安全模型。** 预签名 URL 本质上是一个带有时间限制的临时授权凭证。它包含签名信息，S3 收到请求后会验证签名是否合法、是否过期。即使 URL 泄露，攻击者也只能在有效期内上传指定分片，无法做其他操作。CloudKaho 中 `presignExpiry` 控制有效期，上传会话在 Redis 中设置 25 小时 TTL，足以覆盖大部分上传场景。

**断点续传的实现。** 上传会话存储在 Redis 中（`upload:session:{uploadId}`），包含 UploadID、S3Key、总分片数。如果客户端中途断网，重新连接后可以查询已完成哪些分片，只上传剩余部分。S3 的 Multipart Upload 天然支持这种"部分完成"的状态——未完成的上传会一直保留，直到显式 Complete 或 Abort。

**并发上传策略。** 客户端可以并行上传多个分片（通常 3~5 个并发），充分利用带宽。如果某个分片失败，只需重试该分片，不影响其他分片。这种"分片级重试"比"文件级重试"的粒度细得多，可靠性也高得多。

### 知识点总结

- **S3 Multipart Upload**：AWS S3 提供的大文件上传机制，将文件分成多个 Part 分别上传，最后合并。支持最大 5TB 的单文件上传，每个 Part 最小 5MB（最后一个除外）。
- **Presigned URL**：带有签名的临时 URL，允许持有者在限定时间内对 S3 执行特定操作（上传/下载），无需拥有 AWS 凭证。签名基于 AWS Signature Version 4。
- **数据面与控制面分离**：控制面负责"决策"（认证、路由、元数据），数据面负责"搬运"（实际的数据传输）。分离后两者可以独立扩展，避免后端成为带宽瓶颈。
- **断点续传**：利用分片上传的天然特性，记录已完成的分片列表，在网络恢复后只传剩余部分。S3 的 Multipart Upload 会话不超时（除非显式 Abort），为断点续传提供了基础设施保障。

### 相关知识扩展

**S3 Transfer Acceleration。** 对于跨地域上传场景（如中国用户上传到 us-east-1），S3 提供 Transfer Acceleration 功能——数据先上传到最近的 CloudFront 边缘节点，再通过 AWS 骨干网传输到目标区域。通常可以将跨洲上传速度提升 50%~200%。

**CloudFront 与上传加速。** 除了 S3 Transfer Acceleration，还可以在 S3 前面部署 CloudFront CDN。对于下载场景，CDN 缓存可以大幅减少源站压力；对于上传场景，CloudFront 也可以作为入口，利用 AWS 内部网络加速传输。

**tus 协议。** tus 是一个开放的断点续传协议（[tus.io](https://tus.io)），定义了客户端和服务端之间如何实现可靠的大文件上传。它抽象了底层存储（可以是 S3、本地磁盘等），提供了标准化的分片、续传、过期清理接口。如果系统需要支持多种存储后端，tus 是一个值得考虑的中间层。

**分片并发策略。** 客户端并发上传分片时，需要平衡并发数和资源消耗。常见策略：自适应并发——根据网络状况动态调整并发数（类似 TCP 拥塞控制）；优先上传首尾分片——让用户可以尽早开始预览（某些视频格式支持边下边播）。

### 学习路线与建议

1. 先理解 S3 的基本概念：Bucket、Object、Key、Region，动手用 AWS SDK for Go 实现最简单的 PutObject 和 GetObject。
2. 学习 S3 Multipart Upload 的完整生命周期：Initiate → UploadPart → Complete/Abort，用 AWS CLI 手动操作一遍。
3. 理解 Presigned URL 的签名机制，尝试手动构造一个（虽然实际中不会这么做），理解 SigV4 签名的组成部分。
4. 在本地用 MinIO（兼容 S3 协议）搭建开发环境，实现完整的分片上传流程，包括客户端并发上传和断点续传。
5. 进阶研究 tus 协议的 Go 实现（[tusd](https://github.com/tus/tusd)），了解生产级大文件上传服务的架构。

### 参考文章与延伸阅读

- [AWS S3 Multipart Upload 官方指南](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) — 分片上传的完整流程和最佳实践
- [S3 Presigned URL 文档](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) — 预签名 URL 的安全模型和使用场景
- [tus 协议规范](https://tus.io/protocols/resumable-upload) — 开放标准的断点续传协议
- [MinIO Go Client SDK](https://min.io/docs/minio/linux/developers/go/minio-go.html) — 兼容 S3 的开源对象存储 SDK
- [AWS S3 Transfer Acceleration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transfer-acceleration.html) — 跨地域上传加速方案
