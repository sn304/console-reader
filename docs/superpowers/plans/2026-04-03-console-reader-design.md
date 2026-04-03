# Console Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that displays EPUB ebooks inside Chrome DevTools Console panel with stealth mode (boss key).

**Architecture:** Chrome extension with DevTools Panel. EPUB files parsed locally, content rendered in a styled reader. Keyboard-driven navigation with fake warning messages as camouflage.

**Tech Stack:** Chrome Extension API, Vanilla JS, EPUB.js (for EPUB parsing), Chrome Storage API

---

## File Structure

```
console-reader/
├── manifest.json           # Chrome extension manifest (V3)
├── background.js           # Service worker for file handling
├── console-panel/
│   ├── panel.html          # DevTools panel HTML
│   ├── panel.js            # Panel main logic
│   ├── styles.css          # Reader styles
│   └── epub-parser.js      # EPUB parsing
└── shared/
    ├── storage.js          # Chrome Storage wrapper
    └── shortcuts.js        # Keyboard shortcuts
```

---

## Tasks

### Task 1: Project Setup and Manifest

**Files:**
- Create: `console-reader/manifest.json`
- Create: `console-reader/README.md`

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Console Reader",
  "version": "1.0.0",
  "description": "EPUB reader inside DevTools Console",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_title": "Open Console Reader"
  },
  "icons": {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  },
  "devtools_page": "devtools.html"
}
```

- [ ] **Step 2: Create devtools.html**

```html
<!DOCTYPE html>
<html>
<head></head>
<body>
  <script src="background.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create background.js**

```javascript
// Listen for messages from panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'openEpub') {
    // Handle EPUB file opened by user
    chrome.storage.local.set({ currentBook: message.data });
    sendResponse({ success: true });
  }
});

// Listen for keyboard shortcut (boss key)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-reader') {
    chrome.runtime.sendMessage({ type: 'togglePanel' });
  }
});
```

- [ ] **Step 4: Create README.md**

```markdown
# Console Reader

EPUB reader hidden inside Chrome DevTools Console panel.

## Features
- Open EPUB files directly
- Keyboard navigation (↑/↓ for pages, T for TOC, H for hide)
- Progress saved automatically
- Stealth mode with fake warning messages

## Installation
1. Clone repo
2. Open chrome://extensions
3. Enable Developer mode
4. Load unpacked → select console-reader folder
```

- [ ] **Step 5: Commit**

```bash
cd /root/console-reader && git init && git add -A && git commit -m "feat: initial project structure"
```

---

### Task 2: EPUB Parser

**Files:**
- Create: `console-reader/console-panel/epub-parser.js`

- [ ] **Step 1: Create EPUB parser**

