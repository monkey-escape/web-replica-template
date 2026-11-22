import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertTargetOrigin,
  buildStylesFixture,
  candidateTargetSelectors,
  mergeCaptureSummary,
  headingSlugMatch,
  isBlockedTargetPath,
  isUsefulBox,
  textsLooselyMatch,
  mergeCapturedSections,
  normalizeStylesFixture,
  pickHeadingForSection,
  targetRouteUrl,
} from './capture.js'
import { loadExpectedStyles } from './styles.js'
import { isSectionPresentOnViewport } from './sections.js'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('public-safe target URL guards allow account shells and block privileged paths', () => {
  assert.equal(isBlockedTargetPath('/api/orders'), true)
  assert.equal(isBlockedTargetPath('/API/foo'), true)
  assert.equal(isBlockedTargetPath('/requisition'), true)
  assert.equal(isBlockedTargetPath('/requisition/new'), true)
  assert.equal(isBlockedTargetPath('/login'), true)
  assert.equal(isBlockedTargetPath('/checkout'), true)
  assert.equal(isBlockedTargetPath('/account'), false)
  assert.equal(isBlockedTargetPath('/account/'), false)
  assert.equal(isBlockedTargetPath('/catalog/'), false)
  assert.equal(isBlockedTargetPath('/'), false)
  assert.equal(assertTargetOrigin('https://www.peptidewholesalers.com/about'), 'https://www.peptidewholesalers.com')
  assert.throws(() => assertTargetOrigin('ftp://example.com'), /http/)
  assert.throws(() => assertTargetOrigin('https://user:pass@example.com'), /credentials/)
  assert.equal(targetRouteUrl('https://www.example.com', '/catalog/'), 'https://www.example.com/catalog/')
  assert.throws(() => targetRouteUrl('https://www.example.com', '/api/secret'), /blocked/)
})

test('heading slug match and landmark candidates resolve without target data-component hooks', () => {
  assert.equal(headingSlugMatch('how-we-work', 'How we work with you'), true)
  assert.equal(headingSlugMatch('quality-testing', 'QUALITY TESTING'), true)
  assert.equal(headingSlugMatch('certificates-teaser', 'CERTIFICATES'), true)
  assert.equal(headingSlugMatch('hero', 'Wholesale peptides. 6× tested. Delivered fast.'), false)
  assert.equal(headingSlugMatch('contact-details', 'CONTACT'), false)
  assert.deepEqual(candidateTargetSelectors({ id: 'site-header', selector: "[data-component='site-header']" }), [
    'header',
    "[data-component='site-header']",
  ])
  assert.equal(
    pickHeadingForSection({ id: 'how-we-work' }, ['How we work with you', 'QUALITY TESTING']),
    'How we work with you',
  )
})

test('rich target fixtures normalize to the style map loadExpectedStyles already returns', () => {
  const raw = buildStylesFixture({
    source: 'target',
    origin: 'https://www.example.com',
    siteId: 'demo',
    route: 'home',
    viewport: { name: 'desktop', width: 1440, height: 900 },
    captures: [
      {
        id: 'hero',
        selector: "[data-component='hero']",
        targetSelector: 'h1',
        box: { x: 0, y: 80, width: 1440, height: 400 },
        styles: { 'font-size': '48px', color: 'rgb(18, 41, 77)' },
      },
    ],
    missing: ['promo-bar'],
  })
  const fixture = normalizeStylesFixture(raw)
  assert.equal(fixture.source, 'target')
  assert.equal(fixture.styleMap.hero['font-size'], '48px')
  assert.equal(fixture.boxes.hero.height, 400)
  assert.equal(fixture.selectors.hero, 'h1')

  const flat = normalizeStylesFixture({ hero: { color: 'rgb(0, 0, 0)' } })
  assert.equal(flat.styleMap.hero.color, 'rgb(0, 0, 0)')

  const root = mkdtempSync(join(tmpdir(), 'styles-fix-'))
  const dir = join(root, 'fixtures/sites/demo/styles')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'home.desktop.json'), `${JSON.stringify(raw, null, 2)}\n`)
  assert.deepEqual(loadExpectedStyles('demo', 'home', 'desktop', root).hero, {
    'font-size': '48px',
    color: 'rgb(18, 41, 77)',
  })
  rmSync(root, { recursive: true, force: true })
})

