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
    this.parseSpine(opf, opfPath);

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

    // Find End of Central Directory signature
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
      const compressedSize = view.getUint32(cdPos + 20);
      const uncompressedSize = view.getUint32(cdPos + 24);

      const name = new TextDecoder('utf-8').decode(
        bytes.slice(cdPos + 46, cdPos + 46 + nameLen)
      );

      // Parse local file header
      const localNameLen = view.getUint16(localHeaderOffset + 26);
      const localExtraLen = view.getUint16(localHeaderOffset + 28);

      const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;
      let compressedData = bytes.slice(dataOffset, dataOffset + compressedSize);

      let decompressed;
      if (compressionMethod === 0) {
        // Stored - no compression
        decompressed = compressedData;
      } else if (compressionMethod === 8) {
        // Deflate - use pako if available, otherwise return raw
        if (typeof pako !== 'undefined') {
          try {
            decompressed = pako.inflate(compressedData);
          } catch (e) {
            console.warn('Pako inflate failed:', e);
            decompressed = compressedData;
          }
        } else {
          // Fallback: return as-is (may be garbage)
          console.warn('Pako not available, returning compressed data');
          decompressed = compressedData;
        }
      } else {
        decompressed = compressedData;
      }

      // Normalize path
      const normalizedName = name.replace(/^\.\//, '').replace(/\\/g, '/').replace(/\/$/, '');
      if (normalizedName) {
        entries.push({ name: normalizedName, data: decompressed });
      }
      cdPos += 46 + nameLen + extraLen + commentLen;
    }

    return entries;
  }

  async readXml(path) {
    if (!path) return null;

    // Try various path normalizations
    const paths = [
      path,
      path.replace(/\\/g, '/'),
      './' + path,
      path.replace(/^\.\//, ''),
      path.toLowerCase(),
    ];

    for (const p of paths) {
      if (this.zip[p]) {
        const text = new TextDecoder('utf-8').decode(this.zip[p]);
        const parser = new DOMParser();
        return parser.parseFromString(text, 'text/xml');
      }
    }

    return null;
  }

  parseMetadata(opf) {
    const dcNs = 'http://purl.org/dc/elements/1.1/';

    let title = opf.querySelector(`metadata ${dcNs}title`) ||
                opf.querySelector('metadata title') ||
                opf.querySelector('dc\\:title') ||
                opf.querySelector('title');
    let creator = opf.querySelector(`metadata ${dcNs}creator`) ||
                  opf.querySelector('metadata creator') ||
                  opf.querySelector('dc\\:creator') ||
                  opf.querySelector('creator');

    this.metadata = {
      title: title?.textContent?.trim() || 'Unknown Title',
      creator: creator?.textContent?.trim() || 'Unknown Author'
    };
  }

  parseSpine(opf, opfPath) {
    const manifest = {};
    const opfDir = opfPath ? opfPath.split('/').slice(0, -1).join('/') : '';

    const items = opf.querySelectorAll('manifest item');
    items.forEach(item => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type') || '';

      if (href && (mediaType.includes('html') || mediaType.includes('xml') ||
                   mediaType.includes('xhtml') || !mediaType || mediaType === 'application/xhtml+xml')) {
        let fullHref = href;
        if (opfDir && href.indexOf('/') === -1 && opfDir) {
          fullHref = opfDir + '/' + href;
        }
        fullHref = fullHref.replace(/^\.\//, '').replace(/\/$/, '');
        manifest[id] = fullHref;
      }
    });

    const spineItems = opf.querySelectorAll('spine itemref');
    let index = 0;
    spineItems.forEach((item) => {
      const idref = item.getAttribute('idref');
      const href = manifest[idref];
      if (href) {
        this.chapters.push({
          index: index++,
          href: href,
          title: `Chapter ${index}`
        });
      }
    });

    // If no chapters from spine, try to find HTML files
    if (this.chapters.length === 0) {
      const htmlFiles = Object.keys(this.zip).filter(k =>
        (k.endsWith('.html') || k.endsWith('.xhtml') || k.endsWith('.htm')) &&
        !k.toLowerCase().includes('toc') && !k.toLowerCase().includes('nav')
      );
      htmlFiles.forEach((href, i) => {
        this.chapters.push({
          index: i,
          href: href.replace(/^\.\//, ''),
          title: `Chapter ${i + 1}`
        });
      });
    }
  }

  async getChapterContent(index) {
    const chapter = this.chapters[index];
    if (!chapter) return '';

    let content = null;
    const searchPaths = [
      chapter.href,
      chapter.href.replace(/^\.\//, ''),
      decodeURIComponent(chapter.href),
      chapter.href.split('/').pop(),
    ];

    // Also try without opfDir prefix
    if (content === null) {
      const opfDir = this.getOpfDirectory();
      if (opfDir && chapter.href.startsWith(opfDir + '/')) {
        const relative = chapter.href.substring(opfDir.length + 1);
        searchPaths.push(relative);
      }
    }

    for (const p of searchPaths) {
      if (this.zip[p]) {
        content = this.zip[p];
        break;
      }
    }

    // Try partial match
    if (!content) {
      const searchName = chapter.href.split('/').pop().toLowerCase()
        .replace(/\.[^.]+$/, '');
      for (const [name, data] of Object.entries(this.zip)) {
        const nameLower = name.toLowerCase().replace(/\.[^.]+$/, '');
        if (nameLower.includes(searchName) || searchName.includes(nameLower)) {
          content = data;
          chapter.href = name;
          break;
        }
      }
    }

    if (!content) {
      console.warn('Could not find chapter:', chapter.href);
      console.warn('Available files:', Object.keys(this.zip).slice(0, 20));
      return '';
    }

    const text = new TextDecoder('utf-8').decode(content);

    // Parse HTML and extract text
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');

    // Remove unwanted elements
    doc.querySelectorAll('script, style, noscript, iframe, object, embed').forEach(el => el.remove());

    // Get title
    const titleEl = doc.querySelector('h1, h2, h3, title');
    if (titleEl) {
      chapter.title = titleEl.textContent.trim().substring(0, 100);
    }

    // Get body or main content
    const body = doc.querySelector('body') ||
                 doc.querySelector('section[role="main"]') ||
                 doc.querySelector('main') ||
                 doc.querySelector('article') ||
                 doc.body;

    if (!body) {
      return doc.documentElement?.textContent?.trim() || '';
    }

    return this.cleanText(body.textContent || '');
  }

  getOpfDirectory() {
    for (const name of Object.keys(this.zip)) {
      if (name.endsWith('.opf')) {
        const parts = name.split('/');
        if (parts.length > 1) {
          return parts.slice(0, -1).join('/');
        }
      }
    }
    return '';
  }

  cleanText(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[ ]+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .replace(/ +\n/g, '\n')
      .replace(/\n +/g, '\n')
      .trim();
  }
}

if (typeof module !== 'undefined') module.exports = EpubParser;
