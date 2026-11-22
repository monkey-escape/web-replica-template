import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Hono } from 'hono'
import { isObjectKey, isSiteId, mountLocalMedia, resolveMediaFile } from './media.ts'

test('site ids and object keys reject traversal', () => {
  assert.equal(isSiteId('example'), true)
  assert.equal(isSiteId('peptidewholesalers'), true)
  assert.equal(isSiteId('../etc'), false)
  assert.equal(isObjectKey('images/hero.webp'), true)
  assert.equal(isObjectKey('fonts/dm-sans.woff2'), true)
  assert.equal(isObjectKey('../secret.txt'), false)
  assert.equal(isObjectKey('images/../../etc/passwd'), false)
  assert.equal(isObjectKey(''), false)
})

test('resolveMediaFile stays inside the site assets directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'media-'))
  const assets = join(root, 'example', 'assets', 'images')
  mkdirSync(assets, { recursive: true })
  const file = join(assets, 'mark.svg')
  writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg"/>\n')
  writeFileSync(join(root, 'outside.txt'), 'nope\n')
  symlinkSync(join(root, 'outside.txt'), join(assets, 'escape.txt'))

  assert.equal(await resolveMediaFile(root, 'example', 'images/mark.svg'), realpathSync(file))
  assert.equal(await resolveMediaFile(root, 'example', 'images/escape.txt'), null)
  assert.equal(await resolveMediaFile(root, 'example', '../outside.txt'), null)
  assert.equal(await resolveMediaFile(root, 'missing', 'images/mark.svg'), null)
  rmSync(root, { recursive: true, force: true })
})

test('the local media route serves a file and supports range requests', async () => {
  const root = mkdtempSync(join(tmpdir(), 'media-app-'))
  const assets = join(root, 'example', 'assets')
  mkdirSync(assets, { recursive: true })
  writeFileSync(join(assets, 'hello.txt'), 'hello-media')

  const app = new Hono()
  mountLocalMedia(app, { sitesRoot: root })

  const missing = await app.request('http://127.0.0.1/media/example/missing.txt')
  assert.equal(missing.status, 404)

  const ok = await app.request('http://127.0.0.1/media/example/hello.txt')
  assert.equal(ok.status, 200)
  assert.match(ok.headers.get('content-type') ?? '', /text\/plain/)
  assert.equal(await ok.text(), 'hello-media')

  const ranged = await app.request('http://127.0.0.1/media/example/hello.txt', {
    headers: { Range: 'bytes=0-4' },
  })
  assert.equal(ranged.status, 206)
  assert.equal(await ranged.text(), 'hello')
  assert.equal(ranged.headers.get('content-range'), 'bytes 0-4/11')

  const traversal = await app.request('http://127.0.0.1/media/example/../example/assets/hello.txt')
  assert.equal(traversal.status, 404)
  rmSync(root, { recursive: true, force: true })
})
