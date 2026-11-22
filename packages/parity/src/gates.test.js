import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { activeTrapIds, checkGates, nextTrapId } from './gates.js'
import { repoRoot } from './paths.js'

const store = `
# Traps

\`\`\`yaml
id: trap-0002
status: active
surfaces: [layout]
symptom: example
cause: example
avoid: example
first_seen: 2026-11-22
source_lesson: docs/experience/lessons/2026-11-22-example.md
\`\`\`

\`\`\`yaml
id: trap-0001
status: retired
surfaces: [motion]
symptom: old
cause: old
avoid: old
first_seen: 2026-11-01
source_lesson: docs/experience/lessons/2026-11-01-old.md
\`\`\`
`

test('active trap ids ignore retired entries', () => {
  assert.deepEqual(activeTrapIds(store), ['trap-0002'])
  assert.equal(nextTrapId(store), 'trap-0003')
  assert.equal(nextTrapId('# empty'), 'trap-0001')
})

test('the example fixture clears the gates', () => {
  const result = checkGates('example', repoRoot)
  assert.deepEqual(result.errors, [], result.errors.join('\n'))
})

test('a site without a trap check is refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'gates-'))
  const site = join(root, 'fixtures/sites/demo')
  mkdirSync(join(site, 'analysis/screenshots'), { recursive: true })
  mkdirSync(join(root, 'docs/experience/lessons'), { recursive: true })
  writeFileSync(
    join(site, 'analysis/overview.md'),
    'screenshot structure component interaction token',
  )
  writeFileSync(join(site, 'analysis/tokens.json'), '{}\n')
  writeFileSync(join(site, 'analysis/components.md'), 'components\n')
  writeFileSync(join(site, 'analysis/interactions.md'), 'interactions\n')
  writeFileSync(join(site, 'analysis/screenshots/README.md'), 'shots\n')
  writeFileSync(join(root, 'docs/experience/traps.md'), '# Traps\n')
  writeFileSync(join(root, 'docs/experience/lessons/README.md'), 'lessons\n')

  const missing = checkGates('demo', root)
  assert.equal(missing.ok, false)
  assert.match(missing.errors.join('\n'), /traps-checked/)

  writeFileSync(join(site, 'traps-checked.md'), 'active-traps: none\n')
  assert.equal(checkGates('demo', root).ok, true)
  rmSync(root, { recursive: true, force: true })
})
