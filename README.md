# Console Reader

EPUB reader extension running inside Chrome DevTools Console.

[English](#english) | [中文](#中文)

---

## English

### Overview

Console Reader is a Chrome extension that brings EPUB reading capabilities directly into the Chrome DevTools Console. Perfect for developers who want to read documentation, ebooks, or any EPUB content without leaving their development environment.

### Features

- **In-Console Reading**: Read EPUB files directly within DevTools Console panel
- **Chapter Navigation**: Easily navigate through book chapters
- **Progress Persistence**: Your reading position is automatically saved
- **Keyboard Shortcut**: Press `Ctrl+Shift+H` (Mac: `Cmd+Shift+H`) to toggle the reader
- **Lightweight**: Minimal resource usage, runs as a service worker

### Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select the `console-reader` directory

### Usage

1. Open Chrome DevTools (`F12` or `Ctrl+Shift+I`)
2. Click on the "Reader" panel in DevTools
3. The panel will appear in the Console sidebar
4. Your reading progress is automatically saved

### File Structure

```
console-reader/
├── manifest.json        # Extension manifest (MV3)
├── background.js        # Service worker
├── devtools.html       # DevTools page entry
├── devtools.js         # DevTools panel registration
├── console-panel/
│   ├── panel.html      # Reader panel UI
│   ├── panel.js        # Reader logic
│   ├── styles.css      # Panel styles
│   └── epub-parser.js  # EPUB parser
└── shared/
    └── storage.js      # Storage utilities
```

### Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Save reading progress |
| `activeTab` | Access current tab |
| `scripting` | Inject content scripts |
| `<all_urls>` | Load EPUB files from any source |

### Requirements

- Chrome 88+ (Manifest V3 support)
- Valid EPUB files

---

## 中文

### 简介

Console Reader 是一款 Chrome 扩展程序，可将 EPUB 阅读功能直接带入 Chrome DevTools Console。适合希望在开发环境中阅读文档、电子书或任何 EPUB 内容的开发者。

### 功能特点

- **Console 内阅读**：直接在 DevTools Console 面板中阅读 EPUB 文件
- **章节导航**：轻松浏览书籍章节
- **进度保存**：阅读位置自动保存
- **快捷键**：按 `Ctrl+Shift+H`（Mac: `Cmd+Shift+H`）切换阅读器
- **轻量高效**：占用资源少，以 Service Worker 方式运行

### 安装方法

1. 下载或克隆此仓库
2. 打开 Chrome，访问 `chrome://extensions/`
3. 启用右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `console-reader` 目录

### 使用方法

1. 打开 Chrome 开发者工具（`F12` 或 `Ctrl+Shift+I`）
2. 点击 DevTools 中的 "Reader" 面板
3. 面板将出现在 Console 侧边栏中
4. 阅读进度会自动保存

### 文件结构

```
console-reader/
├── manifest.json        # 扩展程序清单（MV3）
├── background.js        # Service Worker
├── devtools.html       # DevTools 页面入口
├── devtools.js         # DevTools 面板注册
├── console-panel/
│   ├── panel.html      # 阅读器面板 UI
│   ├── panel.js        # 阅读器逻辑
│   ├── styles.css      # 面板样式
│   └── epub-parser.js  # EPUB 解析器
└── shared/
    └── storage.js      # 存储工具
```

### 权限说明

| 权限 | 用途 |
|------|------|
| `storage` | 保存阅读进度 |
| `activeTab` | 访问当前标签页 |
| `scripting` | 注入内容脚本 |
| `<all_urls>` | 从任意源加载 EPUB 文件 |

### 系统要求

- Chrome 88+（支持 Manifest V3）
- 有效的 EPUB 文件

---

## License / 许可证

MIT
