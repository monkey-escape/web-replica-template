import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  captureApiArgs,
  captureSectionsArgs,
  checkGatesArgs,
  cloneLoopArgs,
  compareTargetArgs,
  findRepoRoot,
} from './tools-lib.js'

test('script arg helpers keep site-id safety and refuse fix-loop baseline flags', () => {
  assert.deepEqual(checkGatesArgs({ site: 'example' }), ['--site', 'example'])
  assert.deepEqual(cloneLoopArgs({ site: 'example' }), ['--site', 'example'])
  assert.deepEqual(cloneLoopArgs({ site: 'example', conclude: true }), ['--site', 'example', '--conclude'])
  assert.deepEqual(cloneLoopArgs({ site: 'example', writeLesson: true, slug: 'first-pass' }), [
    '--site',
    'example',
    '--write-lesson',
    '--slug',
    'first-pass',
  ])
  assert.deepEqual(captureSectionsArgs({ site: 'example' }), ['--site', 'example', '--from-target'])
  assert.deepEqual(captureSectionsArgs({ site: 'example', source: 'clone' }), [
    '--site',
    'example',
    '--from-clone',
  ])
  assert.deepEqual(captureApiArgs({ site: 'example', route: 'home' }), ['--site', 'example', '--route', 'home'])
  assert.deepEqual(compareTargetArgs({ site: 'example' }), ['--site', 'example'])
  assert.deepEqual(compareTargetArgs({ site: 'example', action: 'from-staging' }), [
    '--site',
    'example',
    '--from-staging',
  ])
  assert.deepEqual(compareTargetArgs({ site: 'example', action: 'accept' }), ['--site', 'example', '--accept'])

  assert.throws(() => checkGatesArgs({ site: 'Bad Id' }), /kebab-case/)
  assert.throws(() => cloneLoopArgs({ site: 'example', writeLesson: true }), /slug/)
  assert.throws(() => captureSectionsArgs({ site: 'example', source: 'both' }), /source/)
  assert.throws(() => compareTargetArgs({ site: 'example', action: 'accept', target: 'https://www.example.com' }), /--accept/)
  assert.doesNotMatch(cloneLoopArgs({ site: 'example', conclude: true }).join(' '), /capture-reference|update-baseline|--accept/)
})

test('findRepoRoot walks up to a checkout that has the replica scripts', () => {
  const root = mkdtempSync(join(tmpdir(), 'replica-root-'))
  mkdirSync(join(root, 'scripts'))
  writeFileSync(join(root, 'scripts/clone-loop.mjs'), '// test\n')
  writeFileSync(join(root, 'AGENTS.md'), '# test\n')
  const nested = join(root, 'apps/web')
  mkdirSync(nested, { recursive: true })
  assert.equal(findRepoRoot(nested), root)
  assert.throws(() => findRepoRoot(tmpdir()), /Not inside a web-replica checkout/)
  rmSync(root, { recursive: true, force: true })
})
