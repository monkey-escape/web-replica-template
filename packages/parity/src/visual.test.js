import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PNG } from 'pngjs'
import { comparePng } from './visual.js'

function solid(width, height, rgba) {
  const image = new PNG({ width, height })
  for (let index = 0; index < width * height; index += 1) image.data.set(rgba, index * 4)
  return image
}

test('identical pixels pass a strict ratio of zero', () => {
  const image = solid(2, 2, [10, 20, 30, 255])
  const result = comparePng(image, solid(2, 2, [10, 20, 30, 255]), { maxDiffRatio: 0 })
  assert.equal(result.pass, true)
  assert.equal(result.mismatched, 0)
})

test('one different pixel fails strict and can fit an adapt ratio', () => {
  const expected = solid(2, 2, [10, 20, 30, 255])
  const actual = solid(2, 2, [10, 20, 30, 255])
  actual.data.set([255, 0, 0, 255], 0)
  const strict = comparePng(actual, expected, { maxDiffRatio: 0 })
  const adapt = comparePng(actual, expected, { maxDiffRatio: 0.25 })
  assert.equal(strict.pass, false)
  assert.equal(adapt.pass, true)
})

test('different sizes fail closed', () => {
  const result = comparePng(solid(2, 2, [0, 0, 0, 255]), solid(3, 2, [0, 0, 0, 255]), {
    maxDiffRatio: 1,
  })
  assert.equal(result.pass, false)
  assert.equal(result.reason, 'size-mismatch')
})
