import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import {
  buildApiManifestItem,
  classifyApiResponse,
  emptyApiManifest,
  mergeApiManifest,
  prettyJsonBody,
  readApiMocksDecision,
} from './api-capture.js'
import {
  assertTargetOrigin,
  buildStylesFixture,
  isBlockedTargetPath,
  mergeCapturedSections,
  prepareTargetPage,
  readPageHeadings,
  resolveTargetSection,
  targetRouteUrl,
} from './capture.js'
import { repoRoot } from './paths.js'
import { loadProfile } from './profile.js'
import { writeJson } from './report.js'
import { sectionsFor } from './sections.js'
import { STYLE_KEYS, readSectionStyles } from './styles.js'
import { comparePngFiles } from './visual.js'

export const ACCEPT_RELATIVE = [
  'structure.json',
  'sections.json',
  'styles',
  'api',
  'assets',
  'baselines',
]

const VOLATILE_KEYS = new Set(['capturedAt', 'box', 'generatedAt'])
const VIEWPORT_SUFFIX = /\.(desktop|mobile)$/
const BASELINE_NAME = /^(.+)\.(desktop|mobile)\.png$/
const STYLE_NAME = /^(.+)\.(desktop|mobile)\.json$/

export function targetUpdateDir(siteId, root = repoRoot) {
  return resolve(root, 'temp/clone-loop', siteId, 'target-update')
}

export function stagingRoot(siteId, root = repoRoot) {
  return resolve(targetUpdateDir(siteId, root), 'staging')
}

export function fixturesRoot(siteId, root = repoRoot) {
  return resolve(root, 'fixtures/sites', siteId)
}

export function reportPaths(siteId, root = repoRoot) {
  const dir = targetUpdateDir(siteId, root)
  return {
    dir,
    json: resolve(dir, 'report.json'),
    markdown: resolve(dir, 'report.md'),
    meta: resolve(dir, 'meta.json'),
    accepted: resolve(dir, 'accepted.json'),
  }
}

function isSafeRelative(root, target) {
  const rel = relative(root, target)
  return rel !== '' && !rel.startsWith(`..`) && !rel.includes(`..${sep}`)
}

function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export function hashFile(file) {
  if (!existsSync(file) || !statSync(file).isFile()) return null
  return sha256(readFileSync(file))
}

function walkFiles(dir, prefix = '') {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full, rel))
    else if (entry.isFile()) out.push(rel)
  }
  return out.sort()
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE_KEYS.has(key)) continue
      out[key] = stable(value[key])
    }
    return out
  }
  return value
}

function stableString(value) {
  return JSON.stringify(stable(value))
}

function routeBase(name) {
  return String(name || '').replace(VIEWPORT_SUFFIX, '')
}

function unique(items) {
  return [...new Set(items.filter(Boolean))].sort()
}

function mentionRoute(markdown, name) {
  if (!markdown || !name) return false
  const path = name === 'home' ? '/' : `/${name}`
  const body = String(markdown)
  if (body.includes(`\`${name}\``) || body.includes(`\`${path}\``) || body.includes(`\`${path}/\``))
    return true
  return new RegExp(`(^|[^A-Za-z0-9-])${name}([^A-Za-z0-9-]|$)`).test(body)
}

function loadManifestItems(dir, kind) {
  const manifest = readJson(resolve(dir, kind, 'manifest.json'), { items: [] }) ?? { items: [] }
  const items = {}
  for (const item of manifest.items ?? []) {
    if (!item?.key) continue
    const file = resolve(dir, kind, item.file ?? (kind === 'api' ? `${item.key}.json` : item.key))
    items[item.key] = {
      item,
      hash: hashFile(file),
      file: item.file ?? (kind === 'api' ? `${item.key}.json` : item.key),
    }
  }
  return { manifest, items }
}

function loadStyleMap(dir) {
  const stylesDir = resolve(dir, 'styles')
  const map = {}
  if (!existsSync(stylesDir)) return map
  for (const rel of walkFiles(stylesDir)) {
    if (!rel.endsWith('.json')) continue
    const stem = rel.replace(/\.json$/, '')
    map[stem] = readJson(resolve(stylesDir, rel), {})
  }
  return map
}

