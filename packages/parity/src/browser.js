import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export async function withBrowser(run) {
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
    return await run(browser)
  } finally {
    await browser.close()
  }
}

export async function newPage(browser, viewport) {
  return browser.newPage({
    viewport: {
      width: viewport?.width ?? 1440,
      height: viewport?.height ?? 900,
    },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  })
}

export async function preparePage(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 15000 })
  // 隐藏滚动条，避免整页截图宽度变成 1457 而不是视口宽度。
  await page.addStyleTag({
    content:
      'html{scrollbar-width:none !important}body::-webkit-scrollbar,html::-webkit-scrollbar{display:none !important}',
  })
  await page.evaluate(async () => {
    await document.fonts?.ready
  })
}

export function ensureParent(file) {
  mkdirSync(dirname(file), { recursive: true })
}

export async function screenshotFullPage(page, file, viewport) {
  const width = viewport?.width ?? page.viewportSize()?.width ?? 1440
  const minHeight = viewport?.height ?? page.viewportSize()?.height ?? 900
  const height = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
  )
  // 拉高视口再截，避免 fullPage 把宽度撑破 1440 / 390。
  await page.setViewportSize({ width, height: Math.max(height, minHeight) })
  ensureParent(file)
  await page.screenshot({ path: file, fullPage: false })
  await page.setViewportSize({ width, height: minHeight })
}
