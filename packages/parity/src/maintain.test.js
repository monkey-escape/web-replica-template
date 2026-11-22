import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  checkFileSoup,
  checkMaintainability,
  findHotlinks,
  tokenColorValues,
} from './maintain.js'

test('hotlinks catch remote images and fonts, not ordinary anchors', () => {
  const source = `
    <a href="https://www.example.com/about">About</a>
    <img src="https://cdn.example.com/hero.png" alt="" />
    <p style="background:url(https://cdn.example.com/bg.jpg)"></p>
    <img src="/media/example/mark.svg" alt="" />
  `
  assert.deepEqual(findHotlinks(source).sort(), [
    'https://cdn.example.com/bg.jpg',
    'https://cdn.example.com/hero.png',
  ])
})

test('readable files pass soup limits and oversized ones fail', () => {
  assert.equal(checkFileSoup('a\n'.repeat(10), { maxLines: 20, maxBytes: 1000, maxAverageLineLength: 240 }).length, 0)
  const long = checkFileSoup('a\n'.repeat(30), { maxLines: 20, maxBytes: 10_000, maxAverageLineLength: 240 })
  assert.equal(long.some((item) => item.kind === 'source-too-long'), true)
  const minified = checkFileSoup('x'.repeat(300), { maxLines: 1200, maxBytes: 10_000, maxAverageLineLength: 240 })
  assert.equal(minified.some((item) => item.kind === 'source-unreadable'), true)
})

test('maintainability fails a soup page with a hotlink and unused tokens', () => {
  const root = mkdtempSync(join(tmpdir(), 'maintain-'))
  const dir = join(root, 'apps/web/src')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(root, 'apps/web/index.html'), `<img src="https://target.example/a.png">\n`)
  writeFileSync(join(dir, 'style.css'), 'body{color:#000}\n')
  const result = checkMaintainability(root, { tokens: { color: { ink: '#112233' } } })
  assert.equal(result.pass, false)
  assert.equal(result.failures.some((item) => item.kind === 'hotlink'), true)
  assert.equal(result.failures.some((item) => item.kind === 'tokens-unused'), true)
  rmSync(root, { recursive: true, force: true })
})

test('token colors are collected from nested analysis objects', () => {
  assert.deepEqual(tokenColorValues({ color: { ink: '#112233', paper: '#fff' } }).sort(), [
    '#112233',
    '#fff',
  ])
})
