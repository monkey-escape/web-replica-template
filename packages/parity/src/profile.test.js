import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadProfile } from './profile.js'

test('strict routes cannot carry accepted diffs', () => {
  const root = mkdtempSync(join(tmpdir(), 'profile-'))
  const dir = join(root, 'tests/parity/profiles')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'demo.json'),
    JSON.stringify({
      siteId: 'demo',
      baseUrl: 'http://127.0.0.1:5173',
      viewports: [
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'mobile', width: 390, height: 844 },
      ],
      routes: [
        {
          name: 'home',
          path: '/',
          mode: 'strict',
          accepted: [{ kind: 'extra', key: 'components', item: 'banner' }],
        },
      ],
    }),
  )

  assert.throws(() => loadProfile('demo', root), /strict/)
  rmSync(root, { recursive: true, force: true })
})

test('profiles must declare desktop 1440 and mobile 390 viewports', () => {
  const root = mkdtempSync(join(tmpdir(), 'profile-vp-'))
  const dir = join(root, 'tests/parity/profiles')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'demo.json'),
    JSON.stringify({
      siteId: 'demo',
      baseUrl: 'http://127.0.0.1:5173',
      viewport: { width: 1280, height: 720 },
      routes: [{ name: 'home', path: '/', mode: 'strict' }],
    }),
  )
  assert.throws(() => loadProfile('demo', root), /1440/)
  rmSync(root, { recursive: true, force: true })
})

test('optional targetBaseUrl must be a credential-free http(s) origin', () => {
  const root = mkdtempSync(join(tmpdir(), 'profile-target-'))
  const dir = join(root, 'tests/parity/profiles')
  mkdirSync(dir, { recursive: true })
  const base = {
    siteId: 'demo',
    baseUrl: 'http://127.0.0.1:5174',
    viewports: [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ],
    routes: [{ name: 'home', path: '/', mode: 'strict' }],
  }
  writeFileSync(join(dir, 'demo.json'), JSON.stringify({ ...base, targetBaseUrl: 'https://www.example.com/path' }))
  assert.equal(loadProfile('demo', root).targetBaseUrl, 'https://www.example.com')
  writeFileSync(join(dir, 'demo.json'), JSON.stringify({ ...base, targetBaseUrl: 'https://user:pass@example.com' }))
  assert.throws(() => loadProfile('demo', root), /credentials/)
  rmSync(root, { recursive: true, force: true })
})
