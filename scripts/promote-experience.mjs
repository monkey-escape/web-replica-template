import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from '@replica/parity/args'
import { repoRoot } from '@replica/parity/paths'
import {
  DEFAULT_TEMPLATE_REMOTE,
  EXPERIENCE_TRAPS_FILE,
  assessRemotes,
  formatPromotionPlan,
  planPromotion,
} from '@replica/parity/promote-experience'

const args = parseArgs(process.argv.slice(2))

function help() {
  console.log(`Usage:
  node scripts/promote-experience.mjs
  node scripts/promote-experience.mjs --pr
  node scripts/promote-experience.mjs --self-test

Run this from an implementation repo, after a lesson has been written and edited.
The template itself does not run the clone; reusable lessons and new traps go back
to the template through a pull request.

  1. Wait until clone-loop is ready_for_review, or a lesson exists after failed_with_residuals.
  2. Write and edit docs/experience/lessons/ so the note is reusable and has no business data.
  3. Run this command to preview what would be copied (apps, fixtures, baselines, and API data stay behind).
  4. Re-run with --pr to open a branch and pull request against the template upstream.

Site names and target hostnames are redacted in the copies. Secrets are refused.
The implementation repo should keep the public template as git remote "upstream".`)
}

function git(cwd, gitArgs, options = {}) {
  const result = spawnSync('git', gitArgs, {
    cwd,
    encoding: 'utf8',
    ...options,
  })
  if ((result.status ?? 1) !== 0 && options.allowFail !== true) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`git ${gitArgs.join(' ')} failed${detail ? `: ${detail}` : ''}`)
  }
  return result
}

function listRemotes(root) {
  const result = git(root, ['remote', '-v'], { allowFail: true })
  const seen = new Map()
  for (const line of (result.stdout ?? '').split('\n')) {
    const [name, url] = line.trim().split(/\s+/)
    if (name && url && !seen.has(name)) seen.set(name, { name, url })
  }
  return [...seen.values()]
}

function resolveTemplateRemote(root) {
  const remotes = listRemotes(root)
  const assessment = assessRemotes(remotes)
  if (typeof args.remote === 'string') {
    return { name: args.remote, url: remoteUrl(root, args.remote) || remotes.find((row) => row.name === args.remote)?.url, assessment, missing: !remoteUrl(root, args.remote) }
  }
  if (assessment.upstreamIsTemplate) {
    const upstream = remotes.find((row) => row.name === 'upstream')
    return { name: 'upstream', url: upstream.url, assessment, missing: false }
  }
  return { name: 'upstream', url: DEFAULT_TEMPLATE_REMOTE, assessment, missing: true }
}

function remoteUrl(root, name) {
  const result = git(root, ['remote', 'get-url', name], { allowFail: true })
  return (result.stdout ?? '').trim()
}

function readTemplateExperience(root, remote) {
  if (remote.missing) return { lessons: [], traps: '' }
  const show = (path) => {
    const result = git(root, ['show', `${remote.name}/main:${path}`], { allowFail: true })
    return result.status === 0 ? result.stdout : ''
  }
  git(root, ['fetch', remote.name, 'main'], { allowFail: true })
  const ls = git(root, ['ls-tree', '--name-only', `${remote.name}/main`, 'docs/experience/lessons/'], { allowFail: true })
  const lessons = (ls.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.md') && !/readme\.md$/i.test(line))
    .map((line) => line.split('/').pop())
  return { lessons, traps: show(EXPERIENCE_TRAPS_FILE) }
}

function uniqueBranchName() {
  const date = new Date().toISOString().slice(0, 10)
  return `experience/${date}-promote`
}

function writeWorktreeFiles(worktree, files) {
  for (const file of files) {
    const path = join(worktree, file.path)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, file.text)
  }
}

