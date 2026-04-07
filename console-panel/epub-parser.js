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
