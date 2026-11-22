import { createReadStream } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { Context, Hono } from 'hono'

const SITE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
// 对象键是站点 assets 目录里的相对路径，也是生产环境 R2 的 key。禁止向上跳目录。
const OBJECT_KEY = /^(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9][a-zA-Z0-9._/-]*$/

const TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

export function defaultAssetsRoot(): string {
  const override = globalThis.process?.env?.MEDIA_ASSETS_ROOT
  if (override && override.length > 0) return resolve(override)
  const here = dirname(fileURLToPath(import.meta.url))
  return resolve(here, '../../../fixtures/sites')
}

export function isSiteId(value: string): boolean {
  return SITE_ID.test(value)
}

export function isObjectKey(value: string): boolean {
  return value.length > 0 && value.length < 512 && OBJECT_KEY.test(value)
}

/** 把 URL 里的站点 id 和对象键解析成 assets 目录中的真实文件。越界或缺失时返回 null。 */
export async function resolveMediaFile(
  sitesRoot: string,
  siteId: string,
  key: string,
): Promise<string | null> {
  if (!isSiteId(siteId) || !isObjectKey(key)) return null
  const assetsRoot = resolve(sitesRoot, siteId, 'assets')
  const candidate = resolve(assetsRoot, key)
  const rel = relative(assetsRoot, candidate)
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || rel === '') return null
  try {
    const real = await realpath(candidate)
    const realRoot = await realpath(assetsRoot)
    const inside = relative(realRoot, real)
    if (inside.startsWith('..') || inside.includes(`..${sep}`)) return null
    const info = await lstat(real)
    if (!info.isFile()) return null
    return real
  } catch {
    return null
  }
}

function contentType(file: string): string {
  return TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
}

function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const start = match[1] === '' ? null : Number(match[1])
  const end = match[2] === '' ? null : Number(match[2])
  if (start === null && end === null) return null
  if (start === null && end !== null) {
    const from = Math.max(0, size - end)
    return { start: from, end: size - 1 }
  }
  if (start !== null && end === null) {
    if (start >= size) return null
    return { start, end: size - 1 }
  }
  if (start !== null && end !== null) {
    if (start > end || start >= size) return null
    return { start, end: Math.min(end, size - 1) }
  }
  return null
}

async function sendFile(c: Context, file: string) {
  const info = await lstat(file)
  const type = contentType(file)
  const range = parseRange(c.req.header('range'), info.size)
  if (range) {
    const length = range.end - range.start + 1
    c.header('Content-Type', type)
    c.header('Content-Length', String(length))
    c.header('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`)
    c.header('Accept-Ranges', 'bytes')
    c.status(206)
    return c.body(Readable.toWeb(createReadStream(file, { start: range.start, end: range.end })) as ReadableStream)
  }
  c.header('Content-Type', type)
  c.header('Content-Length', String(info.size))
  c.header('Accept-Ranges', 'bytes')
  c.header('Cache-Control', 'public, max-age=0')
  return c.body(Readable.toWeb(createReadStream(file)) as ReadableStream)
}

/** 只在 Node 入口挂载。Worker 上没有本地 fixtures，生产环境把同一前缀换到 R2。 */
export function mountLocalMedia(app: Hono, options: { sitesRoot?: string } = {}): void {
  const sitesRoot = options.sitesRoot ?? defaultAssetsRoot()

  const handler = async (c: Context) => {
    const siteId = c.req.param('siteId')
    const prefix = `/media/${siteId}/`
    const key = c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) : ''
    const file = await resolveMediaFile(sitesRoot, siteId, decodeURIComponent(key))
    if (!file) return c.json({ error: 'not_found' }, 404)
    return sendFile(c, file)
  }

  app.get('/media/:siteId/*', handler)
  app.get('/media/:siteId', (c) => c.json({ error: 'not_found' }, 404))
}

export function mediaUrl(siteId: string, key: string): string {
  return `/media/${siteId}/${key}`
}
