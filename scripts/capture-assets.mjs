import { createWriteStream, existsSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { repoRoot, assertSiteId } from '@replica/parity/paths'

function help() {
  console.log(`Usage:
  node scripts/capture-assets.mjs --site <site-id> [--manifest <file>]
  node scripts/capture-assets.mjs --self-test

Download public images, fonts, and video listed in
fixtures/sites/<site-id>/assets/manifest.json into that assets directory.
Runtime URLs are always /media/<site-id>/<key>. This script does not change
HTML; rewrite pages to those URLs after the files are in place.

Each manifest item needs a key. Give either "url" (http or https) or "from"
(a local file path). Do not list login-walled, /api/, or otherwise restricted
paths.`)
}

function loadManifest(file) {
  const body = JSON.parse(readFileSync(file, 'utf8'))
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    throw new Error(`Manifest ${file} must be a JSON object.`)
  if (!Array.isArray(body.items)) throw new Error(`Manifest ${file} needs an items array.`)
  return body
}

function assertKey(key) {
  if (typeof key !== 'string' || !/^(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(key))
    throw new Error(`Invalid asset key "${key}".`)
  return key
}

async function download(url, dest) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`)
  if (!response.body) throw new Error(`${url} had no body`)
  mkdirSync(dirname(dest), { recursive: true })
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest))
}

async function capture(siteId, manifestFile) {
  assertSiteId(siteId)
  const file = resolve(manifestFile)
  const manifest = loadManifest(file)
  if (manifest.siteId && manifest.siteId !== siteId)
    throw new Error(`Manifest siteId "${manifest.siteId}" does not match "${siteId}".`)
  const assetsRoot = resolve(repoRoot, 'fixtures/sites', siteId, 'assets')
  mkdirSync(assetsRoot, { recursive: true })
  const results = []
  for (const item of manifest.items) {
    const key = assertKey(item.key)
    const dest = resolve(assetsRoot, key)
    if (typeof item.from === 'string' && item.from.length > 0) {
      const from = resolve(dirname(file), item.from)
      if (!existsSync(from)) throw new Error(`Local source missing for ${key}: ${from}`)
      mkdirSync(dirname(dest), { recursive: true })
      if (from !== dest) copyFileSync(from, dest)
      results.push({ key, ok: true, via: 'from' })
      continue
    }
    if (typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) {
      await download(item.url, dest)
      results.push({ key, ok: true, via: 'url' })
      continue
    }
    if (item.source === 'local' && existsSync(dest)) {
      results.push({ key, ok: true, via: 'present' })
      continue
    }
    throw new Error(`Item "${key}" needs a url, a from path, or an already-present local file.`)
  }
  return { siteId, assetsRoot, results }
}

const args = parseArgs({
  options: {
    site: { type: 'string' },
    manifest: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
    'self-test': { type: 'boolean' },
  },
}).values

if (args.help) {
  help()
  process.exit(0)
}

if (args['self-test']) {
  const { siteId, results } = await capture('example', resolve(repoRoot, 'fixtures/sites/example/assets/manifest.json'))
  if (siteId !== 'example' || !results.some((item) => item.key === 'mark.svg' && item.ok))
    throw new Error('example manifest did not resolve mark.svg')
  console.log('capture-assets self-test passed')
  process.exit(0)
}

if (typeof args.site !== 'string') {
  help()
  process.exit(1)
}

const manifest =
  typeof args.manifest === 'string'
    ? resolve(args.manifest)
    : resolve(repoRoot, 'fixtures/sites', args.site, 'assets/manifest.json')

const { results, assetsRoot } = await capture(args.site, manifest)
for (const item of results) console.log(`${item.ok ? 'ok' : 'fail'} ${item.key} (${item.via})`)
console.log(`assets root: ${assetsRoot}`)
console.log('Rewrite runtime URLs to /media/' + args.site + '/<key>. Do not hotlink the target site.')
