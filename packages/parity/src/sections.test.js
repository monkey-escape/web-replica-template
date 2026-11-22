import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PNG } from 'pngjs'
import {
  cropPng,
  hintsForViewport,
  isSectionPresentOnViewport,
  isVisualSection,
  scoreSection,
  sectionsFor,
  styleProbesFor,
} from './sections.js'

function solid(width, height, rgba) {
  const image = new PNG({ width, height })
  for (let index = 0; index < width * height; index += 1) image.data.set(rgba, index * 4)
  return image
}

test('sectionsFor reads viewport lists and shared arrays', () => {
  const document = {
    home: {
      desktop: [{ id: 'hero', selector: '[data-component="hero"]', box: { x: 0, y: 0, width: 10, height: 4 } }],
      mobile: [{ id: 'hero', selector: '[data-component="hero"]' }],
    },
    about: [
      { id: 'notice', selector: '[data-component="template-notice"]', viewports: ['desktop'] },
    ],
  }
  assert.equal(sectionsFor(document, 'home', 'desktop')[0].id, 'hero')
  assert.equal(sectionsFor(document, 'about', 'desktop').length, 1)
  assert.equal(sectionsFor(document, 'about', 'mobile').length, 0)
  assert.deepEqual(sectionsFor(document, 'missing', 'desktop'), [])
})

test('crop and score a mismatched section without failing the surrounding pixels', () => {
  const expected = solid(8, 4, [0, 0, 0, 255])
  const actual = solid(8, 4, [0, 0, 0, 255])
  // Paint a 2x2 red block in the left section only.
  for (let y = 0; y < 2; y += 1) {
    for (let x = 0; x < 2; x += 1) actual.data.set([255, 0, 0, 255], (y * 8 + x) * 4)
  }
  const hero = { x: 0, y: 0, width: 4, height: 2 }
  const footer = { x: 4, y: 2, width: 4, height: 2 }
  const heroScore = scoreSection(actual, expected, hero, hero, { maxDiffRatio: 0 })
  const footerScore = scoreSection(actual, expected, footer, footer, { maxDiffRatio: 0 })
  assert.equal(heroScore.pass, false)
  assert.ok(heroScore.score < 1)
  assert.equal(footerScore.pass, true)
  assert.equal(footerScore.score, 1)
  const cropped = cropPng(actual, hero)
  assert.equal(cropped.width, 4)
  assert.equal(cropped.height, 2)
})

test('tiny hooks such as the age gate are not visual sections', () => {
  assert.equal(isVisualSection({ id: 'age-gate', box: { x: 0, y: 0, width: 1, height: 1 } }), false)
  assert.equal(isVisualSection({ id: 'hero', box: { x: 0, y: 0, width: 400, height: 200 } }), true)
})

test('sectionsFor keeps target heading hints and selectors', () => {
  const document = {
    home: {
      desktop: [
        {
          id: 'hero',
          selector: "[data-component='hero']",
          heading: 'Wholesale peptides',
          targetSelector: 'h1',
        },
      ],
    },
  }
  const [hero] = sectionsFor(document, 'home', 'desktop')
  assert.equal(hero.heading, 'Wholesale peptides')
  assert.equal(hero.targetSelector, 'h1')
})

test('viewport-specific hints bind desktop and mobile independently', () => {
  const document = {
    home: [
      {
        id: 'hero',
        selector: "[data-component='hero']",
        targetSelectors: { desktop: 'header.hero', mobile: 'section.mhero' },
        targetHeadings: { desktop: 'Desktop headline', mobile: 'Mobile headline' },
        styleProbes: {
          desktop: [{ id: 'heading', selector: 'h1.display' }],
          mobile: [{ id: 'heading', selector: 'h1' }],
        },
      },
      {
        id: 'how-we-work',
        selector: "[data-component='how-we-work']",
        viewports: ['mobile'],
        targetSelectors: { mobile: 'section.mservices' },
      },
      {
        id: 'supplier-band',
        selector: "[data-component='supplier-band']",
        absentViewports: ['desktop'],
        targetSelectors: { mobile: 'section.mhero' },
      },
    ],
  }
  const desktop = sectionsFor(document, 'home', 'desktop')
  const mobile = sectionsFor(document, 'home', 'mobile')
  assert.equal(desktop.some((item) => item.id === 'how-we-work'), false)
  assert.equal(desktop.some((item) => item.id === 'supplier-band'), false)
  assert.equal(desktop.find((item) => item.id === 'hero').targetSelector, 'header.hero')
  assert.equal(desktop.find((item) => item.id === 'hero').heading, 'Desktop headline')
  assert.deepEqual(desktop.find((item) => item.id === 'hero').styleProbes, [
    { id: 'heading', selector: 'h1.display', viewports: undefined },
  ])
  assert.equal(mobile.find((item) => item.id === 'hero').targetSelector, 'section.mhero')
  assert.equal(mobile.find((item) => item.id === 'how-we-work').targetSelector, 'section.mservices')
  assert.equal(isSectionPresentOnViewport(document.home[1], 'desktop'), false)
  assert.equal(hintsForViewport(document.home[0], 'mobile').targetSelector, 'section.mhero')
  assert.equal(styleProbesFor(document.home[0], 'mobile')[0].selector, 'h1')
})

test('a null targetSelectors entry marks the section absent on that viewport', () => {
  const section = {
    id: 'band',
    selector: "[data-component='band']",
    targetSelectors: { desktop: null, mobile: 'section.mhero' },
  }
  assert.equal(isSectionPresentOnViewport(section, 'desktop'), false)
  assert.equal(isSectionPresentOnViewport(section, 'mobile'), true)
  assert.deepEqual(sectionsFor({ home: [section] }, 'home', 'desktop'), [])
})
