import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertSiteId, repoRoot } from './paths.js'

const ANALYSIS_FILES = [
  'analysis/overview.md',
  'analysis/tokens.json',
  'analysis/components.md',
  'analysis/interactions.md',
  'analysis/screenshots/README.md',
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