```javascript
class EpubParser {
  constructor(arrayBuffer) {
    this.arrayBuffer = arrayBuffer;
    this.zip = null;
    this.metadata = {};
    this.chapters = [];
    this.content = '';
  }

  async parse() {
    // Use JSZip-like approach with built-in zip handling
    this.zip = await this.extractZip(this.arrayBuffer);
    
    // Parse container.xml to find content.opf
    const container = await this.readXml('META-INF/container.xml');
    const rootfile = container.querySelector('rootfile');
    const opfPath = rootfile.getAttribute('full-path');
    
    // Parse content.opf
    const opf = await this.readXml(opfPath);
    this.parseMetadata(opf);
    this.parseSpine(opf);
    
    return this;
  }

  async extractZip(buffer) {
    // Simple ZIP extraction without external library
    const zip = {};
    const view = new DataView(buffer);
    const entries = this.findZipEntries(buffer);
    
    for (const entry of entries) {
      zip[entry.name] = entry.data;
    }
    return zip;
  }

  findZipEntries(buffer) {
    const entries = [];
    const view = new DataView(buffer);
    let offset = 0;
    
    // Find End of Central Directory
    const signature = 0x06054b50;
    let eocdOffset = -1;
    for (let i = buffer.byteLength - 22; i >= 0; i--) {
      if (view.getUint32(i) === signature) {
        eocdOffset = i;
        break;
      }
    }
    
    if (eocdOffset === -1) return entries;
    
    const numEntries = view.getUint16(eocdOffset + 10);
    const cdOffset = view.getUint32(eocdOffset + 16);
    
    // Parse Central Directory
    let cdPos = cdOffset;
    for (let i = 0; i < numEntries; i++) {
      if (view.getUint32(cdPos) !== 0x02014b50) break;
      
      const nameLen = view.getUint16(cdPos + 28);
      const extraLen = view.getUint16(cdPos + 30);
      const commentLen = view.getUint16(cdPos + 32);
      const localHeaderOffset = view.getUint32(cdPos + 42);
      
      const name = new TextDecoder().decode(
        new Uint8Array(buffer, cdPos + 46, nameLen)
      );
      
      // Read local file header to get compressed size
      const localView = new DataView(buffer, localHeaderOffset);
      const compressedSize = localView.getUint32(18);
      
      const data = new Uint8Array(buffer, localHeaderOffset + 30 + nameLen + 
        localView.getUint16(26), compressedSize);
      
      entries.push({ name, data: this.inflateIfNeeded(data, name) });
      cdPos += 46 + nameLen + extraLen + commentLen;
    }
    
    return entries;
  }

  inflateIfNeeded(data, name) {
    // Check if compressed (method 8 = deflate)
    if (data.length < 2) return data;
    
    // Simple inflate - for now return raw data
    // In production, use pako library
    return data;
  }

  async readXml(path) {
    const content = this.zip[path];
    if (!content) return null;
    
    const text = new TextDecoder().decode(content);
    const parser = new DOMParser();
    return parser.parseFromString(text, 'text/xml');
  }

  parseMetadata(opf) {
    const dcNs = 'http://purl.org/dc/elements/1.1/';
    const title = opf.querySelector(`metadata ${dcNs}title`);
    const creator = opf.querySelector(`metadata ${dcNs}creator`);
    
    this.metadata = {
      title: title?.textContent || 'Unknown',
      creator: creator?.textContent || 'Unknown'
    };
  }

  parseSpine(opf) {
    const manifest = {};
    const items = opf.querySelectorAll('manifest item');
    items.forEach(item => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      manifest[id] = href;
    });

    const spineItems = opf.querySelectorAll('spine itemref');
    spineItems.forEach((item, index) => {
      const idref = item.getAttribute('idref');
      const href = manifest[idref];
      if (href) {
        this.chapters.push({
          index,
          href,
          title: `Chapter ${index + 1}`
        });
      }
    });
  }

  async getChapterContent(index) {
    const chapter = this.chapters[index];
    if (!chapter) return '';

    const content = this.zip[chapter.href];
    if (!content) return '';

    const text = new TextDecoder().decode(content);
    
    // Extract text from HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    
    // Get title from h1/h2 or first p
    const titleEl = doc.querySelector('h1, h2, title');
    chapter.title = titleEl?.textContent?.trim() || chapter.title;

    // Get body text
    const body = doc.querySelector('body');
    return body?.textContent?.trim() || doc.body?.textContent?.trim() || '';
  }
}

if (typeof module !== 'undefined') module.exports = EpubParser;
```

- [ ] **Step 2: Commit**

```bash
cd /root/console-reader && git add console-panel/epub-parser.js && git commit -m "feat: add EPUB parser"
```

---

### Task 3: Storage Module

**Files:**
- Create: `console-reader/shared/storage.js`

- [ ] **Step 1: Create storage wrapper**

```javascript
class ReaderStorage {
  static async saveProgress(bookId, chapterIndex, scrollProgress) {
    const data = await chrome.storage.local.get('readingProgress') || {};
    data[bookId] = {
      chapterIndex,
      scrollProgress,
      lastRead: Date.now()
    };
    await chrome.storage.local.set({ readingProgress: data });
  }

  static async getProgress(bookId) {
    const data = await chrome.storage.local.get('readingProgress');
    return data.readingProgress?.[bookId] || null;
  }

  static async saveCurrentBook(bookData) {
    await chrome.storage.local.set({ currentBook: bookData });
  }

  static async getCurrentBook() {
    const data = await chrome.storage.local.get('currentBook');
    return data.currentBook || null;
  }

  static async saveSettings(settings) {
    const data = await chrome.storage.local.get('readerSettings') || {};
    Object.assign(data, settings);
    await chrome.storage.local.set({ readerSettings: data });
  }

  static async getSettings() {
    const data = await chrome.storage.local.get('readerSettings');
    return {
      fontSize: data.readerSettings?.fontSize || 16,
      theme: data.readerSettings?.theme || 'light',
      lineHeight: data.readerSettings?.lineHeight || 1.8,
      ...data.readerSettings
    };
  }
}

if (typeof module !== 'undefined') module.exports = ReaderStorage;
```

