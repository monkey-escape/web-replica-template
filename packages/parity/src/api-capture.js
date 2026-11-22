import { createHash } from 'node:crypto'
const WRITE_METHODS = /^(POST|PUT|PATCH|DELETE|CONNECT)$/i
// 被动记录时 /api/ 上的公开 JSON 是允许的；仍禁止打开 requisition / 登录墙等特权路径。
const PRIVILEGED_PATH =
  /^(?:\/requisition(?:\/|$)|\/(?:login|signin|sign-in|signup|sign-up|register|checkout|cart)(?:\/|$))/i

export function isPrivilegedApiPath(pathOrUrl) {
  let pathname = pathOrUrl
  try {
    pathname = new URL(pathOrUrl, 'https://example.invalid').pathname
  } catch {
    pathname = pathOrUrl
  }
  return PRIVILEGED_PATH.test(pathname)
}

const SECRET_HEADER =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-access-token|x-csrf-token)$/i
const MEDIA_TYPE = /^(image|audio|video|font)\//i
const HTML_TYPE = /^(text\/html|application\/xhtml\+xml)\b/i
const JSON_TYPE = /^(application\/json|application\/[\w.+-]*\+json|text\/json)\b/i
const MEDIA_EXT =
  /\.(?:avif|gif|ico|jpe?g|png|svg|webp|bmp|mp4|webm|mp3|m4a|wav|ogg|woff2?|ttf|otf|eot|vtt)(?:$|\?)/i
