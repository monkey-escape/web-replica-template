import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.wrangler'])

function firstLine(file) {
  try {
    return readFileSync(file, 'utf8').split('\n')[0] ?? ''
  } catch {
    return ''
  }
}

function walk(dir, root, found) {
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, root, found)
      continue
    }
    if (!entry.isFile()) continue

    const rel = relative(root, full)
    const rottenMarker = firstLine(full).includes('@replica-rotten')
    const obsoleteName =
      entry.name.endsWith('.bak') ||
      entry.name.endsWith('.orig') ||
      entry.name.includes('.obsolete.')
    const inTemp = rel === 'temp' || rel.startsWith(`temp${sep}`)

    if (!rottenMarker && !obsoleteName && !inTemp) continue

    found.push({
      path: rel,
      deletable: rottenMarker || obsoleteName || inTemp,
      reasons: [
        rottenMarker ? 'marked @replica-rotten' : null,
        obsoleteName ? 'obsolete filename' : null,
        inTemp ? 'temp output' : null,
      ].filter(Boolean),
    })
  }
}

export function findRot(root) {
  const found = []
  walk(resolve(root), resolve(root), found)
  return found.sort((left, right) => left.path.localeCompare(right.path))
}