function loadBaselineMap(dir) {
  const baseDir = resolve(dir, 'baselines')
  const map = {}
  if (!existsSync(baseDir)) return map
  for (const rel of walkFiles(baseDir)) {
    if (!rel.endsWith('.png')) continue
    map[rel] = hashFile(resolve(baseDir, rel))
  }
  return map
}

export function loadFixtureSnapshot(dir) {
  const structure = readJson(resolve(dir, 'structure.json'), {}) ?? {}
  const sections = readJson(resolve(dir, 'sections.json'), {}) ?? {}
  const componentsMd = existsSync(resolve(dir, 'analysis/components.md'))
    ? readFileSync(resolve(dir, 'analysis/components.md'), 'utf8')
    : ''
  const meta = readJson(resolve(dir, 'capture-meta.json'), {}) ?? {}
  return {
    root: dir,
    structure,
    sections,
    styles: loadStyleMap(dir),
    api: loadManifestItems(dir, 'api'),
    assets: loadManifestItems(dir, 'assets'),
    baselines: loadBaselineMap(dir),
    componentsMd,
    discoveredRoutes: Array.isArray(meta.discoveredRoutes) ? meta.discoveredRoutes : [],
    missingRoutes: Array.isArray(meta.missingRoutes) ? meta.missingRoutes : [],
  }
}

function routesFromSnapshot(snapshot, profile) {
  const names = []
  for (const key of Object.keys(snapshot.structure ?? {})) names.push(routeBase(key))
  for (const key of Object.keys(snapshot.sections ?? {})) names.push(routeBase(key))
  for (const key of Object.keys(snapshot.styles ?? {})) {
    const match = STYLE_NAME.exec(`${key}.json`)
    names.push(match ? match[1] : routeBase(key))
  }
  for (const file of Object.keys(snapshot.baselines ?? {})) {
    const match = BASELINE_NAME.exec(file)
    names.push(match ? match[1] : file.replace(/\.png$/, ''))
  }
  for (const route of snapshot.discoveredRoutes ?? []) names.push(route.name ?? route)
  for (const route of profile?.routes ?? []) names.push(route.name)
  return unique(names)
}

function componentRouteMap(structure) {
  const map = new Map()
  for (const [key, entry] of Object.entries(structure ?? {})) {
    const route = routeBase(key)
    for (const id of entry?.components ?? []) {
      if (!id) continue
      if (!map.has(id)) map.set(id, new Set())
      map.get(id).add(route)
    }
  }
  return map
}

function keySetDiff(current, staged) {
  const currentKeys = new Set(Object.keys(current ?? {}))
  const stagedKeys = new Set(Object.keys(staged ?? {}))
  return {
    added: unique([...stagedKeys].filter((key) => !currentKeys.has(key))),
    removed: unique([...currentKeys].filter((key) => !stagedKeys.has(key))),
    changed: unique(
      [...currentKeys].filter((key) => stagedKeys.has(key) && stableString(current[key]) !== stableString(staged[key])),
    ),
  }
}

function hashSetDiff(current, staged) {
  const currentKeys = new Set(Object.keys(current ?? {}))
  const stagedKeys = new Set(Object.keys(staged ?? {}))
  const changed = []
  for (const key of currentKeys) {
    if (stagedKeys.has(key) && current[key] !== staged[key]) changed.push(key)
  }
  return {
    added: unique([...stagedKeys].filter((key) => !currentKeys.has(key))),
    removed: unique([...currentKeys].filter((key) => !stagedKeys.has(key))),
    changed: unique(changed),
  }
}

function sectionIdMap(sections) {
  const map = {}
  for (const [route, viewports] of Object.entries(sections ?? {})) {
    const lists = viewports && !Array.isArray(viewports) ? viewports : { default: viewports }
    for (const [viewport, items] of Object.entries(lists ?? {})) {
      const ids = (items ?? []).map((item) => item?.id).filter(Boolean)
      const signatures = {}
      for (const item of items ?? []) {
        if (!item?.id) continue
        signatures[item.id] = stable({
          id: item.id,
          selector: item.selector,
          targetSelector: item.targetSelector,
          targetSelectors: item.targetSelectors,
          targetHeadings: item.targetHeadings,
          targetTexts: item.targetTexts,
          viewports: item.viewports,
          absentViewports: item.absentViewports,
          styleProbes: item.styleProbes,
        })
      }
      map[`${route}.${viewport}`] = { ids, signatures }
    }
  }
  return map
}

