# astro-koharu 使用手册

本文档基于当前仓库内容整理，适用于当前目录中的 `astro-koharu` 项目。

当前可确认信息：

- 主题版本：`4.1.0`
- 技术栈：`Astro 5.x`、`Tailwind CSS 4`、`React`
- 包管理器：`pnpm`

## 1. 这是什么

`astro-koharu` 是一个基于 Astro 的静态博客主题，偏 ACG / 个人博客风格，内置搜索、评论切换、系列文章、多语言、背景音乐、内容生成脚本、备份恢复和主题更新 CLI。

它的典型用法有三种：

1. 直接拿来做个人博客
2. Fork 后长期维护自己的站点
3. 用 Docker 或 Vercel / Netlify 部署上线

## 2. 环境要求

开始前建议准备：

- `Node.js 18+`
- `pnpm`
- `Git`

安装 `pnpm`：

```bash
npm install -g pnpm
```

## 3. 获取项目

有两种常见方式。

### 方式一：克隆仓库

```bash
git clone https://github.com/cosZone/astro-koharu.git
cd astro-koharu
```

### 方式二：作为 GitHub 模板使用

在仓库页面点击 `Use this template`，生成你自己的博客仓库，再克隆到本地。

这种方式更适合长期维护自己的站点。

## 4. 安装依赖

```bash
pnpm install
```

如果你还想使用内置 CMS，可额外安装 CMS 子项目依赖：

```bash
pnpm cms:install
```

## 5. 本地开发

启动开发服务器：

```bash
pnpm dev
```

默认访问地址：

```text
http://localhost:4321
```

预览生产构建：

```bash
pnpm build
pnpm preview
```

类型检查：

```bash
pnpm check
```

## 6. 站点基础配置

主配置文件是 `config/site.yaml`。

至少应先修改这些字段：

```yaml
site:
  title: 你的博客名称
  alternate: myblog
  subtitle: 你的副标题
  name: 你的名字
  author: 你的名字
  description: 一句话介绍
  url: https://your-domain.com/
  avatar: /img/avatar.webp
  defaultOgImage: /img/avatar.webp
  startYear: 2024
  showLogo: true
```

常见用途：

- `title`：网站标题
- `alternate`：英文短名，常用于 Logo、页脚和标识
- `subtitle`：副标题
- `name` / `author`：作者名称
- `url`：部署后的正式域名，SEO、RSS 都会用到
- `avatar`：头像路径
- `defaultOgImage`：社交分享默认封面
- `keywords`：全站 SEO 关键词
- `timezone`：时区

## 7. 替换头像和静态资源

常见静态资源在 `public/` 下。

最常见的替换项：

- `public/img/avatar.webp`：站点头像
- `public/img/`：站点图片资源

如果文章里引用本地图片，通常也是放到 `public/` 下再通过绝对路径引用。

## 8. 配置社交链接

在 `config/site.yaml` 的 `social` 部分配置：

```yaml
social:
  github:
    url: https://github.com/your-username
    icon: ri:github-fill
    color: "#191717"
  email:
    url: mailto:your@email.com
    icon: ri:mail-line
    color: "#55acd5"
  rss:
    url: /rss.xml
    icon: ri:rss-line
    color: "#ff6600"
```

你可以继续添加更多社交项，前提是使用项目支持的图标名。

## 9. 写文章

文章内容放在：

```text
src/content/blog/
```

新建 Markdown 文件即可，例如：

```markdown
---
title: 我的第一篇文章
date: 2024-01-01 12:00:00
tags:
  - 标签1
  - 标签2
categories:
  - 分类名
cover: /img/cover/1.webp
description: 这是摘要
draft: false
sticky: false
---

这里是正文内容。
```

常见 frontmatter 字段：

- `title`：文章标题，必填
- `date`：发布日期，必填
- `tags`：标签列表
- `categories`：分类列表
- `cover`：封面图
- `description`：摘要
- `sticky`：是否置顶
- `draft`：是否草稿

## 10. 分类写法

单层分类：

```yaml
categories:
  - 随笔
```

嵌套分类：

```yaml
categories:
  - [笔记, 前端]
```

如果你不想做复杂信息架构，也可以只用标签，不强制必须深度分类。

## 11. 系列文章 / 周刊

这个主题支持系列内容。可在 `config/site.yaml` 中配置 `featuredSeries`：

```yaml
featuredSeries:
  categoryName: 周刊
  label: 我的周刊
  fullName: 我的技术周刊
  description: 每周技术分享
  cover: /img/weekly_header.webp
  enabled: true
  links:
    github: https://github.com/your-username/your-repo
    rss: /rss.xml
```

适合这些内容形式：