- [ ] **Step 2: Commit**

```bash
cd /root/console-reader && git add shared/storage.js && git commit -m "feat: add storage module"
```

---

### Task 4: Panel HTML and CSS

**Files:**
- Create: `console-reader/console-panel/panel.html`
- Create: `console-reader/console-panel/styles.css`

- [ ] **Step 1: Create panel.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <div class="console-header">
      <span class="console-title">▶ Console</span>
      <div class="header-actions">
        <span class="btn-hide" title="Hide Reader (H)">[HIDE]</span>
      </div>
    </div>

    <div class="console-warnings">
      <div class="warning">⚠ Warning: Large content detected (<span id="line-count">0</span> lines)</div>
      <div class="warning">⚠ Deprecated: Chapter <span id="chapter-num">1</span> content - consider caching</div>
      <div class="success">✓ Content loaded successfully</div>
    </div>

    <div class="reader-content" id="reader-content">
      <div class="chapter-title" id="chapter-title">第1章</div>
      <div class="chapter-subtitle">─────────────────────────────────────────</div>
      <div class="chapter-body" id="chapter-body">
        <!-- Content loads here -->
      </div>
    </div>

    <div class="progress-bar">
      <div class="progress-track">
        <div class="progress-fill" id="progress-fill"></div>
      </div>
      <div class="progress-text"><span id="progress-percent">0</span>%</div>
    </div>

    <div class="nav-buttons">
      <button class="nav-btn" id="btn-prev">[↑ 上页]</button>
      <button class="nav-btn" id="btn-toc">[目录]</button>
      <button class="nav-btn" id="btn-next">[下页 ↓]</button>
    </div>

    <!-- TOC Modal -->
    <div class="modal" id="toc-modal" style="display:none;">
      <div class="modal-content">
        <div class="modal-header">⚠ Chapter Navigation</div>
        <div class="chapter-list" id="chapter-list">
          <!-- Chapters listed here -->
        </div>
        <div class="modal-footer">
          <button class="modal-btn" id="btn-cancel">[取消]</button>
          <button class="modal-btn primary" id="btn-jump">[跳转]</button>
        </div>
      </div>
    </div>

    <!-- File Open -->
    <input type="file" id="file-input" accept=".epub" style="display:none;">
  </div>

  <script src="../shared/storage.js"></script>
  <script src="epub-parser.js"></script>
  <script src="panel.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create styles.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Consolas', 'Monaco', monospace;
  background: #1e1e1e;
  color: #d4d4d4;
  font-size: 14px;
  line-height: 1.6;
  padding: 10px;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 10px;
  background: #2d2d2d;
  border-bottom: 1px solid #3e3e3e;
  -webkit-app-region: drag;
}

.console-title {
  color: #fff;
  font-weight: bold;
}

.header-actions {
  -webkit-app-region: no-drag;
}

.btn-hide {
  color: #6a6a6a;
  cursor: pointer;
  font-size: 12px;
}

.btn-hide:hover {
  color: #fff;
}

.console-warnings {
  padding: 10px;
  border-bottom: 1px solid #3e3e3e;
  font-size: 12px;
}

.warning {
  color: #dcdcaa;
  margin-bottom: 4px;
}

.success {
  color: #6a9955;
}

.reader-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.chapter-title {
  font-size: 20px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 5px;
}

.chapter-subtitle {
  color: #6a6a6a;
  margin-bottom: 20px;
  font-size: 12px;
}

.chapter-body {
  font-size: 16px;
  line-height: 1.8;
  color: #d4d4d4;
  white-space: pre-wrap;
  text-align: justify;
}

.progress-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-top: 1px solid #3e3e3e;
}

.progress-track {
  flex: 1;
  height: 6px;
  background: #3e3e3e;
  border-radius: 3px;
}

.progress-fill {
  height: 100%;
  background: #0e639c;
  border-radius: 3px;
  transition: width 0.3s;
}

.progress-text {
  font-size: 12px;
  color: #6a6a6a;
  min-width: 35px;
  text-align: right;
}

.nav-buttons {
  display: flex;
  justify-content: center;
  gap: 30px;
  padding: 10px;
}

.nav-btn {
  background: none;
  border: 1px solid #3e3e3e;
  color: #d4d4d4;
  padding: 5px 15px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
}

.nav-btn:hover {
  background: #3e3e3e;
  border-color: #0e639c;
}

