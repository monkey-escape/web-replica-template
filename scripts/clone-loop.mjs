import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from '@replica/parity/args'
import { checkGates, nextTrapId } from '@replica/parity/gates'
import { repoRoot } from '@replica/parity/paths'
import { writeJson } from '@replica/parity/report'

const args = parseArgs(process.argv.slice(2))

function help() {
  console.log(`Usage:
  node scripts/clone-loop.mjs --self-test
  node scripts/clone-loop.mjs --site <site-id>
  node scripts/clone-loop.mjs --site <site-id> --write-lesson --slug <slug>

Runs the clone loop for one site:
  1. Refuse to start unless analysis files and the trap check exist.
  2. Run tests/parity/measure.mjs and tests/parity/visual.mjs.
  3. Write temp/clone-loop/<site-id>/report.json with failed routes only.
  4. Exit 2 when a strict route is still not 1:1.
  5. Exit 3 when only adapt routes failed.

The loop does not rewrite reference screenshots. Capture those during analysis:

  node tests/parity/visual.mjs --site <site-id> --capture-reference --allow-strict-capture

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

function summarize(measure, visual) {
  const byRoute = new Map()
  for (const payload of [measure, visual]) {
    for (const result of payload?.results ?? []) {
      const current = byRoute.get(result.route) ?? []
      current.push({ phase: payload.phase, ...result })
      byRoute.set(result.route, current)
    }
  }

  const failed = []
  const passed = []
  for (const [route, parts] of byRoute) {
    const bad = parts.filter((part) => !part.pass)
    if (bad.length === 0) {
      passed.push(route)
      continue
    }
    for (const part of bad) {
      failed.push({
        route,
        mode: part.mode,
        path: part.path,
        phase: part.phase,
        failures: part.failures ?? [],
      })
    }
  }
  return { failed, passed }
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
  console.log('clone-loop self-test passed')
  process.exit(0)
}

if (args['capture-reference'] || args['update-baseline']) {
  console.error('The fix loop does not rewrite reference screenshots.')
  console.error('During analysis only:')
  console.error(
    '  node tests/parity/visual.mjs --site <site-id> --capture-reference --allow-strict-capture',
  )
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
    phase: 'gates',
    failed: gates.errors.map((item) => ({
      route: '*',
      mode: 'strict',
      phase: 'gates',
      failures: [{ kind: 'gate', key: 'analysis', item }],
    })),
    passed: [],
  })
  console.error('Clone loop stopped before implementation checks:')
  for (const error of gates.errors) console.error(`- ${error}`)
  process.exit(1)
}

const measureFile = resolve(repoRoot, 'temp/clone-loop', siteId, 'measure.json')
const visualFile = resolve(repoRoot, 'temp/clone-loop', siteId, 'visual.json')
runPhase('tests/parity/measure.mjs', siteId, measureFile)
runPhase('tests/parity/visual.mjs', siteId, visualFile)

const measure = readPhase(measureFile)
const visual = readPhase(visualFile)
const complete = Boolean(measure?.complete && visual?.complete)
const { failed, passed } = summarize(measure, visual)

writeJson(reportFile, {
  complete,
  siteId,
  failed,
  passed,
})

if (!complete) {
  console.error('Clone loop did not finish both phases. See the messages above.')
  console.error(`partial report: ${reportFile}`)
  process.exit(1)
}

if (failed.length === 0) {
  console.log(`Clone loop passed for ${siteId}. Passed routes: ${passed.join(', ') || '(none)'}`)
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
  }
  process.exit(0)
}

console.error(`Failed items only (${failed.length}). Do not rework routes that passed.`)
for (const item of failed) {
  console.error(`- [${item.mode}] ${item.phase} ${item.route} ${item.path ?? ''}`)
  for (const failure of item.failures)
    console.error(`    ${failure.kind} ${failure.key}: ${failure.item}`)
}

if (failed.some((item) => item.mode === 'strict')) {
  console.error(
    'Strict routes are not 1:1 yet. Keep looping. Do not raise the diff ratio or add accepted diffs.',
  )
  process.exit(2)
}

console.error(
  'Only adapt routes failed. Fix them, or record a difference that docs/adapt.md already allows.',
)
console.error(`report: ${reportFile}`)
process.exit(3)
