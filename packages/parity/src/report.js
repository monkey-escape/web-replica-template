import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

export function loopReportPath(root, siteId) {
  return `${root}/temp/clone-loop/${siteId}/report.json`
}