- 周刊
- 月报
- 书摘
- 连载专题

## 12. 多语言用法

在 `config/site.yaml` 中启用 `i18n`：

```yaml
i18n:
  defaultLocale: zh
  locales:
    - code: zh
      label: 中文
    - code: en
      label: English
```

启用后会生成语言前缀页面，例如：

```text
/en/post/xxx
```

翻译文章目录结构示例：

```text
src/content/blog/
├── tools/getting-started.md
└── en/tools/getting-started.md
```

继续扩展新语言时，通常需要：

1. 在 `config/site.yaml` 中加入语言
2. 在 `src/i18n/translations/` 添加对应语言文件
3. 在 `src/i18n/translations/index.ts` 注册
4. 按需补充 `config/i18n-content.yaml`

没有对应翻译时，会回退到默认语言内容。

## 13. 评论系统切换

仓库说明中可确认支持这些评论系统：

- `Waline`
- `Giscus`
- `Remark42`
- `Twikoo`

一般是在配置文件中切换启用项，并填写对应服务的参数。

如果你准备 Docker 部署，仓库文档特别提到需要关注：

- `comment.remark42`
- `analytics.umami`

这说明评论和统计有一部分依赖配置联动。

## 14. 搜索功能

仓库内置 `Pagefind`，属于无后端全站搜索。

这意味着：

- 不需要单独写搜索后端
- 构建后会生成搜索索引
- 适合静态博客部署

## 15. 背景音乐

可以在 `config/site.yaml` 中配置 `bgm`：

```yaml
bgm:
  enabled: true
  audio:
    - title: 我的歌单
      list:
        - https://music.163.com/playlist?id=你的歌单ID
```

它通过 `Meting API` 解析音乐平台链接。公共 API 可以直接用，但更推荐自部署，以保证稳定性。

## 16. 内容生成脚本

这是这个仓库比较有特色的一部分。

### 16.1 生成 LQIP 图片占位

```bash
pnpm generate:lqips
```

或：

```bash
pnpm koharu generate lqips
```

用途：

- 给图片生成低质量占位
- 提升加载过程观感

### 16.2 生成相关文章相似度

```bash
pnpm generate:similarities
```

或：

```bash
pnpm koharu generate similarities
```

如果要尝试 GPU：

```bash
pnpm generate:similarities:gpu
```

### 16.3 生成 AI 摘要

```bash
pnpm generate:summaries
```

强制重生：

```bash
pnpm generate:summaries:force
```

或：

```bash
pnpm koharu generate summaries
```

### 16.4 一次性生成全部内容资产

```bash
pnpm generate:all
```

或：

```bash
pnpm koharu generate all
```

建议在这些场景后重新生成：

- 新增文章
- 新增封面图
- 调整文章内容较多
- 准备重新部署

## 17. Koharu CLI 用法

项目内置 CLI 入口：

```bash
pnpm koharu
```

它支持这些常见子命令。

### 17.1 新建内容

```bash
pnpm koharu new
pnpm koharu new post
pnpm koharu new friend
```

用途：

- 交互式创建文章
- 创建友链
- 简化内容录入

### 17.2 备份

```bash
pnpm koharu backup
pnpm koharu backup --full
```

适合在这些操作前执行：

- 更新主题
- 大改配置
- 重构目录
- 做高风险改动前

### 17.3 恢复备份

```bash
pnpm koharu restore
pnpm koharu restore --latest
pnpm koharu restore --dry-run
```

### 17.4 查看备份列表

```bash
pnpm koharu list
```

### 17.5 清理旧备份

```bash
pnpm koharu clean
pnpm koharu clean --keep 5
```

### 17.6 更新主题

```bash
pnpm koharu update
pnpm koharu update --check
pnpm koharu update --skip-backup
pnpm koharu update --clean
pnpm koharu update --rebase
pnpm koharu update --dry-run
pnpm koharu update --tag v2.1.0
```

更新模式说明：

- 默认模式：合并上游更新，适合日常使用
- `--clean`：用最新主题覆盖主题文件，再恢复你的内容，冲突少，但主题源码自定义会丢失
- `--rebase`：把你的提交重放到上游之后，适合熟悉 Git 的用户

## 18. 手动更新主题

如果你不想用 CLI，也可以手动更新：

```bash
pnpm koharu backup --full
git remote add upstream https://github.com/cosZone/astro-koharu.git
git fetch upstream
git merge upstream/main
pnpm install
pnpm dev
```

建议更新后再执行：

```bash
pnpm build
```

用于确认构建是否正常。

## 19. Docker 部署

仓库支持 Docker / Compose。

### 19.1 最基础的手动启动

```bash
docker compose --env-file ./.env -f docker/docker-compose.yml up -d --build
```

