import {
  applyLoopMemory,
  stageForFailure,
  stageIndex,
  STAGES,
} from './schedule.js'

export const STATUS = {
  incomplete: 'incomplete',
  failed: 'failed',
  adapt_failed: 'adapt_failed',
  failed_with_residuals: 'failed_with_residuals',
  ready_for_review: 'ready_for_review',
}

export function exitCodeFor(status) {
  if (status === STATUS.ready_for_review) return 0
  if (status === STATUS.incomplete) return 1
  if (status === STATUS.failed) return 2
  if (status === STATUS.adapt_failed) return 3
  if (status === STATUS.failed_with_residuals) return 4
  return 1
}

function resultKey(result) {
  return result.viewport ? `${result.route}@${result.viewport}` : result.route
}

function failingSections(result) {
  return (result.sections ?? []).filter((section) => section.pass === false)
}

export function residualsFrom(measure, visual, maintain, styles, sharedIds = []) {
  const residuals = []
  for (const item of maintain?.failures ?? []) {
    residuals.push({
      kind: item.kind,
      key: item.key,
      item: item.item,
      phase: 'maintainability',
    })
  }
  for (const payload of [measure, visual, styles]) {
    for (const result of payload?.results ?? []) {
      if (result.pass && !failingSections(result).length) continue
      const sections = failingSections(result)
      if (sections.length > 0) {
        for (const section of sections) {
          residuals.push({
            route: result.route,
            viewport: result.viewport,
            mode: result.mode,
            path: result.path,
            phase: payload.phase,
            section: section.id,
            score: section.score,
            reason: section.reason,
            evidence: section.diffPath ?? result.diffPath,
            failures: section.failures ?? [],
          })
        }
      }
      if (result.failures?.length && sections.length === 0) {
        residuals.push({
          route: result.route,
          viewport: result.viewport,
          mode: result.mode,
          path: result.path,
          phase: payload.phase,
          score: result.score,
          reason: result.failures[0]?.kind,
          evidence: result.diffPath,
          failures: result.failures,
        })
      }
    }
  }
  for (const item of residuals) {
    if (!item.stage) item.stage = stageForFailure(item, sharedIds)
  }
  return residuals
}

export function pickNext({ maintain, measure, visual, styles, sharedIds = [] }) {
  if (maintain && maintain.pass === false && (maintain.failures?.length ?? 0) > 0) {
    const failure = maintain.failures[0]
    return {
      kind: 'maintainability',
      phase: 'maintainability',
      stage: STAGES.maintainability,
      reason: failure.kind,
      item: failure.item,
      repair: 'Repair maintainability first. A high pixel score with unreadable source is a fail.',
    }
  }

  const candidates = []
  for (const payload of [measure, visual, styles]) {
    for (const result of payload?.results ?? []) {
      for (const section of failingSections(result)) {
        const evidence = section.failures?.[0]?.item ?? result.failures?.[0]?.item
        const stage = section.stage ?? stageForFailure({ ...section, kind: section.reason, section: section.id, failures: section.failures }, sharedIds)
        candidates.push({
          kind: 'section',
          phase: payload.phase,
          stage,
          route: result.route,
          viewport: result.viewport,
          mode: result.mode,
          path: result.path,
          section: section.id,
          score: section.score ?? 0,
          reason: section.reason,
          item: evidence,
          blame: section.blame,
          evidence: section.diffPath ?? result.diffPath,
          failures: section.failures ?? [],
          repair: `Repair this section next: ${result.route}@${result.viewport ?? 'default'} #${section.id}. Do not declare the clone done.`,
        })
      }
      if (result.pass === false && failingSections(result).length === 0) {
        const failure = result.failures?.[0]
        const stage = stageForFailure(failure ?? { kind: 'failed', phase: payload.phase }, sharedIds)
        candidates.push({
          kind: 'route',
          phase: payload.phase,
          stage,
          route: result.route,
          viewport: result.viewport,
          mode: result.mode,
          path: result.path,
          score: result.score ?? 0,
          reason: failure?.kind ?? 'failed',
          item: failure?.item,
          evidence: result.diffPath,
          failures: result.failures ?? [],
          repair: `Repair this route next: ${resultKey(result)}. Do not declare the clone done.`,
        })
      }
    }
  }

  if (candidates.length === 0) return null
  const ranked = [...candidates].sort((left, right) => {
    const stageDiff = stageIndex(left.stage) - stageIndex(right.stage)
    if (stageDiff !== 0) return stageDiff
    if ((left.mode === 'strict') !== (right.mode === 'strict')) return left.mode === 'strict' ? -1 : 1
    return (left.score ?? 0) - (right.score ?? 0)
  })
  return ranked[0]
}

