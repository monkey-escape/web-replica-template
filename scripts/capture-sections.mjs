import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from '@replica/parity/args'
import {
  assertTargetOrigin,
  buildStylesFixture,
  isBlockedTargetPath,
  candidateTargetSelectors,
  mergeCaptureSummary,
  mergeCapturedSections,
  normalizeStylesFixture,
  prepareTargetPage,
  readPageHeadings,
  resolveTargetSection,
  targetRouteUrl,
} from '@replica/parity/capture'
import { loadProfile } from '@replica/parity/profile'
import { repoRoot, routeUrl } from '@replica/parity/paths'
import { isSectionPresentOnViewport, loadSectionsDocument, sectionsFor, discoverSections } from '@replica/parity/sections'
import { STYLE_KEYS, readComputedStyles, readSectionStyles, stylesPath } from '@replica/parity/styles'

function help() {
  console.log(`Usage:
  node scripts/capture-sections.mjs --self-test
  node scripts/capture-sections.mjs --site <site-id> --from-target [--target <origin>] [--route <name>]
  node scripts/capture-sections.mjs --site <site-id> --from-clone

--from-target opens the live target origin (profile.targetBaseUrl or --target).
It is GET-only on public pages. An age-gate may be dismissed. It will not log
in, open /api/ or /requisition, or submit forms. Target boxes and computed
styles land in fixtures/sites/<site-id>/styles/<route>.<viewport>.json, and
targetSelector / boxes are merged into fixtures/sites/<site-id>/sections.json
without overwriting clone-side selector fields.

sections.json may declare viewport-specific hints (targetSelectors,
targetHeadings, targetTexts, viewports, absentViewports) so desktop and
mobile layouts can bind independently. Optional styleProbes capture child
computed styles (for example an h1) relative to the section root, not just
the container. See docs/oracle.md.

--route merges new route@viewport rows into temp/clone-loop/<site-id>/target-capture.json
instead of replacing the whole summary.

--from-clone reads the running clone (profile.baseUrl) and writes clone-side
boxes and styles under temp/clone-loop/<site-id>/clone-styles/. It does not
overwrite target fixtures in fixtures/sites/<site-id>/styles/.

This script does not rewrite baselines.`)
}

function routeFilter(value) {
  if (value == null || value === true) return null
  const names = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return names.length ? new Set(names) : null
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  help()
  process.exit(0)
}

