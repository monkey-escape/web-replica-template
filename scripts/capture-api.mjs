import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from '@replica/parity/args'
import {
  buildApiManifestItem,
  classifyApiResponse,
  emptyApiManifest,
  mergeApiManifest,
  prettyJsonBody,
  readApiMocksDecision,
  stableApiKey,
} from '@replica/parity/api-capture'
import { assertTargetOrigin, isBlockedTargetPath, prepareTargetPage, targetRouteUrl } from '@replica/parity/capture'
import { loadProfile } from '@replica/parity/profile'
import { repoRoot } from '@replica/parity/paths'

function help() {
  console.log(`Usage:
  node scripts/capture-api.mjs --self-test
  node scripts/capture-api.mjs --site <site-id> [--target <origin>] [--route <name>]

Passively record public JSON/XHR/fetch responses while loading public pages
(GET/read only). This does not navigate the browser to /api/ or /requisition,
log in, or submit forms. An age-gate may be dismissed.

Fixtures land in fixtures/sites/<site-id>/api/ plus manifest.json. Runtime
URLs are /api/mock/<site-id>/<key>. Do not hotlink the target API.

If the public site has no data APIs, write a manifest with apiMocks: "none"
instead of capturing. Analysis is incomplete until that decision is recorded.
See docs/api-mocks.md.`)
}

function routeFilter(value) {
  if (value == null || value === true) return null
  const names = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return names.length ? new Set(names) : null
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function readJsonIfExists(file) {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function manifestPath(root, siteId) {
  return resolve(root, 'fixtures/sites', siteId, 'api', 'manifest.json')
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  help()
  process.exit(0)
}

if (args['self-test']) {
  const text = help.toString()
  if (!text.includes('/api/mock/') || !text.includes('apiMocks') || !text.includes('fixtures/sites/')) {
    throw new Error('help text must document /api/mock/<site-id>/<key> and the fixtures path')
  }
  const accepted = classifyApiResponse({
    method: 'GET',
    url: 'https://www.example.com/api/catalog',
    status: 200,
    contentType: 'application/json',
    resourceType: 'fetch',
    body: '{"ok":true}',
  })
  if (!accepted.accept || accepted.key !== 'get/api-catalog') {
    throw new Error('public JSON GET /api/catalog must be accepted')
  }
  if (classifyApiResponse({ method: 'POST', url: 'https://www.example.com/api/catalog', status: 200, contentType: 'application/json', body: '{}' }).accept) {
    throw new Error('POST must be skipped')
  }
  if (classifyApiResponse({ method: 'GET', url: 'https://www.example.com/requisition', status: 200, contentType: 'application/json', body: '{}' }).accept) {
    throw new Error('/requisition must be skipped')
  }
  const example = readJsonIfExists(manifestPath(repoRoot, 'example'))
  const decision = readApiMocksDecision(example)
  if (!decision.ok || decision.reason !== 'none') {
    throw new Error('example must record apiMocks: "none" (it is a skeleton, not a third-party site)')
  }
  if (stableApiKey('GET', 'https://example.com/api/health') !== 'get/api-health') {
    throw new Error('stable key for /api/health is unexpected')
  }
  const merged = mergeApiManifest(emptyApiManifest('demo', 'none'), {
    apiMocks: 'captured',
    items: [{ key: 'get/api-health' }],
  })
  if (merged.items.length !== 1 || readApiMocksDecision(merged).ok !== true) {
    throw new Error('manifest merge failed')
  }
  console.log('capture-api self-test passed')
  process.exit(0)
}

if (typeof args.site !== 'string') {
  help()
  process.exit(1)
}

const siteId = args.site
const root = repoRoot
const profile = loadProfile(siteId, root)
const origin = assertTargetOrigin(args.target ?? profile.targetBaseUrl, 'target URL')
const filter = routeFilter(args.route)
const { newPage, withBrowser } = await import('@replica/parity/browser')
const apiRoot = resolve(root, 'fixtures/sites', siteId, 'api')
const file = manifestPath(root, siteId)
const captured = []
const skipped = []
const seen = new Set()

function rememberSkip(url, reason) {
  const stamp = `${url}|${reason}`
  if (seen.has(stamp)) return
  seen.add(stamp)
  skipped.push({ url, reason })
}

async function onResponse(response) {
  const request = response.request()
  const url = response.url()
  let body = ''
  let contentType = response.headers()['content-type'] ?? ''
  try {
    const type = request.resourceType()
    if (type !== 'fetch' && type !== 'xhr' && type !== 'other') {
      const verdict = classifyApiResponse({
        method: request.method(),
        url,
        status: response.status(),
        contentType,
        resourceType: type,
        requestHeaders: request.headers(),
        responseHeaders: response.headers(),
      })
      if (!verdict.accept) return
    }
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
      contentType,
      resourceType: request.resourceType(),
      requestHeaders: request.headers(),
      responseHeaders: response.headers(),
      body,
      bodySize: Buffer.byteLength(body),
    })
    if (!verdict.accept) {
      rememberSkip(url, verdict.reason)
      return
    }
    if (seen.has(verdict.key)) return
    seen.add(verdict.key)
    const item = buildApiManifestItem(verdict, { siteId, bodyFile: `${verdict.key}.json` })
    const dest = resolve(apiRoot, item.file)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, prettyJsonBody(body))
    captured.push(item)
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
          console.log(`skipped ${route.name}@${viewport.name}: blocked path ${route.path}`)
          continue
        }
        const url = targetRouteUrl(origin, route.path)
        await prepareTargetPage(page, url)
        await page.waitForTimeout(800)
        console.log(`listened ${route.name}@${viewport.name} from ${url}`)
      }
    } finally {
      await page.close()
    }
  }
})

const previous = readJsonIfExists(file)
let apiMocks = 'captured'
if (captured.length > 0) apiMocks = 'captured'
else if (previous?.apiMocks === 'none') apiMocks = 'none'
else if (previous?.apiMocks === 'pending') apiMocks = 'pending'
else if (Array.isArray(previous?.items) && previous.items.length > 0) apiMocks = 'captured'
const update = { siteId, apiMocks, items: captured, skipped }
const merged = mergeApiManifest(previous, update)
merged.apiMocks = apiMocks
if (captured.length > 0) merged.apiMocks = 'captured'
writeJson(file, merged)
console.log(`Wrote ${captured.length} mock(s) under fixtures/sites/${siteId}/api/`)
console.log(`Skipped ${skipped.length} response(s)`)
console.log(`Manifest: ${file}`)
console.log('Rewrite runtime API URLs to /api/mock/' + siteId + '/<key>. Do not hotlink the target API.')
