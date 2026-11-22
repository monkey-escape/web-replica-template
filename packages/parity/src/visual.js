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
      exactMismatched: null,
      exactRatio: 1,
    }
  }

  const area = actualImage.width * actualImage.height
  const diff = new PNG({ width: actualImage.width, height: actualImage.height })
  const mismatched = pixelmatch(
    actualImage.data,
    expectedImage.data,
    diff.data,
    actualImage.width,
    actualImage.height,
    { threshold: pixelThreshold },
  )
  const ratio = mismatched / area
  let exactMismatched = mismatched
  if (pixelThreshold !== 0) {
    const exactDiff = new PNG({ width: actualImage.width, height: actualImage.height })
    exactMismatched = pixelmatch(
      actualImage.data,
      expectedImage.data,
      exactDiff.data,
      actualImage.width,
      actualImage.height,
      { threshold: 0 },
    )
  }
  const exactRatio = exactMismatched / area

  return {
    pass: ratio <= maxDiffRatio,
    reason: ratio <= maxDiffRatio ? 'match' : 'pixel-diff',
    mismatched,
    ratio,
    exactMismatched,
    exactRatio,
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

export function baselinePath(profile, route, viewport, root = repoRoot) {
  const dir = profile.baselines ?? `fixtures/sites/${profile.siteId}/baselines`
  const name = viewport?.name ? `${route.name}.${viewport.name}.png` : `${route.name}.png`
  return resolve(root, dir, name)
}

export function baselineExists(profile, route, viewport, root = repoRoot) {
  return existsSync(baselinePath(profile, route, viewport, root))
}

export function maxDiffRatioFor(route, profile) {
  if (typeof route.visual?.maxDiffRatio === 'number') return route.visual.maxDiffRatio
  if (route.mode === 'strict') return profile.visual?.strictMaxDiffRatio ?? 0
  return profile.visual?.adaptMaxDiffRatio ?? 0
}
