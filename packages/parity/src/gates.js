import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { readApiMocksDecision } from './api-capture.js'
import { assertSiteId, repoRoot } from './paths.js'

const ANALYSIS_FILES = [
  'analysis/overview.md',
  'analysis/tokens.json',
  'analysis/components.md',
  'analysis/interactions.md',
  'analysis/screenshots/README.md',
  'assets/README.md',
]

const OVERVIEW_MARKERS = ['screenshot', 'structure', 'component', 'interaction', 'token']

function trapSection(markdown) {
  const marker = /^## Active traps\s*$/m
  const match = marker.exec(markdown)
  if (!match) return markdown
  return markdown.slice(match.index + match[0].length)
}

export function activeTrapIds(markdown) {
  const ids = []
  const blocks = trapSection(markdown).matchAll(/```ya?ml\n([\s\S]*?)```/g)
  for (const block of blocks) {
    const body = block[1]
    const id = body.match(/^id:\s*(\S+)\s*$/m)?.[1]
    const status = body.match(/^status:\s*(\S+)\s*$/m)?.[1]
    if (id && status === 'active') ids.push(id)
  }
  return ids
}

export function nextTrapId(markdown) {
  const numbers = [...markdown.matchAll(/^id:\s*trap-(\d+)\s*$/gm)].map((match) => Number(match[1]))
  const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1
  return `trap-${String(next).padStart(4, '0')}`
}

function nonEmpty(file) {
  if (!existsSync(file)) return false
  return statSync(file).size > 0
}


