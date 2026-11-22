import { lstat, readFile, realpath } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context, Hono } from 'hono'
import { isObjectKey, isSiteId } from './media.js'

export function defaultApiFixturesRoot(): string {
  const override = globalThis.process?.env?.API_MOCKS_ROOT
  if (override && override.length > 0) return resolve(override)
  const here = dirname(fileURLToPath(import.meta.url))
  return resolve(here, '../../../fixtures/sites')
}

/** 把 /api/mock/<site-id>/<key> 解析成 api fixtures 里的文件。越界或缺失时返回 null。 */
export async function resolveApiMockFile(
  sitesRoot: string,
  siteId: string,
  key: string,
): Promise<string | null> {
  if (!isSiteId(siteId) || !isObjectKey(key)) return null
  const apiRoot = resolve(sitesRoot, siteId, 'api')
  const candidate = resolve(apiRoot, `${key}.json`)
  const rel = relative(apiRoot, candidate)
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || rel === '') return null
  try {
    const real = await realpath(candidate)
    const realRoot = await realpath(apiRoot)
    const inside = relative(realRoot, real)
    if (inside.startsWith('..') || inside.includes(`..${sep}`)) return null
    const info = await lstat(real)
    if (!info.isFile()) return null
    return real
  } catch {
    return null
  }
}

type ManifestItem = {
  key: string
  status?: number
  contentType?: string
  file?: string
}

async function loadManifest(sitesRoot: string, siteId: string): Promise<{ items: ManifestItem[] } | null> {
  try {
    const file = resolve(sitesRoot, siteId, 'api', 'manifest.json')
    const raw = JSON.parse(await readFile(file, 'utf8')) as { items?: ManifestItem[] }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) return { items: [] }
    return raw
  } catch {
    return null
  }
}

function itemForKey(manifest: { items: ManifestItem[] } | null, key: string): ManifestItem | null {
  if (!manifest) return null
  return manifest.items.find((item) => item.key === key) ?? null
}

/** 只在 Node 入口挂载。Worker 上没有本地 fixtures，不要在 Worker 里读文件系统。 */
export function mountLocalApiMocks(app: Hono, options: { sitesRoot?: string } = {}): void {
  const sitesRoot = options.sitesRoot ?? defaultApiFixturesRoot()

  const handler = async (c: Context) => {
    const siteId = c.req.param('siteId')
    const prefix = `/api/mock/${siteId}/`
    const key = c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) : ''
    const decoded = decodeURIComponent(key)
    const file = await resolveApiMockFile(sitesRoot, siteId, decoded)
    if (!file) return c.json({ error: 'not_found' }, 404)
    const manifest = await loadManifest(sitesRoot, siteId)
    const item = itemForKey(manifest, decoded)
    const body = await readFile(file)
    const type = item?.contentType ?? 'application/json; charset=utf-8'
    const status = item?.status ?? 200
    c.header('Content-Type', type)
    c.header('Cache-Control', 'public, max-age=0')
    // 不回放 Set-Cookie 或鉴权头。
    return c.body(body, status)
  }

  app.get('/api/mock/:siteId/*', handler)
  app.get('/api/mock/:siteId', (c) => c.json({ error: 'not_found' }, 404))
}

export function apiMockUrl(siteId: string, key: string): string {
  return `/api/mock/${siteId}/${key}`
}
