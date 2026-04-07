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
      fontSize: data.readerSettings?.fontSize || 13,
      lineHeight: data.readerSettings?.lineHeight || '1.7',
      ...data.readerSettings
    };
  }
}

if (typeof module !== 'undefined') module.exports = ReaderStorage;
