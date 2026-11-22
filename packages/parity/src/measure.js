import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { newPage, preparePage, withBrowser } from './browser.js'
import { parseSharedComponentIds } from './gates.js'
import { loadProfile, structureDocument, structureKeyFor } from './profile.js'
import { repoRoot, routeUrl } from './paths.js'
import { loadSectionsDocument, sectionsFor } from './sections.js'
import { sectionsFromStructureFailures, stageForFailure, STAGES } from './schedule.js'
import { compareStructure, readStructure } from './structure.js'
import {
  diffComputedStyles,
  diffStyleProbes,
  loadExpectedProbes,
  loadExpectedStyles,
  readSectionStyles,
  styleSectionResults,
} from './styles.js'

function loadSharedIds(siteId, root) {
  const file = resolve(root, 'fixtures/sites', siteId, 'analysis/components.md')
  if (!existsSync(file)) return []
  return parseSharedComponentIds(readFileSync(file, 'utf8'))
}

function structureBlocksLaterStages(failures, sharedIds) {
  return (failures ?? []).some((failure) => {
    const stage = stageForFailure(failure, sharedIds)
    return stage === STAGES.component || stage === STAGES.composition
  })
}

function styleBlocksInteractive(failures, sharedIds) {
  return (failures ?? []).some((failure) => stageForFailure(failure, sharedIds) === STAGES.layout_style)
}

function checksFor(route, viewport) {
  const checks = route.checks ?? []
  return checks.filter((check) => {
    if (!Array.isArray(check.viewports) || check.viewports.length === 0) return true
    return check.viewports.includes(viewport.name)
  })
}

async function runChecks(page, checks) {
  const failures = []
  for (const check of checks ?? []) {
    if (check.action !== 'click' && check.action !== 'type' && check.action !== 'fill') {
      failures.push({
        kind: 'interaction',
        key: 'interactions',
        item: `${check.name}: unsupported action`,
      })
      continue
    }
    try {
      if (check.action === 'type' || check.action === 'fill') {
        await page.locator(check.selector).fill(String(check.value ?? ''))
      } else {
        await page.locator(check.selector).click()
      }
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
  const sharedIds = loadSharedIds(siteId, root)
  await assertReachable(profile.baseUrl)

  const results = await withBrowser(async (browser) => {
    const collected = []
    for (const viewport of profile.viewports) {
      const page = await newPage(browser, viewport)
      try {
        for (const route of profile.routes) {
          const key = structureKeyFor(route, viewport, document)
          const expected = document[key]
          const failures = []
          if (!expected) {
            failures.push({ kind: 'missing', key: 'structure', item: key })
          }

          const url = routeUrl(profile.baseUrl, route.path)
          let styleSections = []
          try {
            await preparePage(page, url)
            if (expected) {
              const actual = await readStructure(page)
              failures.push(...compareStructure(actual, expected, route.accepted ?? []))
            }
            if (structureBlocksLaterStages(failures, sharedIds)) {
              styleSections = sectionsFromStructureFailures(failures, sharedIds)
            } else {
              const expectedStyles = loadExpectedStyles(siteId, route.name, viewport.name, root)
              const expectedProbes = loadExpectedProbes(siteId, route.name, viewport.name, root)
              if (expectedStyles || expectedProbes) {
                const { document: sectionDocument } = loadSectionsDocument(siteId, root)
                let planned = sectionsFor(sectionDocument, route.name, viewport.name)
                if (planned.length === 0) {
                  const ids = new Set([
                    ...Object.keys(expectedStyles ?? {}),
                    ...Object.keys(expectedProbes ?? {}),
                  ])
                  planned = [...ids].map((id) => ({
                    id,
                    selector: `[data-component="${id}"]`,
                  }))
                }
                const tree = await readSectionStyles(page, planned)
                const actualStyles = Object.fromEntries(
                  Object.entries(tree).map(([id, entry]) => [id, entry.styles]),
                )
                const actualProbes = Object.fromEntries(
                  Object.entries(tree).map(([id, entry]) => [id, entry.probes]),
                )
                const styleFailures = [
                  ...diffComputedStyles(actualStyles, expectedStyles),
                  ...diffStyleProbes(actualProbes, expectedProbes),
                ]
                failures.push(...styleFailures)
                styleSections = styleSectionResults(
                  actualStyles,
                  expectedStyles,
                  styleFailures,
                  actualProbes,
                  expectedProbes,
                )
              }
              if (!styleBlocksInteractive(failures, sharedIds)) {
                failures.push(...(await runChecks(page, checksFor(route, viewport))))
              }
            }
          } catch (error) {
            failures.push({ kind: 'navigation', key: 'route', item: error.message })
            if (styleSections.length === 0) {
              styleSections = sectionsFromStructureFailures(failures, sharedIds)
            }
          }

          collected.push({
            route: route.name,
            viewport: viewport.name,
            mode: route.mode,
            path: route.path,
            pass: failures.length === 0,
            failures,
            ...(styleSections.length ? { sections: styleSections } : {}),
          })
        }
      } finally {
        await page.close()
      }
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
