import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseSharedComponentIds } from './gates.js'
import { repoRoot } from './paths.js'

export const STAGES = {
  gates: 'gates',
  maintainability: 'maintainability',
  component: 'component',
  composition: 'composition',
  layout_style: 'layout_style',
  visual: 'visual',
  interactive: 'interactive',
}

export const STAGE_ORDER = [
  STAGES.gates,
  STAGES.maintainability,
  STAGES.component,
  STAGES.composition,
  STAGES.layout_style,
  STAGES.visual,
  STAGES.interactive,
]

export const FUSE_LIMIT = 4

const MAINTAIN_KINDS = new Set(['hotlink', 'tokens', 'section-source', 'maintainability'])
const VISUAL_KINDS = new Set(['pixel-diff', 'baseline-missing'])
const LAYOUT_KINDS = new Set(['style-mismatch', 'size-mismatch', 'section-box-missing'])

export function stageIndex(stage) {
  const index = STAGE_ORDER.indexOf(stage)
  return index === -1 ? STAGE_ORDER.indexOf(STAGES.composition) : index
}

export function loadSharedComponentIds(siteId, root = repoRoot) {
  const file = resolve(root, 'fixtures/sites', siteId, 'analysis/components.md')
  if (!existsSync(file)) return []
  return parseSharedComponentIds(readFileSync(file, 'utf8'))
}

function failureSection(failure) {
  if (failure?.section) return failure.section
  if (failure?.key === 'components' || failure?.key === 'styles') {
    const item = failure.item
    if (typeof item === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(item)) return item
  }
  return undefined
}

export function stageForFailure(failure, sharedIds = []) {
  if (!failure) return STAGES.composition
  const kind = failure.kind ?? failure.reason
  const key = failure.key
  const phase = failure.phase
  const section = failureSection(failure)
  const shared = new Set(sharedIds)

  if (kind === 'gate' || phase === 'gates') return STAGES.gates
  if (phase === 'maintainability' || MAINTAIN_KINDS.has(kind)) return STAGES.maintainability
  if (kind === 'interaction' || phase === 'interactive') return STAGES.interactive
  if (VISUAL_KINDS.has(kind) || phase === 'visual') return STAGES.visual
  if (LAYOUT_KINDS.has(kind)) return STAGES.layout_style
  if (kind === 'missing') {
    const id = section ?? (typeof failure.item === 'string' ? failure.item : undefined)
    if (id && shared.has(id)) return STAGES.component
    if (key === 'components' || key === 'styles') {
      return shared.size === 0 || (id && shared.has(id)) ? STAGES.component : STAGES.composition
    }
    if (key === 'structure') return STAGES.composition
    return STAGES.composition
  }
  if (kind === 'extra' || kind === 'order' || kind === 'navigation') return STAGES.composition
  return STAGES.composition
}

export function isBlockingStage(stage) {
  return (
    stage === STAGES.gates ||
    stage === STAGES.maintainability ||
    stage === STAGES.component ||
    stage === STAGES.composition ||
    stage === STAGES.layout_style
  )
}

/** 更早的阶段没过时，不要跑这一阶段（例如结构没过就不跑 visual）。 */
export function shouldSkipStage(activeStage, candidateStage) {
  if (!activeStage) return false
  return stageIndex(candidateStage) > stageIndex(activeStage)
}

export function sectionsFromStructureFailures(failures, sharedIds = []) {
  const sections = []
  const seen = new Set()
  for (const failure of failures ?? []) {
    const id = failureSection(failure)
    if (!id || seen.has(id)) continue
    seen.add(id)
    sections.push({
      id,
      pass: false,
      score: 0,
      reason: failure.kind,
      stage: stageForFailure(failure, sharedIds),
      failures: [failure],
    })
  }
  return sections
}

export function earliestStageOf(failures, sharedIds = []) {
  let earliest = null
  for (const failure of failures ?? []) {
    const stage = failure.stage ?? stageForFailure(failure, sharedIds)
    if (earliest == null || stageIndex(stage) < stageIndex(earliest)) earliest = stage
  }
  return earliest
}

export function nextIdentity(next) {
  if (!next) return null
  const where = next.section ?? next.item ?? ''
  return [next.stage ?? '', next.route ?? '', next.viewport ?? '', where, next.reason ?? ''].join('|')
}

