class ConsoleReader {
  constructor() {
    this.parser = null;
    this.chapters = [];
    this.currentChapterIndex = 0;
    this.chapterStartLines = [];
    this.allLines = [];
    this.scrollPosition = 0;
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
    this.elements.btnPrev.addEventListener('click', () => this.prevChapter());
    this.elements.btnNext.addEventListener('click', () => this.nextChapter());
    this.elements.btnToc.addEventListener('click', () => this.showToc());
    this.elements.btnCancel.addEventListener('click', () => this.hideToc());
    this.elements.btnJump.addEventListener('click', () => this.jumpToChapter());
    this.elements.btnHide.addEventListener('click', () => this.toggleHide());
    this.elements.btnOpen.addEventListener('click', () => this.elements.fileInput.click());
    this.elements.btnFontSmaller.addEventListener('click', () => this.changeFontSize(-1));
    this.elements.btnFontLarger.addEventListener('click', () => this.changeFontSize(1));

    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.elements.fileInput.addEventListener('change', (e) => this.handleFileOpen(e));
    this.elements.readerContent.addEventListener('scroll', () => this.onScroll());

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
        this.elements.readerContent.scrollTop -= 100;
        break;
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        this.elements.readerContent.scrollTop += 100;
        break;
      case 'PageUp':
        e.preventDefault();
        this.elements.readerContent.scrollTop -= this.elements.readerContent.clientHeight;
        break;
      case 'PageDown':
        e.preventDefault();
        this.elements.readerContent.scrollTop += this.elements.readerContent.clientHeight;
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

  onScroll() {
    const el = this.elements.readerContent;
    const scrollTop = el.scrollTop;
    const scrollHeight = el.scrollHeight - el.clientHeight;

    if (scrollHeight > 0) {
      const progress = (scrollTop / scrollHeight) * 100;
      this.elements.progressFill.style.width = `${progress}%`;
      this.elements.progressPercent.textContent = Math.round(progress);
    }

    // Update current chapter based on scroll position
    this.updateCurrentChapter();
  }

  updateCurrentChapter() {
    const el = this.elements.readerContent;
    const scrollTop = el.scrollTop;
    const lineHeight = this.getLineHeight();
    const currentLine = Math.floor(scrollTop / lineHeight);

    // Find which chapter this line belongs to
    for (let i = this.chapterStartLines.length - 1; i >= 0; i--) {
      if (currentLine >= this.chapterStartLines[i]) {
        if (this.currentChapterIndex !== i) {
          this.currentChapterIndex = i;
          this.elements.chapterNum.textContent = i + 1;
        }
        break;
      }
    }
  }

  getLineHeight() {
    const lineHeight = parseFloat(getComputedStyle(this.elements.chapterBody).lineHeight);
    return isNaN(lineHeight) ? 20 : lineHeight;
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
      this.chapterStartLines = [];

      await this.loadAllContent();

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

    for (let i = 0; i < this.parser.chapters.length; i++) {
      this.chapterStartLines.push(this.allLines.length);

      const text = await this.parser.getChapterContent(i);
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      this.allLines.push(...lines);
    }
  }

  renderContent() {
    // Update chapter info
    const chapter = this.chapters[this.currentChapterIndex];
    this.elements.chapterTitle.textContent = chapter?.title || `Chapter ${this.currentChapterIndex + 1}`;
    this.elements.chapterTitle.title = chapter?.title || '';
    this.elements.chapterNum.textContent = this.currentChapterIndex + 1;

    // Render all content
    this.elements.chapterBody.textContent = this.allLines.join('\n');

    // Reset scroll position
    this.elements.readerContent.scrollTop = 0;

    this.updateProgress();
  }

  prevChapter() {
    if (this.currentChapterIndex > 0) {
      this.currentChapterIndex--;
      this.scrollToChapter(this.currentChapterIndex);
    }
  }

  nextChapter() {
    if (this.currentChapterIndex < this.chapters.length - 1) {
      this.currentChapterIndex++;
      this.scrollToChapter(this.currentChapterIndex);
    }
  }

  scrollToChapter(chapterIndex) {
    const lineHeight = this.getLineHeight();
    const targetLine = this.chapterStartLines[chapterIndex] || 0;
    this.elements.readerContent.scrollTop = targetLine * lineHeight;
    this.elements.chapterNum.textContent = chapterIndex + 1;
    this.updateChapterList();
  }

  changeFontSize(delta) {
    this.fontSize = Math.max(10, Math.min(24, this.fontSize + delta));
    this.elements.chapterBody.style.fontSize = `${this.fontSize}px`;
    this.elements.fontSizeDisplay.textContent = `${this.fontSize}px`;
    ReaderStorage.saveSettings({ fontSize: this.fontSize });
  }

  updateProgress() {
    const el = this.elements.readerContent;
    const scrollHeight = el.scrollHeight - el.clientHeight;
    if (scrollHeight > 0) {
      const progress = (el.scrollTop / scrollHeight) * 100;
      this.elements.progressFill.style.width = `${progress}%`;
      this.elements.progressPercent.textContent = Math.round(progress);
    }
  }

  updateWarnings() {
    this.elements.lineCount.textContent = this.allLines.length;
    this.elements.chapterNum.textContent = this.currentChapterIndex + 1;
  }

  showToc() {
    this.selectedChapterIndex = this.currentChapterIndex;
    this.updateChapterList();
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
    this.scrollToChapter(this.currentChapterIndex);
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
    await ReaderStorage.saveProgress(bookId, this.currentChapterIndex, 0);
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