function diffSections(current, staged) {
  const currentMap = sectionIdMap(current)
  const stagedMap = sectionIdMap(staged)
  const added = []
  const removed = []
  const changed = []
  const keys = unique([...Object.keys(currentMap), ...Object.keys(stagedMap)])
  for (const key of keys) {
    const now = currentMap[key]?.ids ?? []
    const next = stagedMap[key]?.ids ?? []
    for (const id of next) if (!now.includes(id)) added.push(`${key}:${id}`)
    for (const id of now) if (!next.includes(id)) removed.push(`${key}:${id}`)
    const currentSig = currentMap[key]?.signatures ?? {}
    const stagedSig = stagedMap[key]?.signatures ?? {}
    for (const id of now) {
      if (id in stagedSig && stableString(currentSig[id]) !== stableString(stagedSig[id])) {
        changed.push(`${key}:${id}`)
      }
    }
  }
  return { added: unique(added), removed: unique(removed), changed: unique(changed) }
}

function diffManifest(current, staged) {
  const currentItems = current?.items ?? {}
  const stagedItems = staged?.items ?? {}
  const added = []
  const removed = []
  const changed = []
  for (const key of unique([...Object.keys(currentItems), ...Object.keys(stagedItems)])) {
    if (!(key in currentItems)) added.push(key)
    else if (!(key in stagedItems)) removed.push(key)
    else if (
      currentItems[key].hash !== stagedItems[key].hash ||
      stableString(currentItems[key].item) !== stableString(stagedItems[key].item)
    ) {
      changed.push(key)
    }
  }
  const currentDecision = readApiMocksDecision(current?.manifest ?? {})
  const stagedDecision = readApiMocksDecision(staged?.manifest ?? {})
  return {
    added: unique(added),
    removed: unique(removed),
    changed: unique(changed),
    decision: {
      current: currentDecision.reason,
      staged: stagedDecision.reason,
      changed: currentDecision.reason !== stagedDecision.reason,
    },
  }
}

function baselineDetails(currentFile, stagedFile, currentHash, stagedHash) {
  if (!currentHash || !stagedHash || currentHash === stagedHash) {
    return { hashChanged: Boolean(currentHash && stagedHash && currentHash !== stagedHash) }
  }
  try {
    const result = comparePngFiles(currentFile, stagedFile, { pixelThreshold: 0.1, maxDiffRatio: 0 })
    return {
      hashChanged: true,
      reason: result.reason,
      mismatched: result.mismatched,
      ratio: result.ratio,
    }
  } catch {
    return { hashChanged: true }
  }
}

