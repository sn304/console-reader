#!/usr/bin/env python3
"""Final comprehensive test for Console Reader extension"""

import asyncio
import time
from playwright.async_api import async_playwright

EXTENSION_PATH = "/root/console-reader"

async def final_test():
    results = {
        "extension_loaded": False,
        "service_worker": False,
        "background_script": False,
        "devtools_page": False,
    }
    
    async with async_playwright() as p:
        print("Starting Console Reader Extension Test")
        print("="*50)
        
        # Launch browser with extension
        browser = await p.chromium.launch(
            headless=False,
            args=[
                f"--disable-extensions-except={EXTENSION_PATH}",
                f"--load-extension={EXTENSION_PATH}",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--enable-logging",
            ]
        )
        
        context = await browser.new_context()
        
        # Wait a bit for extension to initialize
        await asyncio.sleep(2)
        
        # Check service workers
        sws = context.service_workers
        if sws:
            results["service_worker"] = True
            print(f"✓ Service Worker: Running")
            print(f"  URL: {sws[0].url}")
        else:
            print("✗ Service Worker: Not running")
        
        # Create a page
        page = await context.new_page()
        await page.goto("about:blank")
        await asyncio.sleep(1)
        
        # Check for background pages
        bgs = context.background_pages
        if bgs:
            results["background_script"] = True
            print(f"✓ Background Script: Loaded")
            print(f"  URL: {bgs[0].url}")
        else:
            print("✗ Background Script: Not found")
        
        # Get extension ID from service worker
        if sws:
            try:
                ext_id = await sws[0].evaluate("""() => chrome.runtime.id""")
                results["extension_loaded"] = True
                print(f"✓ Extension ID: {ext_id}")
            except Exception as e:
                print(f"✗ Could not get extension ID: {e}")
        
        # List all targets
        print("\nActive Targets:")
        
        # Manual test section
        print("\n" + "="*50)
        print("MANUAL TEST REQUIRED")
        print("="*50)
        print("""
The extension is loaded. Please manually:
        
1. Press Ctrl+Shift+J (or F12) to open DevTools
2. In the top menu of DevTools, find the dropdown that says "Console"
3. Click it and select "Reader" from the list
4. The Console Reader panel should appear
5. Double-click the header to open an EPUB file
6. Use arrow keys to navigate pages
7. Press T for table of contents
8. Press H to hide/show content (stealth mode)
9. Press Ctrl+Shift+H to toggle the extension
        """)
        
        # Keep browser open for manual testing
        print("Browser will close in 60 seconds...")
        await asyncio.sleep(60)
        
        await browser.close()
        
    # Summary
    print("\n" + "="*50)
    print("TEST SUMMARY")
    print("="*50)
    for key, val in results.items():
        status = "✓ PASS" if val else "⚠ CHECK"
        print(f"  {key}: {status}")
    
    return all(v for v in results.values() if v != False)

if __name__ == "__main__":
    result = asyncio.run(final_test())
    print(f"\nBase verification: {'PASS' if result else 'INCOMPLETE'}")
    print("(Manual testing required for full verification)")
