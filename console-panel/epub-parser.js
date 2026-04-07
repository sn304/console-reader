class EpubParser {
  constructor(arrayBuffer) {
    this.arrayBuffer = arrayBuffer;
    this.zip = null;
    this.metadata = {};
    this.chapters = [];
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

    // Try to get proper titles from toc.ncx
    await this.parseTocNcx();

    return this;
  }

  async extractZip(buffer) {
    const zip = {};
    const bytes = new Uint8Array(buffer);

    // Find EOCD
    let eocdOffset = -1;
    for (let i = buffer.byteLength - 22; i >= 0; i--) {
      if (bytes[i] === 0x50 && bytes[i+1] === 0x4b &&
          bytes[i+2] === 0x05 && bytes[i+3] === 0x06) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) return zip;

    const view = new DataView(buffer);
    const numEntries = view.getUint16(eocdOffset + 10, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);

    let cdPos = cdOffset;
    for (let i = 0; i < numEntries; i++) {
      if (bytes[cdPos] !== 0x50 || bytes[cdPos+1] !== 0x4b ||
          bytes[cdPos+2] !== 0x01 || bytes[cdPos+3] !== 0x02) break;

      const compressionMethod = view.getUint16(cdPos + 10, true);
      const nameLen = view.getUint16(cdPos + 28, true);
      const extraLen = view.getUint16(cdPos + 30, true);
      const commentLen = view.getUint16(cdPos + 32, true);
      const compressedSize = view.getUint32(cdPos + 20, true);
      const localOffset = view.getUint32(cdPos + 42, true);

      const name = new TextDecoder().decode(bytes.slice(cdPos + 46, cdPos + 46 + nameLen));

      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLen + localExtraLen;

      let data;
      if (compressionMethod === 0) {
        data = bytes.slice(dataOffset, dataOffset + compressedSize);
      } else if (compressionMethod === 8) {
        const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
        if (typeof pako !== 'undefined') {
          try {
            data = pako.inflateRaw(compressed);
          } catch (e) {
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

    return zip;
  }

  async readXml(path) {
    if (!path) return null;

    const paths = [path, path.replace(/\\/g, '/'), './' + path, path.replace(/^\.\//, '')];

    for (const p of paths) {
      if (this.zip[p]) {
        return this.parseXml(this.zip[p]);
      }
    }

    const lowerPath = path.toLowerCase().replace(/\\/g, '/');
    for (const [name, data] of Object.entries(this.zip)) {
      if (name.toLowerCase().replace(/\\/g, '/') === lowerPath) {
        return this.parseXml(data);
      }
    }

    return null;
  }

  parseXml(data) {
    try {
      const text = new TextDecoder().decode(data);
      const parser = new DOMParser();
      return parser.parseFromString(text, 'text/xml');
    } catch (e) {
      return null;
    }
  }

  async parseTocNcx() {
    // Try to find toc.ncx or nav
    const tocKeys = Object.keys(this.zip).filter(k =>
      k.endsWith('.ncx') || k.toLowerCase().includes('toc')
    );

    for (const tocKey of tocKeys) {
      const toc = await this.readXml(tocKey);
      if (!toc) continue;

      // NCX format uses navPoint elements
      const navPoints = toc.querySelectorAll('navPoint');
      if (navPoints.length > 0) {
        const tocTitles = {};
        navPoints.forEach(np => {
          const label = np.querySelector('navLabel text')?.textContent?.trim();
          const content = np.querySelector('content')?.getAttribute('src')?.split('#')[0];
          if (label && content) {
            // Normalize content src
            tocTitles[content.replace(/^\.\//, '')] = label;
          }
        });

        // Update chapter titles from TOC
        this.chapters.forEach(ch => {
          const href = ch.href.split('/').pop();
          for (const [src, title] of Object.entries(tocTitles)) {
            if (src.includes(href) || href.includes(src.replace(/\.[^.]+$/, ''))) {
              ch.title = title;
              break;
            }
          }
        });
        return;
      }
    }
  }

  parseMetadata(opf) {
    const getTag = (parent, name) => {
      const tags = parent.getElementsByTagName(name);
      return tags.length > 0 ? tags[0] : null;
    };

    const title = getTag(opf, 'title') ||
                  getTag(opf.getElementsByTagName('metadata')[0] || opf, 'dc:title');
    const creator = getTag(opf, 'creator') ||
                    getTag(opf.getElementsByTagName('metadata')[0] || opf, 'dc:creator');

    this.metadata = {
      title: title?.textContent?.trim() || 'Unknown',
      creator: creator?.textContent?.trim() || 'Unknown'
    };
  }

  parseSpine(opf, opfPath) {
    const manifest = {};
    const opfDir = opfPath ? opfPath.split('/').slice(0, -1).join('/') : '';

    opf.querySelectorAll('manifest item').forEach(item => {
      const id = item.getAttribute('id');
      let href = item.getAttribute('href') || '';
      const mediaType = item.getAttribute('media-type') || '';

      if (href && (mediaType.includes('html') || mediaType.includes('xml') ||
                   mediaType.includes('xhtml') || !mediaType || mediaType === 'application/xhtml+xml')) {
        if (opfDir && !href.includes('/')) {
          href = opfDir + '/' + href;
        }
        href = href.replace(/^\.\//, '').replace(/\/$/, '');
        manifest[id] = href;
      }
    });

    opf.querySelectorAll('spine itemref').forEach((item, index) => {
      const idref = item.getAttribute('idref');
      const href = manifest[idref];
      if (href) {
        this.chapters.push({ index, href, title: `Chapter ${index + 1}` });
      }
    });

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

    doc.querySelectorAll('script, style, noscript').forEach(el => el.remove());

    // Try to get title from h1/h2 if not already set from TOC
    if (!chapter.title || chapter.title.startsWith('Chapter ')) {
      const titleEl = doc.querySelector('h1, h2, h3');
      if (titleEl?.textContent?.trim()) {
        chapter.title = titleEl.textContent.trim().substring(0, 100);
      }
    }

    const body = doc.body || doc.querySelector('main') || doc.querySelector('article');
    if (!body) return '';

    return body.textContent.replace(/\s+/g, ' ').trim();
  }
}

if (typeof module !== 'undefined') module.exports = EpubParser;
