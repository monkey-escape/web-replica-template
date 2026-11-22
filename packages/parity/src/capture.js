import { headingSlug, mergeCapturedSections, normalizeStylesFixture } from './styles.js'
import { hintsForViewport, isSectionPresentOnViewport } from './sections.js'

export const LANDMARK_SELECTORS = {
  'site-header': 'header',
  'site-footer': 'footer',
  'contact-form': 'form',
  'contact-details': 'aside',
}

const BLOCKED_PATH =
  /^(?:\/api(?:\/|$)|\/requisition(?:\/|$)|\/(?:login|signin|sign-in|signup|sign-up|register|checkout|cart)(?:\/|$))/i

export function assertTargetOrigin(value, label = 'target URL') {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} must be an absolute http(s) URL.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must be http or https.`)
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not include credentials.`)
  }
  return url.origin
}

export function targetRouteUrl(origin, path) {
  const base = assertTargetOrigin(origin)
  const url = new URL(path || '/', `${base}/`)
  if (isBlockedTargetPath(url.pathname)) {
    throw new Error(`Refusing to open blocked target path: ${url.pathname}`)
  }
  return url.toString()
}

export function isBlockedTargetPath(pathOrUrl) {
  let pathname = pathOrUrl
  try {
    pathname = new URL(pathOrUrl, 'https://example.invalid').pathname
  } catch {
    pathname = pathOrUrl
  }
  return BLOCKED_PATH.test(pathname)
}

export function headingSlugMatch(sectionId, headingText) {
  if (!sectionId || !headingText) return false
  const id = headingSlug(sectionId)
  const heading = headingSlug(headingText)
  if (!id || !heading) return false
  if (id === heading) return true
  // 短词前缀太容易误伤，例如 CONTACT 对上 contact-details。
  if (id.length >= 8 && heading.startsWith(id)) return true
  if (heading.length >= 8 && id.startsWith(heading)) return true
  return false
}

export function compactText(value) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

export function textsLooselyMatch(haystack, needle) {
  if (!haystack || !needle) return false
  const a = compactText(haystack)
  const b = compactText(needle)
  if (a && b && (a === b || a.includes(b))) return true
  const leftSlug = headingSlug(haystack)
  const rightSlug = headingSlug(needle)
  return Boolean(leftSlug && rightSlug && leftSlug === rightSlug)
}

export function isPageSizedBox(box, pageHeight, threshold = 0.6) {
  const height = Number(box?.height) || 0
  return pageHeight > 0 && height >= pageHeight * threshold
}

export function isUsefulBox(box, minSize = 16) {
  const width = Number(box?.width) || 0
  const height = Number(box?.height) || 0
  return width >= minSize && height >= minSize
}


export function candidateTargetSelectors(section, viewportName) {
  const list = []
  const add = (value) => {
    if (typeof value === 'string' && value.trim() && !list.includes(value)) list.push(value)
  }
  const hints = hintsForViewport(section, viewportName)
  // 视口专属 targetSelectors 优先于地标和抓取留下的通用 targetSelector。
  if (
    viewportName &&
    section?.targetSelectors &&
    Object.hasOwn(section.targetSelectors, viewportName) &&
    typeof section.targetSelectors[viewportName] === 'string'
  ) {
    add(section.targetSelectors[viewportName])
  } else {
    add(hints.targetSelector)
  }
  add(LANDMARK_SELECTORS[section?.id])
  add(section?.targetSelector)
  add(section?.selector)
  return list
}

export function mergeCaptureSummary(existing, update, { merge = true } = {}) {
  const previous = existing && typeof existing === 'object' ? existing : {}
  const next = update && typeof update === 'object' ? update : {}
  if (!merge || !Array.isArray(previous.summary)) {
    return {
      siteId: next.siteId ?? previous.siteId,
      origin: next.origin ?? previous.origin,
      summary: Array.isArray(next.summary) ? next.summary : [],
    }
  }
  const byKey = new Map()
  const keyOf = (item) => `${item.route}@${item.viewport}`
  for (const item of previous.summary) {
    if (item?.route && item?.viewport) byKey.set(keyOf(item), item)
  }
  for (const item of next.summary ?? []) {
    if (item?.route && item?.viewport) byKey.set(keyOf(item), item)
  }
  return {
    siteId: next.siteId ?? previous.siteId,
    origin: next.origin ?? previous.origin,
    summary: [...byKey.values()],
  }
}

