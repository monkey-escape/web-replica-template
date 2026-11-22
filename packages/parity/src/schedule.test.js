import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildOracleReport, pickNext, STATUS } from './oracle.js'
import { parseSharedComponentIds } from './gates.js'
import {
  applyLoopMemory,
  compactBrief,
  FUSE_LIMIT,
  nextIdentity,
  sectionsFromStructureFailures,
  stageForFailure,
  STAGES,
  shouldSkipStage,
} from './schedule.js'

const shared = ['promo-bar', 'site-header', 'site-footer']

test('missing shared components are the component stage, page-specific missing is composition', () => {
  assert.equal(stageForFailure({ kind: 'missing', key: 'components', item: 'promo-bar' }, shared), STAGES.component)
  assert.equal(stageForFailure({ kind: 'missing', key: 'styles', section: 'promo-bar' }, shared), STAGES.component)
  assert.equal(stageForFailure({ kind: 'missing', key: 'components', item: 'hero' }, shared), STAGES.composition)
  assert.equal(stageForFailure({ kind: 'order', key: 'landmarks', item: 'header > main' }, shared), STAGES.composition)
  assert.equal(stageForFailure({ kind: 'style-mismatch', section: 'hero' }, shared), STAGES.layout_style)
  assert.equal(stageForFailure({ kind: 'pixel-diff' }, shared), STAGES.visual)
  assert.equal(stageForFailure({ kind: 'interaction', item: 'click' }, shared), STAGES.interactive)
})

test('a missing shared component becomes a section next ahead of pixel diffs', () => {
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
        failures: [{ kind: 'missing', key: 'components', item: 'promo-bar' }],
        sections: sectionsFromStructureFailures(
          [{ kind: 'missing', key: 'components', item: 'promo-bar' }],
          shared,
        ),
      },
    ],
  }
  const visual = {
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
        sections: [{ id: 'hero', pass: false, score: 0.4, reason: 'pixel-diff' }],
      },
    ],
  }
  const report = buildOracleReport({
    siteId: 'example',
    measure,
    visual,
    maintain: { phase: 'maintainability', pass: true, failures: [] },
    sharedIds: shared,
  })
  assert.equal(report.status, STATUS.failed)
  assert.equal(report.stage, STAGES.component)
  assert.equal(report.next.section, 'promo-bar')
  assert.equal(report.next.stage, STAGES.component)
  assert.equal(report.next.reason, 'missing')
  assert.equal(shouldSkipStage(report.stage, STAGES.visual), true)
})

test('the same next hitting the fuse limit marks the report stuck for the agent', () => {
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
        sections: [{ id: 'hero', pass: false, score: 0.4, reason: 'pixel-diff' }],
      },
    ],
  }
  const measurePass = {
    phase: 'measure',
    complete: true,
    results: visualFail.results.map((item) => ({ ...item, pass: true, failures: [], sections: [] })),
  }
  let report = buildOracleReport({
    siteId: 'example',
    measure: measurePass,
    visual: visualFail,
    maintain: { phase: 'maintainability', pass: true, failures: [] },
  })
  const identity = nextIdentity(report.next)
  for (let attempt = 2; attempt <= FUSE_LIMIT; attempt += 1) {
    report = buildOracleReport({
      siteId: 'example',
      measure: measurePass,
      visual: visualFail,
      maintain: { phase: 'maintainability', pass: true, failures: [] },
      previous: report,
    })
  }
  assert.equal(report.stuck, true)
  assert.equal(report.memory.repeatCount, FUSE_LIMIT)
  assert.equal(report.memory.nextIdentity, identity)
  assert.match(report.next.repair, /Stuck on the same next/)
  assert.match(compactBrief(report), /stuck=true/)
})

test('a previously resolved residual that returns is marked as a regression', () => {
  const passing = {
    complete: true,
    results: [{ route: 'home', viewport: 'desktop', mode: 'strict', path: '/', pass: true, failures: [] }],
  }
  const failingMeasure = {
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
  const first = buildOracleReport({
    siteId: 'example',
    measure: failingMeasure,
    visual: { phase: 'visual', ...passing },
    maintain: { phase: 'maintainability', pass: true, failures: [] },
  })
  const fixed = buildOracleReport({
    siteId: 'example',
    measure: { phase: 'measure', ...passing },
    visual: { phase: 'visual', ...passing },
    maintain: { phase: 'maintainability', pass: true, failures: [] },
    previous: first,
  })
  assert.equal(fixed.status, STATUS.ready_for_review)
  assert.equal(fixed.memory.resolved.length > 0, true)
  const regress = buildOracleReport({
    siteId: 'example',
    measure: failingMeasure,
    visual: { phase: 'visual', ...passing },
    maintain: { phase: 'maintainability', pass: true, failures: [] },
    previous: fixed,
  })
  assert.equal(regress.memory.regressions.length, 1)
  assert.equal(regress.residuals.some((item) => item.regression), true)
})

test('parseSharedComponentIds is the input to component-stage classification', () => {
  assert.deepEqual(parseSharedComponentIds('shared-components: promo-bar, site-header'), [
    'promo-bar',
    'site-header',
  ])
})
