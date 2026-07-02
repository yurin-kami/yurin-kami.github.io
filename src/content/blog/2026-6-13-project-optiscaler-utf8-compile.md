---
title: "项目笔记：中文编译通过运行时全是乱码"
date: "2026-6-13"
tags: ["C++", "MSVC", "UTF-8", "编码", "项目实战"]
excerpt: "kami works"
---

# 项目笔记：中文编译通过运行时全是乱码

### 前情提要

OptiScaler 是一个 C++ DLL 注入式工具，替换游戏中的 DLSS / FSR / XeSS 上采样器，通过 ImGui 覆盖菜单提供实时参数调节。在中文国际化过程中，我把翻译好的中文字符串直接写入了 `.cpp` 源文件。文件用 UTF-8 编码保存，代码编译顺利通过，没有任何报错。然而运行游戏打开菜单时，所有中文都变成了乱码——那种经典的 GBK 乱码，"设置"显示成了"璁剧疆"之类的无意义字符。

### 问题

```cpp
// translations_zh.cpp（文件保存为 UTF-8 编码）
m_translations["Settings"] = "设置";
m_translations["Quality"]  = "质量";
m_translations["Performance"] = "性能";
```

编译通过，零错误零警告。但运行时 ImGui 渲染出来的是乱码。

根本原因是 **MSVC 默认使用系统 code page 来解析源文件**。中文 Windows 的默认 code page 是 GBK（CP936）。当 MSVC 的词法分析器读取 UTF-8 编码的源文件时，它把 UTF-8 字节流当作 GBK 来解释：

```
"设置" 的 UTF-8 编码: E8 AE BE E7 BD AE (6 字节)
按 GBK 解读:          E8AE → 璁  BEE7 → 剧  BDAE → 疆
```

编译器并不是"不知道"文件是 UTF-8——它压根没检查。MSVC 的历史行为是：除非明确告知，否则假设源文件使用当前系统的 ANSI code page。

### 解决

在 `.vcxproj` 文件中添加 `/utf-8` 编译选项：

```xml
<ItemDefinitionGroup>
  <ClCompile>
    <AdditionalOptions>/utf-8 %(AdditionalOptions)</AdditionalOptions>
  </ClCompile>
</ItemDefinitionGroup>
```

或者在 Visual Studio IDE 中：**项目属性 → C/C++ → 命令行 → 其他选项** 中输入 `/utf-8`。

`/utf-8` 是一个组合选项，等价于同时设置两个子选项：

```
/utf-8 = /source-charset:utf-8 + /execution-charset:utf-8
```

**两个必须同时设置，缺一不可。**

### 分析

#### source charset vs execution charset

这是理解 MSVC 编码行为的关键概念。MSVC 的编译过程分为两个独立的编码阶段：

```
源文件字节流 ──[source charset]──→ 内部 Unicode 表示 ──[execution charset]──→ 目标文件字节流
```

**Source charset（源字符集）**：告诉编译器"我的 `.cpp` 文件是什么编码"。设为 `utf-8` 后，编译器知道用 UTF-8 解码源文件中的字符串字面量。

**Execution charset（执行字符集）**：告诉编译器"生成的可执行文件中，字符串字面量应该用什么编码存储"。设为 `utf-8` 后，字符串在目标文件中以 UTF-8 字节序列存放。

如果只设了 `/source-charset:utf-8` 而没有设 `/execution-charset:utf-8`：

```
源文件 "设置" (UTF-8: E8 AE BE E7 BD AE)
  → source charset 正确解码为 Unicode 码点 U+8BBE U+7F6E
  → execution charset 仍为 GBK(CP936)
  → 编译器将 U+8BBE U+7F6E 转换为 GBK 编码: C9 E8 D6 C3
  → 运行时 UTF-8 环境（ImGui）读到 GBK 字节 → 乱码
```

只有两者都设为 UTF-8，才能确保从源文件到目标文件的编码全程一致。

#### GCC 和 Clang 的情况

GCC 和 Clang 默认假设源文件为 UTF-8 编码，执行字符集也默认为 UTF-8。因此在 Linux / macOS 上通常不需要额外的编译选项。这也解释了为什么同一份代码在 Linux 上编译运行正常，到了 Windows MSVC 就出问题——编译器默认行为不同。

```
编译器     source charset 默认值    execution charset 默认值
MSVC       系统 ANSI code page      系统 ANSI code page
GCC        UTF-8                   UTF-8
Clang      UTF-8                   UTF-8
```

