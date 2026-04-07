class EpubParser {
  constructor(arrayBuffer) {
    this.arrayBuffer = arrayBuffer;
    this.zip = null;
    this.metadata = {};
    this.chapters = [];
    this.content = '';
  }

  async parse() {
    this.zip = await this.extractZip(this.arrayBuffer);

    const container = await this.readXml('META-INF/container.xml');
    if (!container) return this;

    const rootfile = container.querySelector('rootfile');
    if (!rootfile) return this;

    const opfPath = rootfile.getAttribute('full-path');
    const opf = await this.readXml(opfPath);
    if (!opf) return this;

    this.parseMetadata(opf);
    this.parseSpine(opf);

    return this;
  }

  async extractZip(buffer) {
    const entries = this.findZipEntries(buffer);
    const zip = {};
    for (const entry of entries) {
      zip[entry.name] = entry.data;
    }
    return zip;
  }

  findZipEntries(buffer) {
    const entries = [];
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Find End of Central Directory
    const eocdSignature = [0x50, 0x4b, 0x05, 0x06];
    let eocdOffset = -1;
    for (let i = buffer.byteLength - 22; i >= 0; i--) {
      if (bytes[i] === eocdSignature[0] && bytes[i+1] === eocdSignature[1] &&
          bytes[i+2] === eocdSignature[2] && bytes[i+3] === eocdSignature[3]) {
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
      if (bytes[cdPos] !== 0x50 || bytes[cdPos+1] !== 0x4b ||
          bytes[cdPos+2] !== 0x01 || bytes[cdPos+3] !== 0x02) break;

      const nameLen = view.getUint16(cdPos + 28);
      const extraLen = view.getUint16(cdPos + 30);
      const commentLen = view.getUint16(cdPos + 32);
      const localHeaderOffset = view.getUint32(cdPos + 42);
      const compressionMethod = view.getUint16(cdPos + 10);

      const name = new TextDecoder('utf-8').decode(
        bytes.slice(cdPos + 46, cdPos + 46 + nameLen)
      );

      // Parse local file header
      const localCompressedSize = view.getUint32(localHeaderOffset + 18);
      const localNameLen = view.getUint16(localHeaderOffset + 26);
      const localExtraLen = view.getUint16(localHeaderOffset + 28);

      const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;
      let compressedData = bytes.slice(dataOffset, dataOffset + localCompressedSize);

      let decompressed;
      if (compressionMethod === 0) {
        // Stored (no compression)
        decompressed = compressedData;
      } else if (compressionMethod === 8) {
        // Deflate
        decompressed = this.inflate(compressedData);
      } else {
        decompressed = compressedData;
      }

      // Normalize path
      const normalizedName = name.replace(/^\.\//, '').replace(/\\/g, '/');
      entries.push({ name: normalizedName, data: decompressed });
      cdPos += 46 + nameLen + extraLen + commentLen;
    }

    return entries;
  }

  inflate(data) {
    // Simple DEFLATE decompressor
    try {
      const result = [];
      let offset = 0;

      while (offset < data.length) {
        // Read block header
        const b = data[offset++];
        const isFinal = b & 0x80;
        const blockType = (b >> 1) & 0x03;

        if (blockType === 0) {
          // No compression
          const len = data[offset] | (data[offset + 1] << 8);
          offset += 2;
          for (let i = 0; i < len && offset < data.length; i++) {
            result.push(data[offset++]);
          }
        } else if (blockType === 1 || blockType === 2) {
          // Compressed with fixed or dynamic Huffman codes
          // Use minimal implementation for common case
          const litCodes = this.buildFixedLiteralLengthCodes();
          const distCodes = this.buildFixedDistanceCodes();

          let bits = 0, bitsLen = 0;
          const getBits = (n) => {
            while (bitsLen < n && offset < data.length) {
              bits = (bits << 8) | data[offset++];
              bitsLen += 8;
            }
            const val = bits >> (bitsLen - n);
            bits &= (1 << (bitsLen - n)) - 1;
            bitsLen -= n;
            return val;
          };

          while (true) {
            const code = getBits(15);
            let symbol = litCodes[code];
            if (!symbol) symbol = this.decodeSymbol(data, getBits, litCodes, distCodes);
            if (symbol === 256) break;

            if (symbol < 256) {
              result.push(symbol);
            } else {
              const length = this.getLength(symbol, data, getBits);
              const distCode = getBits(6);
              const distance = this.getDistance(distCodes, distCode);
              const start = result.length - distance;
              for (let i = 0; i < length && start + i >= 0; i++) {
                result.push(result[start + i]);
              }
            }
          }
        } else {
          // Invalid block type
          break;
        }
      }

      return new Uint8Array(result);
    } catch (e) {
      // Fallback: return as-is
      return data;
    }
  }

  buildFixedLiteralLengthCodes() {
    const codes = new Array(288);
    for (let i = 0; i < 144; i++) codes[i] = 48 + i;
    for (let i = 144; i < 256; i++) codes[i] = 400 + i - 144;
    for (let i = 256; i < 280; i++) codes[i] = 192 + i - 256;
    for (let i = 280; i < 288; i++) codes[i] = 400 + i - 280;
    return codes;
  }

  buildFixedDistanceCodes() {
    return new Array(32).fill(0).map((_, i) => i);
  }

  decodeSymbol(data, getBits, litCodes, distCodes) {
    return 0; // Simplified fallback
  }

  getLength(symbol, data, getBits) {
    if (symbol <= 264) return symbol - 257 + 3;
    if (symbol <= 268) return (symbol - 265) * 4 + getBits(3) + 11;
    if (symbol <= 272) return (symbol - 269) * 8 + getBits(7) + 19;
    if (symbol <= 276) return (symbol - 273) * 16 + getBits(8) + 35;
    return (symbol - 277) * 32 + getBits(9) + 67;
  }

  getDistance(distCodes, code) {
    return code + 1;
  }

  async readXml(path) {
    // Try exact match first
    let content = this.zip[path];
    if (!content) {
      // Try with normalized path
      const normalized = path.replace(/\\/g, '/');
      content = this.zip[normalized];
      // Try lowercase
      if (!content) {
        const lower = path.toLowerCase().replace(/\\/g, '/');
        content = this.zip[lower];
      }
    }
    if (!content) return null;

    const text = new TextDecoder('utf-8').decode(content);
    const parser = new DOMParser();
    return parser.parseFromString(text, 'text/xml');
  }

  parseMetadata(opf) {
    const dcNs = 'http://purl.org/dc/elements/1.1/';
    const ns = 'urn:oasis:names:tc:opendocument:xmlns:container';

    let title = opf.querySelector(`metadata ${dcNs}title`) ||
                opf.querySelector('metadata title') ||
                opf.querySelector('title');
    let creator = opf.querySelector(`metadata ${dcNs}creator`) ||
                  opf.querySelector('metadata creator') ||
                  opf.querySelector('creator');

    this.metadata = {
      title: title?.textContent?.trim() || 'Unknown Title',
      creator: creator?.textContent?.trim() || 'Unknown Author'
    };
  }

  parseSpine(opf) {
    const manifest = {};
    const items = opf.querySelectorAll('manifest item');
    items.forEach(item => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type');
      if (href && (mediaType?.includes('html') || mediaType?.includes('xml') || !mediaType)) {
        manifest[id] = href;
      }
    });

    const spineItems = opf.querySelectorAll('spine itemref');
    let index = 0;
    spineItems.forEach((item) => {
      const idref = item.getAttribute('idref');
      let href = manifest[idref];
      if (href) {
        // Resolve relative to OPF path
        const opfDir = this.getOpfDirectory();
        if (opfDir && !href.startsWith(opfDir)) {
          href = opfDir + '/' + href;
        }
        this.chapters.push({
          index: index++,
          href: href.replace(/^\.\//, ''),
          title: `Chapter ${index}`
        });
      }
    });
  }

  getOpfDirectory() {
    // Extract directory path from OPF location
    const opfItems = Object.keys(this.zip).filter(k => k.endsWith('.opf'));
    if (opfItems.length > 0) {
      const parts = opfItems[0].split('/');
      if (parts.length > 1) {
        return parts.slice(0, -1).join('/');
      }
    }
    return '';
  }

  async getChapterContent(index) {
    const chapter = this.chapters[index];
    if (!chapter) return '';

    let content = this.zip[chapter.href];
    if (!content) {
      // Try without leading ./
      const normalized = chapter.href.replace(/^\.\//, '');
      content = this.zip[normalized];
    }

    if (!content) {
      // Try to find by partial match
      const hrefLower = chapter.href.toLowerCase();
      for (const [name, data] of Object.entries(this.zip)) {
        if (name.toLowerCase().includes(hrefLower) ||
            hrefLower.includes(name.toLowerCase().replace(/^.*\//, ''))) {
          content = data;
          break;
        }
      }
    }

    if (!content) return '';

    const text = new TextDecoder('utf-8').decode(content);

    // Extract text from HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');

    // Get title
    const titleEl = doc.querySelector('h1, h2, h3, title');
    if (titleEl) {
      chapter.title = titleEl.textContent.trim().substring(0, 100);
    }

    // Get body text - remove scripts and styles
    const scripts = doc.querySelectorAll('script, style');
    scripts.forEach(s => s.remove());

    let body = doc.querySelector('body');
    if (!body) body = doc.querySelector('section, article, div[role="main"]') || doc.body;

    if (!body) return doc.body?.textContent?.trim() || '';

    // Clean and return text
    return this.cleanText(body.textContent || '');
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }
}

if (typeof module !== 'undefined') module.exports = EpubParser;
