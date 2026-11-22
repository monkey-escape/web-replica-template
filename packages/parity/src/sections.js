import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'
import { repoRoot } from './paths.js'
import { comparePng } from './visual.js'

export function sectionsPath(siteId, root = repoRoot) {
  return resolve(root, 'fixtures/sites', siteId, 'sections.json')
}

export function loadSectionsDocument(siteId, root = repoRoot) {
  const file = sectionsPath(siteId, root)
  if (!existsSync(file)) return { file, document: null }
  return { file, document: JSON.parse(readFileSync(file, 'utf8')) }
}

export function pickViewportValue(map, viewportName, fallback = undefined) {
  if (map && typeof map === 'object' && !Array.isArray(map) && viewportName && Object.hasOwn(map, viewportName)) {
    return map[viewportName]
  }
  return fallback
}

export function isSectionPresentOnViewport(section, viewportName) {
  if (!section) return false
  if (Array.isArray(section.viewports) && section.viewports.length > 0 && !section.viewports.includes(viewportName)) {
    return false
  }
  if (Array.isArray(section.absentViewports) && section.absentViewports.includes(viewportName)) {
    return false
  }
  if (
    section.targetSelectors &&
    typeof section.targetSelectors === 'object' &&
    !Array.isArray(section.targetSelectors) &&
    viewportName &&
    Object.hasOwn(section.targetSelectors, viewportName)
  ) {
    const hint = section.targetSelectors[viewportName]
    if (hint == null || hint === false) return false
  }
  return true
}

export function normalizeStyleProbe(entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') return null
  const id = entry.id.trim()
  const selector = typeof entry.selector === 'string' ? entry.selector.trim() : ''
  if (!id || !selector) return null
  return {
    id,
    selector,
    viewports: Array.isArray(entry.viewports) ? entry.viewports : undefined,
  }
}

export function styleProbesFor(section, viewportName) {
  const raw = section?.styleProbes
  if (!raw) return []
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? (raw[viewportName] ?? raw.default ?? [])
      : []
  if (!Array.isArray(list)) return []
  return list
    .map(normalizeStyleProbe)
    .filter(Boolean)
    .filter((probe) => !probe.viewports || !viewportName || probe.viewports.includes(viewportName))
}

export function hintsForViewport(section, viewportName) {
  if (!section) {
    return { present: false, targetSelector: null, heading: null, targetText: null, styleProbes: [] }
  }
  const heading = pickViewportValue(
    section.targetHeadings,
    viewportName,
    section.heading ?? section.targetHeading ?? null,
  )
  const targetText = pickViewportValue(section.targetTexts, viewportName, section.targetText ?? null)
  const fromMap = pickViewportValue(section.targetSelectors, viewportName, undefined)
  return {
    present: isSectionPresentOnViewport(section, viewportName),
    targetSelector: typeof fromMap === 'string' && fromMap.trim() ? fromMap.trim() : section.targetSelector ?? null,
    heading: typeof heading === 'string' && heading.trim() ? heading.trim() : null,
    targetText: typeof targetText === 'string' && targetText.trim() ? targetText.trim() : null,
    styleProbes: styleProbesFor(section, viewportName),
  }
}

function normalize(entry, viewportName) {
  if (!entry || typeof entry.id !== 'string' || typeof entry.selector !== 'string') return null
  if (!isSectionPresentOnViewport(entry, viewportName)) return null
  const hints = hintsForViewport(entry, viewportName)
  return {
    id: entry.id,
    selector: entry.selector,
    viewports: Array.isArray(entry.viewports) ? entry.viewports : undefined,
    absentViewports: Array.isArray(entry.absentViewports) ? entry.absentViewports : undefined,
    box: entry.box,
    boxes: entry.boxes,
    targetSelector: hints.targetSelector,
    targetSelectors: entry.targetSelectors,
    heading: hints.heading,
    targetHeading: entry.targetHeading,
    targetHeadings: entry.targetHeadings,
    targetText: hints.targetText,
    targetTexts: entry.targetTexts,
    styleProbes: hints.styleProbes,
  }
}

export function sectionsFor(document, routeName, viewportName) {
  if (!document) return []
  const raw = document[routeName] ?? document.routes?.[routeName]
  if (!raw) return []

  const pickBox = (entry) => {
    const item = normalize(entry, viewportName)
    if (!item) return null
    if (item.boxes && item.boxes[viewportName]) item.box = item.boxes[viewportName]
    return item
  }

  if (Array.isArray(raw)) {
    return raw.map(pickBox).filter(Boolean)
  }
  if (Array.isArray(raw[viewportName])) return raw[viewportName].map(pickBox).filter(Boolean)
  if (Array.isArray(raw.sections)) {
    return raw.sections.map(pickBox).filter(Boolean)
  }
  return []
}

export function cropPng(image, box) {
  if (!image || !box) return null
  const x = Math.max(0, Math.floor(box.x))
  const y = Math.max(0, Math.floor(box.y))
  const width = Math.max(0, Math.min(Math.floor(box.width), image.width - x))
  const height = Math.max(0, Math.min(Math.floor(box.height), image.height - y))
  if (width < 1 || height < 1) return null
  const out = new PNG({ width, height })
  PNG.bitblt(image, out, x, y, width, height, 0, 0)
  return out
}

export function scoreSection(actualImage, expectedImage, actualBox, expectedBox, options = {}) {
  const actual = cropPng(actualImage, actualBox)
  const expected = cropPng(expectedImage, expectedBox ?? actualBox)
  if (!actual || !expected) {
    return { pass: false, reason: 'section-box-missing', score: 0, mismatched: null, ratio: 1 }
  }
  const compared = comparePng(actual, expected, options)
  const score = compared.reason === 'size-mismatch' ? 0 : Math.max(0, 1 - (compared.ratio ?? 1))
  return {
    ...compared,
    score,
    pass: compared.pass,
    actualBox,
    expectedBox: expectedBox ?? actualBox,
  }
}

export async function readSectionBoxes(page, sections) {
  return page.evaluate((items) => {
    return items.map((item) => {
      const element = document.querySelector(item.selector)
      if (!element) return { id: item.id, selector: item.selector, box: null, missing: true }
      const rect = element.getBoundingClientRect()
      return {
        id: item.id,
        selector: item.selector,
        box: {
          x: rect.x + window.scrollX,
          y: rect.y + window.scrollY,
          width: rect.width,
          height: rect.height,
        },
        missing: false,
      }
    })
  }, sections)
}

export async function discoverSections(page) {
  return page.evaluate(() => {
    const seen = new Set()
    const items = []
    for (const element of document.querySelectorAll('[data-component]')) {
      const id = element.getAttribute('data-component') || ''
      if (!id || seen.has(id)) continue
      seen.add(id)
      const rect = element.getBoundingClientRect()
      items.push({
        id,
        selector: `[data-component="${id}"]`,
        box: {
          x: rect.x + window.scrollX,
          y: rect.y + window.scrollY,
          width: rect.width,
          height: rect.height,
        },
      })
    }
    return items
  })
}

export function isVisualSection(section) {
  if (!section || section.id === 'age-gate') return false
  const box = section.box
  if (box && (box.width < 16 || box.height < 16 || box.width * box.height < 256)) return false
  return true
}
