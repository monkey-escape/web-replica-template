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
