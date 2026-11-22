import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

export const EXPERIENCE_LESSONS_DIR = 'docs/experience/lessons'
export const EXPERIENCE_TRAPS_FILE = 'docs/experience/traps.md'
export const DEFAULT_TEMPLATE_REMOTE = 'https://github.com/monkey-escape/web-replica-template.git'

const SECRET_PATTERN =
  /authorization\s*[:=]|api[_-]?key\s*[:=]|-----begin |password\s*[:=]|secret\s*[:=]|cookie\s*[:=]\s*[^\s]+/i

export function implementationSiteIds(root) {
  const dir = join(root, 'fixtures/sites')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'example' && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
}

export function isImplementationRepo(root) {
  return implementationSiteIds(root).length > 0
}

export function listLessonFiles(root) {
  const dir = join(root, EXPERIENCE_LESSONS_DIR)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md')
    .map((name) => join(EXPERIENCE_LESSONS_DIR, name))
    .sort()
}

export function collectReports(root) {
  const dir = join(root, 'temp/clone-loop')
  if (!existsSync(dir)) return []
  const reports = []
  for (const site of readdirSync(dir, { withFileTypes: true })) {
    if (!site.isDirectory()) continue
    const file = join(dir, site.name, 'report.json')
    if (!existsSync(file)) continue
    try {
      const payload = JSON.parse(readFileSync(file, 'utf8'))
      reports.push({
        file: `temp/clone-loop/${site.name}/report.json`,
        siteId: payload.siteId ?? site.name,
        status: payload.status ?? null,
        complete: payload.complete === true,
      })
    } catch {
      reports.push({ file: `temp/clone-loop/${site.name}/report.json`, siteId: site.name, status: null, complete: false })
    }
  }
  return reports
}

export function profileHostnames(root, siteIds) {
  const hosts = []
  for (const siteId of siteIds) {
    const file = join(root, 'tests/parity/profiles', `${siteId}.json`)
    if (!existsSync(file)) continue
    try {
      const profile = JSON.parse(readFileSync(file, 'utf8'))
      for (const value of [profile.targetBaseUrl, profile.baseUrl]) {
        if (typeof value !== 'string') continue
        try {
          hosts.push(new URL(value).hostname)
        } catch {
          // ignore unparsable URLs
        }
      }
    } catch {
      // ignore unreadable profiles
    }
  }
  return [...new Set(hosts)]
}

export function sanitizeLesson(text, { siteIds = [], hostnames = [] } = {}) {
  const findings = []
  if (SECRET_PATTERN.test(text)) findings.push('secret')
  let sanitized = text
  for (const host of hostnames.filter(Boolean)) {
    if (sanitized.includes(host)) {
      findings.push(`hostname:${host}`)
      sanitized = sanitized.split(host).join('the-target-site')
    }
  }
  for (const siteId of siteIds.filter(Boolean)) {
    if (sanitized.includes(siteId)) {
      findings.push(`site:${siteId}`)
      sanitized = sanitized.split(siteId).join('trial-site')
    }
  }
  return {
    text: sanitized,
    findings,
    blocked: findings.includes('secret'),
    redacted: findings.some((item) => item.startsWith('hostname:') || item.startsWith('site:')),
  }
}

export function redactPath(relative, siteIds = []) {
  let path = relative
  for (const siteId of siteIds.filter(Boolean)) {
    path = path.split(siteId).join('trial-site')
  }
  return path
}

export function assessRemotes(remotes = []) {
  const issues = []
  const origin = remotes.find((row) => row.name === 'origin')
  const upstream = remotes.find((row) => row.name === 'upstream')
  const originIsTemplate = Boolean(origin && /web-replica-template/.test(origin.url ?? ''))
  const upstreamIsTemplate = Boolean(upstream && /web-replica-template/.test(upstream.url ?? ''))
  if (originIsTemplate && !upstreamIsTemplate) {
    issues.push('origin points at the public template. Keep the implementation repo on a private origin, and add the template as git remote "upstream".')
  }
  if (!upstreamIsTemplate) {
    issues.push(`add the public template as git remote "upstream": git remote add upstream ${DEFAULT_TEMPLATE_REMOTE}`)
  }
  return {
    ok: upstreamIsTemplate,
    issues,
    originIsTemplate,
    upstreamIsTemplate,
    pushRemote: upstreamIsTemplate ? 'upstream' : null,
  }
}

export function parseActiveTrapIds(markdown) {

  const section = (markdown ?? '').split('## Active traps')[1] ?? ''
  return [...section.matchAll(/^id:\s*(trap-\d+)/gm)].map((match) => match[1])
}

export function extractActiveTrapBlocks(markdown) {
  const section = (markdown ?? '').split('## Active traps')[1] ?? ''
  const trimmed = section.trim()
  if (!trimmed || /^当前没有/.test(trimmed)) return []
  const blocks = []
  const parts = trimmed.split(/^(?=id:\s*trap-\d+)/m)
  for (const part of parts) {
    const text = part.trim()
    const id = text.match(/^id:\s*(trap-\d+)/)?.[1]
    if (id) blocks.push({ id, text: text.replace(/\s+$/, '') + '\n' })
  }
  return blocks
}

