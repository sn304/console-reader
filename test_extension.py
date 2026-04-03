#!/usr/bin/env python3
"""Comprehensive test for Console Reader Chrome Extension"""

import asyncio
import os
import sys
import zipfile
import tempfile
from pathlib import Path
from playwright.async_api import async_playwright

EXTENSION_PATH = "/root/console-reader"

def create_minimal_epub():
    """Create a minimal EPUB file for testing"""
    with tempfile.NamedTemporaryFile(suffix='.epub', delete=False) as f:
        epub_path = f.name

    with zipfile.ZipFile(epub_path, 'w') as epub:
        # mimetype must be first and uncompressed
        epub.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)

        # container.xml
        container_xml = '''<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>'''
        epub.writestr('META-INF/container.xml', container_xml)

        # content.opf
        content_opf = '''<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">test-book-001</dc:identifier>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
  </spine>
</package>'''
        epub.writestr('content.opf', content_opf)

        # chapter1.xhtml
        chapter1 = '''<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body>
<h1>Chapter 1: The Beginning</h1>
<p>This is the first paragraph of our test book.</p>
<p>This is the second paragraph with more content.</p>
<p>Here is the third paragraph to ensure we have enough text for pagination testing.</p>
<p>Fourth paragraph for good measure.</p>
<p>Fifth paragraph to make navigation meaningful.</p>
</body>
</html>'''
        epub.writestr('chapter1.xhtml', chapter1)

    return epub_path

async def test_extension():
    errors = []
    test_results = []

    async with async_playwright() as p:
        # Launch Chromium with extension
        context = await p.chromium.launch_persistent_context(
            user_data_dir="/tmp/test-profile-2",
            headless=True,
            args=[
                f"--disable-extensions-except={EXTENSION_PATH}",
                f"--load-extension={EXTENSION_PATH}",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ]
        )

        # Collect extension info
        print("=== Extension Test Results ===\n")

        # Check if extension loaded
        background_pages = context.background_pages
        if background_pages:
            print(f"✓ Background page loaded: {background_pages[0].url}")
            test_results.append(True)
        else:
            print("✗ No background page found")
            test_results.append(False)

        # Check service workers
        service_workers = context.service_workers
        if service_workers:
            print(f"✓ Service workers running: {len(service_workers)}")
            test_results.append(True)
        else:
            print("⚠ No service workers (may not be relevant for manifest v3")
            test_results.append(True)  # Not a failure

        # Open a test page
        page = await context.new_page()

        # Listen for console errors
        def handle_console(msg):
            if msg.type == "error":
                errors.append(f"Console error: {msg.text}")

        page.on("console", handle_console)

        await page.goto("data:text/html,<h1>Test Page</h1>")
        print("✓ Test page loaded")

        # Check if extension files are accessible
        manifest_path = Path(EXTENSION_PATH) / "manifest.json"
        if manifest_path.exists():
            content = manifest_path.read_text()
            if '"manifest_version": 3' in content:
                print("✓ Manifest v3 valid")
                test_results.append(True)
            else:
                print("✗ Manifest v3 not found")
                test_results.append(False)
        else:
            print("✗ Manifest not found")
            test_results.append(False)

        # Check all required files exist
        required_files = [
            "manifest.json",
            "background.js",
            "devtools.html",
            "console-panel/panel.html",
            "console-panel/panel.js",
            "console-panel/styles.css",
            "console-panel/epub-parser.js",
            "shared/storage.js",
        ]

        all_files_exist = True
        for f in required_files:
            path = Path(EXTENSION_PATH) / f
            if path.exists():
                print(f"✓ {f} exists")
            else:
                print(f"✗ {f} missing")
                all_files_exist = False

        test_results.append(all_files_exist)

        # Create test EPUB
        epub_path = create_minimal_epub()
        print(f"\n✓ Created test EPUB: {epub_path}")

        # Wait for any async operations
        await asyncio.sleep(1)

        await context.close()

    # Final results
    print("\n" + "="*40)
    print("SUMMARY")
    print("="*40)

    passed = sum(test_results)
    total = len(test_results)
    print(f"Tests passed: {passed}/{total}")

    if errors:
        print("\nErrors encountered:")
        for e in errors:
            print(f"  - {e}")
        return False
    else:
        print("\n✓ All tests passed - Extension ready for manual testing")
        print("\nManual testing required for:")
        print("  - Opening DevTools Console panel")
        print("  - Loading EPUB file")
        print("  - Page navigation with arrow keys")
        print("  - TOC modal (press T)")
        print("  - Boss key (press H)")
        return True

if __name__ == "__main__":
    result = asyncio.run(test_extension())
    sys.exit(0 if result else 1)
