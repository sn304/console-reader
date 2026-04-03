#!/usr/bin/env python3
"""Test the panel.html directly"""

import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

EXTENSION_PATH = "/root/console-reader"

async def test_panel_html():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ]
        )

        context = await browser.new_context()
        page = await context.new_page()

        # Collect console messages
        errors = []
        page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)
        page.on("pageerror", lambda err: errors.append(f"[pageerror] {err}"))

        # Load the panel HTML directly (this is what DevTools would load)
        panel_url = f"file://{EXTENSION_PATH}/console-panel/panel.html"
        print(f"Loading: {panel_url}")

        try:
            await page.goto(panel_url)
            await page.wait_for_timeout(2000)

            # Check if content loaded
            title = await page.title()
            print(f"Page title: {title}")

            # Check for visible elements
            body_text = await page.inner_text("body")
            print(f"Body content preview: {body_text[:200]}...")

            if errors:
                print("\n❌ Console errors found:")
                for e in errors:
                    print(f"  {e}")
            else:
                print("\n✓ Panel HTML loaded without errors")

        except Exception as e:
            print(f"❌ Error loading panel: {e}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(test_panel_html())
