---
title: "项目笔记：ImGui 1.92的breaking changes让我编译全挂"
date: "2026-6-13"
tags: ["C++", "ImGui", "API迁移", "项目实战"]
excerpt: "kami works"
---

# 项目笔记：ImGui 1.92的breaking changes让我编译全挂

### 前情提要

OptiScaler 是一个 C++ DLL 注入式工具，替换游戏中的 DLSS / FSR / XeSS 上采样器，通过 ImGui 覆盖菜单提供实时参数调节。项目使用 ImGui 1.92 版本，并且启用了 `IMGUI_DISABLE_OBSOLETE_FUNCTIONS` 宏来清理对废弃 API 的依赖。当我在国际化分支上完成翻译系统的实现后，切回主分支合并代码——编译全挂了。一堆"找不到成员"的错误，而我明明没有修改过任何 ImGui 相关的代码。

### 问题

编译器报出的错误大致有这几类：

```
error C2039: 'FontSize': is not a member of 'ImFont'
error C2039: 'Build': is not a member of 'ImFontAtlas'
error C2039: 'GetGlyphRangesChineseSimplifiedCommon': is not a member of 'ImFontAtlas'
```

这些 API 在之前的版本中一直正常工作，突然"消失"只有两种可能：要么头文件路径错了（不太可能，其他 ImGui 函数正常），要么 ImGui 升级了版本并删除了这些 API。

实际情况是后者。OptiScaler 的上游更新了 ImGui 到 1.92，并且启用了 `IMGUI_DISABLE_OBSOLETE_FUNCTIONS`，这会**让所有标记为 obsolete 的 API 直接从编译中消失**——不是给你个 deprecation warning，而是彻底不存在。编译器报的错是"找不到成员"，而不是"此 API 已废弃"，这让排查方向一度跑偏。

### 解决

#### 具体 breaking changes 及替换方案

**1. `ImFont::FontSize` → `ImFont::DefaultSize`**

`FontSize` 被重命名为 `DefaultSize`，语义不变，仍然是该字体的默认像素大小：

```cpp
// 旧代码
float size = font->FontSize;

// 新代码
float size = font->DefaultSize;
```

**2. `ImFontAtlas::Build()` 不再是公开 API**

旧版本中可以手动调用 `Build()` 来触发字体纹理的构建：

```cpp
// 旧代码
io.Fonts->Build();
io.Fonts->GetTexDataAsRGBA32(&pixels, &width, &height);
```

在 1.92 中，`Build()` 变为内部实现细节。正确做法是直接调用 `GetTexDataAsRGBA32()` 或 `GetTexDataAsAlpha8()`，它们会隐式触发构建：

```cpp
// 新代码
// 不需要显式 Build()，GetTexDataAsRGBA32 会自动触发
io.Fonts->GetTexDataAsRGBA32(&pixels, &width, &height);
```

**3. `GetGlyphRangesChineseSimplifiedCommon()` 被移除**

这个辅助函数在旧版本中返回一个覆盖约 2,500 个常用简体汉字的 glyph ranges 数组。在新版中被彻底删除。替换方案是自定义 glyph ranges（这也正是我在 CJK 字体加载那篇文章中采用自定义 ranges 的原因之一）：

```cpp
// 旧代码
atlas->AddFontFromFileTTF("msyh.ttc", 16.0f, &config,
    atlas->GetGlyphRangesChineseSimplifiedCommon());

// 新代码：自定义 glyph ranges
static const ImWchar cjkRanges[] = {
    0x4E00, 0x9FFF,   // CJK 统一汉字基本区
    0x3000, 0x30FF,   // CJK 符号、平假名、片假名
    0xFF00, 0xFFEF,   // 全角 / 半角字符
    0,
};
atlas->AddFontFromFileTTF("msyh.ttc", 16.0f, &config, cjkRanges);
```

#### 系统化排查流程

面对"API 消失"类型的编译错误，按以下步骤排查：

1. **确认版本差异**：对比 ImGui 版本号，确认发生了版本升级。
2. **查看 Changelog**：阅读 ImGui 仓库中的 `docs/CHANGELOG.txt`，搜索被删除的 API 名称。
3. **检查宏定义**：确认项目是否启用了 `IMGUI_DISABLE_OBSOLETE_FUNCTIONS`。如果暂时需要兼容，可以先注释掉这个宏让代码编译通过，再逐步迁移。
4. **逐条修复**：对照 Changelog 中的 migration notes 逐条替换。

### 分析

#### C++ 库的版本升级策略

C++ 生态中，库的版本升级策略大致分为三类：

**严格向后兼容（如 Qt、Boost）**：新版本尽量保持旧 API 可用，废弃时给出 deprecation warning，数个版本后才真正移除。迁移压力小。

**快速迭代（如 ImGui）**：版本间频繁引入 breaking changes，但提供 `IMGUI_DISABLE_OBSOLETE_FUNCTIONS` 宏让用户主动选择"是否继续兼容旧 API"。不开宏则旧代码继续工作（有 warning），开了则强制迁移。

**破坏性升级（如某些 header-only 小库）**：完全不考虑向后兼容，新版本可能重写整个 API。迁移成本最高。

ImGui 的策略实际上是相对合理的——它给了你一个过渡期。问题在于，如果项目上游（OptiScaler 的主仓库）在某次提交中同时做了"升级 ImGui 版本 + 启用 `IMGUI_DISABLE_OBSOLETE_FUNCTIONS`"两件事，下游分支就毫无过渡余地。