test('merging target capture keeps clone selectors and records target boxes', () => {
  const merged = mergeCapturedSections(
    {
      home: {
        desktop: [{ id: 'hero', selector: "[data-component='hero']" }],
        mobile: [{ id: 'hero', selector: "[data-component='hero']" }],
      },
    },
    'home',
    'desktop',
    [
      {
        id: 'hero',
        targetSelector: 'section:nth-of-type(2)',
        heading: 'Wholesale peptides. 6× tested. Delivered fast.',
        box: { x: 0, y: 120, width: 1440, height: 640 },
      },
      { id: 'supplier-band', missing: true },
    ],
  )
  assert.equal(merged.home.desktop[0].selector, "[data-component='hero']")
  assert.equal(merged.home.desktop[0].targetSelector, 'section:nth-of-type(2)')
  assert.equal(merged.home.desktop[0].boxes.desktop.width, 1440)
  assert.equal(merged.home.mobile[0].targetSelector, undefined)
  assert.equal(
    merged.home.desktop.some((item) => item.id === 'supplier-band'),
    false,
  )
})

test('heading text matches ignore missing spaces between inline spans', () => {
  assert.equal(
    textsLooselyMatch(
      'Wholesale peptides.6× tested.Delivered fast.',
      'Wholesale peptides. 6× tested. Delivered fast.',
    ),
    true,
  )
  assert.equal(
    textsLooselyMatch('Order now, ships next business day. Save up to 30%.', 'ships next business day'),
    true,
  )
  assert.equal(textsLooselyMatch('6× TESTED', 'Wholesale peptides. 6× tested. Delivered fast.'), false)
  assert.equal(textsLooselyMatch('Weekday orders', 'Order now, ships next business day.'), false)
  assert.equal(isUsefulBox({ x: 0, y: 0, width: 1440, height: 0 }), false)
  assert.equal(isUsefulBox({ x: 0, y: 0, width: 390, height: 420 }), true)
})

test('merging a missing target capture clears stale targetSelector and boxes', () => {
  const merged = mergeCapturedSections(
    {
      home: {
        desktop: [
          {
            id: 'supplier-band',
            selector: "[data-component='supplier-band']",
            targetSelector: 'section:nth-of-type(1)',
            boxes: { desktop: { x: 0, y: 0, width: 0, height: 0 } },
          },
        ],
      },
    },
    'home',
    'desktop',
    [{ id: 'supplier-band', missing: true }],
  )
  const item = merged.home.desktop[0]
  assert.equal(item.selector, "[data-component='supplier-band']")
  assert.equal(item.targetSelector, undefined)
  assert.equal(item.boxes, undefined)
})

test('viewport-specific targetSelectors are tried first and can mark a section absent', () => {
  const section = {
    id: 'hero',
    selector: "[data-component='hero']",
    targetSelector: '#feature',
    targetSelectors: { desktop: 'header.hero', mobile: 'section.mhero' },
  }
  assert.equal(candidateTargetSelectors(section, 'desktop')[0], 'header.hero')
  assert.equal(candidateTargetSelectors(section, 'mobile')[0], 'section.mhero')
  assert.equal(candidateTargetSelectors(section, 'desktop').includes('#feature'), true)
  const absent = { id: 'how-we-work', selector: "[data-component='how-we-work']", viewports: ['mobile'] }
  assert.equal(isSectionPresentOnViewport(absent, 'desktop'), false)
})

test('mergeCaptureSummary keeps other routes when --route updates one row', () => {
  const merged = mergeCaptureSummary(
    {
      siteId: 'demo',
      origin: 'https://example.com',
      summary: [
        { route: 'home', viewport: 'desktop', captured: 1, missing: ['hero'] },
        { route: 'catalog', viewport: 'desktop', captured: 3, missing: [] },
      ],
    },
    {
      siteId: 'demo',
      origin: 'https://example.com',
      summary: [{ route: 'home', viewport: 'desktop', captured: 4, missing: [] }],
    },
    { merge: true },
  )
  assert.equal(merged.summary.find((item) => item.route === 'home').captured, 4)
  assert.equal(merged.summary.find((item) => item.route === 'catalog').captured, 3)
  const replaced = mergeCaptureSummary(merged, { siteId: 'demo', origin: 'https://example.com', summary: [{ route: 'legal', viewport: 'desktop', captured: 1, missing: [] }] }, { merge: false })
  assert.equal(replaced.summary.length, 1)
  assert.equal(replaced.summary[0].route, 'legal')
})

test('buildStylesFixture records child probes next to container styles', () => {
  const fixture = normalizeStylesFixture(
    buildStylesFixture({
      source: 'target',
      origin: 'https://example.com',
      siteId: 'demo',
      route: 'home',
      viewport: { name: 'desktop', width: 1440, height: 900 },
      captures: [
        {
          id: 'hero',
          selector: "[data-component='hero']",
          targetSelector: 'header.hero',
          styles: { 'font-size': '16px' },
          probes: { heading: { selector: 'h1', styles: { 'font-size': '80px' } } },
        },
      ],
    }),
  )
  assert.equal(fixture.styleMap.hero['font-size'], '16px')
  assert.equal(fixture.probeMap.hero.heading['font-size'], '80px')
})
