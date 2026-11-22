import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { findRot } from './rot.js'

test('rot scan keeps marked files and temp output, and ignores ordinary source', () => {
  const root = mkdtempSync(join(tmpdir(), 'rot-'))
  mkdirSync(join(root, 'temp/clone-loop'), { recursive: true })
  mkdirSync(join(root, 'apps/web/src'), { recursive: true })
  writeFileSync(join(root, 'apps/web/src/keep.ts'), 'export const keep = true\n')
  writeFileSync(join(root, 'apps/web/src/old.obsolete.ts'), 'export const old = true\n')
  writeFileSync(
    join(root, 'apps/web/src/marked.ts'),
    '@replica-rotten\nexport const marked = true\n',
  )
  writeFileSync(join(root, 'temp/clone-loop/report.json'), '{}\n')

  const found = findRot(root)
    .map((item) => item.path)
    .sort()
  assert.deepEqual(found, [
    'apps/web/src/marked.ts',
    'apps/web/src/old.obsolete.ts',
    'temp/clone-loop/report.json',
  ])
  rmSync(root, { recursive: true, force: true })
})
