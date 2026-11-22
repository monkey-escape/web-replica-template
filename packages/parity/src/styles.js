import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { repoRoot } from './paths.js'

export const STYLE_KEYS = [
  'display',
  'position',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'color',
  'background-color',
  'text-align',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
]

export function stylesPath(siteId, routeName, viewportName, root = repoRoot) {
  return resolve(root, 'fixtures/sites', siteId, 'styles', `${routeName}.${viewportName}.json`)
}

export function headingSlug(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeStylesFixture(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (raw.sections && typeof raw.sections === 'object' && !Array.isArray(raw.sections)) {
    const styleMap = {}
    const boxes = {}
    const selectors = {}
    const probeMap = {}
    for (const [id, entry] of Object.entries(raw.sections)) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        styleMap[id] = entry.styles ?? {}
        if (entry.box) boxes[id] = entry.box
        selectors[id] = entry.targetSelector ?? entry.selector ?? null
        if (entry.probes && typeof entry.probes === 'object' && !Array.isArray(entry.probes)) {
          const probes = {}
          for (const [probeId, probe] of Object.entries(entry.probes)) {
            probes[probeId] = probe?.styles ?? probe
          }
          probeMap[id] = probes
        }
      } else if (entry && typeof entry === 'object') {
        styleMap[id] = entry
      }
    }
    return {
      source: raw.source ?? null,
      origin: raw.origin ?? null,
      viewport: raw.viewport ?? null,
      missing: Array.isArray(raw.missing) ? raw.missing : [],
      sections: raw.sections,
      styleMap,
      boxes,
      selectors,
      probeMap,
    }
  }
  // 旧格式：直接是 { [sectionId]: { [prop]: value } }
  return {
    source: raw.source ?? null,
    origin: raw.origin ?? null,
    viewport: raw.viewport ?? null,
    missing: [],
    sections: raw,
    styleMap: raw,
    boxes: {},
    selectors: {},
    probeMap: {},
  }
}

export function loadStylesFixture(siteId, routeName, viewportName, root = repoRoot) {
  const file = stylesPath(siteId, routeName, viewportName, root)
  if (!existsSync(file)) return null
  return normalizeStylesFixture(JSON.parse(readFileSync(file, 'utf8')))
}

export function loadExpectedStyles(siteId, routeName, viewportName, root = repoRoot) {
  const fixture = loadStylesFixture(siteId, routeName, viewportName, root)
  return fixture?.styleMap ?? null
}

export function loadExpectedProbes(siteId, routeName, viewportName, root = repoRoot) {
  const fixture = loadStylesFixture(siteId, routeName, viewportName, root)
  const probeMap = fixture?.probeMap
  if (!probeMap || Object.keys(probeMap).length === 0) return null
  return probeMap
}

export function styleSectionResults(actual, expected, failures, actualProbes, expectedProbes) {
  const ids = new Set([
    ...Object.keys(expected ?? {}),
    ...Object.keys(actual ?? {}),
    ...Object.keys(expectedProbes ?? {}),
    ...Object.keys(actualProbes ?? {}),
  ])
  ids.delete('age-gate')
  return [...ids].map((id) => {
    const items = failures.filter((item) => item.section === id)
    return {
      id,
      pass: items.length === 0,
      score: items.length === 0 ? 1 : 0,
      reason: items.length === 0 ? 'match' : items[0].kind,
      failures: items,
    }
  })
}

