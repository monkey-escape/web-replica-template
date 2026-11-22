import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderRecap } from './recap.js'

test('recap keeps complete logs and names incomplete ones', () => {
  const markdown = renderRecap({
    date: '2026-11-22',
    commits: ['abc1234 add template'],
    reports: [
      {
        file: 'temp/clone-loop/example/report.json',
        complete: true,
        siteId: 'example',
        failed: [],
        passed: ['home'],
      },
      {
        file: 'temp/clone-loop/example/partial.json',
        complete: false,
        siteId: 'example',
      },
    ],
    rot: [{ path: 'temp/clone-loop/example/partial.json', reasons: ['temp output'] }],
  })

  assert.match(markdown, /abc1234 add template/)
  assert.match(markdown, /report\.json/)
  assert.match(markdown, /未纳入复盘的日志/)
  assert.match(markdown, /partial\.json/)
  assert.match(markdown, /尚未执行清理/)
})
