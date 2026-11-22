import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildOracleReport, exitCodeFor, pickNext, STATUS } from './oracle.js'

const visualFail = {
  phase: 'visual',
  complete: true,
  results: [
    {
      route: 'home',
      viewport: 'desktop',
      mode: 'strict',
      path: '/',
      pass: false,
      failures: [{ kind: 'pixel-diff', key: 'visual', item: '12 pixels' }],
      sections: [
        { id: 'footer', pass: true, score: 1 },
        { id: 'hero', pass: false, score: 0.4, reason: 'pixel-diff' },
      ],
    },
    {
      route: 'about',
      viewport: 'desktop',
      mode: 'adapt',
      path: '/about/',
      pass: true,
      failures: [],
    },
  ],
}

const measurePass = {
  phase: 'measure',
  complete: true,
  results: visualFail.results.map((item) => ({ ...item, pass: true, failures: [], sections: [] })),
}

test('the oracle names the worst strict section and does not treat a pixel miss as ready', () => {
  const report = buildOracleReport({
    siteId: 'example',
    measure: measurePass,
    visual: visualFail,
    maintain: { phase: 'maintainability', pass: true, failures: [] },
  })
  assert.equal(report.status, STATUS.failed)
  assert.equal(exitCodeFor(report.status), 2)
  assert.equal(report.next.section, 'hero')
  assert.match(report.next.repair, /hero/)
  assert.equal(report.residuals.some((item) => item.section === 'hero'), true)
})

test('a 1:1 screenshot still fails when the source is unmaintainable', () => {
  const visualPass = {
    phase: 'visual',
    complete: true,
    results: [
      { route: 'home', viewport: 'desktop', mode: 'strict', path: '/', pass: true, failures: [] },
    ],
  }
  const report = buildOracleReport({
    siteId: 'example',
    measure: { phase: 'measure', complete: true, results: visualPass.results },
    visual: visualPass,
    maintain: {
      phase: 'maintainability',
      pass: false,
      failures: [{ kind: 'hotlink', key: 'maintainability', item: 'apps/web/index.html: https://x/a.png' }],
    },
  })
  assert.equal(report.status, STATUS.failed)
  assert.equal(report.next.kind, 'maintainability')
  assert.match(report.next.repair, /unreadable source is a fail/)
})

test('--conclude records failed_with_residuals instead of a pass', () => {
  const report = buildOracleReport({
    siteId: 'example',
    measure: measurePass,
    visual: visualFail,
    maintain: { phase: 'maintainability', pass: true, failures: [] },
    concluded: true,
  })
  assert.equal(report.status, STATUS.failed_with_residuals)
  assert.equal(exitCodeFor(report.status), 4)
})

test('all-green loops are ready_for_review and exit 0', () => {
  const visualPass = {
    phase: 'visual',
    complete: true,
    results: [
      { route: 'home', viewport: 'desktop', mode: 'strict', path: '/', pass: true, failures: [] },
    ],
  }
  const report = buildOracleReport({
    siteId: 'example',
    measure: { phase: 'measure', complete: true, results: visualPass.results },
    visual: visualPass,
    maintain: { phase: 'maintainability', pass: true, failures: [] },
  })
  assert.equal(report.status, STATUS.ready_for_review)
  assert.equal(exitCodeFor(report.status), 0)
  assert.equal(pickNext({ visual: visualPass, maintain: { pass: true, failures: [] } }), null)
})

test('pickNext blames a computed-style section captured from the target', () => {
  const visualPass = {
    phase: 'visual',
    complete: true,
    results: [
      { route: 'home', viewport: 'desktop', mode: 'strict', path: '/', pass: true, failures: [] },
    ],
  }
  const measure = {
    phase: 'measure',
    complete: true,
    results: [
      {
        route: 'home',
        viewport: 'desktop',
        mode: 'strict',
        path: '/',
        pass: false,
        failures: [
          {
            kind: 'style-mismatch',
            key: 'styles',
            section: 'hero',
            item: 'hero font-size: expected "48px", got "16px"',
          },
        ],
        sections: [
          {
            id: 'hero',
            pass: false,
            score: 0,
            reason: 'style-mismatch',
            failures: [
              {
                kind: 'style-mismatch',
                key: 'styles',
                section: 'hero',
                item: 'hero font-size: expected "48px", got "16px"',
              },
            ],
          },
        ],
      },
    ],
  }
  const report = buildOracleReport({
    siteId: 'example',
    measure,
    visual: visualPass,
    maintain: { phase: 'maintainability', pass: true, failures: [] },
  })
  assert.equal(report.status, STATUS.failed)
  assert.equal(report.next.section, 'hero')
  assert.equal(report.next.reason, 'style-mismatch')
  assert.equal(report.residuals.some((item) => item.section === 'hero' && item.reason === 'style-mismatch'), true)
})

test('an exact-pixel residual does not block ready_for_review and is named in the brief', () => {
  const visualPass = {
    phase: 'visual',
    complete: true,
    results: [
      {
        route: 'home',
        viewport: 'desktop',
        mode: 'strict',
        path: '/',
        pass: true,
        failures: [],
        exactMismatched: 3074111,
        exactRatio: 0.1887,
      },
    ],
  }
  const report = buildOracleReport({
    siteId: 'example',
    measure: { phase: 'measure', complete: true, results: visualPass.results },
    visual: visualPass,
    maintain: { phase: 'maintainability', pass: true, failures: [] },
  })
  assert.equal(report.status, STATUS.ready_for_review)
  assert.equal(report.residuals.length, 0)
  assert.equal(report.exactPixel.maxExactRatio, 0.1887)
  assert.match(report.brief, /exact_residual=home@desktop 18\.9%/)
})

test('a complete measure with no visual report falls back to the visual stage, not gates', () => {
  const report = buildOracleReport({
    siteId: 'example',
    measure: {
      phase: 'measure',
      complete: true,
      results: [{ route: 'home', viewport: 'desktop', mode: 'strict', path: '/', pass: true, failures: [] }],
    },
    visual: null,
    maintain: { phase: 'maintainability', pass: true, failures: [] },
  })
  assert.equal(report.status, STATUS.incomplete)
  assert.equal(report.next, null)
  assert.equal(report.stage, 'visual')
  assert.match(report.brief, /stage=visual/)
})