export function residualKey(item) {
  return [
    item?.stage ?? '',
    item?.route ?? '',
    item?.viewport ?? '',
    item?.section ?? item?.item ?? '',
    item?.reason ?? item?.kind ?? '',
  ].join('|')
}

export function memoryPath(root, siteId) {
  return resolve(root, 'temp/clone-loop', siteId, 'memory.json')
}

export function readLoopMemory(root, siteId) {
  const file = memoryPath(root, siteId)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

export function writeLoopMemory(root, siteId, memory) {
  const file = memoryPath(root, siteId)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(memory, null, 2)}\n`)
  return file
}

function firstEvidence(next) {
  if (next?.item && next.kind !== 'section') return next.item
  const failure = next?.failures?.[0]
  return failure?.item ?? null
}


const EXACT_RESIDUAL_NOTE = 0.01

export function formatExactResidual(report) {
  const exact = report.exactPixel
  const ratio = exact?.maxExactRatio ?? 0
  if (ratio < EXACT_RESIDUAL_NOTE) return ''
  const top = exact.routes?.[0]
  const where = top ? `${top.route ?? ''}@${top.viewport ?? 'default'}` : ''
  return `exact_residual=${where} ${(ratio * 100).toFixed(1)}%`.trim()
}

export function compactBrief(report) {
  const next = report.next
  const stage = next?.stage ?? report.stage ?? 'done'
  if (!next) {
    const stuck = report.stuck ? ` stuck=true` : ''
    const exact = formatExactResidual(report)
    return `status=${report.status} stage=${stage}${stuck}${exact ? ` ${exact}` : ''}`
  }
  const where = next.section
    ? `${next.route ?? ''}@${next.viewport ?? 'default'} #${next.section}`
    : (next.item ?? next.route ?? '')
  const lines = [`status=${report.status} stage=${stage} next=${where} reason=${next.reason ?? ''}`]
  const evidence = firstEvidence(next)
  if (evidence) lines.push(evidence)
  if (report.stuck) {
    lines.push(`stuck=true repeats=${report.memory?.repeatCount ?? ''}. Stop and recap. Do not retry this next.`)
  }
  if (report.memory?.regressions?.length) {
    lines.push(`regressions=${report.memory.regressions.length}`)
  }
  lines.push(`residuals=${(report.residuals ?? []).length} (full list in report.json)`)
  return lines.join('\n')
}

export function applyLoopMemory(report, previous = null, options = {}) {
  const fuseLimit = options.fuseLimit ?? FUSE_LIMIT
  const previousMemory = previous?.memory ?? (previous && !previous.status ? previous : null) ?? {}
  const previouslyResolved = previousMemory.resolved ?? []
  const previouslyOpen = previousMemory.open ?? previous?.residuals ?? []
  const resolvedKeys = new Set(previouslyResolved.map(residualKey))
  const current = report.residuals ?? []
  const currentKeys = new Set(current.map(residualKey))

  const regressions = []
  for (const item of current) {
    if (resolvedKeys.has(residualKey(item))) {
      item.regression = true
      regressions.push({ ...item, regression: true })
    }
  }

  const resolved = []
  for (const item of previouslyResolved) {
    if (!currentKeys.has(residualKey(item))) resolved.push(item)
  }
  for (const item of previouslyOpen) {
    const key = residualKey(item)
    if (!currentKeys.has(key) && !resolved.some((entry) => residualKey(entry) === key)) {
      resolved.push({ ...item, resolved: true })
    }
  }

  const identity = nextIdentity(report.next)
  const previousIdentity = previousMemory.nextIdentity ?? nextIdentity(previous?.next)
  const repeatCount = identity && identity === previousIdentity ? (previousMemory.repeatCount ?? 1) + 1 : identity ? 1 : 0
  const stuck = Boolean(identity) && repeatCount >= fuseLimit

  report.memory = {
    resolved,
    open: current.map((item) => ({
      stage: item.stage,
      route: item.route,
      viewport: item.viewport,
      section: item.section,
      reason: item.reason ?? item.kind,
      item: item.item,
    })),
    regressions,
    repeatCount,
    stuck,
    nextIdentity: identity,
  }
  report.stuck = stuck
  if (stuck && report.next) {
    report.next.stuck = true
    report.next.repeatCount = repeatCount
    report.next.repair = `Stuck on the same next after ${repeatCount} attempts. Stop and run recap. Do not keep retrying this item. ${report.next.repair}`
  }
  report.brief = compactBrief(report)
  return report
}