function openPullRequest(root, plan) {
  const remote = resolveTemplateRemote(root)
  if (!remote.assessment?.ok) {
    for (const issue of remote.assessment?.issues ?? ['The template must be git remote "upstream".']) {
      console.error(issue)
    }
    process.exit(1)
  }
  const fetch = git(root, ['fetch', remote.name, 'main'], { allowFail: true })
  if ((fetch.status ?? 1) !== 0) {
    console.error(`Could not fetch ${remote.name}/main. Set the template as git remote "upstream" and try again.`)
    process.exit(1)
  }
  const worktree = mkdtempSync(join(tmpdir(), 'web-replica-promote-'))
  const branch = typeof args.branch === 'string' ? args.branch : uniqueBranchName()
  git(root, ['worktree', 'add', '-B', branch, worktree, `${remote.name}/main`])
  try {
    writeWorktreeFiles(worktree, plan.files)
    git(worktree, ['add', '--', ...plan.files.map((file) => file.path)])
    const staged = git(worktree, ['status', '--porcelain'])
    if (!(staged.stdout ?? '').trim()) {
      console.error('Nothing to commit after syncing with the template.')
      process.exit(1)
    }
    git(worktree, [
      'commit',
      '-m',
      'Add reusable clone-loop experience from an implementation repo',
    ], { env: { ...process.env, GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME, GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME } })
    const push = git(worktree, ['push', '-u', remote.name, branch], { allowFail: true })
    if ((push.status ?? 1) !== 0) {
      console.error((push.stderr || push.stdout || 'git push failed').trim())
      console.error(`The branch is at ${worktree} as ${branch}. Push it to the template and open a pull request.`)
      process.exit(1)
    }
    const pr = spawnSync(
      'gh',
      [
        'pr',
        'create',
        '--repo',
        repoFromRemote(remote.url),
        '--base',
        'main',
        '--head',
        branch,
        '--title',
        'Add reusable clone-loop experience',
        '--body',
        [
          'This pull request is opened from an implementation repo.',
          'It promotes only reusable lessons and new traps in `docs/experience/`.',
          'It does not copy site fixtures, baselines, apps, or API data.',
          '',
          'Files:',
          ...plan.files.map((file) => `- ${file.path}`),
        ].join('\n'),
      ],
      { cwd: worktree, encoding: 'utf8' },
    )
    if ((pr.status ?? 1) !== 0) {
      console.error((pr.stderr || pr.stdout || 'gh pr create failed').trim())
      console.error(`Branch ${branch} was pushed to ${remote.name}. Open the pull request manually if needed.`)
      process.exit(1)
    }
    console.log((pr.stdout ?? '').trim())
  } finally {
    git(root, ['worktree', 'remove', '--force', worktree], { allowFail: true })
  }
}

function repoFromRemote(url) {
  const trimmed = (url ?? '').trim()
  const ssh = trimmed.match(/github\.com[:/](.+?)(?:\.git)?$/)
  if (ssh) return ssh[1]
  return 'monkey-escape/web-replica-template'
}

if (args.help) {
  help()
  process.exit(0)
}

if (args['self-test']) {
  const plan = planPromotion(
    mkdtempSync(join(tmpdir(), 'promote-self-')),
    {
      siteIds: ['trial'],
      lessons: ['docs/experience/lessons/2026-11-22-demo.md'],
      reports: [{ file: 'temp/clone-loop/trial/report.json', siteId: 'trial', status: 'ready_for_review', complete: true }],
      hostnames: [],
      templateLessons: [],
      templateTraps: '# 陷阱库\n\n## Active traps\n\n当前没有。\n',
      lessonText: { 'docs/experience/lessons/2026-11-22-demo.md': '# demo\n\nReusable note.\n' },
      implementationTraps: '# 陷阱库\n\n## Active traps\n\n当前没有。\n',
    },
  )
  const text = formatPromotionPlan(plan)
  if (!plan.ok || !text.includes('Ready to promote') || !text.includes('--pr')) {
    console.error('promote-experience self-test failed')
    process.exit(1)
  }
  console.log('promote-experience self-test passed')
  process.exit(0)
}

const remote = resolveTemplateRemote(repoRoot)
if (remote.assessment?.issues?.length) {
  for (const issue of remote.assessment.issues) console.error(issue)
  if (args.pr && !remote.assessment.ok) process.exit(1)
}
const template = readTemplateExperience(repoRoot, remote)
const plan = planPromotion(repoRoot, {
  templateLessons: template.lessons,
  templateTraps: template.traps,
})
console.log(formatPromotionPlan(plan))
if (!plan.ok) process.exit(1)
if (args.pr) openPullRequest(repoRoot, plan)
else console.log('No pull request opened. Re-run with --pr after the lesson looks reusable.')