export function summarizeRoutes(measure, visual, styles) {
  const byKey = new Map()
  for (const payload of [measure, visual, styles]) {
    for (const result of payload?.results ?? []) {
      const key = resultKey(result)
      const current = byKey.get(key) ?? []
      current.push({ phase: payload.phase, ...result })
      byKey.set(key, current)
    }
  }
  const failed = []
  const passed = []
  for (const [key, parts] of byKey) {
    const bad = parts.filter((part) => !part.pass || failingSections(part).length > 0)
    if (bad.length === 0) {
      passed.push(key)
      continue
    }
    for (const part of bad) {
      failed.push({
        route: part.route,
        viewport: part.viewport,
        mode: part.mode,
        path: part.path,
        phase: part.phase,
        sections: failingSections(part),
        failures: part.failures ?? [],
      })
    }
  }
  return { failed, passed }
}


export function exactPixelSummary(visual) {
  const routes = (visual?.results ?? [])
    .filter((item) => typeof item.exactRatio === 'number' && item.exactRatio > 0)
    .map((item) => ({
      route: item.route,
      viewport: item.viewport,
      mode: item.mode,
      exactMismatched: item.exactMismatched ?? null,
      exactRatio: item.exactRatio,
      pass: item.pass,
    }))
    .sort((left, right) => right.exactRatio - left.exactRatio)
  return {
    maxExactRatio: routes[0]?.exactRatio ?? 0,
    routes,
  }
}

function fallbackStage({ status, measure, visualComplete }) {
  if (status === STATUS.ready_for_review) return null
  if (measure?.complete && !visualComplete) return STAGES.visual
  return STAGES.gates
}

export function buildOracleReport({
  siteId,
  measure,
  visual,
  maintain,
  styles,
  concluded = false,
  sharedIds = [],
  previous = null,
  skippedVisual = false,
} = {}) {
  const visualComplete = Boolean(visual?.complete || visual?.skipped || skippedVisual)
  const complete = Boolean(measure?.complete && visualComplete && maintain)
  const { failed, passed } = summarizeRoutes(measure, visual, styles)
  const residuals = residualsFrom(measure, visual, maintain, styles, sharedIds)
  const next = pickNext({ maintain, measure, visual, styles, sharedIds })
  const maintainFailed = maintain ? maintain.pass === false : false
  const strictFailed = failed.some((item) => item.mode === 'strict')
  const adaptFailed = failed.some((item) => item.mode === 'adapt')

  let status = STATUS.incomplete
  if (complete) {
    if (!maintainFailed && !strictFailed && !adaptFailed) status = STATUS.ready_for_review
    else if (!maintainFailed && !strictFailed && adaptFailed) status = STATUS.adapt_failed
    else status = STATUS.failed
  }
  if (concluded && status !== STATUS.ready_for_review) status = STATUS.failed_with_residuals

  const report = {
    complete,
    siteId,
    status,
    stage: next?.stage ?? fallbackStage({ status, measure, visualComplete }),
    next,
    failed,
    passed,
    residuals,
    maintainability: maintain ?? null,
    concluded,
    skippedVisual: Boolean(skippedVisual || visual?.skipped),
    exactPixel: exactPixelSummary(visual),
  }
  return applyLoopMemory(report, previous)
}