const SHARED_NONE = /shared-components:\s*none\b/i
const SHARED_PENDING = /shared-components:\s*pending\b/i
const SHARED_HEADING = /^#{1,3}\s*(shared(?:\s+components?)?|共用(?:组件)?|共享(?:组件)?)\s*$/im
const COMPONENT_TOKEN = /data-component|`[a-z0-9]+(?:-[a-z0-9]+)+`/i
const ROUTE_TOKEN = /`\/[^`]*`|routes?\s*:|出现在|全站|\/about|\/catalog|\s\/(?:\s|$)/i

function sectionAfterHeading(markdown, heading) {
  const match = heading.exec(markdown)
  if (!match) return ''
  const start = match.index + match[0].length
  const rest = markdown.slice(start)
  const next = rest.search(/^#{1,3}\s+/m)
  return next === -1 ? rest : rest.slice(0, next)
}

export function checkComponentsDocument(markdown) {
  const errors = []
  const text = String(markdown ?? '').trim()
  if (text.length < 80) {
    errors.push(
      'analysis/components.md is a shell. Record shared vs page-specific components, or write "shared-components: none".',
    )
    return errors
  }
  if (SHARED_PENDING.test(text)) {
    errors.push(
      'analysis/components.md still says shared-component analysis is pending. Identify shared components and the routes they appear on before implementing pages.',
    )
    return errors
  }
  if (SHARED_NONE.test(text)) return errors
  const shared = sectionAfterHeading(text, SHARED_HEADING)
  const hasSharedList = /shared-components\s*:/i.test(text) && !SHARED_NONE.test(text)
  if (!shared && !hasSharedList) {
    errors.push(
      'analysis/components.md must have a Shared / 共用 section (or "shared-components: none"). Identify shared components before implementing route pages.',
    )
    return errors
  }
  const body = shared || text
  if (!COMPONENT_TOKEN.test(body)) {
    errors.push('The Shared section must name at least one component (a data-component or kebab-case id).')
  }
  if (!ROUTE_TOKEN.test(body) && !/routes?/i.test(body)) {
    errors.push('Shared components must record the routes they appear on.')
  }
  return errors
}

function uniqueIds(ids) {
  const seen = new Set()
  const result = []
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

/** 从 components.md 读出共用组件 id，供组件级门禁使用。 */
export function parseSharedComponentIds(markdown) {
  const text = String(markdown ?? '')
  if (SHARED_NONE.test(text)) return []
  const list = text.match(/shared-components:\s*(.+)\s*$/im)
  if (list) {
    const value = list[1].trim()
    if (!/^(none|pending)$/i.test(value)) {
      return uniqueIds(
        value.split(/[,，]/).map((item) => item.trim().replace(/^[`'"]+|[`'"]+$/g, '')).filter(Boolean),
      )
    }
  }
  const shared = sectionAfterHeading(text, SHARED_HEADING)
  if (!shared) return []
  const ids = []
  for (const match of shared.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)+)`/gi)) ids.push(match[1])
  return uniqueIds(ids)
}

export function checkApiMocksDocument(siteId, siteRoot) {
  const errors = []
  const manifestFile = resolve(siteRoot, 'api/manifest.json')
  if (!nonEmpty(manifestFile)) {
    errors.push(
      `Missing fixtures/sites/${siteId}/api/manifest.json. Capture public API responses with node scripts/capture-api.mjs --site ${siteId}, or record apiMocks: "none" if the public site has no data APIs.`,
    )
    return errors
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
    const decision = readApiMocksDecision(manifest)
    if (decision.ok) return errors
    if (decision.reason === 'pending') {
      errors.push(
        `fixtures/sites/${siteId}/api/manifest.json still has apiMocks: "pending". Capture public JSON into api/ or set apiMocks: "none" if there are no public data APIs.`,
      )
    } else {
      errors.push(
        `fixtures/sites/${siteId}/api/manifest.json must list captured items or set apiMocks: "none".`,
      )
    }
  } catch (error) {
    errors.push(`fixtures/sites/${siteId}/api/manifest.json is not valid JSON. ${error.message}`)
  }
  return errors
}

export function checkGates(siteId, root = repoRoot) {
  assertSiteId(siteId)
  const errors = []
  const siteRoot = resolve(root, 'fixtures/sites', siteId)

  for (const relative of ANALYSIS_FILES) {
    const file = resolve(siteRoot, relative)
    if (!nonEmpty(file)) errors.push(`Missing analysis file: fixtures/sites/${siteId}/${relative}`)
  }

  const overviewPath = resolve(siteRoot, 'analysis/overview.md')
  if (nonEmpty(overviewPath)) {
    const overview = readFileSync(overviewPath, 'utf8').toLowerCase()
    for (const marker of OVERVIEW_MARKERS) {
      if (!overview.includes(marker))
        errors.push(`Analysis overview must mention "${marker}" before implementation starts.`)
    }
  }

  const tokensPath = resolve(siteRoot, 'analysis/tokens.json')
  if (nonEmpty(tokensPath)) {
    try {
      const tokens = JSON.parse(readFileSync(tokensPath, 'utf8'))
      if (tokens === null || typeof tokens !== 'object' || Array.isArray(tokens))
        errors.push('analysis/tokens.json must be a JSON object.')
    } catch (error) {
      errors.push(`analysis/tokens.json is not valid JSON. ${error.message}`)
    }
  }

  const componentsPath = resolve(siteRoot, 'analysis/components.md')
  if (nonEmpty(componentsPath)) {
    errors.push(...checkComponentsDocument(readFileSync(componentsPath, 'utf8')))
  }

  errors.push(...checkApiMocksDocument(siteId, siteRoot))

  const trapsFile = resolve(root, 'docs/experience/traps.md')
  if (!nonEmpty(trapsFile)) errors.push('Missing docs/experience/traps.md.')

  const lessonsReadme = resolve(root, 'docs/experience/lessons/README.md')
  if (!nonEmpty(lessonsReadme)) errors.push('Missing docs/experience/lessons/README.md.')

  const checkedFile = resolve(siteRoot, 'traps-checked.md')
  if (!nonEmpty(checkedFile)) {
    errors.push(
      `Missing fixtures/sites/${siteId}/traps-checked.md. Read the trap store and record that check before coding.`,
    )
  } else if (nonEmpty(trapsFile)) {
    const active = activeTrapIds(readFileSync(trapsFile, 'utf8'))
    const checked = readFileSync(checkedFile, 'utf8')
    if (active.length === 0) {
      if (!checked.includes('active-traps: none'))
        errors.push(
          'traps-checked.md must contain "active-traps: none" while the trap store has no active entries.',
        )
    } else {
      if (checked.includes('active-traps: none'))
        errors.push(
          'traps-checked.md says there are no active traps, but the store has active entries.',
        )
      for (const id of active) {
        if (!checked.includes(id))
          errors.push(`traps-checked.md does not mention active trap ${id}.`)
      }
    }
  }

  return { ok: errors.length === 0, errors }
}
