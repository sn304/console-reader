class EpubParser {
  constructor(arrayBuffer) {
    this.arrayBuffer = arrayBuffer;
    this.zip = null;
    this.metadata = {};
    this.chapters = [];
    this.content = '';
    this.debug = [];
  }

  async parse() {
    this.zip = await this.extractZip(this.arrayBuffer);
    console.log('ZIP entries:', Object.keys(this.zip).slice(0, 30));

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
    console.log('OPF path:', opfPath);

    const opf = await this.readXml(opfPath);
    if (!opf) {
      console.error('Could not read OPF file:', opfPath);
      return this;
    }

    this.parseMetadata(opf);
    this.parseSpine(opf, opfPath);
    console.log('Chapters found:', this.chapters.length, this.chapters);

    return this;
  }

  async extractZip(buffer) {
    const zip = {};

    // Find all local file headers
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    while (offset < buffer.byteLength - 4) {
      // Check for local file header signature
      if (bytes[offset] === 0x50 && bytes[offset+1] === 0x4b &&
          bytes[offset+2] === 0x03 && bytes[offset+3] === 0x04) {

        const nameLen = bytes[offset + 26] | (bytes[offset + 27] << 8);
        const extraLen = bytes[offset + 28] | (bytes[offset + 29] << 8);
        const compressionMethod = bytes[offset + 8] | (bytes[offset + 9] << 8);
        const compressedSize = bytes[offset + 18] | (bytes[offset + 19] << 8) |
                              (bytes[offset + 20] << 16) | (bytes[offset + 21] << 24);
        const uncompressedSize = bytes[offset + 22] | (bytes[offset + 23] << 8) |
                                (bytes[offset + 24] << 16) | (bytes[offset + 25] << 24);

        const name = new TextDecoder('utf-8').decode(
          bytes.slice(offset + 30, offset + 30 + nameLen)
        );

        const dataOffset = offset + 30 + nameLen + extraLen;
        let data;

        if (compressionMethod === 0) {
          // Stored
          data = bytes.slice(dataOffset, dataOffset + compressedSize);
        } else if (compressionMethod === 8) {
          // Deflate
          const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
          if (typeof pako !== 'undefined') {
            try {
              data = pako.inflate(compressed);
            } catch (e) {
              console.error('Inflate failed for:', name, e);
              data = compressed;
            }
          } else {
            data = compressed;
          }
        } else {
          data = bytes.slice(dataOffset, dataOffset + compressedSize);
        }

        // Normalize path
        const normalizedName = name.replace(/^\.\//, '').replace(/\\/g, '/');
        if (normalizedName && !normalizedName.endsWith('/')) {
          zip[normalizedName] = data;
        }

        // Move to next entry
        offset = dataOffset + (compressionMethod === 0 ? compressedSize : compressed.length);
      } else {
        offset++;
      }
    }

    // Fallback: also try central directory method
    if (Object.keys(zip).length === 0) {
      console.log('Trying central directory method...');
      this.findViaCentralDirectory(buffer, zip);
    }

    return zip;
  }

  findViaCentralDirectory(buffer, zip) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    // Find EOCD
    for (let i = buffer.byteLength - 22; i >= 0; i--) {
      if (bytes[i] === 0x50 && bytes[i+1] === 0x4b &&
          bytes[i+2] === 0x05 && bytes[i+3] === 0x06) {

        const numEntries = view.getUint16(i + 10);
        const cdOffset = view.getUint32(i + 16);
        console.log('Found EOCD: entries=', numEntries, 'cdOffset=', cdOffset);

        // Parse CD
        let cdPos = cdOffset;
        for (let j = 0; j < numEntries; j++) {
          if (bytes[cdPos] !== 0x50 || bytes[cdPos+1] !== 0x4b ||
              bytes[cdPos+2] !== 0x01 || bytes[cdPos+3] !== 0x02) break;

          const nameLen = view.getUint16(cdPos + 28);
          const extraLen = view.getUint16(cdPos + 30);
          const commentLen = view.getUint16(cdPos + 32);
          const localOffset = view.getUint32(cdPos + 42);
          const compressionMethod = view.getUint16(cdPos + 10);
          const compressedSize = view.getUint32(cdPos + 20);
          const uncompressedSize = view.getUint32(cdPos + 24);

          const name = new TextDecoder('utf-8').decode(
            bytes.slice(cdPos + 46, cdPos + 46 + nameLen)
          );

          // Read from local header
          const localNameLen = view.getUint16(localOffset + 26);
          const localExtraLen = view.getUint16(localOffset + 28);
          const dataOffset = localOffset + 30 + localNameLen + localExtraLen;

          let data;
          if (compressionMethod === 0) {
            data = bytes.slice(dataOffset, dataOffset + compressedSize);
          } else if (compressionMethod === 8) {
            const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
            if (typeof pako !== 'undefined') {
              try {
                data = pako.inflate(compressed);
              } catch (e) {
                console.error('Inflate failed:', name);
                data = compressed;
              }
            } else {
              data = compressed;
            }
          } else {
            data = bytes.slice(dataOffset, dataOffset + compressedSize);
          }

          const normalizedName = name.replace(/^\.\//, '').replace(/\\/g, '/');
          if (normalizedName && !normalizedName.endsWith('/')) {
            zip[normalizedName] = data;
          }

          cdPos += 46 + nameLen + extraLen + commentLen;
        }
        break;
      }
    }
  }

  async readXml(path) {
    if (!path) return null;

    const paths = [
      path,
      path.replace(/\\/g, '/'),
      './' + path,
      path.replace(/^\.\//, ''),
    ];

    for (const p of paths) {
      if (this.zip[p]) {
        const text = new TextDecoder('utf-8').decode(this.zip[p]);
        const parser = new DOMParser();
        return parser.parseFromString(text, 'text/xml');
      }
    }

    // Try case-insensitive match
    const lowerPath = path.toLowerCase().replace(/\\/g, '/');
    for (const [name, data] of Object.entries(this.zip)) {
      if (name.toLowerCase().replace(/\\/g, '/') === lowerPath) {
        const text = new TextDecoder('utf-8').decode(data);
        const parser = new DOMParser();
        return parser.parseFromString(text, 'text/xml');
      }
    }

    return null;
  }

  parseMetadata(opf) {
    const dcNs = 'http://purl.org/dc/elements/1.1/';

    const title = opf.querySelector(`metadata ${dcNs}title`) ||
                  opf.querySelector('metadata title') ||
                  opf.querySelector('dc\\:title') ||
                  opf.querySelector('title');
    const creator = opf.querySelector(`metadata ${dcNs}creator`) ||
                    opf.querySelector('metadata creator') ||
                    opf.querySelector('dc\\:creator') ||
                    opf.querySelector('creator');

    this.metadata = {
      title: title?.textContent?.trim() || 'Unknown',
      creator: creator?.textContent?.trim() || 'Unknown'
    };
    console.log('Metadata:', this.metadata);
  }

  parseSpine(opf, opfPath) {
    const manifest = {};
    const opfDir = opfPath ? opfPath.split('/').slice(0, -1).join('/') : '';

    // Build manifest
    const items = opf.querySelectorAll('manifest item');
    items.forEach(item => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type') || '';

      if (href) {
        let fullHref = href;
        if (opfDir && !href.includes('/')) {
          fullHref = opfDir + '/' + href;
        }
        fullHref = fullHref.replace(/^\.\//, '').replace(/\/$/, '');
        manifest[id] = fullHref;
      }
    });
    console.log('Manifest:', manifest);

    // Parse spine
    const spineItems = opf.querySelectorAll('spine itemref');
    let index = 0;
    spineItems.forEach(item => {
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
    console.log('Spine chapters:', this.chapters.length);

    // Fallback: find HTML files
    if (this.chapters.length === 0) {
      console.log('No spine items, searching for HTML files...');
      const htmlFiles = Object.keys(this.zip).filter(k =>
        (k.endsWith('.html') || k.endsWith('.xhtml') || k.endsWith('.htm')) &&
        !k.toLowerCase().includes('toc') &&
        !k.toLowerCase().includes('nav') &&
        !k.toLowerCase().includes('cover')
      ).sort();

      htmlFiles.forEach((href, i) => {
        this.chapters.push({
          index: i,
          href: href.replace(/^\.\//, ''),
          title: `Chapter ${i + 1}`
        });
      });
      console.log('HTML chapters:', this.chapters.length, htmlFiles);
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

    // Try to find
    for (const p of searchPaths) {
      if (this.zip[p]) {
        content = this.zip[p];
        break;
      }
    }

    // Partial match
    if (!content) {
      const searchName = chapter.href.split('/').pop()
        .replace(/\.[^.]+$/, '').toLowerCase();
      for (const [name, data] of Object.entries(this.zip)) {
        const nameLower = name.replace(/\.[^.]+$/, '').toLowerCase();
        if (nameLower.includes(searchName) || searchName.includes(nameLower)) {
          content = data;
          chapter.href = name;
          break;
        }
      }
    }

    if (!content) {
      console.error('Chapter not found:', chapter.href);
      return '';
    }

    const text = new TextDecoder('utf-8').decode(content);
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');

    doc.querySelectorAll('script, style, noscript').forEach(el => el.remove());

    const titleEl = doc.querySelector('h1, h2, h3, title');
    if (titleEl) {
      chapter.title = titleEl.textContent.trim().substring(0, 100);
    }

    const body = doc.body || doc.querySelector('main') || doc.querySelector('article') || doc.body;

    return this.cleanText(body?.textContent || doc.documentElement?.textContent || '');
  }

  cleanText(text) {
    return text
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .replace(/\t/g, ' ').replace(/ +/g, ' ')
      .replace(/\n +\n/g, '\n\n').replace(/ +\n/g, '\n').replace(/\n +/g, '\n')
      .trim();
  }
}

if (typeof module !== 'undefined') module.exports = EpubParser;
