import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  formatPromotionPlan,
  isImplementationRepo,
  mergeTraps,
  assessRemotes,
  planPromotion,
  promotionReadiness,
  redactPath,
  sanitizeLesson,
} from './promote-experience.js'

function writeImpl(files) {
  const root = mkdtempSync(join(tmpdir(), 'promote-exp-'))
  for (const [relative, text] of Object.entries(files)) {
    const path = join(root, relative)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }
  return root
}

test('the template repo with only example is not an implementation repo', () => {
  const root = writeImpl({ 'fixtures/sites/example/analysis/overview.md': '# example\n' })
  assert.equal(isImplementationRepo(root), false)
  const ready = promotionReadiness(root)
  assert.equal(ready.ok, false)
  assert.match(ready.reasons.join('\n'), /not from the template/)
})

test('promotion waits for a lesson and a finished loop', () => {
  const root = writeImpl({
    'fixtures/sites/trial/analysis/overview.md': '# trial\n',
    'temp/clone-loop/trial/report.json': JSON.stringify({ siteId: 'trial', status: 'failed', complete: true }),
  })
  const ready = promotionReadiness(root)
  assert.equal(ready.ok, false)
  assert.match(ready.reasons.join('\n'), /write and edit a lesson first/)
  assert.match(ready.reasons.join('\n'), /ready_for_review/)
})

test('a ready_for_review report plus a new lesson can be promoted, with site names redacted', () => {
  const lesson = `# 2026-11-22 perceptual pass

- site: peptidewholesalers

Do not treat a ${'peptidewholesalers'}.com pass at threshold 0.1 as exact 1:1.
`
  // use a hostname from the profile rather than baking a typo
  const root = writeImpl({
    'fixtures/sites/peptidewholesalers/analysis/overview.md': '# trial\n',
    'tests/parity/profiles/peptidewholesalers.json': JSON.stringify({
      siteId: 'peptidewholesalers',
      targetBaseUrl: 'https://www.peptidewholesalers.com',
    }),
    'docs/experience/lessons/2026-11-22-perceptual-pass.md':
      '# 2026-11-22 perceptual pass\n\n- site: peptidewholesalers\n\nDo not treat a www.peptidewholesalers.com pass at threshold 0.1 as exact 1:1.\n',
    'docs/experience/traps.md': `# 陷阱库\n\n## Active traps\n\n当前没有。\n`,
    'temp/clone-loop/peptidewholesalers/report.json': JSON.stringify({
      siteId: 'peptidewholesalers',
      status: 'ready_for_review',
      complete: true,
    }),
  })
  const plan = planPromotion(root, { templateLessons: [], templateTraps: '# 陷阱库\n\n## Active traps\n\n当前没有。\n' })
  assert.equal(plan.ok, true)
  assert.equal(plan.files.length, 1)
  assert.equal(plan.files[0].path, 'docs/experience/lessons/2026-11-22-perceptual-pass.md')
  assert.equal(plan.files[0].redacted, true)
  assert.ok(!plan.files[0].text.includes('peptidewholesalers'))
  assert.match(plan.files[0].text, /trial-site/)
  assert.match(plan.files[0].text, /the-target-site/)
  assert.match(formatPromotionPlan(plan), /Ready to promote/)
})

test('lessons already on the template and empty traps are not promoted again', () => {
  const root = writeImpl({
    'fixtures/sites/trial/analysis/overview.md': '# trial\n',
    'docs/experience/lessons/2026-11-22-already.md': '# already\n',
    'docs/experience/traps.md': `# 陷阱库\n\n## Active traps\n\n当前没有。\n`,
    'temp/clone-loop/trial/report.json': JSON.stringify({ siteId: 'trial', status: 'ready_for_review', complete: true }),
  })
  const plan = planPromotion(root, {
    templateLessons: ['2026-11-22-already.md'],
    templateTraps: '# 陷阱库\n\n## Active traps\n\n当前没有。\n',
  })
  assert.equal(plan.ok, false)
  assert.match(plan.reasons.join('\n'), /nothing new to promote/)
})

