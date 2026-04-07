class ConsoleReader {
  constructor() {
    this.parser = null;
    this.chapters = [];
    this.currentChapterIndex = 0;
    this.chapterStartLines = [];  // Line index where each chapter starts
    this.allLines = [];
    this.visibleLines = 15;  // Will be calculated based on viewport
    this.scrollPosition = 0;  // Current scroll position in lines
    this.fontSize = 13;

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
      btnOpen: document.getElementById('btn-open'),
      btnFontSmaller: document.getElementById('btn-font-smaller'),
      btnFontLarger: document.getElementById('btn-font-larger'),
      fontSizeDisplay: document.getElementById('font-size-display'),
      fileInput: document.getElementById('file-input'),
      emptyState: document.getElementById('empty-state')
    };
  }

  bindEvents() {
    this.elements.btnPrev.addEventListener('click', () => this.scrollUp());
    this.elements.btnNext.addEventListener('click', () => this.scrollDown());
    this.elements.btnToc.addEventListener('click', () => this.showToc());
    this.elements.btnCancel.addEventListener('click', () => this.hideToc());
    this.elements.btnJump.addEventListener('click', () => this.jumpToChapter());
    this.elements.btnHide.addEventListener('click', () => this.toggleHide());
    this.elements.btnOpen.addEventListener('click', () => this.elements.fileInput.click());
    this.elements.btnFontSmaller.addEventListener('click', () => this.changeFontSize(-1));
    this.elements.btnFontLarger.addEventListener('click', () => this.changeFontSize(1));

    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.elements.fileInput.addEventListener('change', (e) => this.handleFileOpen(e));
    this.elements.readerContent.addEventListener('scroll', () => this.handleScroll());

    document.querySelector('.console-header').addEventListener('dblclick', () => {
      this.elements.fileInput.click();
    });
  }

  handleKeydown(e) {
    if (e.target.tagName === 'INPUT') return;

    switch(e.key) {
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        this.scrollUp();
        break;
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        this.scrollDown();
        break;
      case 'PageUp':
        e.preventDefault();
        this.scrollUp(this.visibleLines);
        break;
      case 'PageDown':
        e.preventDefault();
        this.scrollDown(this.visibleLines);
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
      case '+':
      case '=':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.changeFontSize(1);
        }
        break;
      case '-':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.changeFontSize(-1);
        }
        break;
      case 'Escape':
        this.hideToc();
        break;
      case 'o':
      case 'O':
        this.elements.fileInput.click();
        break;
    }
  }

  handleScroll() {
    // Sync scroll position with displayed content
    const scrollTop = this.elements.readerContent.scrollTop;
    const lineHeight = parseFloat(getComputedStyle(this.elements.chapterBody).lineHeight) || 20;
    this.scrollPosition = Math.floor(scrollTop / lineHeight);
    this.updateChapterFromScroll();
    this.updateProgress();
  }

  scrollUp(lines = this.visibleLines) {
    this.scrollPosition = Math.max(0, this.scrollPosition - lines);
    this.elements.readerContent.scrollTop = this.scrollPosition * this.getLineHeight();
    this.updateChapterFromScroll();
    this.updateProgress();
    this.saveProgress();
  }

  scrollDown(lines = this.visibleLines) {
    this.scrollPosition = Math.min(this.allLines.length - 1, this.scrollPosition + lines);
    this.elements.readerContent.scrollTop = this.scrollPosition * this.getLineHeight();
    this.updateChapterFromScroll();
    this.updateProgress();
    this.saveProgress();
  }

  getLineHeight() {
    const lineHeight = parseFloat(getComputedStyle(this.elements.chapterBody).lineHeight);
    return isNaN(lineHeight) ? 20 : lineHeight;
  }

  calculateVisibleLines() {
    const viewportHeight = this.elements.readerContent.clientHeight;
    const lineHeight = this.getLineHeight();
    const padding = 30;  // Top/bottom padding
    this.visibleLines = Math.floor((viewportHeight - padding) / lineHeight);
    this.visibleLines = Math.max(5, this.visibleLines);  // At least 5 lines
  }

  updateChapterFromScroll() {
    // Find which chapter we're currently viewing based on scroll position
    for (let i = this.chapterStartLines.length - 1; i >= 0; i--) {
      if (this.scrollPosition >= this.chapterStartLines[i]) {
        this.currentChapterIndex = i;
        break;
      }
    }
    this.elements.chapterNum.textContent = this.currentChapterIndex + 1;
  }

  async checkForOpenBook() {
    this.showEmptyState();
  }

  showEmptyState() {
    this.elements.emptyState.style.display = 'flex';
    this.elements.readerContent.style.display = 'none';
  }

  hideEmptyState() {
    this.elements.emptyState.style.display = 'none';
    this.elements.readerContent.style.display = 'block';
  }

  async handleFileOpen(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      await this.loadBook({
        name: file.name,
        data: arrayBuffer
      });
    } catch (err) {
      console.error('Failed to open file:', err);
      alert('Failed to open EPUB file.');
    }
  }

  async loadBook(bookData) {
    try {
      const arrayBuffer = bookData.data instanceof ArrayBuffer
        ? bookData.data
        : new Uint8Array(bookData.data).buffer;
      this.parser = new EpubParser(arrayBuffer);
      await this.parser.parse();

      if (this.parser.chapters.length === 0) {
        throw new Error('No chapters found');
      }

      this.chapters = this.parser.chapters;
      this.currentChapterIndex = 0;
      this.scrollPosition = 0;
      this.chapterStartLines = [];

      // Load all content and build line array
      await this.loadAllContent();

      this.calculateVisibleLines();
      this.hideEmptyState();
      this.renderContent();
      this.updateChapterList();
      this.updateWarnings();
    } catch (err) {
      console.error('Failed to load book:', err);
      this.showEmptyState();
      throw err;
    }
  }

  async loadAllContent() {
    this.allLines = [];
    this.chapterStartLines = [];
    this.chapterTitles = [];

    for (let i = 0; i < this.parser.chapters.length; i++) {
      this.chapterStartLines.push(this.allLines.length);

      const text = await this.parser.getChapterContent(i);
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      this.allLines.push(...lines);
    }

    // Store chapter titles
    this.chapterTitles = this.chapters.map(ch => ch.title || 'Chapter');
  }

  renderContent() {
    this.calculateVisibleLines();

    // Show visible range with context
    const startLine = Math.max(0, this.scrollPosition - this.visibleLines);
    const endLine = Math.min(this.allLines.length, this.scrollPosition + this.visibleLines * 2);

    const visibleLines = this.allLines.slice(startLine, endLine);
    this.elements.chapterBody.textContent = visibleLines.join('\n');

    // Update current chapter info
    this.updateChapterFromScroll();

    // Update title
    const chapter = this.chapters[this.currentChapterIndex];
    this.elements.chapterTitle.textContent = chapter?.title || 'Chapter ' + (this.currentChapterIndex + 1);
    this.elements.chapterTitle.title = chapter?.title || '';

    // Scroll to correct position
    const scrollOffset = this.scrollPosition - startLine;
    this.elements.readerContent.scrollTop = scrollOffset * this.getLineHeight();

    this.updateProgress();
  }

  changeFontSize(delta) {
    this.fontSize = Math.max(10, Math.min(24, this.fontSize + delta));
    this.elements.chapterBody.style.fontSize = `${this.fontSize}px`;
    this.elements.fontSizeDisplay.textContent = `${this.fontSize}px`;
    this.calculateVisibleLines();
    this.renderContent();
    ReaderStorage.saveSettings({ fontSize: this.fontSize });
  }

  updateProgress() {
    const progress = this.allLines.length > 0
      ? (this.scrollPosition / this.allLines.length) * 100
      : 0;
    this.elements.progressFill.style.width = `${progress}%`;
    this.elements.progressPercent.textContent = Math.round(progress);
  }

  updateWarnings() {
    this.elements.lineCount.textContent = this.allLines.length;
  }

  showToc() {
    this.selectedChapterIndex = this.currentChapterIndex;
    this.elements.tocModal.style.display = 'flex';
  }

  hideToc() {
    this.elements.tocModal.style.display = 'none';
  }

  updateChapterList() {
    if (!this.parser) return;

    this.elements.chapterList.innerHTML = this.chapters.map((ch, i) => `
      <div class="chapter-item ${i === this.currentChapterIndex ? 'current' : ''}"
           data-index="${i}">${ch.title || `Chapter ${i + 1}`}</div>
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
    this.currentChapterIndex = this.selectedChapterIndex;
    this.scrollPosition = this.chapterStartLines[this.currentChapterIndex] || 0;
    this.renderContent();
    this.hideToc();
    this.saveProgress();
  }

  toggleHide() {
    this.elements.readerContent.classList.toggle('hidden');
    document.querySelector('.console-warnings').classList.toggle('hidden');
    document.querySelector('.progress-bar').classList.toggle('hidden');
    document.querySelector('.nav-buttons').classList.toggle('hidden');
  }

  async saveProgress() {
    if (!this.parser) return;
    const bookId = this.parser.metadata.title;
    await ReaderStorage.saveProgress(bookId, this.currentChapterIndex, this.scrollPosition);
  }

  async loadSettings() {
    const settings = await ReaderStorage.getSettings();
    this.fontSize = settings.fontSize || 13;
    this.elements.chapterBody.style.fontSize = `${this.fontSize}px`;
    this.elements.fontSizeDisplay.textContent = `${this.fontSize}px`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.reader = new ConsoleReader();
});