export function mergeCapturedSections(document, routeName, viewportName, captured) {
  const next = structuredClone(document ?? {})
  const route = next[routeName] ?? {}
  const existing = Array.isArray(route)
    ? route
    : Array.isArray(route[viewportName])
      ? route[viewportName]
      : Array.isArray(route.sections)
        ? route.sections
        : []
  const byId = new Map(existing.map((item) => [item.id, { ...item }]))
  for (const item of captured ?? []) {
    if (!item?.id || item.skipped) continue
    if (item.missing) {
      const current = byId.get(item.id)
      if (!current) continue
      if (current.boxes) {
        const boxes = { ...current.boxes }
        delete boxes[viewportName]
        if (Object.keys(boxes).length) current.boxes = boxes
        else delete current.boxes
      }
      if (current.box && !current.boxes) delete current.box
      if (current.targetSelectors) {
        const map = { ...current.targetSelectors }
        delete map[viewportName]
        if (Object.keys(map).length) current.targetSelectors = map
        else delete current.targetSelectors
      }
      delete current.targetSelector
      byId.set(item.id, current)
      continue
    }
    const current = byId.get(item.id) ?? { id: item.id, selector: item.selector }
    if (item.selector && !current.selector) current.selector = item.selector
    if (item.targetSelector) {
      current.targetSelector = item.targetSelector
      current.targetSelectors = { ...(current.targetSelectors ?? {}), [viewportName]: item.targetSelector }
    }
    if (item.heading) current.heading = item.heading
    if (item.styleProbes) current.styleProbes = item.styleProbes
    if (item.box) {
      current.boxes = { ...(current.boxes ?? {}), [viewportName]: item.box }
      if (!Array.isArray(route) && route[viewportName]) current.box = item.box
      else current.box = current.box ?? item.box
    }
    byId.set(item.id, current)
  }
  const merged = [...byId.values()]
  if (Array.isArray(route)) {
    next[routeName] = merged
    return next
  }
  next[routeName] = { ...route, [viewportName]: merged }
  return next
}

export function diffComputedStyles(actual, expected, keys = STYLE_KEYS) {
  const failures = []
  const expectedSections = expected ?? {}
  for (const [id, expectedProps] of Object.entries(expectedSections)) {
    const actualProps = actual?.[id]
    if (!actualProps) {
      failures.push({
        kind: 'missing',
        key: 'styles',
        item: id,
        section: id,
      })
      continue
    }
    for (const prop of keys) {
      if (expectedProps[prop] == null) continue
      const got = actualProps[prop]
      if (got !== expectedProps[prop]) {
        failures.push({
          kind: 'style-mismatch',
          key: 'styles',
          section: id,
          item: `${id} ${prop}: expected "${expectedProps[prop]}", got "${got ?? ''}"`,
        })
      }
    }
  }
  return failures
}

export function diffStyleProbes(actual, expected, keys = STYLE_KEYS) {
  const failures = []
  for (const [sectionId, expectedProbes] of Object.entries(expected ?? {})) {
    for (const [probeId, expectedEntry] of Object.entries(expectedProbes ?? {})) {
      const expectedProps = expectedEntry?.styles ?? expectedEntry
      const actualEntry = actual?.[sectionId]?.[probeId]
      const actualProps = actualEntry?.styles ?? actualEntry
      if (!actualProps) {
        failures.push({
          kind: 'missing',
          key: 'styles',
          section: sectionId,
          probe: probeId,
          item: `${sectionId} ${probeId}`,
        })
        continue
      }
      for (const prop of keys) {
        if (expectedProps?.[prop] == null) continue
        const got = actualProps[prop]
        if (got !== expectedProps[prop]) {
          failures.push({
            kind: 'style-mismatch',
            key: 'styles',
            section: sectionId,
            probe: probeId,
            item: `${sectionId} ${probeId} ${prop}: expected "${expectedProps[prop]}", got "${got ?? ''}"`,
          })
        }
      }
    }
  }
  return failures
}

export async function readSectionStyles(page, sections, keys = STYLE_KEYS) {
  return page.evaluate(
    ({ items, props }) => {
      const result = {}
      const read = (node) => {
        const computed = getComputedStyle(node)
        const record = {}
        for (const prop of props) record[prop] = computed.getPropertyValue(prop).trim()
        return record
      }
      for (const item of items) {
        const selector = item.resolvedSelector || item.targetSelector || item.selector
        const element = selector ? document.querySelector(selector) : null
        if (!element) continue
        const probes = {}
        for (const probe of item.styleProbes ?? []) {
          if (!probe?.id || !probe?.selector) continue
          const node = element.querySelector(probe.selector)
          if (!node) continue
          probes[probe.id] = { selector: probe.selector, styles: read(node) }
        }
        result[item.id] = { styles: read(element), probes }
      }
      return result
    },
    { items: sections, props: keys },
  )
}

export async function readComputedStyles(page, sections, keys = STYLE_KEYS) {
  const tree = await readSectionStyles(page, sections, keys)
  const map = {}
  for (const [id, entry] of Object.entries(tree)) map[id] = entry.styles
  return map
}
