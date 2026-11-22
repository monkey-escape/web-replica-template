import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PNG } from 'pngjs'
import { blamePixels, worstSection } from './blame.js'

function solid(width, height, rgba) {
  const image = new PNG({ width, height })
  for (let index = 0; index < width * height; index += 1) image.data.set(rgba, index * 4)
  return image
}

test('blamePixels points at the section that holds the red mismatch cluster', () => {
  const diff = solid(8, 4, [0, 0, 0, 255])
  for (let index = 0; index < 4; index += 1) diff.data.set([255, 0, 0, 255], index * 4)
  const blamed = blamePixels(diff, [
    { id: 'hero', selector: '[data-component="hero"]', box: { x: 0, y: 0, width: 4, height: 2 } },
    { id: 'footer', selector: '[data-component="site-footer"]', box: { x: 4, y: 2, width: 4, height: 2 } },
  ])
  assert.equal(blamed[0].id, 'hero')
  assert.equal(blamed[0].mismatched, 4)
  assert.equal(blamed[1].id, 'footer')
  assert.equal(blamed[1].mismatched, 0)
})

test('worstSection prefers a failing low score over a passing one', () => {
  const worst = worstSection([
    { id: 'footer', pass: true, score: 1 },
    { id: 'hero', pass: false, score: 0.2 },
    { id: 'nav', pass: false, score: 0.8 },
  ])
  assert.equal(worst.id, 'hero')
})