export function pickHeadingForSection(section, headings = []) {
  if (typeof section.heading === 'string' && section.heading.trim()) return section.heading.trim()
  if (typeof section.targetHeading === 'string' && section.targetHeading.trim()) {
    return section.targetHeading.trim()
  }
  return headings.find((text) => headingSlugMatch(section.id, text)) ?? null
}

export function buildStylesFixture({
  source,
  origin,
  siteId,
  route,
  viewport,
  captures,
  missing = [],
  capturedAt = new Date().toISOString(),
}) {
  const sections = {}
  for (const item of captures ?? []) {
    if (!item?.id) continue
    const probes = item.probes && typeof item.probes === 'object' && !Array.isArray(item.probes) ? item.probes : null
    sections[item.id] = {
      selector: item.selector ?? null,
      targetSelector: item.targetSelector ?? item.resolvedSelector ?? null,
      box: item.box ?? null,
      styles: item.styles ?? {},
      ...(probes && Object.keys(probes).length ? { probes } : {}),
    }
  }
  return {
    source,
    origin: origin ?? null,
    siteId,
    route,
    viewport: viewport
      ? { name: viewport.name, width: viewport.width, height: viewport.height }
      : null,
    capturedAt,
    sections,
    missing,
  }
}

export { mergeCapturedSections, normalizeStylesFixture }