export function compareSnapshots(current, staged, options = {}) {
  const profile = options.profile ?? null
  const currentRoutes = routesFromSnapshot(current, profile)
  const stagedNames = new Set(routesFromSnapshot(staged, null))
  const missing = new Set(staged.missingRoutes ?? [])
  const discovered = unique((staged.discoveredRoutes ?? []).map((item) => item.name ?? item))
  const added = unique([...stagedNames].filter((name) => !currentRoutes.includes(name) || discovered.includes(name) && !currentRoutes.includes(name)))
  const removed = unique(currentRoutes.filter((name) => missing.has(name) || !stagedNames.has(name)))
  const candidates = unique([...currentRoutes, ...stagedNames])

  const structureDiff = keySetDiff(current.structure, staged.structure)
  const sectionDiff = diffSections(current.sections, staged.sections)
  const styleDiff = keySetDiff(current.styles, staged.styles)
  const api = diffManifest(current.api, staged.api)
  const assets = diffManifest(current.assets, staged.assets)
  const baselineNames = hashSetDiff(current.baselines, staged.baselines)
  const baselines = {
    ...baselineNames,
    details: Object.fromEntries(
      baselineNames.changed.map((file) => [
        file,
        baselineDetails(
          resolve(current.root, 'baselines', file),
          resolve(staged.root, 'baselines', file),
          current.baselines[file],
          staged.baselines[file],
        ),
      ]),
    ),
  }

  const changedRoutes = new Set()
  for (const key of [...structureDiff.changed, ...structureDiff.added]) changedRoutes.add(routeBase(key))
  for (const item of [...sectionDiff.changed, ...sectionDiff.added, ...sectionDiff.removed]) {
    changedRoutes.add(routeBase(item.split(':')[0]))
  }
  for (const key of [...styleDiff.changed, ...styleDiff.added]) {
    const match = STYLE_NAME.exec(`${key}.json`)
    changedRoutes.add(match ? match[1] : routeBase(key))
  }
  for (const file of [...baselines.changed, ...baselines.added]) {
    const match = BASELINE_NAME.exec(file)
    changedRoutes.add(match ? match[1] : file.replace(/\.png$/, ''))
  }
  for (const name of added) changedRoutes.delete(name)
  for (const name of removed) changedRoutes.delete(name)

  const currentShared = componentRouteMap(current.structure)
  const stagedShared = componentRouteMap(staged.structure)
  const changedRepeatedBlocks = []
  for (const id of unique([...currentShared.keys(), ...stagedShared.keys()])) {
    const before = [...(currentShared.get(id) ?? [])].sort()
    const after = [...(stagedShared.get(id) ?? [])].sort()
    const sharedBefore = before.length > 1
    const sharedAfter = after.length > 1
    if ((sharedBefore || sharedAfter) && before.join(' ') !== after.join(' ')) {
      changedRepeatedBlocks.push({ component: id, currentRoutes: before, stagedRoutes: after })
    }
  }
  const newRoutesNotInComponents = unique(
    [...added, ...discovered].filter((name) => !mentionRoute(current.componentsMd, name)),
  )

  const hasChanges = [
    added,
    removed,
    [...changedRoutes],
    structureDiff.added,
    structureDiff.changed,
    structureDiff.removed,
    sectionDiff.added,
    sectionDiff.changed,
    sectionDiff.removed,
    styleDiff.added,
    styleDiff.changed,
    api.added,
    api.changed,
    api.removed,
    assets.added,
    assets.changed,
    assets.removed,
    baselines.added,
    baselines.changed,
    baselines.removed,
    changedRepeatedBlocks,
    newRoutesNotInComponents,
  ].some((list) => list.length > 0)

  const residuals = []
  if (removed.length) {
    residuals.push({
      kind: 'removed-route',
      item: removed.join(', '),
      note: 'Accept will not delete clone source or current fixture files for removed routes.',
    })
  }
  if (newRoutesNotInComponents.length) {
    residuals.push({
      kind: 'shared-components',
      item: newRoutesNotInComponents.join(', '),
      note: 'Record these routes in analysis/components.md before implementing pages.',
    })
  }

  const status = hasChanges ? 'changes' : 'unchanged'
  const next = hasChanges
    ? 'Review the delta, analyze new or changed shared components and pages, then run compare-target --accept before editing apps/web. After accept, run clone-loop and repair only the changed or failed routes.'
    : 'No target drift detected. Fixtures were not modified.'

  return {
    siteId: options.siteId ?? null,
    status,
    next,
    residuals,
    currentRoot: current.root,
    stagingRoot: staged.root,
    routes: {
      added,
      removed,
      changed: unique([...changedRoutes]),
      unchanged: unique(candidates.filter((name) => !added.includes(name) && !removed.includes(name) && !changedRoutes.has(name))),
      discovered,
    },
    structure: structureDiff,
    sections: sectionDiff,
    styles: styleDiff,
    sharedComponents: {
      newRoutesNotInComponents,
      changedRepeatedBlocks,
    },
    api,
    assets,
    baselines,
    warnings: [
      'This recapture is not a fix-loop baseline overwrite.',
      'Removed routes are listed only. Accept copies added and changed fixture files and never deletes clone source.',
    ],
  }
}

