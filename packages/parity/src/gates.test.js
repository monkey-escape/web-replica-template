import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { activeTrapIds, checkComponentsDocument, checkGates, nextTrapId, parseSharedComponentIds } from './gates.js'
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

const sharedComponentsDoc = `# Components

## Shared

- \`site-header\` — routes: \`/\`, \`/about/\`

## Page-specific

- \`hero\` — \`/\`
`

function writePassingSite(root, siteId = 'demo') {
  const site = join(root, `fixtures/sites/${siteId}`)
  mkdirSync(join(site, 'analysis/screenshots'), { recursive: true })
  mkdirSync(join(site, 'assets'), { recursive: true })
  mkdirSync(join(site, 'api'), { recursive: true })
  mkdirSync(join(root, 'docs/experience/lessons'), { recursive: true })
  writeFileSync(
    join(site, 'analysis/overview.md'),
    'screenshot structure component interaction token',
  )
  writeFileSync(join(site, 'analysis/tokens.json'), '{}\n')
  writeFileSync(join(site, 'analysis/components.md'), sharedComponentsDoc)
  writeFileSync(join(site, 'analysis/interactions.md'), 'interactions\n')
  writeFileSync(join(site, 'analysis/screenshots/README.md'), 'shots\n')
  writeFileSync(join(site, 'assets/README.md'), 'assets\n')
  writeFileSync(
    join(site, 'api/manifest.json'),
    JSON.stringify({ siteId, apiMocks: 'none', items: [] }),
  )
  writeFileSync(join(root, 'docs/experience/traps.md'), '# Traps\n')
  writeFileSync(join(root, 'docs/experience/lessons/README.md'), 'lessons\n')
  return site
}

test('active trap ids ignore retired entries', () => {
  assert.deepEqual(activeTrapIds(store), ['trap-0002'])
  assert.equal(nextTrapId(store), 'trap-0003')
  assert.equal(nextTrapId('# empty'), 'trap-0001')
})

test('active trap ids also read unfenced blocks under Active traps', () => {
  const markdown = `# 陷阱库

\`\`\`yaml
id: trap-NNNN
status: active
\`\`\`

## Active traps

id: trap-0004
status: active
surfaces: [screenshot]

id: trap-0005
status: retired
surfaces: [visual]
`
  assert.deepEqual(activeTrapIds(markdown), ['trap-0004'])
})


test('the example fixture clears the gates', () => {
  const result = checkGates('example', repoRoot)
  assert.deepEqual(result.errors, [], result.errors.join('\n'))
})

test('a site without a trap check is refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'gates-'))
  const site = writePassingSite(root)
  // start without traps-checked, which is still a hard fail
  const missing = checkGates('demo', root)
  assert.equal(missing.ok, false)
  assert.match(missing.errors.join('\n'), /traps-checked/)

  writeFileSync(join(site, 'traps-checked.md'), 'active-traps: none\n')
  assert.equal(checkGates('demo', root).ok, true)
  rmSync(root, { recursive: true, force: true })
})

test('components.md must distinguish shared blocks or record shared-components: none', () => {
  const shell = checkComponentsDocument('components\n')
  assert.equal(shell.length > 0, true)
  assert.match(shell.join('\n'), /shell|shared-components: none/)

  const pending = checkComponentsDocument(`# Components

shared-components: pending

The early table is only a placeholder. Shared versus page-specific analysis is not finished, so this document must not pass the gate yet.
`)
  assert.match(pending.join('\n'), /pending/)

  const none = checkComponentsDocument(`# Components

This public site has no repeated header, footer, or card.

shared-components: none
`)
  assert.deepEqual(none, [])

  const shared = checkComponentsDocument(sharedComponentsDoc)
  assert.deepEqual(shared, [])
})

test('API mock analysis must be decided before the loop starts', () => {
  const root = mkdtempSync(join(tmpdir(), 'gates-api-'))
  const site = writePassingSite(root)
  writeFileSync(join(site, 'traps-checked.md'), 'active-traps: none\n')
  rmSync(join(site, 'api/manifest.json'), { force: true })

  const missing = checkGates('demo', root)
  assert.equal(missing.ok, false)
  assert.match(missing.errors.join('\n'), /api\/manifest/)

  writeFileSync(
    join(site, 'api/manifest.json'),
    JSON.stringify({ siteId: 'demo', apiMocks: 'pending', items: [] }),
  )
  const pending = checkGates('demo', root)
  assert.equal(pending.ok, false)
  assert.match(pending.errors.join('\n'), /pending/)

  writeFileSync(
    join(site, 'api/manifest.json'),
    JSON.stringify({ siteId: 'demo', apiMocks: 'none', items: [] }),
  )
  assert.equal(checkGates('demo', root).ok, true)
  rmSync(root, { recursive: true, force: true })
})

test('parseSharedComponentIds extracts ids from a shared-components list or the Shared section', () => {
  assert.deepEqual(
    parseSharedComponentIds('shared-components: promo-bar, site-header, site-footer'),
    ['promo-bar', 'site-header', 'site-footer'],
  )
  assert.deepEqual(parseSharedComponentIds('shared-components: none'), [])
  assert.deepEqual(parseSharedComponentIds(sharedComponentsDoc), ['site-header'])
})
