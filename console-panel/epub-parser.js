class EpubParser {
  constructor(arrayBuffer) {
    this.arrayBuffer = arrayBuffer;
    this.zip = null;
    this.metadata = {};
    this.chapters = [];
  }

  async parse() {
    this.zip = await this.extractZip(this.arrayBuffer);

    console.log('extractZip done, ZIP keys:', Object.keys(this.zip).slice(0, 10));

    const container = await this.readXml('META-INF/container.xml');
    if (!container) {
      console.error('No container.xml found');
      return this;
    }

    const rootfile = container.querySelector('rootfile');
    if (!rootfile) {
      console.error('No rootfile in container');
      return this;
    }

    const opfPath = rootfile.getAttribute('full-path');
    const opf = await this.readXml(opfPath);
    if (!opf) {
      console.error('Could not read OPF:', opfPath);
      return this;
    }

    this.parseMetadata(opf);
    this.parseSpine(opf, opfPath);

    return this;
  }

  async extractZip(buffer) {
    const zip = {};
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    // Find EOCD (End of Central Directory)
    let eocdOffset = -1;
    for (let i = buffer.byteLength - 22; i >= 0; i--) {
      if (view.getUint32(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      console.error('No EOCD found, buffer length:', buffer.byteLength);
      return zip;
    }

    console.log('EOCD found at:', eocdOffset);
    const numEntries = view.getUint16(eocdOffset + 10);
    const cdOffset = view.getUint32(eocdOffset + 16);
    console.log('numEntries:', numEntries, 'cdOffset:', cdOffset);

    // Parse Central Directory
    let cdPos = cdOffset;
    for (let i = 0; i < numEntries; i++) {
      if (view.getUint32(cdPos) !== 0x02014b50) break;

      const compressionMethod = view.getUint16(cdPos + 10);
      const nameLen = view.getUint16(cdPos + 28);
      const extraLen = view.getUint16(cdPos + 30);
      const commentLen = view.getUint16(cdPos + 32);
      const compressedSize = view.getUint32(cdPos + 20);
      const localOffset = view.getUint32(cdPos + 42);

      const name = new TextDecoder().decode(bytes.slice(cdPos + 46, cdPos + 46 + nameLen));

      // Read from local header
      const localNameLen = view.getUint16(localOffset + 26);
      const localExtraLen = view.getUint16(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLen + localExtraLen;

      let data;
      if (compressionMethod === 0) {
        // Stored
        data = bytes.slice(dataOffset, dataOffset + compressedSize);
      } else if (compressionMethod === 8) {
        // Deflate (raw, no zlib header)
        const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
        if (typeof pako !== 'undefined') {
          try {
            data = pako.inflateRaw(compressed);
          } catch (e) {
            console.error('Inflate failed:', name, e.message);
            data = compressed;
          }
        } else {
          data = compressed;
        }
      }

      const normalizedName = name.replace(/^\.\//, '').replace(/\\/g, '/');
      if (normalizedName && !normalizedName.endsWith('/')) {
        zip[normalizedName] = data;
      }

      cdPos += 46 + nameLen + extraLen + commentLen;
    }

    console.log('ZIP extracted, total keys:', Object.keys(zip).length);
    return zip;
  }

  async readXml(path) {
    if (!path) return null;

    // Try exact match first
    if (this.zip[path]) {
      return this.parseXml(this.zip[path]);
    }

    // Try various normalizations
    const paths = [
      path,
      path.replace(/\\/g, '/'),
      './' + path,
      path.replace(/^\.\//, ''),
    ];

    for (const p of paths) {
      if (this.zip[p]) {
        return this.parseXml(this.zip[p]);
      }
    }

    // Case-insensitive search
    const lowerPath = path.toLowerCase().replace(/\\/g, '/');
    for (const [name, data] of Object.entries(this.zip)) {
      if (name.toLowerCase().replace(/\\/g, '/') === lowerPath) {
        return this.parseXml(data);
      }
    }

    console.error('XML not found:', path, 'Available:', Object.keys(this.zip).slice(0, 10));
    return null;
  }

  parseXml(data) {
    try {
      const text = new TextDecoder().decode(data);
      const parser = new DOMParser();
      return parser.parseFromString(text, 'text/xml');
    } catch (e) {
      console.error('XML parse error:', e);
      return null;
    }
  }

  parseMetadata(opf) {
    const dcNs = 'http://purl.org/dc/elements/1.1/';

    const title = opf.querySelector(`metadata ${dcNs}title`) ||
                  opf.querySelector('metadata title') ||
                  opf.querySelector('title');
    const creator = opf.querySelector(`metadata ${dcNs}creator`) ||
                    opf.querySelector('metadata creator') ||
                    opf.querySelector('creator');

    this.metadata = {
      title: title?.textContent?.trim() || 'Unknown',
      creator: creator?.textContent?.trim() || 'Unknown'
    };
  }

  parseSpine(opf, opfPath) {
    const manifest = {};
    const opfDir = opfPath ? opfPath.split('/').slice(0, -1).join('/') : '';

    // Build manifest lookup
    opf.querySelectorAll('manifest item').forEach(item => {
      const id = item.getAttribute('id');
      let href = item.getAttribute('href') || '';
      const mediaType = item.getAttribute('media-type') || '';

      // Skip non-HTML content
      if (href && (mediaType.includes('html') || mediaType.includes('xml') ||
                   mediaType.includes('xhtml') || !mediaType || mediaType === 'application/xhtml+xml')) {
        if (opfDir && !href.includes('/')) {
          href = opfDir + '/' + href;
        }
        href = href.replace(/^\.\//, '').replace(/\/$/, '');
        manifest[id] = href;
      }
    });

    // Parse spine for chapter order
    opf.querySelectorAll('spine itemref').forEach((item, index) => {
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

    // Fallback: find HTML files if no spine
    if (this.chapters.length === 0) {
      Object.keys(this.zip)
        .filter(k => (k.endsWith('.html') || k.endsWith('.xhtml')) &&
                     !k.toLowerCase().includes('cover') &&
                     !k.toLowerCase().includes('toc') &&
                     !k.toLowerCase().includes('nav'))
        .sort()
        .forEach((href, i) => {
          this.chapters.push({ index: i, href, title: `Chapter ${i + 1}` });
        });
    }
  }

  async getChapterContent(index) {
    const chapter = this.chapters[index];
    if (!chapter) return '';

    let content = this.zip[chapter.href];

    // Try to find with different paths
    if (!content) {
      const searchName = chapter.href.split('/').pop();
      for (const [name, data] of Object.entries(this.zip)) {
        if (name.endsWith(searchName) || name.includes(searchName.replace('.html', ''))) {
          content = data;
          chapter.href = name;
          break;
        }
      }
    }

    if (!content) return '';

    const text = new TextDecoder().decode(content);
    const doc = new DOMParser().parseFromString(text, 'text/html');

    // Remove scripts/styles
    doc.querySelectorAll('script, style, noscript').forEach(el => el.remove());

    // Get title
    const titleEl = doc.querySelector('h1, h2, h3, title');
    if (titleEl) {
      chapter.title = titleEl.textContent.trim().substring(0, 100);
    }

    // Get body text
    const body = doc.body || doc.querySelector('main') || doc.querySelector('article');
    if (!body) return '';

    return body.textContent.replace(/\s+/g, ' ').trim();
  }
}

if (typeof module !== 'undefined') module.exports = EpubParser;