export function formatTargetUpdateReport(report) {
  const list = (label, items) =>
    `${label}: ${items?.length ? items.join(', ') : '(none)'}`
  const lines = [
    `# Target update report${report.siteId ? ` for ${report.siteId}` : ''}`,
    '',
    `status: ${report.status}`,
    `next: ${report.next}`,
    '',
    '## Routes',
    list('added', report.routes.added),
    list('removed', report.routes.removed) + ' (not deleted on accept)',
    list('changed', report.routes.changed),
    list('discovered', report.routes.discovered),
    '',
    '## Sections',
    list('added', report.sections.added),
    list('removed', report.sections.removed),
    list('changed', report.sections.changed),
    '',
    '## Styles',
    list('added', report.styles.added),
    list('changed', report.styles.changed),
    '',
    '## Shared components',
    list('new routes not in components.md', report.sharedComponents.newRoutesNotInComponents),
    report.sharedComponents.changedRepeatedBlocks.length
      ? report.sharedComponents.changedRepeatedBlocks
          .map(
            (item) =>
              `- ${item.component}: ${item.currentRoutes.join(', ') || '(none)'} -> ${item.stagedRoutes.join(', ') || '(none)'}`,
          )
          .join('\n')
      : 'changed repeated blocks: (none)',
    '',
    '## API mocks',
    list('added', report.api.added),
    list('removed', report.api.removed),
    list('changed', report.api.changed),
    `decision: ${report.api.decision?.current ?? 'undecided'} -> ${report.api.decision?.staged ?? 'undecided'}`,
    '',
    '## Assets',
    list('added', report.assets.added),
    list('removed', report.assets.removed),
    list('changed', report.assets.changed),
    '',
    '## Baselines',
    list('added', report.baselines.added),
    list('removed', report.baselines.removed),
    list('changed', report.baselines.changed),
    '',
    'Refreshing baselines is allowed only after this report, via --accept. Do not recapture baselines inside clone-loop.',
  ]
  return `${lines.join('\n')}\n`
}

export function writeTargetUpdateReport(siteId, report, root = repoRoot) {
  const paths = reportPaths(siteId, root)
  mkdirSync(paths.dir, { recursive: true })
  writeJson(paths.json, report)
  writeFileSync(paths.markdown, formatTargetUpdateReport(report))
  return paths
}

export function seedStagingFromCurrent(currentRoot, staging, options = {}) {
  mkdirSync(staging, { recursive: true })
  const relatives = options.relatives ?? ACCEPT_RELATIVE
  for (const rel of relatives) {
    const from = resolve(currentRoot, rel)
    if (!existsSync(from)) continue
    copyTree(from, resolve(staging, rel), currentRoot)
  }
  const components = resolve(currentRoot, 'analysis/components.md')
  if (existsSync(components)) {
    mkdirSync(resolve(staging, 'analysis'), { recursive: true })
    copyFileSync(components, resolve(staging, 'analysis/components.md'))
  }
}

function copyTree(from, to, root) {
  const info = statSync(from)
  if (info.isDirectory()) {
    mkdirSync(to, { recursive: true })
    for (const entry of readdirSync(from)) copyTree(join(from, entry), join(to, entry), root)
    return
  }
  if (!isSafeRelative(root, from) && from !== root) {
    // 源目录本身可以是 root 下的直接文件；其余必须在 root 内。
  }
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
}

function filesForChange(kind, item) {
  if (kind === 'structure') return ['structure.json']
  if (kind === 'sections') return ['sections.json']
  if (kind === 'styles') return [`styles/${item}.json`]
  if (kind === 'api') return item === 'manifest' ? ['api/manifest.json'] : [`api/${item}.json`, 'api/manifest.json']
  if (kind === 'assets') return item === 'manifest' ? ['assets/manifest.json'] : [`assets/${item}`, 'assets/manifest.json']
  if (kind === 'baselines') return [`baselines/${item}`]
  return []
}

export function plannedAcceptCopies(report) {
  const files = new Set()
  if (report.structure?.added?.length || report.structure?.changed?.length) files.add('structure.json')
  if (report.routes?.added?.length) files.add('structure.json')
  if (report.sections?.added?.length || report.sections?.changed?.length || report.sections?.removed?.length)
    files.add('sections.json')
  for (const item of [...(report.styles?.added ?? []), ...(report.styles?.changed ?? [])]) {
    for (const file of filesForChange('styles', item)) files.add(file)
  }
  for (const item of [...(report.api?.added ?? []), ...(report.api?.changed ?? [])]) {
    files.add('api/manifest.json')
    files.add(`api/${item}.json`)
  }
  if (report.api?.decision?.changed) files.add('api/manifest.json')
  for (const item of [...(report.assets?.added ?? []), ...(report.assets?.changed ?? [])]) {
    files.add('assets/manifest.json')
    const stagedFile = report.assets?.files?.[item] ?? item
    files.add(`assets/${stagedFile}`)
  }
  for (const item of [...(report.baselines?.added ?? []), ...(report.baselines?.changed ?? [])]) {
    files.add(`baselines/${item}`)
  }
  return [...files].sort()
}