export async function dismissPublicGates(page) {
  const button = page.getByRole('button', { name: /yes,\s*i[’']m 21 or older/i })
  try {
    await button.click({ timeout: 4000 })
    await page.waitForTimeout(400)
  } catch {
    // 公开页不一定有年龄层。
  }
}


async function locateBySelector(page, selector) {
  if (!selector) return null
  return page.evaluate((args) => {
    const useful = (rect) => rect.width >= 16 && rect.height >= 16
    const pageHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
    const boxOf = (element) => {
      const rect = element.getBoundingClientRect()
      return {
        x: rect.x + window.scrollX,
        y: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height,
      }
    }
    const landmark =
      args.selector === 'header' ||
      args.selector === 'footer' ||
      args.selector === 'form' ||
      args.selector === 'aside'
    const items = [...document.querySelectorAll(args.selector)]
      .map((element) => ({ element, box: boxOf(element) }))
      .filter((item) => useful(item.box) && (landmark || item.box.height < pageHeight * 0.6))
    if (items.length === 0) return null
    const preferLargest = args.selector === 'form' || args.selector === 'aside'
    let chosen = items[0]
    if (preferLargest) {
      const inMain = items.filter((item) => item.element.closest('main'))
      const pool = inMain.length ? inMain : items
      pool.sort((left, right) => right.box.width * right.box.height - left.box.width * left.box.height)
      chosen = pool[0]
    }
    return { selector: args.selector, box: chosen.box }
  }, { selector })
}

export async function resolveTargetSection(page, section, headings = [], viewportName) {
  if (!section?.id || section.id === 'age-gate') {
    return { ...section, missing: true, skipped: true }
  }
  if (viewportName && !isSectionPresentOnViewport(section, viewportName)) {
    return { ...section, missing: true, skipped: true, absent: true }
  }

  const hints = hintsForViewport(section, viewportName)
  const authoritativeSelector =
    viewportName &&
    section?.targetSelectors &&
    Object.hasOwn(section.targetSelectors, viewportName) &&
    typeof section.targetSelectors[viewportName] === 'string'
      ? section.targetSelectors[viewportName]
      : null
  if (authoritativeSelector) {
    const located = await locateBySelector(page, authoritativeSelector)
    if (located) {
      return {
        ...section,
        missing: false,
        heading: hints.heading ?? section.heading,
        targetSelector: located.selector,
        resolvedSelector: located.selector,
        box: located.box,
        styleProbes: hints.styleProbes,
      }
    }
  }

  const heading = hints.heading ?? pickHeadingForSection(section, headings)
  const text = heading ?? hints.targetText ?? (typeof section.targetText === 'string' ? section.targetText : null)
  if (text) {
    const located = await page.evaluate((args) => {
      const needle = args.needle
      const fromHeading = args.fromHeading
      const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim()
      const compact = (value) => normalize(value).replace(/\s+/g, '').toLowerCase()
      const slug = (value) =>
        String(value || '')
          .toLowerCase()
          .replace(/×/g, 'x')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      const loose = (haystack, needleText) => {
        const a = compact(haystack)
        const b = compact(needleText)
        if (a && b && (a === b || a.includes(b))) return true
        const leftSlug = slug(haystack)
        const rightSlug = slug(needleText)
        return Boolean(leftSlug && rightSlug && leftSlug === rightSlug)
      }
      const useful = (rect) => rect.width >= 16 && rect.height >= 16
      const pageHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
      const notPage = (rect) => rect.height < pageHeight * 0.6
      const boxOf = (element) => {
        const rect = element.getBoundingClientRect()
        return {
          x: rect.x + window.scrollX,
          y: rect.y + window.scrollY,
          width: rect.width,
          height: rect.height,
        }
      }
      const selectorFor = (element) => {
        const hook = element.getAttribute('data-component')
        if (hook) return `[data-component="${hook}"]`
        if (element.id && /^[A-Za-z][\w-]*$/.test(element.id)) return `#${element.id}`
        const skip = new Set(['wrap', 'section', 'tight', 'display', 'l', 'primary', 'btn'])
        const classes = [...element.classList].filter(
          (name) => /^[a-z][a-z0-9_-]*$/i.test(name) && !skip.has(name),
        )
        if (classes[0]) return `${element.tagName.toLowerCase()}.${classes[0]}`
        const parent = element.parentElement
        if (parent) {
          const same = [...parent.children].filter((child) => child.tagName === element.tagName)
          return `${element.tagName.toLowerCase()}:nth-of-type(${same.indexOf(element) + 1})`
        }
        return element.tagName.toLowerCase()
      }
      const skipTag = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'HEAD', 'HTML'])
      const want = normalize(needle)
      if (!want) return null

      const visibleText = (element) => normalize(element.innerText || '')
      const isMatch = (element) => {
        if (skipTag.has(element.tagName)) return false
        const rect = element.getBoundingClientRect()
        if (!useful(rect) || !notPage(rect)) return false
        const text = visibleText(element)
        return Boolean(text && loose(text, want))
      }

      const headingHits = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(isMatch)
      const pool = headingHits.length
        ? headingHits
        : [...document.querySelectorAll('body *')].filter(isMatch)
      if (pool.length === 0) return null
      pool.sort((left, right) => visibleText(left).length - visibleText(right).length)
      const start = pool[0]
      const startBox = start.getBoundingClientRect()
      let chosen = start
      if (/^H[1-6]$/.test(start.tagName) || fromHeading) {
        const block = start.closest('section, article, header, footer, form, aside, [data-component]')
        if (block) {
          const rect = block.getBoundingClientRect()
          if (useful(rect) && notPage(rect)) chosen = block
        }
      } else {
        let node = start.parentElement
        while (node && node !== document.body) {
          const rect = node.getBoundingClientRect()
          if (!useful(rect) || !notPage(rect) || rect.height > Math.max(startBox.height * 4, 64)) break
          chosen = node
          node = node.parentElement
        }
      }
      const chosenBox = boxOf(chosen)
      if (!useful(chosenBox) || !notPage(chosen.getBoundingClientRect())) return null
      return { selector: selectorFor(chosen), box: chosenBox }
    }, { needle: text, fromHeading: Boolean(heading) })
    if (located?.box) {
      return {
        ...section,
        missing: false,
        heading: hints.heading ?? section.heading,
        targetSelector: located.selector,
        resolvedSelector: located.selector,
        box: located.box,
        styleProbes: hints.styleProbes,
      }
    }
  }

  for (const selector of candidateTargetSelectors(section, viewportName)) {
    if (selector === authoritativeSelector) continue
    const located = await locateBySelector(page, selector)
    if (located) {
      return {
        ...section,
        missing: false,
        targetSelector: located.selector,
        resolvedSelector: located.selector,
        box: located.box,
        styleProbes: hints.styleProbes,
      }
    }
  }

  return { ...section, missing: true }
}

export async function readPageHeadings(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .map((element) => (element.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  )
}

export async function prepareTargetPage(page, url) {
  const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 })
  await dismissPublicGates(page)
  await page.addStyleTag({
    content:
      'html{scrollbar-width:none !important}body::-webkit-scrollbar,html::-webkit-scrollbar{display:none !important}',
  })
  await page.evaluate(async () => {
    await document.fonts?.ready
  })
  return response
}
