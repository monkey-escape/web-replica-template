import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { parseArgs } from '@replica/parity/args'
import { repoRoot } from '@replica/parity/paths'
import { renderRecap } from '@replica/parity/recap'
import { findRot } from '@replica/parity/rot'

const args = parseArgs(process.argv.slice(2))

function help() {
  console.log(`Usage:
  node scripts/recap-daily.mjs [--date YYYY-MM-DD] [--force] [--apply-clean]
  node scripts/recap-daily.mjs --self-test

Reads the day's git commits and every JSON log under temp/clone-loop.
Logs without "complete": true are listed and then ignored.
--apply-clean deletes only:
  - files whose first line contains @replica-rotten
  - *.bak, *.orig, and *.obsolete.*
  - files under temp/`)
}

function commitsFor(date) {
  try {
    const output = execFileSync(
      'git',
      ['log', `--since=${date}T00:00:00Z`, `--until=${date}T23:59:59Z`, '--pretty=format:%h %s'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    )
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function collectLogs(dir, found) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      collectLogs(full, found)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const file = relative(repoRoot, full)
    try {
      const value = JSON.parse(readFileSync(full, 'utf8'))
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        found.push({ file, complete: false, siteId: 'unknown' })
        continue
      }
      found.push({ ...value, file })
    } catch {
      found.push({ file, complete: false, siteId: 'unknown' })
    }
  }
}

function safeRemove(root, relPath) {
  const rootResolved = resolve(root)
  const full = resolve(root, relPath)
  if (full !== rootResolved && !full.startsWith(`${rootResolved}${sep}`))
    throw new Error(`Refusing to delete ${relPath}`)
  if (!existsSync(full) || !statSync(full).isFile()) return false
  rmSync(full)
  return true
}

if (args.help) {
  help()
  process.exit(0)
}

if (args['self-test']) {
  const markdown = renderRecap({
    date: '2026-11-22',
    commits: ['abc1234 add template'],
    reports: [
      {
        file: 'temp/clone-loop/example/report.json',
        complete: true,
        siteId: 'example',
        failed: [],
        passed: ['home'],
      },
      {
        file: 'temp/clone-loop/example/partial.json',
        complete: false,
        siteId: 'example',
      },
    ],
    rot: [],
  })
  if (
    !markdown.includes('abc1234 add template') ||
    !markdown.includes('未纳入复盘的日志') ||
    !markdown.includes('partial.json')
  ) {
    console.error('recap self-test failed')
    process.exit(1)
  }
  console.log('recap self-test passed')
  process.exit(0)
}

const date = typeof args.date === 'string' ? args.date : new Date().toISOString().slice(0, 10)
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Pass --date as YYYY-MM-DD.')
  process.exit(1)
}

const reports = []
collectLogs(resolve(repoRoot, 'temp/clone-loop'), reports)
const rot = findRot(repoRoot)
let markdown = renderRecap({
  date,
  commits: commitsFor(date),
  reports,
  rot,
})

const cleaned = []
if (args['apply-clean']) {
  for (const item of rot) {
    if (!item.deletable) continue
    if (safeRemove(repoRoot, item.path)) cleaned.push(item.path)
  }
  markdown = `${markdown.replace(
    '- 尚未执行清理。',
    cleaned.length === 0
      ? '- 没有删除任何文件。'
      : cleaned.map((file) => `- 已删除 \`${file}\``).join('\n'),
  )}\n`
}

const target = resolve(repoRoot, 'docs/recap', `${date}.md`)
if (existsSync(target) && args.force !== true) {
  console.error(`${target} already exists. Re-run with --force to replace it.`)
  process.exit(1)
}

writeFileSync(target, markdown)
console.log(`Wrote ${relative(repoRoot, target)}`)