test('failed_with_residuals can be promoted once a lesson exists', () => {
  const root = writeImpl({
    'fixtures/sites/trial/analysis/overview.md': '# trial\n',
    'docs/experience/lessons/2026-11-22-order.md': '# order\n\nShared chrome appeared in the wrong order.\n',
    'temp/clone-loop/trial/report.json': JSON.stringify({
      siteId: 'trial',
      status: 'failed_with_residuals',
      complete: true,
    }),
  })
  const plan = planPromotion(root, { templateLessons: [], templateTraps: '' })
  assert.equal(plan.ok, true)
  assert.equal(plan.hasRecapFailure, true)
})

test('a lesson with a secret is refused', () => {
  const result = sanitizeLesson('password: hunter2\n')
  assert.equal(result.blocked, true)
  const root = writeImpl({
    'fixtures/sites/trial/analysis/overview.md': '# trial\n',
    'docs/experience/lessons/2026-11-22-secret.md': 'api_key: abcdef\n',
    'temp/clone-loop/trial/report.json': JSON.stringify({ siteId: 'trial', status: 'ready_for_review', complete: true }),
  })
  const plan = planPromotion(root)
  assert.equal(plan.ok, false)
  assert.match(plan.reasons.join('\n'), /secret/)
})

test('new trap ids are appended and existing template traps are kept', () => {
  const template = `# 陷阱库\n\n## Active traps\n\nid: trap-0001\nstatus: active\nsymptom: old\n`
  const implementation = `# 陷阱库\n\n## Active traps\n\nid: trap-0001\nstatus: active\nsymptom: old\n\nid: trap-0002\nstatus: active\nsymptom: new\n`
  const merged = mergeTraps(template, implementation)
  assert.deepEqual(merged.added, ['trap-0002'])
  assert.match(merged.markdown, /trap-0001/)
  assert.match(merged.markdown, /trap-0002/)
  assert.match(merged.markdown, /symptom: new/)
})

test('a lesson filename containing the site id is redacted', () => {
  assert.equal(
    redactPath('docs/experience/lessons/2026-11-22-peptidewholesalers-first-loop.md', ['peptidewholesalers']),
    'docs/experience/lessons/2026-11-22-trial-site-first-loop.md',
  )
  const root = writeImpl({
    'fixtures/sites/peptidewholesalers/analysis/overview.md': '# trial\n',
    'docs/experience/lessons/2026-11-22-peptidewholesalers-first-loop.md': '# note\n',
    'temp/clone-loop/peptidewholesalers/report.json': JSON.stringify({
      siteId: 'peptidewholesalers',
      status: 'ready_for_review',
      complete: true,
    }),
  })
  const plan = planPromotion(root, { templateLessons: [], templateTraps: '' })
  assert.equal(plan.files[0].path, 'docs/experience/lessons/2026-11-22-trial-site-first-loop.md')
  assert.equal(plan.files[0].sourcePath, 'docs/experience/lessons/2026-11-22-peptidewholesalers-first-loop.md')
})

test('a PR requires upstream to be the public template, not origin', () => {
  const assessment = assessRemotes([
    { name: 'origin', url: 'https://github.com/monkey-escape/web-replica-template.git' },
  ])
  assert.equal(assessment.ok, false)
  assert.equal(assessment.originIsTemplate, true)
  assert.match(assessment.issues.join('\n'), /private origin/)
  const good = assessRemotes([
    { name: 'origin', url: 'https://github.com/monkey-escape/web-replica-peptidewholesalers.git' },
    { name: 'upstream', url: 'https://github.com/monkey-escape/web-replica-template.git' },
  ])
  assert.equal(good.ok, true)
  assert.equal(good.pushRemote, 'upstream')
})
