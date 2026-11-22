const LIST_KEYS = ['landmarks', 'headings', 'components', 'interactions']

function sameAcceptance(rule, failure) {
  return rule.kind === failure.kind && rule.key === failure.key && rule.item === failure.item
}

export function listDiff(actual, expected) {
  const failures = []
  const counts = new Map()
  for (const item of expected) counts.set(item, (counts.get(item) ?? 0) + 1)

  for (const item of actual) {
    const left = counts.get(item) ?? 0
    if (left > 0) counts.set(item, left - 1)
    else failures.push({ kind: 'extra', item })
  }

  for (const [item, left] of counts) {
    for (let index = 0; index < left; index += 1) failures.push({ kind: 'missing', item })
  }

  if (failures.length === 0 && actual.join('\0') !== expected.join('\0')) {
    failures.push({
      kind: 'order',
      item: `${expected.join(' > ')} => ${actual.join(' > ')}`,
    })
  }

  return failures
}

export function compareStructure(actual, expected, accepted = []) {
  const failures = []
  for (const key of LIST_KEYS) {
    const diffs = listDiff(actual?.[key] ?? [], expected?.[key] ?? [])
    for (const diff of diffs) failures.push({ ...diff, key })
  }

  return failures.filter((failure) => !accepted.some((rule) => sameAcceptance(rule, failure)))
}

export async function readStructure(page) {
  return page.evaluate(() => {
    const text = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim()
    return {
      landmarks: [...document.querySelectorAll('header, nav, main, footer')].map((element) =>
        element.tagName.toLowerCase(),
      ),
      headings: [...document.querySelectorAll('h1, h2, h3')].map(text),
      components: [...document.querySelectorAll('[data-component]')].map(
        (element) => element.getAttribute('data-component') || '',
      ),
      interactions: [...document.querySelectorAll('[data-interaction]')].map(
        (element) => element.getAttribute('data-interaction') || '',
      ),
    }
  })
}