export function mergeDocumentOnAccept(currentDoc, stagedDoc, removedNames = []) {
  const next = { ...(currentDoc ?? {}), ...(stagedDoc ?? {}) }
  for (const name of removedNames) {
    for (const key of Object.keys(next)) {
      if (routeBase(key) !== name) continue
      if (currentDoc && Object.hasOwn(currentDoc, key)) next[key] = currentDoc[key]
    }
  }
  return next
}

export function acceptTargetUpdate(siteId, options = {}) {
  const root = options.root ?? repoRoot
  const paths = reportPaths(siteId, root)
  if (!existsSync(paths.json)) {
    throw new Error(
      `No compare report at ${paths.json}. Run node scripts/compare-target.mjs --site ${siteId} first, then pass --accept.`,
    )
  }
  const report = options.report ?? readJson(paths.json)
  if (!report || typeof report !== 'object') throw new Error(`Compare report ${paths.json} is not valid JSON.`)
  const staging = options.stagingRoot ?? report.stagingRoot ?? stagingRoot(siteId, root)
  const current = options.fixturesRoot ?? report.currentRoot ?? fixturesRoot(siteId, root)
  if (!existsSync(staging)) throw new Error(`Staging directory missing: ${staging}`)

  const copied = []
  const missing = []
  const removedNames = report.routes?.removed ?? []
  for (const rel of plannedAcceptCopies(report)) {
    const from = resolve(staging, rel)
    const to = resolve(current, rel)
    if (!isSafeRelative(staging, from) || !isSafeRelative(current, to)) {
      throw new Error(`Refusing to copy unsafe path ${rel}`)
    }
    if (!existsSync(from) || !statSync(from).isFile()) {
      missing.push(rel)
      continue
    }
    mkdirSync(dirname(to), { recursive: true })
    if (rel === 'structure.json' || rel === 'sections.json') {
      const merged = mergeDocumentOnAccept(readJson(to, {}), readJson(from, {}), removedNames)
      writeJson(to, merged)
    } else {
      copyFileSync(from, to)
    }
    copied.push(rel)
  }

  const accepted = {
    siteId,
    copied,
    missing,
    skippedRemoved: report.routes?.removed ?? [],
    note: 'Removed routes were not deleted from fixtures or apps/web. That is a later implementation decision.',
  }
  writeJson(paths.accepted, accepted)
  return accepted
}

function pathToRouteName(pathname) {
  const trimmed = pathname.replace(/\/+$/, '')
  if (trimmed === '' || trimmed === '/') return 'home'
  return trimmed
    .replace(/^\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page'
}

export async function discoverPublicLinks(page, origin) {
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].map((anchor) => anchor.getAttribute('href') || ''),
  )
  const found = []
  const seen = new Set()
  for (const href of hrefs) {
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:'))
      continue
    let url
    try {
      url = new URL(href, origin)
    } catch {
      continue
    }
    if (url.origin !== new URL(origin).origin) continue
    if (isBlockedTargetPath(url.pathname)) continue
    const name = pathToRouteName(url.pathname)
    if (seen.has(name)) continue
    seen.add(name)
    found.push({ name, path: url.pathname })
  }
  return found
}

function mergeLiveStructure(existing = {}, live) {
  return {
    landmarks: live.landmarks ?? existing.landmarks ?? [],
    headings: live.headings ?? existing.headings ?? [],
    components:
      Array.isArray(live.components) && live.components.length > 0
        ? live.components
        : (existing.components ?? []),
    interactions:
      Array.isArray(live.interactions) && live.interactions.length > 0
        ? live.interactions
        : (existing.interactions ?? []),
  }
}

