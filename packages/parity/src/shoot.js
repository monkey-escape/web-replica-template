import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ensureParent, preparePage, withBrowser } from './browser.js'
import { loadProfile } from './profile.js'
import { repoRoot, routeUrl } from './paths.js'
import { baselineExists, baselinePath, comparePngFiles, maxDiffRatioFor } from './visual.js'

export async function compareSite(siteId, options = {}) {
  const root = options.root ?? repoRoot
  const profile = loadProfile(siteId, root)
  const captureReference = options.captureReference === true

  const results = await withBrowser(profile.viewport, async (page) => {
    const collected = []
    for (const route of profile.routes) {
      const failures = []
      const url = routeUrl(profile.baseUrl, route.path)
      const actualPath = resolve(root, 'temp/clone-loop', siteId, 'actual', `${route.name}.png`)
      const expectedPath = baselinePath(profile, route, root)
      const diffPath = resolve(root, 'temp/clone-loop', siteId, 'diff', `${route.name}.png`)

      try {
        await preparePage(page, url)
        ensureParent(actualPath)
        await page.screenshot({ path: actualPath, fullPage: true })

        if (captureReference) {
          if (route.mode === 'strict' && !options.allowStrictCapture) {
            collected.push({
              route: route.name,
              mode: route.mode,
              path: route.path,
              pass: false,
              failures: [
                {
                  kind: 'baseline-locked',
                  key: 'visual',
                  item: `${route.name} is strict. Capture its reference during analysis with --allow-strict-capture, not during the fix loop.`,
                },
              ],
            })
            continue
          }
          ensureParent(expectedPath)
          copyFileSync(actualPath, expectedPath)
          collected.push({
            route: route.name,
            mode: route.mode,
            path: route.path,
            pass: false,
            captured: true,
            failures: [
              {
                kind: 'baseline-written',
                key: 'visual',
                item: `Wrote ${expectedPath}. This is not a pass. Re-run visual compare without capture.`,
              },
            ],
          })
          continue
        }

        if (!baselineExists(profile, route, root)) {
          failures.push({
            kind: 'baseline-missing',
            key: 'visual',
            item: `No reference screenshot at ${expectedPath}. Capture it during analysis before coding.`,
          })
        } else {
          ensureParent(diffPath)
          const compared = comparePngFiles(actualPath, expectedPath, {
            pixelThreshold: profile.visual?.pixelThreshold ?? 0.1,
            maxDiffRatio: maxDiffRatioFor(route, profile),
            diffPath,
          })
          if (!compared.pass) {
            failures.push({
              kind: compared.reason,
              key: 'visual',
              item:
                compared.reason === 'size-mismatch'
                  ? `size ${compared.actual.width}x${compared.actual.height} vs ${compared.expected.width}x${compared.expected.height}`
                  : `${compared.mismatched} pixels (${compared.ratio})`,
            })
          }
        }
      } catch (error) {
        failures.push({ kind: 'screenshot', key: 'visual', item: error.message })
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
    phase: 'visual',
    siteId,
    complete: true,
    captureReference,
    results,
  }
}
