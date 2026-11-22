import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = dirname(fileURLToPath(import.meta.url))

function extractPrefix(patch) {
  const match = patch.match(/prefix: \|\n([\s\S]*?)\n          - id: agent-instructions/)
  assert.ok(match, 'persona prefix block')
  return match[1]
}

test('bundle manifest points at the patch, tools export, and plugin entry', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'dsh-web-replica')
  assert.equal(manifest.private, true)
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.main, 'index.js')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.exports['.'], './index.js')
  assert.equal(manifest.exports['./tools'], './tools.js')
  assert.equal(manifest.exports['./package.json'], './package.json')
  assert.match(manifest.engines.dsh, /0\.2\.3-alpha\.1/)
  assert.match(manifest.peerDependencies['@deepseek-ai/dsh-tools'], /0\.2\.3-alpha\.1/)
  for (const file of ['index.js', 'tools.js', 'tools-lib.js', 'cordis.patch.yml', 'skills']) {
    assert.ok(manifest.files.includes(file), file)
  }
})

test('patch inserts one replica preset, keeps bash/fs/web, and mounts official script tools', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id: web-replica/)
  assert.match(patch, /name: dsh-web-replica/)
  assert.match(patch, /id: preset-web-replica/)
  assert.match(patch, /name: '@deepseek-ai\/dsh-agent-preset'/)
  assert.match(patch, /id: web-replica\n/)
  assert.match(patch, /name: '@deepseek-ai\/dsh-skill-filesystem'/)
  assert.match(patch, /resolve\('dsh-web-replica\/package\.json'\)/)
  assert.match(patch, /name: '@deepseek-ai\/dsh-tool-bash'/)
  assert.match(patch, /name: '@deepseek-ai\/dsh-tool-fs'/)
  assert.match(patch, /name: '@deepseek-ai\/dsh-tool-web'/)
  assert.match(patch, /id: web-replica-tools\n\s+name: dsh-web-replica\/tools/)
  assert.doesNotMatch(patch, /id: preset-standard/)
  assert.equal(patch.split('id: preset-web-replica').length - 1, 1)
})

test('persona states the hard rules and phase order without pasting the playbook', () => {
  const prefix = extractPrefix(readFileSync(join(root, 'cordis.patch.yml'), 'utf8'))
  assert.ok(prefix.length > 400, 'persona should carry operational rules')
  assert.ok(prefix.length < 4000, `persona is ${prefix.length} chars; do not paste the playbook`)
  assert.match(prefix, /One method only/)
  assert.match(prefix, /docs\/playbook\.md/)
  assert.match(prefix, /Phase order/)
  assert.match(prefix, /shared-components: none/)
  assert.match(prefix, /apiMocks/)
  assert.match(prefix, /check-gates\.mjs/)
  assert.match(prefix, /Implement shared components first/)
  assert.match(prefix, /Compose pages/)
  assert.match(prefix, /report\.next/)
  assert.match(prefix, /--capture-reference/)
  assert.match(prefix, /compare-target/)
  assert.match(prefix, /no login/)
  assert.match(prefix, /replica_\*/)
  assert.doesNotMatch(prefix, /\| `analysis\/overview\.md`/)
  assert.doesNotMatch(prefix, /Cursor marketplace/)
})

test('skills carry commands and still point at the repo method', () => {
  const names = readdirSync(join(root, 'skills')).sort()
  assert.deepEqual(names, [
    'web-replica-analyze',
    'web-replica-experience',
    'web-replica-maintain',
    'web-replica-parity',
    'web-replica-recap',
    'web-replica-update',
  ])
  for (const name of names) {
    const body = readFileSync(join(root, 'skills', name, 'SKILL.md'), 'utf8')
    assert.match(body, new RegExp(`^---\\nname: ${name}\\n`, 'u'))
    const description = body.match(/^description: (.+)$/m)?.[1] ?? ''
    assert.ok(description.length > 0)
    assert.ok(description.length <= 500, `${name} description is ${description.length} chars`)
    assert.ok(body.length < 8192, `${name} skill is ${body.length} chars`)
    assert.match(body, /docs\/playbook\.md|Canonical docs/)
  }
  const analyze = readFileSync(join(root, 'skills/web-replica-analyze/SKILL.md'), 'utf8')
  assert.match(analyze, /check-gates\.mjs/)
  assert.match(analyze, /shared-components: none/)
  assert.match(analyze, /capture-api\.mjs/)
  assert.match(analyze, /replica_check_gates|replica_capture_sections|replica_capture_api/)
  const parity = readFileSync(join(root, 'skills/web-replica-parity/SKILL.md'), 'utf8')
  assert.match(parity, /oracle/i)
  assert.match(parity, /may not declare the clone done yourself/)
  assert.match(parity, /replica_clone_loop/)
  const maintain = readFileSync(join(root, 'skills/web-replica-maintain/SKILL.md'), 'utf8')
  assert.match(maintain, /human-maintainable/i)
  const update = readFileSync(join(root, 'skills/web-replica-update/SKILL.md'), 'utf8')
  assert.match(update, /compare-target\.mjs/)
  assert.match(update, /docs\/target-update\.md/)
  assert.match(update, /replica_compare_target/)
})

test('official tool wrappers wrap repo scripts and keep fix-loop safety', () => {
  const tools = readFileSync(join(root, 'tools.js'), 'utf8')
  const lib = readFileSync(join(root, 'tools-lib.js'), 'utf8')
  assert.match(tools, /from '@deepseek-ai\/dsh-tools'/)
  assert.match(tools, /defineTool/)
  assert.match(tools, /export const inject = \['tools'\]/)
  for (const name of [
    'replica_check_gates',
    'replica_capture_sections',
    'replica_capture_api',
    'replica_compare_target',
    'replica_clone_loop',
  ]) {
    assert.match(tools, new RegExp(`name: '${name}'`))
  }
  assert.match(tools, /scripts\/clone-loop\.mjs|SCRIPT\.cloneLoop/)
  assert.match(lib, /--capture-reference/)
  assert.match(lib, /--update-baseline/)
  assert.match(lib, /FORBIDDEN_LOOP_FLAGS/)
  assert.doesNotMatch(tools, /marketplace plugin 8006/)
})
