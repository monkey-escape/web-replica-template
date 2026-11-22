import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { Hono } from 'hono'
import { apiMockUrl, mountLocalApiMocks, resolveApiMockFile } from './api-mocks.ts'

test('resolveApiMockFile stays inside the site api directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'api-mock-'))
  const api = join(root, 'example', 'api', 'get')
  mkdirSync(api, { recursive: true })
  const file = join(api, 'health.json')
  writeFileSync(file, '{"ok":true}\n')
  writeFileSync(join(root, 'outside.json'), '{"nope":true}\n')
  symlinkSync(join(root, 'outside.json'), join(api, 'escape.json'))

  assert.equal(await resolveApiMockFile(root, 'example', 'get/health'), realpathSync(file))
  assert.equal(await resolveApiMockFile(root, 'example', 'get/escape'), null)
  assert.equal(await resolveApiMockFile(root, 'example', '../outside'), null)
  assert.equal(await resolveApiMockFile(root, 'missing', 'get/health'), null)
  rmSync(root, { recursive: true, force: true })
})

test('the local mock route replays a public fixture and ignores traversal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'api-mock-app-'))
  const api = join(root, 'example', 'api', 'get')
  mkdirSync(api, { recursive: true })
  writeFileSync(join(api, 'health.json'), '{"ok":true,"source":"fixture"}\n')
  writeFileSync(
    join(dirname(api), 'manifest.json'),
    JSON.stringify({
      siteId: 'example',
      apiMocks: 'captured',
      items: [
        {
          key: 'get/health',
          method: 'GET',
          path: '/api/health',
          status: 200,
          contentType: 'application/json; charset=utf-8',
          file: 'get/health.json',
        },
      ],
    }),
  )

  const app = new Hono()
  mountLocalApiMocks(app, { sitesRoot: root })

  const missing = await app.request('http://127.0.0.1/api/mock/example/missing')
  assert.equal(missing.status, 404)

  const ok = await app.request('http://127.0.0.1/api/mock/example/get/health')
  assert.equal(ok.status, 200)
  assert.match(ok.headers.get('content-type') ?? '', /application\/json/)
  assert.equal(ok.headers.get('set-cookie'), null)
  assert.deepEqual(await ok.json(), { ok: true, source: 'fixture' })
  assert.equal(apiMockUrl('example', 'get/health'), '/api/mock/example/get/health')

  const traversal = await app.request('http://127.0.0.1/api/mock/example/../example/api/get/health')
  assert.equal(traversal.status, 404)
  rmSync(root, { recursive: true, force: true })
})
