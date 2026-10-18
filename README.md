<h1 align="center">
  <img src="images/logo.svg" alt="Image Downloader logo" height="40" valign="middle" />
  &nbsp;Image Downloader
</h1>

<p align="center">
  <b>Browse and bulk-download images from any webpage. Clean, ultra-fast, and 100% private.</b>
  <br />
  <sub>English | <a href="README_zh.md">简体中文</a></sub>
</p>

<p align="center">
  <a href="https://github.com/PactInteractive/image-downloader/blob/master/LICENSE.md"><img src="https://img.shields.io/badge/license-GPLv3-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/Manifest-V3-success.svg" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/runtime-Bun-f472b6.svg" alt="Bun" />
  <img src="https://img.shields.io/badge/architecture-No--Bundler-purple.svg" alt="No Bundler" />
</p>

Welcome! If you are here to learn how to use this extension, check out the [User Guide](USERGUIDE.md).

If you are a developer looking to build, customize, or contribute to the extension locally instead of installing from the Chrome Web Store — keep reading!

---

## ✨ Key Features

- **⚡ Instant Response & Ultra-lightweight**: Built with Preact 11 + Signals and native browser ESM (`htm`). No heavy bundlers (Webpack/Vite/Babel), sub-50ms startup time, near-zero memory footprint.
- **🔍 Deep Image Sniffing**: Recursively traverses standard `<img>` tags, CSS `background-image`, Web Components inside `ShadowRoot`, and page-sandboxed `Blob`/Canvas objects.
- **🧹 Smart Deduplication Engine**: Automatically folds `@2x` retina assets and numeric width suffixes (`-500x500`), matching hash patterns across folders while isolating multi-level country domains (`.co.uk`).
- **🛡️ 100% Private & Local**: Zero analytics, zero ads, zero tracking. All extraction and filtering run purely on your local machine; no webpage or image data is ever uploaded to external servers.
- **🎯 Precise Filtering**: Filter images on-the-fly by natural width, height, aspect ratio, image type, and URL patterns/regex.
- **📁 Subfolders & Renaming**: Easily download selected images into dedicated subfolders with customizable sequential numbering.
- **🌓 Dark Mode & Side Panel**: Supports both floating popup and persistent Side Panel modes with automatic theme adaptation.

---

## 📦 Prerequisites

This project is powered by [Bun](https://bun.sh). Ensure Bun is installed on your machine:

- **macOS / Linux**:
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **Windows (PowerShell)**:
  ```powershell
  powershell -c "irm bun.sh/install.ps1 | iex"
  ```

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
bun install
```

### 2. Build the Extension
Start the development server with automatic watch and live rebuild:
```bash
bun start
```

Or perform a one-off build:
- **macOS / Linux**:
  ```bash
  bun run build
  ```
- **Windows (PowerShell)**:
  ```powershell
  bun run build
  ```

### 3. Load into Your Browser

#### Google Chrome / Microsoft Edge / Brave:
1. Navigate to `chrome://extensions` (or `edge://extensions`) in your browser.
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click the **Load unpacked** button.
4. Select the `build/` directory inside this repository (⚠️ **never** load `src/` directly).

#### Mozilla Firefox:
The build script automatically generates a Firefox-compatible build:
1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `manifest.json` from the `build-firefox/` directory.

---

## 🧪 Testing & Quality Gates

Run local unit tests powered by Happy DOM and Chrome API stubs:

```bash
# Watch mode for iterative development
bun test --watch

# Run all tests once
bun test

# Type-check (via JSDoc + types.d.ts)
bun check

# Code formatting
bun run lint
```

---

## 🏗️ Architecture at a Glance

This project deliberately avoids traditional bundlers:
- **`src/`**: Plain JavaScript using `htm` and Preact Signals. No JSX compilation required.
- **`scripts/build.ts`**: Minimal Bun-powered build script that compiles Tailwind CSS v4, copies static assets, and maps module specifiers to `/lib/*.mjs`.
- **`build/`**: The standalone MV3 output directory loaded by Chromium browsers.
- **`build-firefox/`**: Dedicated output directory adapted for Firefox APIs.

For detailed developer rules and TDD discipline, see [AGENTS.md](AGENTS.md).

---

## 📄 License & Author

- Author: **Vladimir Sabev** ([@vdsabev](https://x.com/vdsabev)) / [PactInteractive](https://github.com/PactInteractive)
- License: Based on [GNU General Public License v3 (GPLv3)](LICENSE.md) with an additional restriction on commercial resale and modification.