/* TOC Modal */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #2d2d2d;
  border: 1px solid #3e3e3e;
  border-radius: 4px;
  width: 300px;
  max-height: 400px;
  overflow: hidden;
}

.modal-header {
  padding: 10px 15px;
  background: #3e3e3e;
  color: #dcdcaa;
  font-size: 13px;
}

.chapter-list {
  max-height: 300px;
  overflow-y: auto;
  padding: 10px;
}

.chapter-item {
  padding: 8px;
  cursor: pointer;
  color: #d4d4d4;
  font-size: 13px;
}

.chapter-item:hover {
  background: #3e3e3e;
}

.chapter-item.current {
  color: #4ec9b0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px 15px;
  border-top: 1px solid #3e3e3e;
}

.modal-btn {
  background: none;
  border: 1px solid #3e3e3e;
  color: #d4d4d4;
  padding: 5px 15px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}

.modal-btn.primary {
  border-color: #0e639c;
  color: #fff;
}

.modal-btn:hover {
  background: #3e3e3e;
}

/* Themes */
.theme-dark {
  background: #1e1e1e;
  color: #d4d4d4;
}

.theme-light {
  background: #fff;
  color: #333;
}

.theme-light .console-header {
  background: #f3f3f3;
  border-color: #ddd;
}

.theme-light .chapter-title {
  color: #333;
}

.theme-light .console-warnings {
  border-color: #ddd;
}

/* Hidden state for boss key */
.hidden {
  display: none !important;
}
```

- [ ] **Step 3: Commit**

```bash
cd /root/console-reader && git add console-panel/panel.html console-panel/styles.css && git commit -m "feat: add panel HTML and CSS"
```

---

### Task 5: Panel JavaScript (Main Logic)

**Files:**
- Create: `console-reader/console-panel/panel.js`

- [ ] **Step 1: Create panel.js**

```javascript
class ConsoleReader {
  constructor() {
    this.parser = null;
    this.currentChapter = 0;
    this.totalChapters = 0;
    this.content = [];
    this.linesPerPage = 20;
    this.currentLine = 0;
    this.selectedChapterIndex = 0;

    this.initElements();
    this.bindEvents();
    this.loadSettings();
    this.checkForOpenBook();
  }

  initElements() {
    this.elements = {
      lineCount: document.getElementById('line-count'),
      chapterNum: document.getElementById('chapter-num'),
      chapterTitle: document.getElementById('chapter-title'),
      chapterBody: document.getElementById('chapter-body'),
      progressFill: document.getElementById('progress-fill'),
      progressPercent: document.getElementById('progress-percent'),
      tocModal: document.getElementById('toc-modal'),
      chapterList: document.getElementById('chapter-list'),
      readerContent: document.getElementById('reader-content'),
      btnPrev: document.getElementById('btn-prev'),
      btnNext: document.getElementById('btn-next'),
      btnToc: document.getElementById('btn-toc'),
      btnCancel: document.getElementById('btn-cancel'),
      btnJump: document.getElementById('btn-jump'),
      btnHide: document.querySelector('.btn-hide'),
      fileInput: document.getElementById('file-input')
    };
  }

  bindEvents() {
    // Navigation
    this.elements.btnPrev.addEventListener('click', () => this.prevPage());
    this.elements.btnNext.addEventListener('click', () => this.nextPage());
    this.elements.btnToc.addEventListener('click', () => this.showToc());
    this.elements.btnCancel.addEventListener('click', () => this.hideToc());
    this.elements.btnJump.addEventListener('click', () => this.jumpToChapter());
    this.elements.btnHide.addEventListener('click', () => this.toggleHide());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeydown(e));

    // File open
    this.elements.fileInput.addEventListener('change', (e) => this.handleFileOpen(e));

