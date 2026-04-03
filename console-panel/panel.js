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
