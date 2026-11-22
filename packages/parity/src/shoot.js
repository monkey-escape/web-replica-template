import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ensureParent, newPage, preparePage, screenshotFullPage, withBrowser } from './browser.js'
import { blamePixels } from './blame.js'
import { loadProfile } from './profile.js'
import { repoRoot, routeUrl } from './paths.js'
import {
  discoverSections,
  loadSectionsDocument,
  readSectionBoxes,
  isVisualSection,
  scoreSection,
  sectionsFor,
} from './sections.js'
import { baselineExists, baselinePath, comparePngFiles, maxDiffRatioFor, readPng } from './visual.js'

export async function compareSite(siteId, options = {}) {
  const root = options.root ?? repoRoot
  const profile = loadProfile(siteId, root)
  const captureReference = options.captureReference === true
  const { document: sectionDocument } = loadSectionsDocument(siteId, root)

  const results = await withBrowser(async (browser) => {
    const collected = []
    for (const viewport of profile.viewports) {
      const page = await newPage(browser, viewport)
      try {
        for (const route of profile.routes) {
          const failures = []
          let compared = null
          let sectionResults = []
          const url = routeUrl(profile.baseUrl, route.path)
          const stem = `${route.name}.${viewport.name}`
          const actualPath = resolve(root, 'temp/clone-loop', siteId, 'actual', `${stem}.png`)
          const expectedPath = baselinePath(profile, route, viewport, root)
          const diffPath = resolve(root, 'temp/clone-loop', siteId, 'diff', `${stem}.png`)

          try {
            await preparePage(page, url)
            await screenshotFullPage(page, actualPath, viewport)

            if (captureReference) {
              if (route.mode === 'strict' && !options.allowStrictCapture) {
                collected.push({
                  route: route.name,
                  viewport: viewport.name,
                  mode: route.mode,
                  path: route.path,
                  pass: false,
                  failures: [
                    {
                      kind: 'baseline-locked',
                      key: 'visual',
                      item: `${stem} is strict. Capture its reference during analysis with --allow-strict-capture, not during the fix loop.`,
                    },
                  ],
                })
                continue
              }
              ensureParent(expectedPath)
              copyFileSync(actualPath, expectedPath)
              collected.push({
                route: route.name,
                viewport: viewport.name,
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

            if (!baselineExists(profile, route, viewport, root)) {
              failures.push({
                kind: 'baseline-missing',
                key: 'visual',
                item: `No reference screenshot at ${expectedPath}. Capture it during analysis before coding.`,
              })
            } else {
              ensureParent(diffPath)
              compared = comparePngFiles(actualPath, expectedPath, {
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

              const planned = sectionsFor(sectionDocument, route.name, viewport.name)
              const boxes = planned.length
                ? await readSectionBoxes(page, planned)
                : await discoverSections(page)
              const actualImage = readPng(actualPath)
              const expectedImage = readPng(expectedPath)
              const diffImage = existsSync(diffPath) ? readPng(diffPath) : null
              const aligned =
                actualImage.width === expectedImage.width &&
                actualImage.height === expectedImage.height
              const blamed = aligned && diffImage ? blamePixels(diffImage, boxes) : []
              const compareOptions = {
                pixelThreshold: profile.visual?.pixelThreshold ?? 0.1,
                maxDiffRatio: maxDiffRatioFor(route, profile),
              }
              // 整页高度对不齐时，用克隆框去裁参考图不可靠；1×1 的测量钩子也不该成为下一刀。
              sectionResults = boxes
                .filter((item) => isVisualSection(item))
                .map((item) => {
                  if (!aligned) {
                    return {
                      id: item.id,
                      selector: item.selector,
                      pass: true,
                      score: null,
                      reason: 'unaligned-page',
                    }
                  }
                  const plannedBox = planned.find((entry) => entry.id === item.id)?.box
                  const scored = item.missing
                    ? { pass: false, reason: 'section-missing', score: 0, mismatched: null }
                    : scoreSection(
                        actualImage,
                        expectedImage,
                        item.box,
                        plannedBox ?? item.box,
                        compareOptions,
                      )
                  const blame = blamed.find((entry) => entry.id === item.id)
                  return {
                    id: item.id,
                    selector: item.selector,
                    pass: scored.pass === true,
                    score: scored.score ?? 0,
                    reason: scored.reason,
                    mismatched: scored.mismatched,
                    blame: blame
                      ? { mismatched: blame.mismatched, share: blame.share }
                      : undefined,
                  }
                })
            }
          } catch (error) {
            failures.push({ kind: 'screenshot', key: 'visual', item: error.message })
          }

          collected.push({
            route: route.name,
            viewport: viewport.name,
            mode: route.mode,
            path: route.path,
            pass: failures.length === 0,
            failures,
            sections: sectionResults,
            exactMismatched: compared?.exactMismatched ?? null,
            exactRatio: compared?.exactRatio ?? null,
            diffPath: failures.length ? diffPath : undefined,
          })
        }
      } finally {
        await page.close()
      }
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
