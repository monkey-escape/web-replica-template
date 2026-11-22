import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  bodyLooksLikeSecrets,
  classifyApiResponse,
  emptyApiManifest,
  mergeApiManifest,
  mockRuntimePath,
  readApiMocksDecision,
  stableApiKey,
} from './api-capture.js'

test('stable API keys are path-safe and change with the query string', () => {
  assert.equal(stableApiKey('GET', 'https://example.com/api/health'), 'get/api-health')
  assert.equal(stableApiKey('GET', 'https://example.com/api/health/'), 'get/api-health')
  const withQuery = stableApiKey('GET', 'https://example.com/api/items?page=2')
  const otherQuery = stableApiKey('GET', 'https://example.com/api/items?page=3')
  assert.match(withQuery, /^get\/api-items-[a-f0-9]{8}$/)
  assert.notEqual(withQuery, otherQuery)
  assert.equal(mockRuntimePath('example', 'get/api-health'), '/api/mock/example/get/api-health')
})

test('public JSON GETs are accepted and privileged or credentialed traffic is skipped', () => {
  const ok = classifyApiResponse({
    method: 'GET',
    url: 'https://www.example.com/api/catalog',
    status: 200,
    contentType: 'application/json',
    resourceType: 'fetch',
    body: '{"ok":true}',
  })
  assert.equal(ok.accept, true)
  assert.equal(ok.key, 'get/api-catalog')
  // 导航抓取仍禁止打开 /api/ 页面；被动监听公开 JSON 是允许的。

  assert.equal(classifyApiResponse({ method: 'POST', url: 'https://www.example.com/api/catalog', status: 200, contentType: 'application/json', body: '{}' }).reason, 'write-or-unsupported-method')
  assert.equal(classifyApiResponse({ method: 'GET', url: 'https://www.example.com/requisition', status: 200, contentType: 'application/json', body: '{}' }).reason, 'blocked-path')
  assert.equal(classifyApiResponse({ method: 'GET', url: 'https://www.example.com/login', status: 200, contentType: 'application/json', body: '{}' }).reason, 'blocked-path')
  assert.equal(classifyApiResponse({ method: 'GET', url: 'https://www.example.com/api/me', status: 200, contentType: 'application/json', requestHeaders: { authorization: 'Bearer x' }, body: '{}' }).reason, 'credential-header')
  assert.equal(classifyApiResponse({ method: 'GET', url: 'https://www.example.com/api/me', status: 200, contentType: 'application/json', responseHeaders: { 'set-cookie': 'sid=1' }, body: '{}' }).reason, 'credential-header')
  assert.equal(classifyApiResponse({ method: 'GET', url: 'https://www.example.com/', status: 200, contentType: 'text/html', resourceType: 'document', body: '<html></html>' }).reason, 'resource-type')
  assert.equal(classifyApiResponse({ method: 'GET', url: 'https://www.example.com/', status: 200, contentType: 'text/html', body: '<html></html>' }).reason, 'html-document')
  assert.equal(classifyApiResponse({ method: 'GET', url: 'https://www.example.com/hero.webp', status: 200, contentType: 'image/webp', resourceType: 'image' }).reason, 'resource-type')
  assert.equal(classifyApiResponse({ method: 'GET', url: 'https://www.example.com/hero.webp', status: 200, contentType: 'image/webp' }).reason, 'media')
  assert.equal(classifyApiResponse({ method: 'GET', url: 'https://www.googletagmanager.com/gtm.js', status: 200, contentType: 'application/json', body: '{}' }).reason, 'tracker')
  assert.equal(
    classifyApiResponse({
      method: 'GET',
      url: 'https://www.example.com/api/secret',
      status: 200,
      contentType: 'application/json',
      body: '{"api_key":"abc"}',
    }).reason,
    'possible-secrets',
  )
  assert.equal(bodyLooksLikeSecrets('{"access_token":"aaaa"}'), true)
  assert.equal(bodyLooksLikeSecrets('{"ok":true,"count":3}'), false)
})

test('API mock manifests merge items and keep skipped reasons', () => {
  const merged = mergeApiManifest(
    emptyApiManifest('demo', 'none'),
    {
      siteId: 'demo',
      apiMocks: 'captured',
      items: [{ key: 'get/api-health', method: 'GET', path: '/api/health' }],
      skipped: [{ url: 'https://www.example.com/api/me', reason: 'credential-header' }],
    },
  )
  assert.equal(merged.apiMocks, 'captured')
  assert.equal(merged.items[0].key, 'get/api-health')
  const again = mergeApiManifest(merged, {
    items: [{ key: 'get/api-health', method: 'GET', path: '/api/health', status: 200 }],
    skipped: [{ url: 'https://www.example.com/api/me', reason: 'credential-header' }],
  })
  assert.equal(again.items.length, 1)
  assert.equal(again.items[0].status, 200)
  assert.equal(again.skipped.length, 1)
  assert.equal(readApiMocksDecision({ apiMocks: 'none', items: [] }).ok, true)
  assert.equal(readApiMocksDecision({ apiMocks: 'pending', items: [] }).ok, false)
  assert.equal(readApiMocksDecision({ items: [{ key: 'get/x' }] }).ok, true)
  assert.equal(readApiMocksDecision(null).ok, false)
})