async function recaptureAssets(staging, observed) {
  const file = resolve(staging, 'assets/manifest.json')
  const manifest = readJson(file, { items: [] }) ?? { items: [] }
  const items = [...(manifest.items ?? [])]
  const seen = new Set(items.map((item) => item.key))
  for (const item of observed) {
    if (!item?.key || seen.has(item.key)) continue
    seen.add(item.key)
    items.push({ key: item.key, url: item.url })
  }
  manifest.items = items
  writeJson(file, manifest)
  for (const item of items) {
    if (typeof item.url !== 'string' || !/^https?:\/\//i.test(item.url)) continue
    const dest = resolve(staging, 'assets', item.key)
    try {
      const response = await fetch(item.url, { redirect: 'follow' })
      if (!response.ok || !response.body) continue
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, Buffer.from(await response.arrayBuffer()))
    } catch {
      // 下载失败时保留已有的 seeded 文件，让报告去标差异。
    }
  }
}

export async function recaptureTargetToStaging(siteId, options = {}) {
  const root = options.root ?? repoRoot
  const profile = loadProfile(siteId, root)
  const origin = assertTargetOrigin(options.target ?? profile.targetBaseUrl, 'target URL')
  const current = fixturesRoot(siteId, root)
  const staging = stagingRoot(siteId, root)
  const filter =
    options.route == null || options.route === true
      ? null
      : new Set(
          String(options.route)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        )

  rmSync(staging, { recursive: true, force: true })
  seedStagingFromCurrent(current, staging)

  let document = readJson(resolve(staging, 'sections.json'), {}) ?? {}
  let structure = readJson(resolve(staging, 'structure.json'), {}) ?? {}
  let apiManifest = readJson(resolve(staging, 'api/manifest.json'), emptyApiManifest(siteId, 'pending'))
  const capturedApi = []
  const skippedApi = []
  const seenApi = new Set()
  const discovered = []
  const seenLinks = new Set()
  const missingRoutes = []
  const visited = []
  const observedAssets = []
  const { newPage, withBrowser, screenshotFullPage } = await import('./browser.js')
  const { readStructure } = await import('./structure.js')

  function rememberSkip(url, reason) {
    const stamp = `${url}|${reason}`
    if (seenApi.has(stamp)) return
    seenApi.add(stamp)
    skippedApi.push({ url, reason })
  }

  async function onResponse(response) {
    const request = response.request()
    const url = response.url()
    try {
      const type = request.resourceType()
      if (type === 'image' || type === 'font' || type === 'media') {
        try {
          const parsed = new URL(url)
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            const key = parsed.pathname
              .replace(/^\//, '')
              .toLowerCase()
              .replace(/[^a-z0-9._/-]+/g, '-')
              .replace(/^-+|-+$/g, '')
            if (key && !key.includes('..')) observedAssets.push({ key, url })
          }
        } catch {
          /* ignore */
        }
        return
      }
      if (type !== 'fetch' && type !== 'xhr' && type !== 'other') return
      let body = ''
      try {
        body = await response.text()
      } catch {
        rememberSkip(url, 'unread-body')
        return
      }
      const verdict = classifyApiResponse({
        method: request.method(),
        url,
        status: response.status(),
        contentType: response.headers()['content-type'] ?? '',
        resourceType: type,
        requestHeaders: request.headers(),
        responseHeaders: response.headers(),
        body,
        bodySize: Buffer.byteLength(body),
      })
      if (!verdict.accept) {
        rememberSkip(url, verdict.reason)
        return
      }
      if (seenApi.has(verdict.key)) return
      seenApi.add(verdict.key)
      const item = buildApiManifestItem(verdict, { siteId, bodyFile: `${verdict.key}.json` })
      const dest = resolve(staging, 'api', item.file)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, prettyJsonBody(body))
      capturedApi.push(item)
    } catch (error) {
      rememberSkip(url, error.message)
    }
  }

  await withBrowser(async (browser) => {
    for (const viewport of profile.viewports) {
      const page = await newPage(browser, viewport)
      page.on('response', (response) => {
        void onResponse(response)
      })
      try {
        for (const route of profile.routes) {
          if (filter && !filter.has(route.name)) continue
          if (isBlockedTargetPath(route.path)) {
            visited.push({ route: route.name, viewport: viewport.name, skipped: 'blocked-path' })
            continue
          }
          const url = targetRouteUrl(origin, route.path)
          let response
          try {
            response = await prepareTargetPage(page, url)
          } catch (error) {
            visited.push({ route: route.name, viewport: viewport.name, skipped: error.message })
            continue
          }
          const status = response?.status?.() ?? 0
          if (isBlockedTargetPath(page.url()) || status === 401 || status === 403) {
            visited.push({ route: route.name, viewport: viewport.name, skipped: 'privileged' })
            continue
          }
          if (status === 404 || status >= 500) {
            missingRoutes.push(route.name)
            delete structure[route.name]
            for (const file of walkFiles(resolve(staging, 'baselines'))) {
              if (file.startsWith(`${route.name}.`)) rmSync(resolve(staging, 'baselines', file), { force: true })
            }
            visited.push({ route: route.name, viewport: viewport.name, skipped: `http-${status}` })
            continue
          }
          await page.waitForTimeout(800)
          const live = await readStructure(page)
          structure[route.name] = mergeLiveStructure(structure[route.name], live)
          for (const link of await discoverPublicLinks(page, origin)) {
            if (seenLinks.has(link.name)) continue
            if (profile.routes.some((item) => item.name === link.name || item.path === link.path)) continue
            seenLinks.add(link.name)
            discovered.push(link)
          }
          const headings = await readPageHeadings(page)
          const planned = sectionsFor(document, route.name, viewport.name)
          const captures = []
          const missing = []
          for (const section of planned) {
            const resolved = await resolveTargetSection(page, section, headings, viewport.name)
            if (resolved.skipped || resolved.absent) continue
            if (resolved.missing) {
              missing.push(section.id)
              captures.push(resolved)
              continue
            }
            const tree = await readSectionStyles(page, [resolved], STYLE_KEYS)
            const recorded = tree[resolved.id] ?? { styles: {}, probes: {} }
            captures.push({ ...resolved, styles: recorded.styles ?? {}, probes: recorded.probes ?? {} })
          }
          const fixture = buildStylesFixture({
            source: 'target',
            origin,
            siteId,
            route: route.name,
            viewport,
            captures: captures.filter((item) => !item.missing),
            missing,
          })
          writeJson(resolve(staging, 'styles', `${route.name}.${viewport.name}.json`), fixture)
          document = mergeCapturedSections(document, route.name, viewport.name, captures)
          const shot = resolve(staging, 'baselines', `${route.name}.${viewport.name}.png`)
          await screenshotFullPage(page, shot, viewport)
          visited.push({
            route: route.name,
            viewport: viewport.name,
            url,
            status,
            captured: captures.filter((item) => !item.missing).length,
          })
        }
      } finally {
        await page.close()
      }
    }
  })

  writeJson(resolve(staging, 'structure.json'), structure)
  writeJson(resolve(staging, 'sections.json'), document)
  const mergedApi = mergeApiManifest(apiManifest, {
    siteId,
    apiMocks: capturedApi.length > 0 ? 'captured' : apiManifest?.apiMocks ?? 'pending',
    items: capturedApi,
    skipped: skippedApi,
  })
  writeJson(resolve(staging, 'api/manifest.json'), mergedApi)
  await recaptureAssets(staging, observedAssets)
  const meta = {
    siteId,
    origin,
    visited,
    discoveredRoutes: discovered,
    missingRoutes: unique(missingRoutes),
    capturedAt: new Date().toISOString(),
  }
  writeJson(resolve(staging, 'capture-meta.json'), meta)
  writeJson(reportPaths(siteId, root).meta, meta)
  return { staging, meta }
}

export function compareTargetSite(siteId, options = {}) {
  const root = options.root ?? repoRoot
  const current = loadFixtureSnapshot(options.fixturesRoot ?? fixturesRoot(siteId, root))
  const staged = loadFixtureSnapshot(options.stagingRoot ?? stagingRoot(siteId, root))
  let profile = null
  try {
    profile = loadProfile(siteId, root)
  } catch {
    profile = null
  }
  const report = compareSnapshots(current, staged, { siteId, profile })
  report.siteId = siteId
  return report
}
