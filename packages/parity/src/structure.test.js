import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareStructure, listDiff } from './structure.js'

test('listDiff reports missing, extra, and order', () => {
  assert.deepEqual(listDiff(['a', 'b'], ['a', 'b']), [])
  assert.deepEqual(listDiff(['a'], ['a', 'b']), [{ kind: 'missing', item: 'b' }])
  assert.deepEqual(listDiff(['a', 'c'], ['a']), [{ kind: 'extra', item: 'c' }])
  assert.equal(listDiff(['b', 'a'], ['a', 'b'])[0].kind, 'order')
})

test('accepted diffs are removed and unrelated diffs stay', () => {
  const actual = {
    landmarks: ['header', 'main'],
    headings: ['Hello'],
    components: ['hero', 'notice'],
    interactions: [],
  }
  const expected = {
    landmarks: ['header', 'main'],
    headings: ['Hello'],
    components: ['hero'],
    interactions: [],
  }
  const failures = compareStructure(actual, expected, [
    { kind: 'extra', key: 'components', item: 'notice' },
  ])
  assert.deepEqual(failures, [])

  const stillThere = compareStructure(actual, expected, [])
  assert.equal(stillThere.length, 1)
  assert.equal(stillThere[0].item, 'notice')
})
