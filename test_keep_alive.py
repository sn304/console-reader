#!/usr/bin/env python3
"""Test with persistent context to keep extension alive"""

import asyncio
from playwright.async_api import async_playwright

EXTENSION_PATH = "/root/console-reader"

async def test_with_persistent():
    async with async_playwright() as p:
        print("Launching persistent browser context...")
        
        # Use persistent context - better for extensions
        context = await p.chromium.launch_persistent_context(
            user_data_dir="/tmp/ext-test-profile",
            headless=False,
            args=[
                f"--disable-extensions-except={EXTENSION_PATH}",
                f"--load-extension={EXTENSION_PATH}",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ]
        )
        
        print("Browser launched!")
        
        # Immediately check for service workers
        print(f"\nService workers: {len(context.service_workers)}")
        for sw in context.service_workers:
            print(f"  ✓ SW: {sw.url}")
            
        # Check background pages
        print(f"Background pages: {len(context.background_pages)}")
        for bg in context.background_pages:
            print(f"  ✓ BG: {bg.url}")
        
        # Get extension ID
        if context.service_workers:
            try:
                ext_id = await context.service_workers[0].evaluate("() => chrome.runtime.id")
                print(f"\n✓ Extension ID: {ext_id}")
            except Exception as e:
                print(f"✗ Error: {e}")
        
        # Open a page
        page = await context.new_page()
        print(f"\nNew page created: {page.url}")
        
        # Wait and check again
        await asyncio.sleep(2)
        print(f"\nAfter 2s - Service workers: {len(context.service_workers)}")
        
        print("\n" + "="*50)
        print("Manual test - Browser is open for 90 seconds")
        print("Please open DevTools and find the 'Reader' panel")
        print("="*50)
        
        await asyncio.sleep(90)
        await context.close()
        print("Done!")

if __name__ == "__main__":
    asyncio.run(test_with_persistent())