    // Double click header to open file
    document.querySelector('.console-header').addEventListener('dblclick', () => {
      this.elements.fileInput.click();
    });
  }

  handleKeydown(e) {
    switch(e.key) {
      case 'ArrowUp':
        e.preventDefault();
        this.prevPage();
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.nextPage();
        break;
      case 't':
      case 'T':
        if (!this.elements.tocModal.style.display || this.elements.tocModal.style.display === 'none') {
          this.showToc();
        }
        break;
      case 'h':
      case 'H':
        this.toggleHide();
        break;
      case 'Escape':
        this.hideToc();
        break;
    }
  }

  async checkForOpenBook() {
    const book = await ReaderStorage.getCurrentBook();
    if (book) {
      await this.loadBook(book);
    } else {
      // Prompt to open file
      this.elements.chapterBody.innerHTML = 
        '<div style="text-align:center;padding:50px;color:#6a6a6a;">' +
        'Double-click header to open EPUB file<br><br>or<br><br>' +
        '<button onclick="document.getElementById(\'file-input\').click()" ' +
        'style="background:#0e639c;border:none;color:#fff;padding:10px 20px;cursor:pointer;">' +
        'Open EPUB</button></div>';
    }
  }

  async handleFileOpen(e) {
    const file = e.target.files[0];
    if (!file) return;

    const arrayBuffer = await file.arrayBuffer();
    this.parser = new EpubParser(arrayBuffer);
    await this.parser.parse();
    
    await ReaderStorage.saveCurrentBook({
      name: file.name,
      data: Array.from(new Uint8Array(arrayBuffer))
    });

    await this.loadBook({
      name: file.name,
      data: Array.from(new Uint8Array(arrayBuffer))
    });
  }

  async loadBook(bookData) {
    const arrayBuffer = new Uint8Array(bookData.data).buffer;
    this.parser = new EpubParser(arrayBuffer);
    await this.parser.parse();

    this.totalChapters = this.parser.chapters.length;
    this.content = [];
    this.currentChapter = 0;
    this.currentLine = 0;

    // Load first chapter
    await this.loadChapter(0);
    this.updateChapterList();
    this.updateWarnings();
  }

  async loadChapter(index) {
    if (index < 0 || index >= this.totalChapters) return;

    const text = await this.parser.getChapterContent(index);
    this.content = text.split('\n').filter(line => line.trim());
    this.currentChapter = index;
    this.currentLine = 0;

    this.renderPage();
    this.updateProgress();
    this.updateWarnings();
    this.saveProgress();
  }

  renderPage() {
    const chapter = this.parser.chapters[this.currentChapter];
    this.elements.chapterTitle.textContent = chapter?.title || `Chapter ${this.currentChapter + 1}`;

    const pageContent = this.content.slice(this.currentLine, this.currentLine + this.linesPerPage).join('\n\n');
    this.elements.chapterBody.textContent = pageContent || 'No content';

    this.elements.lineCount.textContent = this.content.length;
    this.elements.chapterNum.textContent = this.currentChapter + 1;
  }

  prevPage() {
    if (this.currentLine > 0) {
      this.currentLine = Math.max(0, this.currentLine - this.linesPerPage);
      this.renderPage();
      this.updateProgress();
      this.saveProgress();
    } else if (this.currentChapter > 0) {
      this.loadChapter(this.currentChapter - 1);
      this.currentLine = Math.max(0, this.content.length - this.linesPerPage);
      this.renderPage();
      this.updateProgress();
      this.saveProgress();
    }
  }

  nextPage() {
    if (this.currentLine + this.linesPerPage < this.content.length) {
      this.currentLine += this.linesPerPage;
      this.renderPage();
      this.updateProgress();
      this.saveProgress();
    } else if (this.currentChapter < this.totalChapters - 1) {
      this.loadChapter(this.currentChapter + 1);
    }
  }

  updateProgress() {
    const chapterProgress = this.currentLine / Math.max(1, this.content.length);
    const totalProgress = ((this.currentChapter + chapterProgress) / this.totalChapters) * 100;
    
    this.elements.progressFill.style.width = `${totalProgress}%`;
    this.elements.progressPercent.textContent = Math.round(totalProgress);
  }

  updateWarnings() {
    this.elements.lineCount.textContent = this.content.length;
    this.elements.chapterNum.textContent = this.currentChapter + 1;
  }

  showToc() {
    this.selectedChapterIndex = this.currentChapter;
    this.elements.tocModal.style.display = 'flex';
  }

  hideToc() {
    this.elements.tocModal.style.display = 'none';
  }

  updateChapterList() {
    if (!this.parser) return;

    this.elements.chapterList.innerHTML = this.parser.chapters.map((ch, i) => `
      <div class="chapter-item ${i === this.currentChapter ? 'current' : ''}" 
           data-index="${i}">${ch.title}</div>
    `).join('');

    this.elements.chapterList.querySelectorAll('.chapter-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectedChapterIndex = parseInt(item.dataset.index);
        this.elements.chapterList.querySelectorAll('.chapter-item').forEach(el => {
          el.classList.remove('current');
        });
        item.classList.add('current');
      });
    });
  }

  jumpToChapter() {
    this.loadChapter(this.selectedChapterIndex);
    this.hideToc();
  }

  toggleHide() {
    // Toggle visibility - for boss key
    this.elements.readerContent.classList.toggle('hidden');
    document.querySelector('.console-warnings').classList.toggle('hidden');
    document.querySelector('.progress-bar').classList.toggle('hidden');
    document.querySelector('.nav-buttons').classList.toggle('hidden');
  }

  async saveProgress() {
    if (!this.parser) return;
    const bookId = this.parser.metadata.title;
    await ReaderStorage.saveProgress(bookId, this.currentChapter, this.currentLine);
  }

  async loadSettings() {
    const settings = await ReaderStorage.getSettings();
    this.applySettings(settings);
  }

  applySettings(settings) {
    document.body.className = settings.theme === 'dark' ? '' : `theme-${settings.theme}`;
    this.elements.chapterBody.style.fontSize = `${settings.fontSize}px`;
    this.elements.chapterBody.style.lineHeight = settings.lineHeight;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.reader = new ConsoleReader();
});
```

- [ ] **Step 2: Commit**

```bash
cd /root/console-reader && git add console-panel/panel.js && git commit -m "feat: add panel main logic"
```

---

### Task 6: Chrome DevTools Integration

**Files:**
- Create: `console-reader/devtools.html`
- Modify: `console-reader/manifest.json`

- [ ] **Step 1: Create devtools.html**

```html
<!DOCTYPE html>
<html>
<head>
  <script>
    // Create console panel
    chrome.devtools.panels.create(
      'Console',
      'icon16.png',
      'console-panel/panel.html',
      (panel) => {
        console.log('Console Reader panel created');
      }
    );
  </script>