if (args['self-test']) {
  const { document } = loadSectionsDocument('example')
  const home = sectionsFor(document, 'home', 'desktop')
  if (!home.some((item) => item.id === 'hero' && item.selector.includes('hero'))) {
    throw new Error('example sections.json must list the home hero')
  }

  const text = help.toString()
  if (!text.includes('--from-target') || !text.includes('fixtures/sites/') || !text.includes('styles/')) {
    throw new Error('help text must document --from-target and the styles fixture path')
  }
  if (isBlockedTargetPath('/api/secret') !== true || isBlockedTargetPath('/requisition') !== true) {
    throw new Error('blocked target paths must include /api/ and /requisition')
  }
  if (isBlockedTargetPath('/account') !== false || isBlockedTargetPath('/catalog/') !== false) {
    throw new Error('public account and catalog paths must stay allowed')
  }
  assertTargetOrigin('https://www.peptidewholesalers.com')
  const fixture = normalizeStylesFixture(
    buildStylesFixture({
      source: 'target',
      origin: 'https://www.example.com',
      siteId: 'example',
      route: 'home',
      viewport: { name: 'desktop', width: 1440, height: 900 },
      captures: [{ id: 'hero', selector: "[data-component='hero']", styles: { color: 'rgb(0, 0, 0)' }, box: { x: 0, y: 0, width: 10, height: 10 } }],
      missing: [],
    }),
  )
  if (fixture.styleMap.hero.color !== 'rgb(0, 0, 0)' || fixture.source !== 'target') {
    throw new Error('target styles fixture must normalize to a style map')
  }
  const merged = mergeCapturedSections(
    { home: { desktop: [{ id: 'hero', selector: "[data-component='hero']" }] } },
    'home',
    'desktop',
    [{ id: 'hero', targetSelector: 'section:nth-of-type(1)', box: { x: 1, y: 2, width: 3, height: 4 } }],
  )
  const hero = merged.home.desktop[0]
  if (hero.selector !== "[data-component='hero']" || hero.targetSelector !== 'section:nth-of-type(1)') {
    throw new Error('merge must keep the clone selector and add targetSelector')
  }
  if (isSectionPresentOnViewport({ id: 'band', selector: 'section', viewports: ['mobile'] }, 'desktop') !== false) {
    throw new Error('viewports must skip a section on other breakpoints')
  }
  const hinted = sectionsFor({
    home: [{
      id: 'hero',
      selector: "[data-component='hero']",
      targetSelectors: { desktop: 'header.hero', mobile: 'section.mhero' },
      styleProbes: [{ id: 'heading', selector: 'h1' }],
    }],
  }, 'home', 'mobile')
  if (hinted[0].targetSelector !== 'section.mhero' || hinted[0].styleProbes[0].id !== 'heading') {
    throw new Error('viewport targetSelectors and styleProbes must resolve in sectionsFor')
  }
  const selectors = candidateTargetSelectors({
    id: 'hero',
    selector: "[data-component='hero']",
    targetSelectors: { desktop: 'header.hero' },
  }, 'desktop')
  if (selectors[0] !== 'header.hero') {
    throw new Error('viewport-specific targetSelectors must be tried first')
  }
  const mergedSummary = mergeCaptureSummary(
    { siteId: 'demo', origin: 'https://example.com', summary: [
      { route: 'home', viewport: 'desktop', captured: 1, missing: [] },
      { route: 'catalog', viewport: 'desktop', captured: 2, missing: [] },
    ] },
    { siteId: 'demo', origin: 'https://example.com', summary: [
      { route: 'home', viewport: 'desktop', captured: 4, missing: ['x'] },
    ] },
    { merge: true },
  )
  const homeRow = mergedSummary.summary.find((item) => item.route === 'home' && item.viewport === 'desktop')
  const catalogRow = mergedSummary.summary.find((item) => item.route === 'catalog')
  if (homeRow?.captured !== 4 || catalogRow?.captured !== 2 || !text.includes('target-capture.json')) {
    throw new Error('--route must merge target-capture.json instead of replacing the whole summary')
  }
  const probeFixture = normalizeStylesFixture(buildStylesFixture({
    source: 'target',
    origin: 'https://www.example.com',
    siteId: 'example',
    route: 'home',
    viewport: { name: 'desktop', width: 1440, height: 900 },
    captures: [{
      id: 'hero',
      selector: "[data-component='hero']",
      styles: { 'font-size': '16px' },
      probes: { heading: { selector: 'h1', styles: { 'font-size': '48px' } } },
    }],
  }))
  if (probeFixture.probeMap.hero.heading['font-size'] !== '48px') {
    throw new Error('style probes must land in the styles fixture probe map')
  }
  console.log('capture-sections self-test passed')
  process.exit(0)
}

const fromTarget = args['from-target'] === true
const fromClone = args['from-clone'] === true
if ((fromTarget === fromClone) || typeof args.site !== 'string') {
  help()
  process.exit(1)
}

const siteId = args.site
const root = repoRoot
const profile = loadProfile(siteId, root)
const filter = routeFilter(args.route)
const { newPage, preparePage, withBrowser } = await import('@replica/parity/browser')

