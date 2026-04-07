class ConsoleReader {
  constructor() {
    this.parser = null;
    this.currentChapter = 0;
    this.totalChapters = 0;
    this.content = [];
    this.linesPerPage = 25;
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
      btnOpen: document.getElementById('btn-open'),
      fileInput: document.getElementById('file-input'),
      emptyState: document.getElementById('empty-state')
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
    this.elements.btnOpen.addEventListener('click', () => this.elements.fileInput.click());

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
    // Don't handle if in input
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
    // Always show empty state - we no longer persist EPUB files
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
      alert('Failed to open EPUB file. Please ensure it is a valid EPUB.');
    }
  }

  async loadBook(bookData) {
    try {
      // Handle both direct ArrayBuffer and stored format
      const arrayBuffer = bookData.data instanceof ArrayBuffer
        ? bookData.data
        : new Uint8Array(bookData.data).buffer;
      this.parser = new EpubParser(arrayBuffer);
      await this.parser.parse();

      console.log('EPUB parsed, chapters:', this.parser.chapters.length, this.parser.chapters);
      console.log('ZIP keys sample:', Object.keys(this.parser.zip || {}).slice(0, 5));

      if (this.parser.chapters.length === 0) {
        throw new Error('No chapters found in EPUB');
      }

      this.totalChapters = this.parser.chapters.length;
      this.content = [];
      this.currentChapter = 0;
      this.currentLine = 0;

      this.hideEmptyState();
      await this.loadChapter(0);
      this.updateChapterList();
      this.updateWarnings();

      console.log('Book loaded, content paragraphs:', this.content.length);
    } catch (err) {
      console.error('Failed to load book:', err);
      this.showEmptyState();
      throw err;
    }
  }

  async loadChapter(index) {
    if (index < 0 || index >= this.totalChapters) return;

    try {
      const text = await this.parser.getChapterContent(index);
      this.content = text.split('\n\n').filter(line => line.trim().length > 0);
      this.currentChapter = index;
      this.currentLine = 0;

      this.renderPage();
      this.updateProgress();
      this.updateWarnings();
      this.saveProgress();
    } catch (err) {
      console.error('Failed to load chapter:', err);
      this.elements.chapterBody.textContent = 'Failed to load chapter content.';
    }
  }

  renderPage() {
    const chapter = this.parser.chapters[this.currentChapter];
    this.elements.chapterTitle.textContent = chapter?.title || `Chapter ${this.currentChapter + 1}`;
    this.elements.chapterTitle.title = chapter?.title || '';

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
    this.loadChapter(this.selectedChapterIndex);
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
    // Theme is now handled automatically via CSS prefers-color-scheme
    // Only apply font size and line height from saved settings
    if (settings.fontSize) {
      this.elements.chapterBody.style.fontSize = `${settings.fontSize}px`;
    }
    if (settings.lineHeight) {
      this.elements.chapterBody.style.lineHeight = settings.lineHeight;
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.reader = new ConsoleReader();
});
