class ConsoleReader {
  constructor() {
    this.parser = null;
    this.currentChapter = 0;
    this.totalChapters = 0;
    this.allContent = [];  // All chapters concatenated
    this.currentLine = 0;
    this.linesPerPage = 12;  // Fewer lines per page for better readability
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
      btnOpen: document.getElementById('btn-open'),
      fileInput: document.getElementById('file-input'),
      emptyState: document.getElementById('empty-state')
    };
  }

  bindEvents() {
    this.elements.btnPrev.addEventListener('click', () => this.prevPage());
    this.elements.btnNext.addEventListener('click', () => this.nextPage());
    this.elements.btnToc.addEventListener('click', () => this.showToc());
    this.elements.btnCancel.addEventListener('click', () => this.hideToc());
    this.elements.btnJump.addEventListener('click', () => this.jumpToChapter());
    this.elements.btnHide.addEventListener('click', () => this.toggleHide());
    this.elements.btnOpen.addEventListener('click', () => this.elements.fileInput.click());

    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.elements.fileInput.addEventListener('change', (e) => this.handleFileOpen(e));

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
        this.prevPage();
        break;
      case 'ArrowDown':
      case 'j':
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
      case 'o':
      case 'O':
        this.elements.fileInput.click();
        break;
    }
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

      this.totalChapters = this.parser.chapters.length;
      this.currentChapter = 0;
      this.currentLine = 0;

      // Load all content
      await this.loadAllContent();

      this.hideEmptyState();
      this.updateChapterList();
      this.updateWarnings();
    } catch (err) {
      console.error('Failed to load book:', err);
      this.showEmptyState();
      throw err;
    }
  }

  async loadAllContent() {
    // Concatenate all chapters into one continuous stream
    const lines = [];

    for (let i = 0; i < this.parser.chapters.length; i++) {
      const text = await this.parser.getChapterContent(i);
      // Split into lines and filter empty ones
      const chapterLines = text.split('\n').filter(line => line.trim().length > 0);
      lines.push(...chapterLines);
    }

    this.allContent = lines;
    this.currentLine = 0;
    this.renderPage();
  }

  renderPage() {
    const chapter = this.parser.chapters[this.currentChapter];
    this.elements.chapterTitle.textContent = chapter?.title || `Chapter ${this.currentChapter + 1}`;
    this.elements.chapterTitle.title = chapter?.title || '';

    // Get page content
    const pageContent = this.allContent.slice(this.currentLine, this.currentLine + this.linesPerPage);
    this.elements.chapterBody.textContent = pageContent.join('\n');

    // Update progress
    this.updateProgress();
    this.updateWarnings();
  }

  prevPage() {
    if (this.currentLine > 0) {
      this.currentLine = Math.max(0, this.currentLine - this.linesPerPage);
      this.renderPage();
      this.saveProgress();
    } else if (this.currentChapter > 0) {
      // Go to previous chapter
      this.currentChapter--;
      // Find the starting line of this chapter
      const chapterStartLine = this.getChapterStartLine(this.currentChapter);
      this.currentLine = Math.max(0, chapterStartLine);
      this.renderPage();
      this.saveProgress();
    }
  }

  nextPage() {
    if (this.currentLine + this.linesPerPage < this.allContent.length) {
      this.currentLine += this.linesPerPage;
      this.renderPage();
      this.saveProgress();
    } else if (this.currentChapter < this.totalChapters - 1) {
      // Go to next chapter
      this.currentChapter++;
      this.currentLine = this.getChapterStartLine(this.currentChapter);
      this.renderPage();
      this.saveProgress();
    }
  }

  getChapterStartLine(chapterIndex) {
    // Calculate the starting line index for a chapter
    let lineCount = 0;
    for (let i = 0; i < chapterIndex; i++) {
      // We need to get chapter i content to count lines
      // For simplicity, just return 0 if we haven't loaded that chapter
    }
    return 0; // Simplified - would need async chapter content loading
  }

  updateProgress() {
    const progress = (this.currentLine / Math.max(1, this.allContent.length)) * 100;
    this.elements.progressFill.style.width = `${progress}%`;
    this.elements.progressPercent.textContent = Math.round(progress);
    this.elements.chapterNum.textContent = this.currentChapter + 1;
  }

  updateWarnings() {
    this.elements.lineCount.textContent = this.allContent.length;
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
    this.currentChapter = this.selectedChapterIndex;
    this.currentLine = 0;
    this.loadAllContent();
    this.hideToc();
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
    await ReaderStorage.saveProgress(bookId, this.currentChapter, this.currentLine);
  }

  async loadSettings() {
    const settings = await ReaderStorage.getSettings();
    this.applySettings(settings);
  }

  applySettings(settings) {
    if (settings.fontSize) {
      this.elements.chapterBody.style.fontSize = `${settings.fontSize}px`;
    }
    if (settings.lineHeight) {
      this.elements.chapterBody.style.lineHeight = settings.lineHeight;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.reader = new ConsoleReader();
});
