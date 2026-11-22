import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { repoRoot } from './paths.js'

export function readPng(file) {
  return PNG.sync.read(readFileSync(file))
}

export function comparePng(actualImage, expectedImage, options = {}) {
  const pixelThreshold = options.pixelThreshold ?? 0.1
  const maxDiffRatio = options.maxDiffRatio ?? 0

  if (actualImage.width !== expectedImage.width || actualImage.height !== expectedImage.height) {
    return {
      pass: false,
      reason: 'size-mismatch',
      actual: { width: actualImage.width, height: actualImage.height },
      expected: { width: expectedImage.width, height: expectedImage.height },
      mismatched: null,
      ratio: 1,
    }
  }

  const diff = new PNG({ width: actualImage.width, height: actualImage.height })
  const mismatched = pixelmatch(
    actualImage.data,
    expectedImage.data,
    diff.data,
    actualImage.width,
    actualImage.height,
    { threshold: pixelThreshold },
  )
  const ratio = mismatched / (actualImage.width * actualImage.height)

  return {
    pass: ratio <= maxDiffRatio,
    reason: ratio <= maxDiffRatio ? 'match' : 'pixel-diff',
    mismatched,
    ratio,
    width: actualImage.width,
    height: actualImage.height,
    diff,
  }
}

export function comparePngFiles(actualPath, expectedPath, options = {}) {
  const actualImage = readPng(actualPath)
  const expectedImage = readPng(expectedPath)
  const result = comparePng(actualImage, expectedImage, options)
  if (options.diffPath && result.diff) writeFileSync(options.diffPath, PNG.sync.write(result.diff))
  const publicResult = { ...result }
  delete publicResult.diff
  return publicResult
}

export function baselinePath(profile, route, root = repoRoot) {
  const dir = profile.baselines ?? `fixtures/sites/${profile.siteId}/baselines`
  return resolve(root, dir, `${route.name}.png`)
}

export function baselineExists(profile, route, root = repoRoot) {
  return existsSync(baselinePath(profile, route, root))
}

export function maxDiffRatioFor(route, profile) {
  if (typeof route.visual?.maxDiffRatio === 'number') return route.visual.maxDiffRatio
  if (route.mode === 'strict') return profile.visual?.strictMaxDiffRatio ?? 0
  return profile.visual?.adaptMaxDiffRatio ?? 0
}
