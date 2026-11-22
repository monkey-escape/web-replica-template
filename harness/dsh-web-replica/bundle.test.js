import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = dirname(fileURLToPath(import.meta.url))

test('bundle manifest points at the patch and the plugin entry', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'dsh-web-replica')
  assert.equal(manifest.private, true)
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.main, 'index.js')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.exports['./package.json'], './package.json')
  assert.match(manifest.engines.dsh, /0\.2\.3-alpha\.1/)
  for (const file of ['index.js', 'cordis.patch.yml', 'skills']) {
    assert.ok(manifest.files.includes(file), file)
  }
})

test('patch inserts a replica preset without replacing standard', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id: web-replica/)
  assert.match(patch, /name: dsh-web-replica/)
  assert.match(patch, /id: preset-web-replica/)
  assert.match(patch, /name: '@deepseek-ai\/dsh-agent-preset'/)
  assert.match(patch, /id: web-replica\n/)
  assert.match(patch, /AGENTS\.md/)
  assert.match(patch, /docs\/playbook\.md/)
  assert.match(patch, /docs\/adapt\.md/)
  assert.match(patch, /docs\/experience\/traps\.md/)
  assert.match(patch, /clone-loop\.mjs/)
  assert.match(patch, /recap-daily\.mjs/)
  assert.match(patch, /name: '@deepseek-ai\/dsh-skill-filesystem'/)
  assert.match(patch, /resolve\('dsh-web-replica\/package\.json'\)/)
  assert.doesNotMatch(patch, /id: preset-standard/)
})

test('skills are thin pointers at the repo method', () => {
  const names = readdirSync(join(root, 'skills')).sort()
  assert.deepEqual(names, [
    'web-replica-analyze',
    'web-replica-experience',
    'web-replica-parity',
    'web-replica-recap',
  ])
  for (const name of names) {
    const body = readFileSync(join(root, 'skills', name, 'SKILL.md'), 'utf8')
    assert.match(body, new RegExp(`^---\\nname: ${name}\\n`, 'u'))
    const description = body.match(/^description: (.+)$/m)?.[1] ?? ''
    assert.ok(description.length > 0)
    assert.ok(description.length <= 500, `${name} description is ${description.length} chars`)
    assert.ok(body.length < 8192, `${name} skill is ${body.length} chars`)
  }
})