</head>
<body>
</body>
</html>
```

- [ ] **Step 2: Update manifest.json permissions**

Need to add `"devtools"` permission:

```json
{
  "manifest_version": 3,
  "name": "Console Reader",
  "version": "1.0.0",
  "description": "EPUB reader hidden in DevTools Console",
  "permissions": ["storage", "activeTab", "scripting", "devtools"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_title": "Open Console Reader"
  },
  "devtools_page": "devtools.html"
}
```

- [ ] **Step 3: Commit**

```bash
cd /root/console-reader && git add devtools.html manifest.json && git commit -m "feat: add DevTools integration"
```

---

### Task 7: Add Boss Key Command

**Files:**
- Modify: `console-reader/manifest.json`

- [ ] **Step 1: Add keyboard command to manifest**

```json
{
  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Ctrl+Shift+H",
        "mac": "Command+Shift+H"
      },
      "description": "Toggle Console Reader"
    }
  }
}
```

- [ ] **Step 2: Update background.js to handle command**

```javascript
chrome.commands.onCommand.addListener((command) => {
  if (command === '_execute_action') {
    // Toggle the panel visibility
    chrome.runtime.sendMessage({ type: 'togglePanel' });
  }
});
```

- [ ] **Step 3: Commit**

```bash
cd /root/console-reader && git add manifest.json background.js && git commit -m "feat: add boss key command"
```

---

### Task 8: Testing and Verification

**Files:**
- Test with sample EPUB file

- [ ] **Step 1: Verify extension loads**

1. Open chrome://extensions
2. Enable Developer mode
3. Click "Load unpacked"
4. Select /root/console-reader folder
5. Verify no errors

- [ ] **Step 2: Test panel opens**

1. Open any webpage
2. Press F12 to open DevTools
3. Click "Console" tab
4. Verify reader panel appears

- [ ] **Step 3: Test file open**

1. Double-click header to open file dialog
2. Select an EPUB file
3. Verify content loads

- [ ] **Step 4: Test navigation**

1. Press ↑/↓ to navigate pages
2. Press T to open TOC
3. Press H to hide reader

- [ ] **Step 5: Final commit**

```bash
cd /root/console-reader && git add -A && git commit -m "feat: complete console reader extension"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Project setup, manifest, background script |
| 2 | EPUB parser with ZIP extraction |
| 3 | Storage module for progress/settings |
| 4 | Panel HTML and CSS with stealth styling |
| 5 | Main panel logic (navigation, TOC, settings) |
| 6 | Chrome DevTools panel integration |
| 7 | Boss key (Ctrl+Shift+H) |
| 8 | Testing and final commit |