if (fromTarget) {
  const origin = assertTargetOrigin(args.target ?? profile.targetBaseUrl, 'target URL')
  let { document, file } = loadSectionsDocument(siteId, root)
  document = document ?? {}
  const summary = []

  await withBrowser(async (browser) => {
    for (const viewport of profile.viewports) {
      const page = await newPage(browser, viewport)
      try {
        for (const route of profile.routes) {
          if (filter && !filter.has(route.name)) continue
          if (isBlockedTargetPath(route.path)) {
            summary.push({ route: route.name, viewport: viewport.name, skipped: 'blocked-path' })
            console.log(`skipped ${route.name}@${viewport.name}: blocked path ${route.path}`)
            continue
          }
          const url = targetRouteUrl(origin, route.path)
          await prepareTargetPage(page, url)
          const headings = await readPageHeadings(page)
          const planned = sectionsFor(document, route.name, viewport.name)
          const captures = []
          const missing = []
          for (const section of planned) {
            const resolved = await resolveTargetSection(page, section, headings, viewport.name)
            if (resolved.skipped || resolved.absent) continue
            if (resolved.missing) {
              missing.push(section.id)
              captures.push(resolved)
              continue
            }
            const tree = await readSectionStyles(page, [resolved], STYLE_KEYS)
            const recorded = tree[resolved.id] ?? { styles: {}, probes: {} }
            captures.push({ ...resolved, styles: recorded.styles ?? {}, probes: recorded.probes ?? {} })
          }
          const fixture = buildStylesFixture({
            source: 'target',
            origin,
            siteId,
            route: route.name,
            viewport,
            captures: captures.filter((item) => !item.missing),
            missing,
          })
          const out = stylesPath(siteId, route.name, viewport.name, root)
          writeJson(out, fixture)
          document = mergeCapturedSections(document, route.name, viewport.name, captures)
          summary.push({
            route: route.name,
            viewport: viewport.name,
            captured: captures.filter((item) => !item.missing).length,
            missing,
            file: out,
            url,
          })
          console.log(
            `captured ${route.name}@${viewport.name} from ${url} (${fixture.missing.length} missing)`,
          )
        }
      } finally {
        await page.close()
      }
    }
  })

  writeJson(file, document)
  const report = resolve(root, 'temp/clone-loop', siteId, 'target-capture.json')
  let previous = null
  if (existsSync(report)) {
    try {
      previous = JSON.parse(readFileSync(report, 'utf8'))
    } catch {
      previous = null
    }
  }
  const payload = mergeCaptureSummary(previous, { siteId, origin, summary }, { merge: Boolean(filter) })
  writeJson(report, payload)
  console.log(`Wrote target styles under fixtures/sites/${siteId}/styles/`)
  console.log(`Merged target boxes into ${file}`)
  console.log(`Capture summary: ${report}`)
  process.exit(0)
}

const summary = []
await withBrowser(async (browser) => {
  for (const viewport of profile.viewports) {
    const page = await newPage(browser, viewport)
    try {
      for (const route of profile.routes) {
        if (filter && !filter.has(route.name)) continue
        await preparePage(page, routeUrl(profile.baseUrl, route.path))
        const planned = sectionsFor(loadSectionsDocument(siteId, root).document, route.name, viewport.name)
        const items = planned.length ? planned : await discoverSections(page)
        const styles = await readComputedStyles(page, items, STYLE_KEYS)
        const captures = items.map((item) => ({
          ...item,
          styles: styles[item.id] ?? {},
          box: item.box ?? null,
        }))
        const fixture = buildStylesFixture({
          source: 'clone',
          origin: profile.baseUrl,
          siteId,
          route: route.name,
          viewport,
          captures,
        })
        const out = resolve(
          root,
          'temp/clone-loop',
          siteId,
          'clone-styles',
          `${route.name}.${viewport.name}.json`,
        )
        writeJson(out, fixture)
        summary.push({ route: route.name, viewport: viewport.name, file: out })
        console.log(`captured clone ${route.name}@${viewport.name} -> ${out}`)
      }
    } finally {
      await page.close()
    }
  }
})

const report = resolve(root, 'temp/clone-loop', siteId, 'clone-capture.json')
writeJson(report, { siteId, origin: profile.baseUrl, summary })
console.log('Wrote clone-side styles under temp/clone-loop/. Target fixtures were not changed.')