export function mergeTraps(templateMarkdown, implementationMarkdown) {
  const templateIds = new Set(parseActiveTrapIds(templateMarkdown))
  const incoming = extractActiveTrapBlocks(implementationMarkdown).filter((block) => !templateIds.has(block.id))
  if (incoming.length === 0) {
    return { markdown: templateMarkdown, added: [] }
  }
  const base = templateMarkdown.replace(/\s+$/, '')
  const withoutPlaceholder = base.replace(/\n当前没有。\s*$/, '\n')
  const markdown = `${withoutPlaceholder}\n\n${incoming.map((block) => block.text.trimEnd()).join('\n\n')}\n`
  return { markdown, added: incoming.map((block) => block.id) }
}

export function promotionReadiness(root, options = {}) {
  const siteIds = options.siteIds ?? implementationSiteIds(root)
  const lessons = options.lessons ?? listLessonFiles(root)
  const reports = options.reports ?? collectReports(root)
  const reasons = []
  const hasReady = reports.some((item) => item.status === 'ready_for_review')
  const hasRecapFailure = reports.some((item) => item.status === 'failed_with_residuals')
  if (siteIds.length === 0) {
    reasons.push('run this from an implementation repo (a site other than example), not from the template')
  } else {
    if (lessons.length === 0) {
      reasons.push('write and edit a lesson first: node scripts/clone-loop.mjs --site <site-id> --write-lesson --slug <slug>')
    }
    if (!hasReady && !hasRecapFailure) {
      reasons.push('wait until clone-loop is ready_for_review, or write a lesson after failed_with_residuals')
    }
  }
  return {
    ok: reasons.length === 0,
    reasons,
    siteIds,
    lessons,
    reports,
    hasReady,
    hasRecapFailure,
  }
}

export function planPromotion(root, options = {}) {
  const readiness = promotionReadiness(root, options)
  const hostnames = options.hostnames ?? profileHostnames(root, readiness.siteIds)
  const templateLessons = new Set(options.templateLessons ?? [])
  const templateTraps = options.templateTraps ?? ''
  const files = []
  const blocked = []
  const warnings = []

  for (const relative of readiness.lessons) {
    const name = basename(relative)
    if (templateLessons.has(name) || templateLessons.has(relative)) {
      warnings.push(`${relative} already exists on the template; it will not be overwritten`)
      continue
    }
    const source = options.lessonText?.[relative] ?? readFileSync(join(root, relative), 'utf8')
    const sanitized = sanitizeLesson(source, { siteIds: readiness.siteIds, hostnames })
    const path = redactPath(relative, readiness.siteIds)
    if (sanitized.blocked) {
      blocked.push({ path, findings: sanitized.findings })
      continue
    }
    files.push({
      path,
      sourcePath: relative,
      text: sanitized.text,
      redacted: sanitized.redacted || path !== relative,
      findings: sanitized.findings,
    })
  }

  const localTraps = options.implementationTraps ?? (
    existsSync(join(root, EXPERIENCE_TRAPS_FILE))
      ? readFileSync(join(root, EXPERIENCE_TRAPS_FILE), 'utf8')
      : ''
  )
  const traps = mergeTraps(templateTraps || defaultTrapsSkeleton(), localTraps)
  if (traps.added.length > 0) {
    files.push({
      path: EXPERIENCE_TRAPS_FILE,
      text: traps.markdown,
      redacted: false,
      findings: traps.added.map((id) => `trap:${id}`),
    })
  }

  return {
    ...readiness,
    ok: readiness.ok && blocked.length === 0 && files.length > 0,
    reasons: [
      ...readiness.reasons,
      ...blocked.map((item) => `${item.path} looks like it contains a secret and cannot be promoted`),
      ...(readiness.ok && blocked.length === 0 && files.length === 0
        ? ['nothing new to promote: lessons already exist on the template and there are no new traps']
        : []),
    ],
    hostnames,
    blocked,
    warnings,
    files,
    addedTraps: traps.added,
  }
}

function defaultTrapsSkeleton() {
  return `# 陷阱库\n\n## Active traps\n\n当前没有。\n`
}

export function formatPromotionPlan(plan) {
  const lines = []
  if (!plan.ok) {
    lines.push('Experience is not ready to promote to the template:')
    for (const reason of plan.reasons) lines.push(`- ${reason}`)
    return lines.join('\n')
  }
  lines.push('Ready to promote reusable experience to the template.')
  lines.push('This copies only docs/experience lessons and new traps. It does not copy apps, fixtures, baselines, or API data.')
  if (plan.hasReady) lines.push('Timing: a clone-loop report is ready_for_review.')
  else if (plan.hasRecapFailure) lines.push('Timing: a lesson exists after failed_with_residuals.')
  for (const file of plan.files) {
    const note = file.redacted ? ' (site names redacted)' : ''
    lines.push(`- ${file.path}${note}`)
  }
  for (const warning of plan.warnings) lines.push(`warning: ${warning}`)
  lines.push('Preview with: node scripts/promote-experience.mjs')
  lines.push('Open a PR with: node scripts/promote-experience.mjs --pr')
  return lines.join('\n')
}
