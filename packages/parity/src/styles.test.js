import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffComputedStyles, diffStyleProbes, normalizeStylesFixture, styleSectionResults } from './styles.js'

test('computed style diffs name the section and property', () => {
  const failures = diffComputedStyles(
    { hero: { color: 'rgb(0, 0, 0)', 'font-size': '16px' } },
    { hero: { color: 'rgb(18, 41, 77)', 'font-size': '16px' }, footer: { color: 'rgb(255, 255, 255)' } },
  )
  assert.equal(
    failures.some((item) => item.section === 'hero' && item.item.includes('color')),
    true,
  )
  assert.equal(failures.some((item) => item.section === 'footer' && item.kind === 'missing'), true)
  assert.equal(failures.some((item) => item.item.includes('font-size')), false)
})

test('style section results blame the failing element', () => {
  const expected = { hero: { 'font-size': '48px' }, footer: { color: 'rgb(255, 255, 255)' } }
  const actual = { hero: { 'font-size': '16px' }, footer: { color: 'rgb(255, 255, 255)' } }
  const failures = diffComputedStyles(actual, expected)
  const sections = styleSectionResults(actual, expected, failures)
  const hero = sections.find((item) => item.id === 'hero')
  const footer = sections.find((item) => item.id === 'footer')
  assert.equal(hero.pass, false)
  assert.equal(hero.reason, 'style-mismatch')
  assert.equal(footer.pass, true)
  assert.equal(normalizeStylesFixture({ hero: { color: 'rgb(1, 2, 3)' } }).styleMap.hero.color, 'rgb(1, 2, 3)')
})

test('child style probes are normalized and blamed separately from the container', () => {
  const fixture = normalizeStylesFixture({
    source: 'target',
    sections: {
      hero: {
        styles: { 'font-size': '16px' },
        probes: {
          heading: { selector: 'h1', styles: { 'font-size': '48px', 'font-weight': '700' } },
        },
      },
    },
  })
  assert.equal(fixture.styleMap.hero['font-size'], '16px')
  assert.equal(fixture.probeMap.hero.heading['font-size'], '48px')
  const failures = [
    ...diffComputedStyles({ hero: { 'font-size': '16px' } }, fixture.styleMap),
    ...diffStyleProbes(
      { hero: { heading: { 'font-size': '20px', 'font-weight': '700' } } },
      fixture.probeMap,
    ),
  ]
  assert.equal(failures.some((item) => item.item.includes('hero font-size')), false)
  assert.equal(
    failures.some((item) => item.section === 'hero' && item.probe === 'heading' && item.item.includes('font-size')),
    true,
  )
  const sections = styleSectionResults({ hero: { 'font-size': '16px' } }, fixture.styleMap, failures, { hero: { heading: {} } }, fixture.probeMap)
  assert.equal(sections.find((item) => item.id === 'hero').pass, false)
  assert.equal(sections.find((item) => item.id === 'hero').reason, 'style-mismatch')
})
