---
title: "项目笔记：ImGui中文显示全是方框怎么办"
date: "2026-6-13"
tags: ["C++", "ImGui", "字体", "国际化", "项目实战"]
excerpt: "kami works"
---

# 项目笔记：ImGui 中文显示全是方框怎么办

### 前情提要

OptiScaler 是一个用 C++ 编写的 DLL 注入式工具，它可以拦截游戏中的 DLSS / FSR / XeSS 上采样器调用，并替换为其他实现，从而在不依赖特定硬件的前提下自由切换超分辨率方案。项目通过 ImGui 提供实时覆盖菜单（Overlay Menu），允许玩家在游戏内调整各项参数。当我为 OptiScaler 添加中文国际化支持时，第一个迎面撞上的问题就是——菜单里所有中文字符全部显示成了方框。

### 问题

ImGui 在初始化字体时，默认只加载 ASCII 字符范围（0x0020–0x00FF）。这意味着当你用 `ImGui::Text("设置")` 试图渲染中文时，ImGui 在字体纹理图集（Font Atlas）中找不到对应字形，只能退化为显示一个空心方框——也就是 ImGui 社区里俗称的 "tofu" 问题。

```cpp
// 默认初始化，只包含 ASCII + Latin-1
io.Fonts->AddFontDefault();
ImGui::Text("设置"); // 显示为方框 □□
```

### 解决

核心思路是：加载一个支持 CJK 字符的字体文件（例如微软雅黑），通过 `MergeMode = true` 将其合并到与主字体相同的 `ImFont` 对象中。这样英文字符走 Hack 字体渲染，中文字符走微软雅黑渲染，视觉上保持统一。

```cpp
void LoadCJKFonts(ImFontAtlas* atlas, float fontSize) {
    // 先加载英文字体（Hack）作为主字体
    ImFontConfig hackConfig;
    hackConfig.OversampleH = 2;
    hackConfig.OversampleV = 1;
    atlas->AddFontFromFileTTF("fonts\\hack.ttf", fontSize, &hackConfig,
        atlas->GetGlyphRangesDefault());

    // 配置 CJK 字体，开启 MergeMode
    ImFontConfig cjkConfig;
    cjkConfig.MergeMode = true;  // 关键：合并到现有字体，而不是新建

    // 自定义 glyph ranges，精确控制加载哪些字符
    static const ImWchar cjkRanges[] = {
        0x4E00, 0x9FFF,   // CJK 统一汉字基本区（约 20,000 字）
        0x3000, 0x30FF,   // CJK 符号、平假名、片假名
        0xFF00, 0xFFEF,   // 全角 / 半角字符
        0,                // 必须以 0 结尾
    };

    // 字体回退链：优先微软雅黑，备选黑体
    const char* paths[] = {
        "C:\\Windows\\Fonts\\msyh.ttc",
        "C:\\Windows\\Fonts\\simhei.ttf",
    };
    for (const char* p : paths) {
        if (GetFileAttributesA(p) != INVALID_FILE_ATTRIBUTES) {
            atlas->AddFontFromFileTTF(p, fontSize, &cjkConfig, cjkRanges);
            break;  // 找到一个就停止
        }
    }
}
```

调用时机需要在 ImGui 上下文创建之后、首次渲染之前：

```cpp
ImGui::CreateContext();
ImGuiIO& io = ImGui::GetIO();
LoadCJKFonts(io.Fonts, 16.0f);
```

### 分析

**MergeMode 的本质。** `ImFontAtlas` 在构建字体纹理时，会为每个 glyph 在纹理上分配一块区域。开启 `MergeMode` 后，新加载的字体不会创建独立的 `ImFont` 对象，而是将字形数据追加到前一个 `ImFont` 中。渲染时 ImGui 按 Unicode 码点查表，英文字符命中 Hack，中文字符命中微软雅黑，调用方无需做任何区分。

**自定义 glyph ranges 的优势。** ImGui 内置了 `GetGlyphRangesChineseFull()` 和 `GetGlyphRangesChineseSimplifiedCommon()` 等辅助函数，但它们加载的字符集非常庞大（CJK Full 涵盖 27,000+ 字符），会将大量字体数据上传到 GPU 显存，在低端显卡上造成帧率下降。自定义 ranges 只加载项目实际用到的字符区间，显著降低显存占用。