#### IMGUI_DISABLE_OBSOLETE_FUNCTIONS 的意义

这个宏的设计意图是**强制项目清理对废弃 API 的依赖**。在大型项目中，deprecation warning 容易被忽视（尤其是警告数量多的时候），而这个宏直接把旧 API 从编译单元中抹除，让所有未迁移的调用点以编译错误的形式暴露出来。

```cpp
// imgui.h 中的典型实现
#ifndef IMGUI_DISABLE_OBSOLETE_FUNCTIONS
    // 旧 API 仍然可用，但标记为 deprecated
    IMGUI_DEPRECATED("Use DefaultSize instead")
    float FontSize;
#else
    // 旧 API 彻底不存在
    // 编译时直接报 "is not a member" 错误
#endif
```

这是一种"长痛不如短痛"的工程哲学——短期编译全挂，长期代码干净。

#### 如何系统化处理 API 迁移

对于频繁更新依赖的 C++ 项目，建议建立以下流程：

1. **依赖版本锁定**：使用 `git submodule` 或 CMake `FetchContent` 明确记录依赖版本，避免意外升级。
2. **升级时单独提交**：依赖升级单独一个 commit，不混入功能代码。这样出了问题可以快速 `git bisect` 定位。
3. **CI 中编译测试**：每次依赖升级触发 CI 构建，尽早发现 breaking changes。
4. **维护迁移文档**：在项目 wiki 中记录每次依赖升级的 breaking changes 和修复方式，方便团队成员参考。

### 知识点总结

- **`IMGUI_DISABLE_OBSOLETE_FUNCTIONS`**：ImGui 的编译宏，启用后所有标记为 obsolete 的 API 从编译中彻底消失，不是 deprecation warning 而是编译错误。
- **API 废弃策略**：deprecation warning → obsolete period → removal。ImGui 用宏控制这个过程的激进程度。
- **Semantic Versioning**：major.minor.patch 版本号约定中，major 升级允许 breaking changes。但 ImGui 的 1.x 系列在 minor 版本间也有 breaking changes，不完全遵循 SemVer。
- **C++ 编译错误 "is not a member"**：当编译器报这个错时，除了拼写错误，也要考虑 API 是否已被删除或重命名。

### 相关知识扩展

#### C++ ABI 兼容性

C++ 没有稳定的 ABI（Application Binary Interface）。这意味着用不同编译器版本或不同库版本编译的二进制文件，互相之间不能保证链接成功。ImGui 是 header-only 库（编译进你的项目），所以 ABI 问题表现为源码级的 breaking changes。对于动态链接的库（DLL / .so），ABI 不兼容会导致运行时崩溃，问题更加隐蔽。

Pimpl 模式和虚函数表是 C++ 中维持 ABI 兼容性的常用手段。Qt 的 d-pointer 模式是工业级案例。

#### `[[deprecated]]` 属性

C++14 引入了标准属性 `[[deprecated]]`，可以在编译期标记废弃的 API 并附带迁移建议：

```cpp
[[deprecated("Use DefaultSize instead. Will be removed in v2.0.")]]
float FontSize;

// 使用时编译器输出：
// warning: 'FontSize' is deprecated: Use DefaultSize instead. Will be removed in v2.0.
```

这是比注释或文档更可靠的废弃通知方式，因为信息直接出现在编译输出中，不会被忽略（除非关闭了 deprecation warnings）。

#### 大型项目升级策略

Google、Meta 等大型公司在处理大规模依赖升级时有成熟的工程实践：

- **Google 的 monorepo**：所有代码在一个仓库中，依赖升级时直接全局搜索并修复所有调用点。使用工具如 ClangMR 进行自动化重构。
- **Meta 的 Buck 构建系统**：依赖版本矩阵化管理，支持渐进式升级——先在新版本上跑测试，通过后再切换生产环境。
- **开源项目的 Dependabot / Renovate**：自动创建依赖升级 PR，CI 验证兼容性，减少人工跟踪版本变化的负担。

### 学习路线与建议

1. **入门**：阅读 ImGui 的 `CHANGELOG.txt`，养成每次升级前先看 changelog 的习惯。这适用于所有依赖，不仅限于 ImGui。
2. **实践**：在自己的项目中尝试启用 `IMGUI_DISABLE_OBSOLETE_FUNCTIONS`，看看有多少旧 API 还在被使用，逐一迁移。
3. **工程化**：使用 Git submodule 或 CMake `FetchContent` 管理 ImGui 版本，避免意外升级。每次升级做独立的 commit。
4. **深入**：学习 C++ ABI 兼容性的基本概念，理解为什么 C++ 库的版本升级经常带来 breaking changes，以及如何通过设计模式（Pimpl、虚接口）缓解这个问题。

### 参考文章与延伸阅读

- [ImGui Changelog](https://github.com/ocornut/imgui/blob/master/docs/CHANGELOG.txt)
- [ImGui Fonts 文档](https://github.com/ocornut/imgui/blob/master/docs/FONTS.md)
- [Semantic Versioning 规范](https://semver.org/)
- [C++ [[deprecated]] 属性](https://en.cppreference.com/w/cpp/language/attributes/deprecated)
- [Pimpl 模式与 ABI 兼容性](https://en.cppreference.com/w/cpp/language/pimpl)
