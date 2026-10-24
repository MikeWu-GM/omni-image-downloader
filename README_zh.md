<h1 align="center">
  <img src="images/logo.svg" alt="OmniImage Downloader logo" height="40" valign="middle" />
  &nbsp;OmniImage Downloader
</h1>

<p align="center">
  <b>跨单标签页或整窗多标签页一键嗅探、精准筛选并高并发批量下载网页图片。纯净、极速、100% 本地隐私安全。</b>
  <br />
  <sub><a href="README.md">English</a> | 简体中文</sub>
</p>

<p align="center">
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-GPLv3-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/Manifest-V3-success.svg" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/runtime-Bun-f472b6.svg" alt="Bun" />
  <img src="https://img.shields.io/badge/architecture-No--Bundler-purple.svg" alt="No Bundler" />
</p>

欢迎！如果你是普通用户并想了解如何使用此扩展，请查阅 [用户使用指南 (User Guide)](USERGUIDE.md)。

如果你是开发者，希望在本地运行、定制或向 **OmniImage Downloader** 贡献代码——请继续阅读下方文档！

---

## ✨ 核心特性

- **🗂️ 整窗多标签页并发嗅探（Window Multi-Tab）**：支持在 **当前标签页（Current Tab）** 与 **当前窗口所有标签页（Current Window）** 之间一键切换，按标签页分组折叠展示，并支持多标签页独立子目录隔离下载。
- **⚡ 1~128 高并发下载流控引擎**：内置可调节的并发下载调度器（支持 `1` 至 `128` 并发上限）与 Blob/格式探测节流队列，状态栏实时反馈下载进度。
- **🎯 真实 DOM 尺寸与动态格式归一化**：直接从页面 DOM 提取图片真实 `naturalWidth` / `naturalHeight`，支持自定义大小图阈值预设，动态探测无后缀 CDN 图片格式（含 WebP 精准识别）并在保存时自动修正扩展名。
- **📁 智能网页标题子目录与来源书签**：批量下载时自动将净化后的网页标题预填为子文件夹名称（同名标签页自动编号消歧），并支持一键生成安全的本地 `source.html` 来源网页跳转书签。
- **🔒 标签页级侧边栏隔离（Tab-Scoped Side Panel）**：原生支持 Chrome 侧边栏（Side Panel）常驻与传统浮层弹窗双模式无损切换，侧边栏严格绑定当前标签页，彻底杜绝跨标签页状态污染。
- **🔍 深度 DOM 与 ShadowRoot 穿透挖掘**：递归穿透常规 `<img>` 标签、CSS `background-image`、Web Components 内的 `ShadowRoot`，以及页面沙箱上下文中的 `Blob` 与 `Canvas` 资源。
- **🧹 智能去重引擎**：自动识别并折叠 `@2x` 高清图与 `-500x500` 等数字宽度后缀；跨目录匹配 Hash 命名，同时对 `.co.uk` 等多级国别域名做独立隔离。
- **🛡️ 100% 纯本地运行与零隐私泄露**：绝无广告、无遥测统计、无外部网络请求。所有图片解析与筛选完全在本地内存完成。

---

## 📦 环境要求 (Prerequisites)

本项目基于 [Bun](https://bun.sh) 运行环境构建与测试。在本地开发前，请确保已安装 Bun：

- **macOS / Linux**：
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **Windows (PowerShell)**：
  ```powershell
  powershell -c "irm bun.sh/install.ps1 | iex"
  ```

---

## 🚀 快速上手 (Quick Start)

### 1. 安装项目依赖
```bash
bun install
```

### 2. 编译构建扩展
启动开发服务器（支持源码监听与自动重新构建）：
```bash
bun start
```
或者执行一次性完整构建（自动生成 `build/`、`build-firefox/` 及 `dist/*.zip` 跨平台发行包）：
- **macOS / Linux**：
  ```bash
  bun run build
  ```
- **Windows (PowerShell)**：
  ```powershell
  bun run build
  ```

### 3. 加载到浏览器中运行

#### Google Chrome / Microsoft Edge / Brave:
1. 打开浏览器扩展管理页面：`chrome://extensions`（或 `edge://extensions`）；
2. 开启右上角的 **开发者模式 (Developer mode)** 开关；
3. 点击 **加载已解压的扩展程序 (Load unpacked)** 按钮；
4. 选择当前仓库下的 `build/` 目录（⚠️ **切勿直接选择 `src/` 目录**）。

#### Mozilla Firefox:
构建系统会自动生成专供 Firefox 运行的独立产物包：
1. 打开 Firefox 并访问：`about:debugging#/runtime/this-firefox`；
2. 点击 **临时载入附加组件... (Load Temporary Add-on...)**；
3. 选择 `build-firefox/` 目录下的 `manifest.json` 文件即可。

---

## 🧪 自动化测试与质量门禁

本项目使用内置的 Happy DOM 与 Chrome API 桩环境运行轻量高效的单元测试：

```bash
# 源码变更监听模式（推荐日常迭代使用）
bun test --watch

# 一次性执行全量单元测试
bun test

# 静态类型检查（基于 JSDoc // @ts-check 与 types.d.ts）
bun check

# 代码格式化与规范检查
bun run lint
```

---

## 🏗️ 架构概览 (No-Bundler Architecture)

本项目坚持原生 ESM 设计哲学，彻底抛弃了重型前端打包器：
- **`src/`**：纯 JavaScript 源码，使用 `htm` 与 Preact Signals，无需 JSX 预编译；
- **`scripts/build.ts`**：轻量级 Bun 构建脚本，负责 Tailwind CSS v4 独立编译、`sharp` 多尺寸图标自动生成、静态资源拷贝与 `/lib/*.mjs` 原生导入映射；
- **`build/`**：Chromium 浏览器实际运行的独立 Manifest V3 产物目录；
- **`build-firefox/`**：适配 Firefox 专有规范的独立产物包。

有关开发规范与 TDD 纪律，请参阅 [AGENTS.md](AGENTS.md)。

---

## 📄 开源许可与致谢声明

- **当前维护者 (Maintainer)**：**MikeWu-GM** ([MikeWu-GM/omni-image-downloader](https://github.com/MikeWu-GM/omni-image-downloader)) —— 独立演进增强版（OmniImage Downloader），提供整窗多标签页提取、高并发流控引擎、动态格式识别及全新紧凑交互架构。
- **上游致谢 (Upstream Attribution)**：最初分叉自 **Vladimir Sabev** ([@vdsabev](https://x.com/vdsabev)) / [PactInteractive/image-downloader](https://github.com/PactInteractive/image-downloader)。
- **开源协议 (License)**：基于 [GNU General Public License v3 (GPLv3)](LICENSE.md) 协议免费开源分发。