### 19.2 项目内置快捷脚本

```bash
pnpm docker:up
pnpm docker:down
pnpm docker:logs
pnpm docker:rebuild
```

说明：

- `docker:up`：构建并启动容器
- `docker:down`：停止并移除容器
- `docker:logs`：查看日志
- `docker:rebuild`：重建容器

文档中还提到：

- 运行前要准备 `.env`
- `docker/rebuild.sh` 会自动停止旧容器并重新构建
- 可通过环境变量 `ENV_FILE=/path/to/.env` 自定义环境文件
- 可通过 `SKIP_DOWN=true` 跳过 `docker compose down`

### 19.3 Docker 使用时的重要注意点

如果你新增了文章、图片，或依赖内容生成资产的功能，请先在本地生成：

```bash
pnpm koharu generate all
```

然后提交生成结果，再重建 Docker。

文档特别强调生成结果需要被提交，示例为：

```bash
git add src/assets/*.json
git commit -m "chore: update generated assets"
```

## 20. Vercel / Netlify 部署

这个主题支持主流平台自动部署。

可确认的行为：

- 识别到平台时，会自动选择对应适配器
- 未识别平台时，会回退到 Node.js 适配器

最推荐的部署方式仍然是：

1. Fork 或模板创建自己的仓库
2. 导入到 Vercel 或 Netlify
3. 部署完成后配置自定义域名
4. 回到 `config/site.yaml` 更新 `site.url`

## 21. CMS 用法

仓库中存在 `cms/` 子项目，并且 `package.json` 暴露了以下脚本：

```bash
pnpm cms:install
pnpm cms
```

可推断用法：

- `pnpm cms:install`：安装 CMS 子项目依赖
- `pnpm cms`：启动 CMS 开发服务

如果你计划使用这个能力，建议单独进入 `cms/` 查看其内部 README 或界面提示。

## 22. 代码质量与维护命令

### 22.1 代码检查

```bash
pnpm lint
pnpm lint:fix
pnpm format
pnpm check
```

### 22.2 Markdown 检查

```bash
pnpm lint-md
pnpm lint-md:fix
```

### 22.3 无用依赖与文件分析

```bash
pnpm knip
```

### 22.4 保存 slug

```bash
pnpm save-slugs
```

### 22.5 Changelog 生成

```bash
pnpm change
```

## 23. 推荐的日常工作流

如果你只是正常写博客，推荐流程是：

1. `pnpm dev` 本地开发
2. 修改 `config/site.yaml`
3. 在 `src/content/blog/` 写文章
4. 新增图片后运行 `pnpm koharu generate all`
5. 本地执行 `pnpm build`
6. 提交代码
7. 推送并自动部署

如果你改动很多主题配置或准备升级版本，推荐先：

1. `pnpm koharu backup --full`
2. 再做更新或重构
3. 出问题时用 `pnpm koharu restore --latest`

## 24. 常用命令速查

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm check
pnpm lint
pnpm format
pnpm koharu
pnpm koharu new post
pnpm koharu backup --full
pnpm koharu restore --latest
pnpm koharu update --check
pnpm koharu generate all
pnpm cms
pnpm docker:up
pnpm docker:logs
```

## 25. 使用时最容易忽略的点

### 25.1 `site.url` 要写正式域名

这个字段会影响：

- SEO
- RSS
- Open Graph
- 部署后的分享链接

### 25.2 内容生成结果可能需要提交

如果你使用了：

- LQIP
- 相似文章
- AI 摘要

那么生成出来的内容资产通常不是“运行时自动生产”，而是应作为项目内容的一部分提交。

### 25.3 Docker 部署前最好先本地生成资产

尤其是图片、摘要和相似文章相关功能。

### 25.4 更新主题前先备份

最稳妥的做法：

```bash
pnpm koharu backup --full
```

## 26. 适合哪些人

这个主题尤其适合：

- 个人博客作者
- ACG / 手账 / 前端风格内容站
- 想用 Astro 做静态博客的人
- 希望兼顾颜值和性能的人

## 27. 一句话上手版

如果你只想最快跑起来，照着做：

```bash
git clone https://github.com/cosZone/astro-koharu.git
cd astro-koharu
pnpm install
pnpm dev
```

然后：

1. 改 `config/site.yaml`
2. 替换 `public/img/avatar.webp`
3. 在 `src/content/blog/` 写文章
4. `pnpm build`
5. 部署到 Vercel / Netlify

## 28. 参考来源

本文档内容主要根据当前仓库中的以下文件整理：

- `GETTING-STARTED.md`
- `package.json`
- 仓库目录结构

如果后续仓库升级，请以最新版本文档和脚本为准。
