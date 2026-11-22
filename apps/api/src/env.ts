import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 只给 Node 入口用。不覆盖已经存在的环境变量，也不打印值。
export function loadLocalEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url))
  const files = [resolve(here, '../../../.env'), resolve(here, '../../.env')]

  for (const file of files) {
    if (!existsSync(file)) continue

    for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq <= 0) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}
