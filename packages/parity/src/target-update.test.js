import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { PNG } from 'pngjs'
import { checkGates } from './gates.js'
import { repoRoot } from './paths.js'
import {
  acceptTargetUpdate,
  compareSnapshots,
  loadFixtureSnapshot,
  plannedAcceptCopies,
  seedStagingFromCurrent,
  writeTargetUpdateReport,
} from './target-update.js'

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function writePng(file, rgb) {
  const image = new PNG({ width: 2, height: 2 })
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = rgb[0]
    image.data[index + 1] = rgb[1]
    image.data[index + 2] = rgb[2]
    image.data[index + 3] = 255
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, PNG.sync.write(image))
}

function siteTree(root, { extraRoute = false, about = true, heading = 'Home', apiBody = '{"ok":true}', asset = 'mark', baseline = [0, 0, 0], headerRoutes = ['home', 'about'] } = {}) {
  writeJson(join(root, 'structure.json'), {
    home: {
      landmarks: ['header', 'main'],
      headings: [heading],
      components: ['site-header', 'hero'],
      interactions: [],
    },
    ...(about
      ? {
          about: {
            landmarks: ['header', 'main'],
            headings: ['About'],
            components: ['site-header'],
            interactions: [],
          },
        }
      : {}),
    ...(extraRoute
      ? {
          blog: {
            landmarks: ['header', 'main'],
            headings: ['Blog'],
            components: ['site-header', 'post-list'],
            interactions: [],
          },
        }
      : {}),
  })
  writeJson(join(root, 'sections.json'), {
    home: { desktop: [{ id: 'hero', selector: "[data-component='hero']" }] },
    ...(about ? { about: { desktop: [{ id: 'site-header', selector: "[data-component='site-header']" }] } } : {}),
    ...(extraRoute ? { blog: { desktop: [{ id: 'post-list', selector: "[data-component='post-list']" }] } } : {}),
  })
  writeJson(join(root, 'styles/home.desktop.json'), {
    source: 'target',
    capturedAt: '2026-01-01T00:00:00.000Z',
    sections: { hero: { styles: { 'font-size': '48px' }, box: { x: 1, y: 2, width: 3, height: 4 } } },
  })
  writeJson(join(root, 'api/manifest.json'), {
    siteId: 'demo',
    apiMocks: 'captured',
    items: [{ key: 'get/api-catalog', method: 'GET', path: '/api/catalog', file: 'get/api-catalog.json' }],
  })
  writeJson(join(root, 'api/get/api-catalog.json'), JSON.parse(apiBody))
  writeJson(join(root, 'assets/manifest.json'), {
    siteId: 'demo',
    items: [{ key: 'mark.svg', url: 'https://www.example.com/mark.svg' }],
  })
  writeFileSync(join(root, 'assets/mark.svg'), asset)
  writePng(join(root, 'baselines/home.desktop.png'), baseline)
  if (about) writePng(join(root, 'baselines/about.desktop.png'), [0, 0, 255])
  if (extraRoute) writePng(join(root, 'baselines/blog.desktop.png'), [0, 255, 0])
  mkdirSync(join(root, 'analysis'), { recursive: true })
  writeFileSync(
    join(root, 'analysis/components.md'),
    `# Components

## Shared

- \`site-header\` — routes: ${headerRoutes.map((name) => `\`${name === 'home' ? '/' : '/' + name + '/'}\``).join(', ')}

## Page-specific

- \`hero\` — \`/\`
`,
  )
}

test('compareSnapshots reports added, changed, and removed routes plus api and asset changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'target-update-'))
  const currentRoot = join(root, 'current')
  const stagingRoot = join(root, 'staging')
  siteTree(currentRoot)
  siteTree(stagingRoot, {
    extraRoute: true,
    about: false,
    heading: 'Welcome',
    apiBody: '{"ok":true,"n":2}',
    asset: 'mark-v2',
    baseline: [255, 0, 0],
  })
  writeJson(join(stagingRoot, 'styles/home.desktop.json'), {
    source: 'target',
    capturedAt: '2026-02-02T00:00:00.000Z',
    sections: { hero: { styles: { 'font-size': '32px' }, box: { x: 9, y: 9, width: 9, height: 9 } } },
  })
  writeJson(join(stagingRoot, 'capture-meta.json'), { missingRoutes: ['about'], discoveredRoutes: [{ name: 'blog', path: '/blog/' }] })

  const report = compareSnapshots(loadFixtureSnapshot(currentRoot), loadFixtureSnapshot(stagingRoot), {
    siteId: 'demo',
  })

  assert.equal(report.status, 'changes')
  assert.match(report.next, /--accept/)
  assert.deepEqual(report.routes.added, ['blog'])
  assert.deepEqual(report.routes.removed, ['about'])
  assert.ok(report.routes.changed.includes('home'))
  assert.ok(report.sharedComponents.newRoutesNotInComponents.includes('blog'))
  assert.ok(report.sharedComponents.changedRepeatedBlocks.some((item) => item.component === 'site-header'))
  assert.deepEqual(report.api.changed, ['get/api-catalog'])
  assert.deepEqual(report.assets.changed, ['mark.svg'])
  assert.ok(report.baselines.changed.includes('home.desktop.png'))
  assert.ok(report.baselines.removed.includes('about.desktop.png'))
  assert.ok(report.baselines.added.includes('blog.desktop.png'))
  assert.ok(report.styles.changed.includes('home.desktop'))
  assert.ok(report.residuals.some((item) => item.kind === 'removed-route'))
  assert.ok(report.warnings.some((item) => /never deletes|will not delete/i.test(item)))
  rmSync(root, { recursive: true, force: true })
})

