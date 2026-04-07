class ConsoleReader {
  constructor() {
    this.parser = null;
    this.chapters = [];
    this.currentChapterIndex = 0;
    this.chapterStartLines = [];
    this.allLines = [];
    this.currentPage = 0;
    this.linesPerPage = 0;
    this.fontSize = 13;
    this.selectedChapterIndex = 0;

    this.initElements();
    this.bindEvents();
    this.loadSettings();
    this.checkForOpenBook();
  }

  initElements() {
    this.elements = {
      chapterTitle: document.getElementById('chapter-title'),
      chapterBody: document.getElementById('chapter-body'),
      progressFill: document.getElementById('progress-fill'),
      progressPercent: document.getElementById('progress-percent'),
      tocModal: document.getElementById('toc-modal'),
      chapterList: document.getElementById('chapter-list'),
      readerWrapper: document.getElementById('reader-wrapper'),
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
      emptyState: document.getElementById('empty-state'),
      consoleBottombar: document.getElementById('console-bottombar'),
      lineCountDisplay: document.getElementById('line-count-display'),
      chapterNumDisplay: document.getElementById('chapter-num-display'),
      consoleOutput: document.getElementById('console-output'),
      consoleRows: document.querySelectorAll('.console-row')
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
    this.elements.btnFontSmaller.addEventListener('click', () => this.changeFontSize(-1));
    this.elements.btnFontLarger.addEventListener('click', () => this.changeFontSize(1));

    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.elements.fileInput.addEventListener('change', (e) => this.handleFileOpen(e));

    document.querySelector('.console-topbar').addEventListener('dblclick', () => {
      this.elements.fileInput.click();
    });

    // Disable mouse wheel scrolling, use it for page navigation
    this.elements.readerContent.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.deltaY > 0) {
        this.nextPage();
      } else if (e.deltaY < 0) {
        this.prevPage();
      }
    }, { passive: false });

    // Recalculate on window resize
    window.addEventListener('resize', () => {
      if (this.parser) {
        this.calculateLinesPerPage();
        this.renderCurrentPage();
      }
    });
  }

  handleKeydown(e) {
    if (e.target.tagName === 'INPUT') return;

    switch(e.key) {
      case 'ArrowUp':
      case 'k':
      case 'PageUp':
        e.preventDefault();
        this.prevPage();
        break;
      case 'ArrowDown':
      case 'j':
      case 'PageDown':
      case ' ':
        e.preventDefault();
        this.nextPage();
        break;
      case 'Home':
        e.preventDefault();
        this.firstPage();
        break;
      case 'End':
        e.preventDefault();
        this.lastPage();
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

  calculateLinesPerPage() {
    const el = this.elements.readerContent;
    const bodyEl = this.elements.chapterBody;

    const bodyStyle = getComputedStyle(bodyEl);
    const elStyle = getComputedStyle(el);

    const lineHeight = parseFloat(bodyStyle.lineHeight) || (this.fontSize * 1.65);
    const paddingTop = parseFloat(elStyle.paddingTop) || 8;
    const paddingBottom = parseFloat(elStyle.paddingBottom) || 8;

    const availableHeight = el.clientHeight - paddingTop - paddingBottom;
    this.linesPerPage = Math.floor(availableHeight / lineHeight);
    this.linesPerPage = Math.max(3, this.linesPerPage);
  }

  getTotalPages() {
    if (this.linesPerPage === 0) return 1;
    return Math.ceil(this.allLines.length / this.linesPerPage);
  }

  prevPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.renderCurrentPage();
    } else if (this.currentChapterIndex > 0) {
      this.currentChapterIndex--;
      this.currentPage = 0;
      this.renderCurrentPage();
    }
  }

  nextPage() {
    const totalPages = this.getTotalPages();

    if (this.currentPage < totalPages - 1) {
      this.currentPage++;
      this.renderCurrentPage();
    } else if (this.currentChapterIndex < this.chapters.length - 1) {
      this.currentChapterIndex++;
      this.currentPage = 0;
      this.renderCurrentPage();
    }
  }

  firstPage() {
    this.currentPage = 0;
    this.renderCurrentPage();
  }

  lastPage() {
    this.currentPage = Math.max(0, this.getTotalPages() - 1);
    this.renderCurrentPage();
  }

  renderCurrentPage() {
    const startLine = this.currentPage * this.linesPerPage;
    const endLine = Math.min(startLine + this.linesPerPage, this.allLines.length);
    const pageLines = this.allLines.slice(startLine, endLine);

    this.elements.chapterBody.textContent = pageLines.join('\n');

    const chapter = this.chapters[this.currentChapterIndex];
    this.elements.chapterTitle.textContent = chapter?.title || `Chapter ${this.currentChapterIndex + 1}`;

    // Update status bar displays
    this.elements.lineCountDisplay.textContent = this.allLines.length;
    this.elements.chapterNumDisplay.textContent = this.currentChapterIndex + 1;

    // Update fake console output
    this.updateConsoleOutput();

    this.updateProgress();
    this.updateChapterListSelection();
  }

  updateConsoleOutput() {
    const totalPages = this.getTotalPages();
    const chapter = this.chapters[this.currentChapterIndex];

    const rows = this.elements.consoleRows;
    if (rows[0]) {
      rows[0].querySelector('.line-count').textContent = this.allLines.length;
    }
    if (rows[1]) {
      rows[1].querySelector('.chapter-num').textContent = this.currentChapterIndex + 1;
    }
  }

  updateProgress() {
    const totalPages = this.getTotalPages();
    const progress = totalPages > 1 ? (this.currentPage / (totalPages - 1)) * 100 : 0;
    this.elements.progressFill.style.width = `${progress}%`;
    this.elements.progressPercent.textContent = Math.round(progress);
  }

  updateChapterListSelection() {
    this.elements.chapterList.querySelectorAll('.chapter-item').forEach((item, i) => {
      item.classList.toggle('current', i === this.currentChapterIndex);
    });
  }

  async checkForOpenBook() {
    this.showEmptyState();
  }

  showEmptyState() {
    this.elements.emptyState.classList.remove('hidden');
    this.elements.readerWrapper.classList.remove('active');
    this.elements.consoleOutput.style.display = 'none';
  }

  hideEmptyState() {
    this.elements.emptyState.classList.add('hidden');
    this.elements.readerWrapper.classList.add('active');
    this.elements.consoleOutput.style.display = 'block';
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
      this.chapterStartLines = [];
      this.currentPage = 0;

      await this.loadAllContent();

      this.calculateLinesPerPage();
      this.hideEmptyState();
      this.renderCurrentPage();
      this.updateChapterList();
    } catch (err) {
      console.error('Failed to load book:', err);
      this.showEmptyState();
      throw err;
    }
  }

  async loadAllContent() {
    this.allLines = [];
    this.chapterStartLines = [];

    for (let i = 0; i < this.parser.chapters.length; i++) {
      this.chapterStartLines.push(this.allLines.length);

      const text = await this.parser.getChapterContent(i);
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      this.allLines.push(...lines);
    }
  }

  changeFontSize(delta) {
    this.fontSize = Math.max(10, Math.min(24, this.fontSize + delta));
    this.elements.chapterBody.style.fontSize = `${this.fontSize}px`;
    this.elements.fontSizeDisplay.textContent = `${this.fontSize}px`;

    this.calculateLinesPerPage();
    this.renderCurrentPage();

    ReaderStorage.saveSettings({ fontSize: this.fontSize });
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
    this.currentPage = 0;
    this.renderCurrentPage();
    this.hideToc();
  }

  toggleHide() {
    this.elements.readerWrapper.classList.toggle('hidden');
    this.elements.consoleOutput.classList.toggle('hidden');
    this.elements.consoleBottombar?.classList.toggle('hidden');
  }

  async saveProgress() {
    if (!this.parser) return;
    const bookId = this.parser.metadata.title;
    await ReaderStorage.saveProgress(bookId, this.currentChapterIndex, this.currentPage);
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
