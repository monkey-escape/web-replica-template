import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkLocalMockApi, plannedMockHealthCheck } from './mock-health.js'

function writeManifest(root, siteId, manifest) {
  const dir = join(root, 'fixtures/sites', siteId, 'api')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest))
}

test('mock health is skipped when apiMocks is none', () => {
  const root = mkdtempSync(join(tmpdir(), 'mock-health-'))
  writeManifest(root, 'demo', { siteId: 'demo', apiMocks: 'none', items: [] })
  const planned = plannedMockHealthCheck('demo', root)
  assert.equal(planned.skipped, true)
  assert.equal(planned.reason, 'none')
  assert.equal(checkLocalMockApi('demo', root).ok, true)
  rmSync(root, { recursive: true, force: true })
})

test('mock health targets the local Hono /api/mock URL, not a Cloudflare Worker route', () => {
  const root = mkdtempSync(join(tmpdir(), 'mock-health-'))
  writeManifest(root, 'demo', {
    siteId: 'demo',
    apiMocks: 'captured',
    items: [{ key: 'get/health', runtime: '/api/mock/demo/get/health' }],
  })
  const planned = plannedMockHealthCheck('demo', root, { PORT: '3001' })
  assert.equal(planned.skipped, false)
  assert.equal(planned.url, 'http://127.0.0.1:3001/api/mock/demo/get/health')
  const result = checkLocalMockApi('demo', root, { PORT: '1' })
  assert.equal(result.ok, false)
  assert.match(result.url, /\/api\/mock\/demo\/get\/health/)
  assert.match(result.error, /pnpm dev:api/)
  rmSync(root, { recursive: true, force: true })
})
