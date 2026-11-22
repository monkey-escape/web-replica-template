import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export async function withBrowser(viewport, run) {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch (error) {
    throw new Error(
      `Playwright is not installed. Run pnpm install from the repo root. ${error.message}`,
    )
  }

  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (error) {
    throw new Error(`Could not launch Chromium. Install it with pnpm browsers.\n${error.message}`)
  }

  try {
    const page = await browser.newPage({
      viewport: {
        width: viewport?.width ?? 1280,
        height: viewport?.height ?? 720,
      },
      deviceScaleFactor: 1,
      colorScheme: 'light',
    })
    return await run(page)
  } finally {
    await browser.close()
  }
}

export async function preparePage(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 15000 })
  await page.evaluate(async () => {
    await document.fonts?.ready
  })
}

export function ensureParent(file) {
  mkdirSync(dirname(file), { recursive: true })
}