const SECRET_FIELD =
  /(?:"|')?(password|passwd|secret|api[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|id_token|client_secret|authorization|creditcard|card_number|ssn)(?:"|')?\s*:/i
const JWT = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/
const PEM = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/
const TRACKER_HOST =
  /(?:^|\.)(?:google-analytics\.com|googletagmanager\.com|googleadservices\.com|doubleclick\.net|facebook\.net|facebook\.com|hotjar\.com|segment\.io|sentry\.io)$/i
const SKIP_RESOURCE = /^(document|stylesheet|script|image|media|font|manifest|websocket)$/i
const MAX_BODY_BYTES = 1_000_000
const OBJECT_KEY = /^(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9][a-zA-Z0-9._/-]*$/

export function isApiObjectKey(value) {
  return typeof value === 'string' && value.length > 0 && value.length < 512 && OBJECT_KEY.test(value)
}

export function stableApiKey(method, urlString) {
  const url = new URL(urlString)
  const path = url.pathname.replace(/\/+/g, '/').replace(/^\/|\/$/g, '')
  const slug = (path || 'root')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  const verb = String(method || 'GET').toLowerCase()
  if (url.search) {
    const digest = createHash('sha256').update(url.search).digest('hex').slice(0, 8)
    return `${verb}/${slug || 'root'}-${digest}`
  }
  return `${verb}/${slug || 'root'}`
}

export function mockRuntimePath(siteId, key) {
  return `/api/mock/${siteId}/${key}`
}

export function bodyLooksLikeSecrets(body) {
  if (body == null) return false
  const text = typeof body === 'string' ? body : (() => {
    try {
      return JSON.stringify(body)
    } catch {
      return String(body)
    }
  })()
  if (!text) return false
  return SECRET_FIELD.test(text) || JWT.test(text) || PEM.test(text)
}

function headerMap(headers) {
  const map = {}
  if (!headers) return map
  if (typeof headers.forEach === 'function') {
    headers.forEach((value, name) => {
      map[String(name).toLowerCase()] = String(value)
    })
    return map
  }
  for (const [name, value] of Object.entries(headers)) {
    map[String(name).toLowerCase()] = String(value)
  }
  return map
}

function hasSecretHeader(headers) {
  return Object.keys(headers).some((name) => SECRET_HEADER.test(name))
}

export function classifyApiResponse(input = {}) {
  const method = String(input.method || 'GET').toUpperCase()
  const url = input.url
  if (!url) return { accept: false, reason: 'missing-url' }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { accept: false, reason: 'invalid-url' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { accept: false, reason: 'non-http' }
  }
  if (WRITE_METHODS.test(method) || (method !== 'GET' && method !== 'HEAD')) {
    return { accept: false, reason: 'write-or-unsupported-method' }
  }
  if (method === 'HEAD') return { accept: false, reason: 'no-body' }
  if (isPrivilegedApiPath(parsed.pathname)) {
    return { accept: false, reason: 'blocked-path' }
  }
  if (TRACKER_HOST.test(parsed.hostname)) {
    return { accept: false, reason: 'tracker' }
  }
  const resourceType = input.resourceType ? String(input.resourceType).toLowerCase() : ''
  if (resourceType && SKIP_RESOURCE.test(resourceType)) {
    return { accept: false, reason: 'resource-type' }
  }
  const requestHeaders = headerMap(input.requestHeaders)
  const responseHeaders = headerMap(input.responseHeaders)
  if (hasSecretHeader(requestHeaders) || hasSecretHeader(responseHeaders)) {
    return { accept: false, reason: 'credential-header' }
  }
  const contentType = String(input.contentType || responseHeaders['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (HTML_TYPE.test(contentType)) return { accept: false, reason: 'html-document' }
  if (MEDIA_TYPE.test(contentType) || MEDIA_EXT.test(parsed.pathname)) {
    return { accept: false, reason: 'media' }
  }
  if (contentType && !JSON_TYPE.test(contentType)) {
    return { accept: false, reason: 'not-json' }
  }
  if (!contentType && typeof input.body === 'string') {
    const trimmed = input.body.trim()
    if (trimmed && trimmed[0] !== '{' && trimmed[0] !== '[') {
      return { accept: false, reason: 'not-json' }
    }
  }
  const status = Number(input.status || 0)
  if (status < 200 || status >= 400) return { accept: false, reason: 'http-error' }
  const size = Number(input.bodySize ?? (typeof input.body === 'string' ? Buffer.byteLength(input.body) : 0))
  if (size > MAX_BODY_BYTES) return { accept: false, reason: 'too-large' }
  if (bodyLooksLikeSecrets(input.body)) return { accept: false, reason: 'possible-secrets' }
  const key = stableApiKey(method, parsed.toString())
  if (!isApiObjectKey(key)) return { accept: false, reason: 'unsafe-key' }
  return {
    accept: true,
    reason: 'ok',
    key,
    method,
    url: parsed.toString(),
    path: parsed.pathname + parsed.search,
    status,
    contentType: contentType || 'application/json',
    runtime: null,
  }
}

export function buildApiManifestItem(classification, { siteId, bodyFile } = {}) {
  if (!classification?.accept) return null
  const key = classification.key
  return {
    key,
    method: classification.method,
    url: classification.url,
    path: classification.path,
    status: classification.status,
    contentType: classification.contentType,
    file: bodyFile ?? `${key}.json`,
    runtime: siteId ? mockRuntimePath(siteId, key) : undefined,
  }
}

export function emptyApiManifest(siteId, apiMocks = 'none') {
  return {
    siteId,
    apiMocks,
    items: [],
    skipped: [],
  }
}

export function mergeApiManifest(existing, update) {
  const previous = existing && typeof existing === 'object' ? existing : {}
  const next = update && typeof update === 'object' ? update : {}
  const byKey = new Map()
  for (const item of previous.items ?? []) {
    if (item?.key) byKey.set(item.key, item)
  }
  for (const item of next.items ?? []) {
    if (item?.key) byKey.set(item.key, item)
  }
  const skipped = []
  const seenSkip = new Set()
  for (const item of [...(previous.skipped ?? []), ...(next.skipped ?? [])]) {
    const stamp = `${item?.url ?? ''}|${item?.reason ?? ''}`
    if (seenSkip.has(stamp)) continue
    seenSkip.add(stamp)
    skipped.push(item)
  }
  const apiMocks = next.apiMocks ?? previous.apiMocks ?? (byKey.size > 0 ? 'captured' : 'none')
  return {
    siteId: next.siteId ?? previous.siteId,
    apiMocks,
    items: [...byKey.values()],
    skipped,
  }
}

export function prettyJsonBody(body) {
  if (body == null) return '{}\n'
  if (typeof body !== 'string') return `${JSON.stringify(body, null, 2)}\n`
  try {
    return `${JSON.stringify(JSON.parse(body), null, 2)}\n`
  } catch {
    return body.endsWith('\n') ? body : `${body}\n`
  }
}

export function readApiMocksDecision(manifest) {
  if (!manifest || typeof manifest !== 'object') return { ok: false, reason: 'missing' }
  const flag = manifest.apiMocks ?? manifest['api-mocks']
  if (flag === 'none') return { ok: true, reason: 'none' }
  if (flag === 'pending') return { ok: false, reason: 'pending' }
  if (Array.isArray(manifest.items) && manifest.items.length > 0) return { ok: true, reason: 'captured' }
  if (flag === 'captured' && (!manifest.items || manifest.items.length === 0)) {
    return { ok: false, reason: 'empty' }
  }
  return { ok: false, reason: 'undecided' }
}
