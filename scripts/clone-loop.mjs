import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from '@replica/parity/args'
import { checkGates, nextTrapId } from '@replica/parity/gates'
import { checkMaintainability } from '@replica/parity/maintain'
import { checkLocalMockApi } from '@replica/parity/mock-health'
import { buildOracleReport, exitCodeFor, STATUS } from '@replica/parity/oracle'
import { repoRoot } from '@replica/parity/paths'
import { writeJson } from '@replica/parity/report'
import {
  earliestStageOf,
  loadSharedComponentIds,
  shouldSkipStage,
  STAGES,
  writeLoopMemory,
} from '@replica/parity/schedule'

const args = parseArgs(process.argv.slice(2))

function help() {
  console.log(`Usage:
  node scripts/clone-loop.mjs --self-test
  node scripts/clone-loop.mjs --site <site-id>
  node scripts/clone-loop.mjs --site <site-id> --conclude
  node scripts/clone-loop.mjs --site <site-id> --write-lesson --slug <slug>

This script is the oracle. The agent authors code; it cannot declare the clone done.

  1. Refuse to start unless analysis files and the trap check exist.
  2. Run component-progressive gates: shared-component skeleton, page composition, box/computed style, then visual residual, then interactive.
  3. Write temp/clone-loop/<site-id>/report.json with status, stage, next, brief (for the agent), and residuals.
  4. Exit 0 only for ready_for_review (strict 1:1 and maintainable).
  5. Exit 2 when a strict route/section is not 1:1, or source is not maintainable.
  6. Exit 3 when only adapt routes failed.
  7. Exit 4 when --conclude records failed_with_residuals with evidence.

A 99% screenshot with unreadable source is a fail. Repair only the worst item in report.next.
Profiles must include desktop width 1440 and mobile width 390.

The loop does not rewrite reference screenshots. Capture those during analysis,
or refresh them after a live target change with compare-target --accept
(never from this loop):

  node tests/parity/visual.mjs --site <site-id> --capture-reference --allow-strict-capture
  node scripts/compare-target.mjs --site <site-id>
  node scripts/compare-target.mjs --site <site-id> --accept

Start both dev servers before a real run:
  pnpm dev:api
  pnpm dev:web`)
}

function readPhase(file) {
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}

function runPhase(script, siteId, out) {
  const result = spawnSync(
    process.execPath,
    [resolve(repoRoot, script), '--site', siteId, '--out', out],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    },
  )
  return result.status ?? 1
}

function writeLesson(siteId, slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error('Lesson slug must be lowercase letters, digits, and single hyphens.')
  const date = new Date().toISOString().slice(0, 10)
  const relative = `docs/experience/lessons/${date}-${slug}.md`
  const target = resolve(repoRoot, relative)
  if (existsSync(target))
    throw new Error(`${relative} already exists. Edit it instead of overwriting.`)

  const traps = readFileSync(resolve(repoRoot, 'docs/experience/traps.md'), 'utf8')
  const trapId = nextTrapId(traps)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(
    target,
    `# ${date} ${slug}

- date: ${date}
- site: ${siteId}
- routes:

## 发生了什么

写下这一轮真正失败过的点。如果一次就过了，写「没有新的失败」，不要编造陷阱。

## 下次开工前要检查的陷阱

只有在上面有真实失败时，才把下面的块追加到 \`docs/experience/traps.md\` 的 Active traps 下面。没有新陷阱就删掉这个代码块。

\`\`\`yaml
id: ${trapId}
status: active
surfaces: []
symptom:
cause:
avoid:
first_seen: ${date}
source_lesson: ${relative}
\`\`\`

## 可以删掉的临时代码

把确认无用的文件第一行标成 \`@replica-rotten\`，或改成 \`*.obsolete.*\`。当天复盘的 \`pnpm recap --apply-clean\` 只会删这些，外加 \`temp/\`。
`,
  )
  return relative
}

if (args.help) {
  help()
  process.exit(0)
}

if (args['self-test']) {
  const gates = checkGates('example')
  if (!gates.ok) {
    console.error(gates.errors.join('\n'))
    process.exit(1)
  }
  // 自检只查当前 apps/web 是否可读、有没有热链。token 复用要等真实循环用该站点自己的 tokens.json，
  // 否则下游克隆里的 apps/web 会和 example 的调色板对不上。
  const maintain = checkMaintainability(repoRoot)
  if (!maintain.pass) {
    console.error('apps/web failed maintainability:')
    for (const failure of maintain.failures) console.error(`- ${failure.kind}: ${failure.item}`)
    process.exit(1)
  }
  const passing = {
    complete: true,
    results: [{ route: 'home', viewport: 'desktop', mode: 'strict', path: '/', pass: true, failures: [] }],
  }
  const ready = buildOracleReport({
    siteId: 'example',
    measure: { phase: 'measure', ...passing },
    visual: { phase: 'visual', ...passing },
    maintain,
  })
  if (ready.status !== STATUS.ready_for_review || exitCodeFor(ready.status) !== 0) {
    throw new Error(`expected ready_for_review, got ${ready.status}`)
  }
  const residuals = buildOracleReport({
    siteId: 'example',
    measure: { phase: 'measure', ...passing },
    visual: {
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
    },
    maintain,
    concluded: true,
  })
  if (residuals.status !== STATUS.failed_with_residuals || exitCodeFor(residuals.status) !== 4) {
    throw new Error(`expected failed_with_residuals, got ${residuals.status}`)
  }
  if (residuals.next?.section !== 'hero') throw new Error('self-test did not name hero as next')
  console.log('clone-loop self-test passed')
  process.exit(0)
}

