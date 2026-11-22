import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mockRuntimePath, readApiMocksDecision } from './api-capture.js'
import { repoRoot } from './paths.js'

export function localApiOrigin(env = process.env) {
  const port = env.PORT ?? '3000'
  return `http://127.0.0.1:${port}`
}

export function plannedMockHealthCheck(siteId, root = repoRoot, env = process.env) {
  const manifestFile = resolve(root, 'fixtures/sites', siteId, 'api/manifest.json')
  if (!existsSync(manifestFile)) return { skipped: true, reason: 'no-manifest' }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  } catch (error) {
    return { skipped: false, ok: false, error: `api/manifest.json is not valid JSON. ${error.message}` }
  }
  const decision = readApiMocksDecision(manifest)
  if (decision.reason === 'none') return { skipped: true, reason: 'none' }
  if (!decision.ok) return { skipped: true, reason: decision.reason }
  const item = (manifest.items ?? []).find((entry) => entry?.key)
  if (!item) return { skipped: true, reason: 'no-items' }
  const url = `${localApiOrigin(env)}${item.runtime ?? mockRuntimePath(siteId, item.key)}`
  return { skipped: false, url, key: item.key }
}

export function checkLocalMockApi(siteId, root = repoRoot, env = process.env) {
  const planned = plannedMockHealthCheck(siteId, root, env)
  if (planned.ok === false) return planned
  if (planned.skipped) return { ok: true, skipped: true, reason: planned.reason }
  const script = `fetch(${JSON.stringify(planned.url)}).then((response) => { console.log(response.status); process.exit(0) }).catch((error) => { console.error(error.message); process.exit(2) })`
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    timeout: 5000,
  })
  if (result.status === 2 || result.error) {
    const detail = (result.stderr || result.error?.message || 'connection failed').trim()
    return {
      ok: false,
      url: planned.url,
      error: `Local mock API is not reachable at ${planned.url}. Start it with pnpm dev:api. ${detail}`,
    }
  }
  const status = Number((result.stdout || '').trim())
  if (!Number.isFinite(status) || status >= 500) {
    return {
      ok: false,
      url: planned.url,
      status,
      error: `Local mock ${planned.url} returned ${status}. Start pnpm dev:api and confirm /api/mock is mounted on the Node entry, not a Cloudflare Worker route.`,
    }
  }
  if (status === 404) {
    return {
      ok: false,
      url: planned.url,
      status,
      error: `Local mock ${planned.url} returned 404. Confirm fixtures/sites/${siteId}/api has that key and pnpm dev:api is running.`,
    }
  }
  return { ok: true, skipped: false, url: planned.url, status }
}
