import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// packages/parity/src -> 仓库根
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

export function assertSiteId(siteId) {
  if (typeof siteId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(siteId))
    throw new Error(
      `Invalid site id "${siteId}". Use lowercase letters, digits, and single hyphens.`,
    )
  return siteId
}

export function routeUrl(baseUrl, path) {
  const url = new URL(baseUrl)
  url.pathname = path
  url.search = ''
  url.hash = ''
  return url.toString()
}
