import { preparePage, withBrowser } from './browser.js'
import { loadProfile, structureDocument } from './profile.js'
import { repoRoot, routeUrl } from './paths.js'
import { compareStructure, readStructure } from './structure.js'

async function runChecks(page, checks) {
  const failures = []
  for (const check of checks ?? []) {
    if (check.action !== 'click') {
      failures.push({
        kind: 'interaction',
        key: 'interactions',
        item: `${check.name}: unsupported action`,
      })
      continue
    }
    try {
      await page.locator(check.selector).click()
      if (check.expectText) {
        const status = page.locator(check.expectText.selector)
        // 点击后的请求是异步的，先等到期望文本出现，再读最终内容。
        await status.filter({ hasText: check.expectText.includes }).waitFor({ timeout: 5000 })
        const text = (await status.innerText()).replace(/\s+/g, ' ').trim()
        if (!text.includes(check.expectText.includes)) {
          failures.push({
            kind: 'interaction',
            key: 'interactions',
            item: `${check.name}: expected "${check.expectText.includes}", got "${text}"`,
          })
        }
      }
    } catch (error) {
      failures.push({
        kind: 'interaction',
        key: 'interactions',
        item: `${check.name}: ${error.message}`,
      })
    }
  }
  return failures
}

async function assertReachable(url) {
  try {
    const response = await fetch(url, { redirect: 'manual' })
    if (response.status >= 500) throw new Error(`status ${response.status}`)
  } catch (error) {
    throw new Error(
      `Web server is not reachable at ${url}. Start it with pnpm dev:web. ${error.message}`,
    )
  }
}

export async function measureSite(siteId, root = repoRoot) {
  const profile = loadProfile(siteId, root)
  const { document } = structureDocument(profile, root)
  await assertReachable(profile.baseUrl)

  const results = await withBrowser(profile.viewport, async (page) => {
    const collected = []
    for (const route of profile.routes) {
      const key = route.structureKey ?? route.name
      const expected = document[key]
      const failures = []
      if (!expected) {
        failures.push({ kind: 'missing', key: 'structure', item: key })
      }

      const url = routeUrl(profile.baseUrl, route.path)
      try {
        await preparePage(page, url)
        if (expected) {
          const actual = await readStructure(page)
          failures.push(...compareStructure(actual, expected, route.accepted ?? []))
        }
        failures.push(...(await runChecks(page, route.checks)))
      } catch (error) {
        failures.push({ kind: 'navigation', key: 'route', item: error.message })
      }

      collected.push({
        route: route.name,
        mode: route.mode,
        path: route.path,
        pass: failures.length === 0,
        failures,
      })
    }
    return collected
  })

  return {
    phase: 'measure',
    siteId,
    complete: true,
    results,
  }
}