```plain
Glyph 数量对比：
  GetGlyphRangesChineseFull()        ≈ 27,000 个
  GetGlyphRangesChineseSimplifiedCommon() ≈ 2,500 个（但在新版 ImGui 已被移除）
  自定义 cjkRanges (0x4E00–0x9FFF)    ≈ 20,000 个（基本区，覆盖日常用字 99%+）
```

**字体回退链设计。** 不同 Windows 版本预装的字体不同。Windows 10/11 有 msyh.ttc，但更早版本可能只有 simhei.ttf。通过遍历候选路径并在找到第一个可用字体后立即 break，实现了轻量级的回退机制。更完善的方案是加入 `simfang.ttf`（仿宋）作为第三备选。

### 知识点总结

- **ImFontAtlas**：ImGui 的字体管理器，负责将多个字体的字形光栅化到一张 GPU 纹理上。所有 `ImFont` 都共享同一张纹理，切换字体时不产生纹理绑定开销。
- **MergeMode**：`ImFontConfig::MergeMode = true` 让新字体数据追加到最近一个已添加的 `ImFont`，而非创建新实例。这是 ImGui 实现"一个 ImFont 多套字形"的唯一官方方式。
- **Glyph Ranges**：`ImWchar` 数组以成对形式定义 Unicode 区间（起始码点， 结束码点），以 0 结尾。传入 `AddFontFromFileTTF` 时，只有落在这些区间内的字符会被光栅化进纹理图集。
- **CJK Unicode 基本区（U+4E00–U+9FFF）**：又称"统一汉字基本区"，包含约 20,902 个汉字，覆盖简体中文、繁体中文、日文汉字（Kanji）、韩文汉字（Hanja）的绝大部分常用字。

### 相关知识扩展

#### DPI 缩放与字体渲染

在高 DPI 显示器（如 4K、Windows 150% 缩放）下，固定像素尺寸的字体位图会出现模糊。ImGui 支持通过 `io.FontGlobalScale` 全局缩放字体，但更精确的做法是根据系统 DPI 动态计算 `fontSize`：

```cpp
float dpiScale = GetDpiScaleForMonitor(); // 自定义函数，返回 1.0 / 1.5 / 2.0 等
LoadCJKFonts(io.Fonts, 16.0f * dpiScale);
io.FontGlobalScale = 1.0f; // 不再二次缩放
```

这样字体在光栅化阶段就以高分辨率生成，纹理质量远优于后缩放。

#### FreeType 渲染器

ImGui 默认使用内置的 `stb_truetype` 进行字体光栅化，速度快但 hinting 质量一般。切换到 FreeType 渲染器可以获得更好的字形轮廓和 hinting：

```cpp
// 需要编译 imgui_freetype.cpp
#define IMGUI_ENABLE_FREETYPE
// 在 ImFontConfig 中还可以指定光栅化器标志
cjkConfig.FontBuilderFlags = ImGuiFreeTypeBuilderFlags_ForceAutoHint;
```

FreeType 的 auto-hinter 对 CJK 字符的支持比 stb_truetype 显著更好，尤其是小字号下的笔画清晰度。

#### SDF（Signed Distance Field）字体技术

SDF 字体将字形存储为距离场而非位图，支持无损缩放到任意尺寸。Unity 的 TextMeshPro、Valve 的 Source 引擎均采用此技术。ImGui 目前没有原生 SDF 支持，但社区有实验性分支。对于游戏覆盖菜单这种需要适配多种分辨率的场景，SDF 是未来的方向。

### 学习路线与建议

1. **入门**：阅读 ImGui 官方 `imgui_demo.cpp` 中的字体加载示例，理解 `ImFontAtlas` 的基本用法。
2. **进阶**：研究 `imgui.h` 中 `ImFontConfig` 的所有字段，理解 `OversampleH/V`、`PixelSnapH`、`GlyphExtraSpacing` 等参数对渲染质量的影响。
3. **深入**：学习 FreeType 库的架构，理解 glyph hinting、subpixel rendering 的原理。
4. **实战**：尝试实现一个支持多语言（中英日韩）的字体加载系统，处理不同语言的最优字体选择和回退链。

### 参考文章与延伸阅读

- [ImGui 官方文档 - Fonts](https://github.com/ocornut/imgui/blob/master/docs/FONTS.md)
- [CJK 统一汉字 Unicode 范围](https://unicode.org/charts/unihan.html)
- [FreeType 官方文档](https://freetype.org/freetype2/docs/documentation.html)
- [Signed Distance Field 字体渲染原理 （Valve）](https://steamcommunity.com/sharedfiles/filedetails/?id=2074187454)
