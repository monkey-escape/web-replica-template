import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

export const DEFAULT_LIMITS = {
  maxLines: 1200,
  maxBytes: 80_000,
  maxAverageLineLength: 240,
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git'])
const SOURCE_EXT = new Set(['.html', '.css', '.ts', '.js'])
const SOUP_EXT = new Set(['.html', '.css'])

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, acc)
    else acc.push(path)
  }
  return acc
}

function failure(kind, item) {
  return { kind, key: 'maintainability', item }
}

export function findHotlinks(source) {
  const found = []
  const patterns = [
    /<(?:img|source|video|audio|script)\b[^>]*?\s(?:src|poster)\s*=\s*["']([^"']+)["']/gi,
    /<link\b[^>]*?\shref\s*=\s*["']([^"']+)["']/gi,
    /\bsrcset\s*=\s*["']([^"']+)["']/gi,
    /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi,
    /@import\s+['"]([^'"]+)['"]/gi,
  ]
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(source))) {
      const chunks = match[1].split(',').map((part) => part.trim().split(/\s+/)[0])
      for (const url of chunks) {
        if (/^https?:\/\//i.test(url) || url.startsWith('//')) found.push(url)
      }
    }
  }
  return [...new Set(found)]
}

export function checkFileSoup(source, limits = DEFAULT_LIMITS) {
  const failures = []
  const lines = source.split(/\r?\n/)
  const bytes = Buffer.byteLength(source)
  if (lines.length > limits.maxLines) {
    failures.push(failure('source-too-long', `${lines.length} lines (limit ${limits.maxLines})`))
  }
  if (bytes > limits.maxBytes) {
    failures.push(failure('source-too-large', `${bytes} bytes (limit ${limits.maxBytes})`))
  }
  const nonempty = lines.filter((line) => line.trim().length > 0)
  const average =
    nonempty.reduce((sum, line) => sum + line.length, 0) / Math.max(nonempty.length, 1)
  if (average > limits.maxAverageLineLength) {
    failures.push(
      failure(
        'source-unreadable',
        `average line length ${Math.round(average)} (limit ${limits.maxAverageLineLength})`,
      ),
    )
  }
  return failures
}

export function tokenColorValues(tokens) {
  const values = []
  const visit = (value) => {
    if (typeof value === 'string' && /#(?:[0-9a-f]{3,8})\b/i.test(value)) values.push(value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  visit(tokens)
  return [...new Set(values)]
}

export function checkMaintainability(root, options = {}) {
  const webRoot = resolve(root, options.webDir ?? 'apps/web')
  const limits = { ...DEFAULT_LIMITS, ...options.limits }
  const failures = []
  const files = walk(webRoot).filter((file) => SOURCE_EXT.has(extname(file)))

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const rel = relative(root, file)
    if (SOUP_EXT.has(extname(file))) {
      for (const item of checkFileSoup(source, limits)) {
        failures.push({ ...item, item: `${rel}: ${item.item}` })
      }
    }
    for (const url of findHotlinks(source)) {
      failures.push(failure('hotlink', `${rel}: ${url}`))
    }
  }

  if (options.tokens) {
    const colors = tokenColorValues(options.tokens)
    const css = files
      .filter((file) => extname(file) === '.css')
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
    if (colors.length > 0 && !colors.some((color) => css.toLowerCase().includes(color.toLowerCase()))) {
      failures.push(
        failure(
          'tokens-unused',
          'apps/web styles do not reuse any color from analysis/tokens.json. Share tokens instead of inventing a second palette.',
        ),
      )
    }
  }

  return { phase: 'maintainability', pass: failures.length === 0, failures }
}