#### /utf-8 选项的版本要求

`/utf-8` 选项从 Visual Studio 2015 Update 2 开始支持。更早版本的 MSVC 需要分别设置 `/source-charset:utf-8` 和 `/execution-charset:utf-8`。考虑到 VS 2015 已经是十年前的编译器，现在基本不会遇到不支持的情况。

#### BOM 头的替代作用

在 `.cpp` 文件开头添加 UTF-8 BOM（`\xEF\xBB\xBF`）也可以让 MSVC 识别源文件为 UTF-8 编码。但 BOM 只解决了 source charset 的问题，不影响 execution charset。因此即使有 BOM，仍然需要设置 `/execution-charset:utf-8`。另外，BOM 在某些工具链中会引起问题（如 Git diff 输出、某些 Unix 工具），所以更推荐使用编译选项而非 BOM。

### 知识点总结

- **MSVC source charset**：控制编译器如何解码源文件中的字符。默认使用系统 ANSI code page，需显式设为 UTF-8。
- **MSVC execution charset**：控制编译器在目标文件中如何编码字符串字面量。默认使用系统 ANSI code page，需显式设为 UTF-8。
- **`/utf-8`**：MSVC 的便捷选项，等价于 `/source-charset:utf-8 /execution-charset:utf-8`。
- **GBK（CP936）**：中文 Windows 的默认 ANSI code page，是 GB2312 的超集，与 UTF-8 不兼容。
- **跨编译器差异**：GCC / Clang 默认 UTF-8，MSVC 默认系统 code page。这是跨平台 C++ 项目中编码问题的常见根源。

### 相关知识扩展

#### C++20 char8_t

C++20 引入了 `char8_t` 类型，专门用于表示 UTF-8 编码的字符：

```cpp
// C++20
const char8_t* s = u8"设置";  // 保证 UTF-8 编码，类型安全
// const char* s2 = u8"设置"; // C++20 中编译错误！不允许隐式转换
```

`char8_t` 在类型层面区分了"UTF-8 字符串"和"普通字符串"，避免了编码混淆。但现有大部分库（包括 ImGui）的 API 接受 `const char*`，使用 `char8_t` 需要显式 `reinterpret_cast`，实用性受限。

#### u8"" 前缀

在 C++11 中，`u8"..."` 前缀要求编译器以 UTF-8 编码存储字符串字面量，不受 execution charset 影响：

```cpp
// C++11 起可用
const char* s = u8"设置";  // 无论 execution charset 是什么，都是 UTF-8
```

这看起来是完美的解决方案，但有个陷阱：如果源文件本身不是 UTF-8 编码，`u8""` 内的非 ASCII 字符会编译失败或产生未定义行为。所以 `/source-charset:utf-8` 仍然是必要的。

#### BOM 头的作用与争议

UTF-8 BOM（`\xEF\xBB\xBF`）在 UTF-8 中不是必需的（UTF-8 不需要字节序标记），但 MSVC 将其作为识别 UTF-8 文件的信号。其他编辑器（Notepad、旧版 VS）也依赖 BOM 来判断文件编码。现代编辑器（VS Code、Sublime Text）则通过内容嗅探自动检测。在开源社区，无 BOM 的 UTF-8 是主流约定。

### 学习路线与建议

1. **入门**：理解 source charset 和 execution charset 的区别，这是 MSVC 编码体系的核心。
2. **实践**：用 `xxd` 或 VS Code 的 Hex Editor 扩展查看编译前后字符串的字节变化，直观验证编码转换过程。
3. **规范**：在项目中统一使用 `/utf-8` 编译选项，所有源文件保存为无 BOM 的 UTF-8，并在 `.editorconfig` 中声明 `charset = utf-8`。
4. **进阶**：关注 C++20 的 `char8_t` 和 `u8""` 前缀，理解 C++ 标准委员会在 UTF-8 安全性方面的设计意图。

### 参考文章与延伸阅读

- [MSVC /utf-8 选项文档](https://learn.microsoft.com/en-us/cpp/build/reference/utf-8-set-source-and-executable-character-sets-to-utf-8)
- [MSVC /source-charset 选项文档](https://learn.microsoft.com/en-us/cpp/build/reference/source-charset-set-source-character-set)
- [C++20 char8_t 提案 P0482](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p0482r6.html)
- [UTF-8 BOM 争议讨论](https://utf8everywhere.org/)
