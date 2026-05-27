---
title: "解决关闭opencode导致wezterm会闪退的问题"
date: "2026-5-27"
tags: ["opencode", "agent", "wezterm", "终端模拟器"]
excerpt: "kami works"
---

# 关闭opencode导致wezterm会闪退（实际为wezterm的问题）

### 前情提要

习惯linux命令，于是在Windows11上安装了支持kitty图像显示协议的wezterm，并且配置了gitbash+ohmyzsh和opencode

### 问题

在某次更新后opencode退出会导致wezterm标签页会一起关闭

### 解决

使用google英文搜索，发现wezterm下有一条issue：https://github.com/wezterm/wezterm/issues/7520

#### 解决方法

1. 进入微软wt的仓库https://github.com/microsoft/terminal/releases/tag/v1.24.10921.0 (或更新的版本)

2. 下载nupkg包，例如https://github.com/microsoft/terminal/releases/download/v1.24.10921.0/Microsoft.Windows.Console.ConPTY.1.24.260402001.nupkg

3. 使用解压缩软件打开，本人使用了bandzip，7z应该也行

4. 找到 *untimes\win-x64\native\conpty.dll* 和*build\native\runtimes\x64\OpenConsole.exe* 两个文件复制到wezterm的目录（注意架构，这里使用x64），例如：

   ![image-20260527224702788](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/image-20260527224702788.png)

![image-20260527224720429](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/image-20260527224720429.png)

![image-20260527224728044](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/image-20260527224728044.png)

5. 验证

   ![image-20260527225233121](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/image-20260527225233121.png)

​	可以观察到退出oc（opencode）后wezterm没有直接关闭标签页，问题解决

### 分析

启用wezterm的调试功能，定位到崩溃前OpenConsole.exe进程：