if (args['capture-reference'] || args['update-baseline'] || args.accept) {
  console.error('The fix loop does not rewrite reference screenshots or accept a target-update.')
  console.error('During first-time analysis:')
  console.error(
    '  node tests/parity/visual.mjs --site <site-id> --capture-reference --allow-strict-capture',
  )
  console.error('After the live target site changes, compare then accept:')
  console.error('  node scripts/compare-target.mjs --site <site-id>')
  console.error('  node scripts/compare-target.mjs --site <site-id> --accept')
  process.exit(1)
}

if (typeof args.site !== 'string') {
  help()
  process.exit(1)
}

const siteId = args.site
const gates = checkGates(siteId)
const reportFile = resolve(repoRoot, 'temp/clone-loop', siteId, 'report.json')

if (!gates.ok) {
  writeJson(reportFile, {
    complete: false,
    siteId,
    status: STATUS.incomplete,
    phase: 'gates',
    failed: gates.errors.map((item) => ({
      route: '*',
      mode: 'strict',
      phase: 'gates',
      failures: [{ kind: 'gate', key: 'analysis', item }],
    })),
    passed: [],
    residuals: gates.errors.map((item) => ({ phase: 'gates', kind: 'gate', item })),
  })
  console.error('Clone loop stopped before implementation checks:')
  for (const error of gates.errors) console.error(`- ${error}`)
  process.exit(1)
}

const mocks = checkLocalMockApi(siteId)
if (!mocks.ok) {
  writeJson(reportFile, {
    complete: false,
    siteId,
    status: STATUS.incomplete,
    phase: 'mock_api',
    stage: STAGES.gates,
    failed: [
      {
        route: '*',
        mode: 'strict',
        phase: 'mock_api',
        failures: [{ kind: 'gate', key: 'mock_api', item: mocks.error }],
      },
    ],
    passed: [],
    residuals: [{ phase: 'mock_api', kind: 'gate', stage: STAGES.gates, item: mocks.error }],
    brief: `status=incomplete stage=gates reason=mock-api\n${mocks.error}`,
  })
  console.error(mocks.error)
  process.exit(1)
}

const measureFile = resolve(repoRoot, 'temp/clone-loop', siteId, 'measure.json')
const visualFile = resolve(repoRoot, 'temp/clone-loop', siteId, 'visual.json')
const previous = readPhase(reportFile)
const sharedIds = loadSharedComponentIds(siteId)
runPhase('tests/parity/measure.mjs', siteId, measureFile)

const measure = readPhase(measureFile)
const tokensFile = resolve(repoRoot, 'fixtures/sites', siteId, 'analysis/tokens.json')
const tokens = existsSync(tokensFile) ? JSON.parse(readFileSync(tokensFile, 'utf8')) : undefined
const maintain = checkMaintainability(repoRoot, { tokens })
writeJson(resolve(repoRoot, 'temp/clone-loop', siteId, 'maintain.json'), maintain)

const stageFailures = []
if (maintain?.pass === false) {
  for (const failure of maintain.failures ?? []) {
    stageFailures.push({ ...failure, phase: 'maintainability' })
  }
}
for (const result of measure?.results ?? []) {
  stageFailures.push(...(result.failures ?? []))
  for (const section of result.sections ?? []) {
    if (section.pass === false) {
      stageFailures.push({
        kind: section.reason,
        reason: section.reason,
        section: section.id,
        stage: section.stage,
        failures: section.failures,
      })
    }
  }
}
const activeStage = earliestStageOf(stageFailures, sharedIds)
const skippedVisual = Boolean(activeStage && shouldSkipStage(activeStage, STAGES.visual))
if (skippedVisual) {
  writeJson(visualFile, {
    phase: 'visual',
    siteId,
    complete: true,
    skipped: true,
    reason: activeStage,
    results: [],
  })
} else {
  runPhase('tests/parity/visual.mjs', siteId, visualFile)
}

const visual = readPhase(visualFile)
const report = buildOracleReport({
  siteId,
  measure,
  visual,
  maintain,
  concluded: args.conclude === true,
  sharedIds,
  previous,
  skippedVisual,
})
writeJson(reportFile, report)
if (report.memory) writeLoopMemory(repoRoot, siteId, report.memory)

if (report.status === STATUS.incomplete) {
  console.error('Clone loop did not finish the current stage or maintainability. See the messages above.')
  console.error(`partial report: ${reportFile}`)
  process.exit(1)
}

console.log(`Oracle status: ${report.status}`)
if (report.brief) console.error(report.brief)
else if (report.next?.repair) console.error(report.next.repair)
if (report.stuck) {
  console.error('The same next failed repeatedly. Stop and run recap. Do not keep retrying this item.')
  console.error('  node scripts/recap-daily.mjs')
}

if (report.status === STATUS.ready_for_review) {
  console.log(`Ready for review. Passed: ${report.passed.join(', ') || '(none)'}`)
  if (args['write-lesson']) {
    if (typeof args.slug !== 'string') {
      console.error('Pass --slug with --write-lesson.')
      process.exit(1)
    }
    const relative = writeLesson(siteId, args.slug)
    console.log(`Lesson draft: ${relative}`)
  } else {
    console.log('Write a lesson before you call the site done:')
    console.log(`  node scripts/clone-loop.mjs --site ${siteId} --write-lesson --slug <slug>`)
    console.log('After the lesson is reusable and public-safe, preview a template PR:')
    console.log('  node scripts/promote-experience.mjs')
  }
  process.exit(0)
}

console.error(`Residuals: ${report.residuals.length}. Repair only next. Full list: ${reportFile}`)
console.error('The script is the oracle. Do not declare the clone done from a model judgment.')

process.exit(exitCodeFor(report.status))