test('accept copies added and changed fixture files and never deletes removed routes', () => {
  const root = mkdtempSync(join(tmpdir(), 'target-accept-'))
  const currentRoot = join(root, 'fixtures/sites/demo')
  const stagingRoot = join(root, 'temp/clone-loop/demo/target-update/staging')
  siteTree(currentRoot)
  siteTree(stagingRoot, {
    extraRoute: true,
    about: false,
    heading: 'Welcome',
    apiBody: '{"ok":true,"n":2}',
    asset: 'mark-v2',
    baseline: [255, 0, 0],
  })
  writeJson(join(stagingRoot, 'capture-meta.json'), { missingRoutes: ['about'] })
  const report = compareSnapshots(loadFixtureSnapshot(currentRoot), loadFixtureSnapshot(stagingRoot), {
    siteId: 'demo',
  })
  writeTargetUpdateReport('demo', { ...report, currentRoot, stagingRoot }, root)

  assert.ok(plannedAcceptCopies(report).includes('structure.json'))
  assert.ok(plannedAcceptCopies(report).includes('baselines/blog.desktop.png'))
  assert.ok(!plannedAcceptCopies(report).includes('baselines/about.desktop.png'))

  const accepted = acceptTargetUpdate('demo', { root, report: { ...report, currentRoot, stagingRoot } })
  assert.ok(accepted.copied.includes('structure.json'))
  assert.ok(accepted.copied.includes('api/get/api-catalog.json'))
  assert.ok(accepted.copied.includes('assets/mark.svg'))
  assert.ok(accepted.copied.includes('baselines/home.desktop.png'))
  assert.ok(accepted.copied.includes('baselines/blog.desktop.png'))
  assert.deepEqual(accepted.skippedRemoved, ['about'])
  const acceptedStructure = JSON.parse(readFileSync(join(currentRoot, 'structure.json'), 'utf8'))
  assert.equal(acceptedStructure.home.headings[0], 'Welcome')
  assert.ok(acceptedStructure.blog)
  // 删除的 about 仍留在当前 fixtures 里，等实现阶段再决定要不要删页面。
  assert.ok(acceptedStructure.about)
  assert.ok(readFileSync(join(currentRoot, 'baselines/about.desktop.png')))
  assert.equal(readFileSync(join(currentRoot, 'assets/mark.svg'), 'utf8'), 'mark-v2')

  assert.throws(
    () => acceptTargetUpdate('missing', { root }),
    /No compare report/,
  )
  rmSync(root, { recursive: true, force: true })
})

test('identical snapshots are unchanged and ignore volatile style fields', () => {
  const root = mkdtempSync(join(tmpdir(), 'target-same-'))
  const currentRoot = join(root, 'current')
  const stagingRoot = join(root, 'staging')
  siteTree(currentRoot)
  seedStagingFromCurrent(currentRoot, stagingRoot)
  writeJson(join(stagingRoot, 'styles/home.desktop.json'), {
    source: 'target',
    capturedAt: '2099-01-01T00:00:00.000Z',
    sections: { hero: { styles: { 'font-size': '48px' }, box: { x: 99, y: 99, width: 99, height: 99 } } },
  })
  const report = compareSnapshots(loadFixtureSnapshot(currentRoot), loadFixtureSnapshot(stagingRoot), {
    siteId: 'demo',
  })
  assert.equal(report.status, 'unchanged')
  assert.deepEqual(report.routes.added, [])
  assert.deepEqual(report.routes.removed, [])
  assert.deepEqual(report.routes.changed, [])
  assert.deepEqual(plannedAcceptCopies(report), [])
  rmSync(root, { recursive: true, force: true })
})

test('the example fixture still clears the analysis gates', () => {
  const result = checkGates('example', repoRoot)
  assert.deepEqual(result.errors, [], result.errors.join('\n'))
})