```
0:000> !analyze -v
Reloading current modules
.....................................
*******************************************************************************
*                                                                             *
*                        Exception Analysis                                   *
*                                                                             *
*******************************************************************************


KEY_VALUES_STRING: 1

    Key  : AV.Type
    Value: Write

    Key  : Analysis.CPU.mSec
    Value: 359

    Key  : Analysis.Elapsed.mSec
    Value: 3147

    Key  : Analysis.IO.Other.Mb
    Value: 0

    Key  : Analysis.IO.Read.Mb
    Value: 12

    Key  : Analysis.IO.Write.Mb
    Value: 0

    Key  : Analysis.Init.CPU.mSec
    Value: 296

    Key  : Analysis.Init.Elapsed.mSec
    Value: 69919

    Key  : Analysis.Memory.CommitPeak.Mb
    Value: 173

    Key  : Analysis.Version.DbgEng
    Value: 10.0.29547.1002

    Key  : Analysis.Version.Description
    Value: 10.2602.27.2 amd64fre

    Key  : Analysis.Version.Ext
    Value: 1.2602.27.2

    Key  : Failure.Bucket
    Value: INVALID_POINTER_WRITE_c0000005_OpenConsole.exe!WriteCharsLegacy

    Key  : Failure.Exception.Code
    Value: 0xc0000005

    Key  : Failure.Exception.IP.Address
    Value: 0x7ff7c4bd59ea

    Key  : Failure.Exception.IP.Module
    Value: OpenConsole

    Key  : Failure.Exception.IP.Offset
    Value: 0x559ea

    Key  : Failure.Hash
    Value: {4b340304-ea48-c33c-9072-a8a7230f1e65}

    Key  : Failure.ProblemClass.Primary
    Value: INVALID_POINTER_WRITE

    Key  : Faulting.IP.Type
    Value: Paged

    Key  : Timeline.OS.Boot.DeltaSec
    Value: 868286

    Key  : Timeline.Process.Start.DeltaSec
    Value: 88

    Key  : WER.OS.Branch
    Value: ge_release

    Key  : WER.OS.Version
    Value: 10.0.26100.1

    Key  : WER.Process.Version
    Value: 1.22.2502.4002


NTGLOBALFLAG:  0

APPLICATION_VERIFIER_FLAGS:  0

EXCEPTION_RECORD:  (.exr -1)
ExceptionAddress: 00007ff7c4bd59ea (OpenConsole!WriteCharsLegacy+0x00000000000003ba)
   ExceptionCode: c0000005 (Access violation)
  ExceptionFlags: 00000000
NumberParameters: 2
   Parameter[0]: 0000000000000001
   Parameter[1]: 00000000000043cb
Attempt to write to address 00000000000043cb

FAULTING_THREAD:  d9f4

PROCESS_NAME:  OpenConsole.exe

WRITE_ADDRESS:  00000000000043cb 

ERROR_CODE: (NTSTATUS) 0xc0000005 - The instruction at 0x%p referenced memory at 0x%p. The memory could not be %s.

EXCEPTION_CODE_STR:  c0000005

EXCEPTION_PARAMETER1:  0000000000000001

EXCEPTION_PARAMETER2:  00000000000043cb

STACK_TEXT:  
000000a8`56aff240 00007ff7`c4bc6bae     : 00000000`00000000 00000000`00000000 00000000`00000000 00000000`00000000 : OpenConsole!WriteCharsLegacy+0x3ba
000000a8`56aff340 00007ff7`c4bc582f     : 000000a8`56aff5e0 0000023f`3d22d230 00000000`00000000 00000000`00000000 : OpenConsole!COOKED_READ_DATA::_handlePostCharInputLoop+0x10e
000000a8`56aff4a0 00007ff7`c4bc56af     : 0000023f`3d262000 00007ff7`000000c8 0000023f`00000020 32fbeadf`f6fbeadf : OpenConsole!COOKED_READ_DATA::Read+0x13f
000000a8`56aff530 00007ff7`c4b9dae9     : 0000023f`3d289058 0000000a`0003003f 000000a8`00000020 00000001`00000001 : OpenConsole!COOKED_READ_DATA::Notify+0x6f
000000a8`56aff560 00007ff7`c4b9cc29     : 00000000`00000000 00007ffc`1f6b6abd 0000023f`3d244960 000000a8`56aff8e0 : OpenConsole!ConsoleWaitBlock::Notify+0xc9
(Inline Function) --------`--------     : --------`-------- --------`-------- --------`-------- --------`-------- : OpenConsole!ConsoleWaitQueue::_NotifyBlock+0xb
000000a8`56aff770 00007ff7`c4bbc216     : 000000a8`56aff8e0 0000023f`3d21d610 00000000`00000000 000000a8`56aff8c0 : OpenConsole!ConsoleWaitQueue::NotifyWaiters+0x59
(Inline Function) --------`--------     : --------`-------- --------`-------- --------`-------- --------`-------- : OpenConsole!ConsoleWaitQueue::NotifyWaiters+0xa
(Inline Function) --------`--------     : --------`-------- --------`-------- --------`-------- --------`-------- : OpenConsole!InputBuffer::WakeUpReadersWaitingForData+0xe
000000a8`56aff7b0 00007ff7`c4bd341a     : 000000a8`56affaa0 00000000`00000000 00007ffc`0000094c 00007abc`0883129c : OpenConsole!InputBuffer::Write+0x76
000000a8`56aff810 00007ff7`c4bd389c     : 00007abc`0883129c 00000000`0000d9f4 00000000`00000000 00000000`00000000 : OpenConsole!_WriteConsoleInputWImplHelper+0x1a
000000a8`56aff840 00007ff7`c4c1a58e     : 000000a8`56affaa0 00007ff7`c4bbdb3a 00000000`00000000 000000a8`56affaa0 : OpenConsole!ApiRoutines::WriteConsoleInputWImpl+0x5c
000000a8`56aff880 00007ff7`c4c1eec1     : 000000a8`56affa00 000000a8`56affaa0 00007ff7`c4c63578 00007ff7`c4c14f55 : OpenConsole!ApiDispatchers::ServerWriteConsoleInput+0x37e
000000a8`56aff9a0 00007ff7`c4c14fec     : 00000000`0000d9f4 00007ff7`c4c14c67 000000a8`56affa90 000000a8`56affaa0 : OpenConsole!ApiSorter::ConsoleDispatchRequest+0xc1
(Inline Function) --------`--------     : --------`-------- --------`-------- --------`-------- --------`-------- : OpenConsole!IoDispatchers::ConsoleDispatchRequest+0x8
000000a8`56affa10 00007ff7`c4baecb6     : 00000000`00000000 000000a8`56affaa0 000000a8`56affb60 000000a8`56affaa0 : OpenConsole!IoSorter::ServiceIoOperation+0x6c
000000a8`56affa60 00007ffc`21cce8d7     : 00000000`00000000 00000000`00000000 00000000`00000000 00000000`00000000 : OpenConsole!ConsoleIoThread+0x1f6
000000a8`56affce0 00007ffc`21fcc48c     : 00000000`00000000 00000000`00000000 000004f0`fffffb30 000004d0`fffffb30 : KERNEL32!BaseThreadInitThunk+0x17
000000a8`56affd10 00000000`00000000     : 00000000`00000000 00000000`00000000 00000000`00000000 00000000`00000000 : ntdll!RtlUserThreadStart+0x2c


STACK_COMMAND: ~0s; .ecxr ; kb

IP_IN_PAGED_CODE: 
OpenConsole!WriteCharsLegacy+3ba [C:\__w\1\s\src\host\_stream.cpp @ 280]
00007ff7`c4bd59ea c6406b00        mov     byte ptr [rax+6Bh],0

FAULTING_SOURCE_LINE:  C:\__w\1\s\src\host\_stream.cpp

FAULTING_SOURCE_FILE:  C:\__w\1\s\src\host\_stream.cpp

FAULTING_SOURCE_LINE_NUMBER:  280

FAULTING_SOURCE_CODE:  
No source found for 'C:\__w\1\s\src\host\_stream.cpp'


SYMBOL_NAME:  OpenConsole!WriteCharsLegacy+3ba

MODULE_NAME: OpenConsole

IMAGE_NAME:  OpenConsole.exe

FAILURE_BUCKET_ID:  INVALID_POINTER_WRITE_c0000005_OpenConsole.exe!WriteCharsLegacy

OS_VERSION:  10.0.26100.1

BUILDLAB_STR:  ge_release

OSPLATFORM_TYPE:  x64

OSNAME:  Windows 10

IMAGE_VERSION:  1.22.2502.4002

FAILURE_ID_HASH:  {4b340304-ea48-c33c-9072-a8a7230f1e65}

Followup:     MachineOwner
```

大概是空指针解引用的问题。更新上游WindowsTerminal，将上述两个文件替换后即可修复

### 另，此操作也可解决*`pwsh` 的 FailFast 问题和 `0x80131623` 相关的问题*