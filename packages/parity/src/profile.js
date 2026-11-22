import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertSiteId, repoRoot } from './paths.js'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function loadProfile(siteId, root = repoRoot) {
  assertSiteId(siteId)
  const file = resolve(root, 'tests/parity/profiles', `${siteId}.json`)
  let profile
  try {
    profile = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`Could not read parity profile ${file}. ${error.message}`)
  }

  if (!isObject(profile)) throw new Error(`Profile ${file} must be a JSON object.`)
  if (profile.siteId !== siteId)
    throw new Error(`Profile siteId "${profile.siteId}" does not match "${siteId}".`)
  if (typeof profile.baseUrl !== 'string' || profile.baseUrl.length === 0)
    throw new Error(`Profile ${siteId} needs a baseUrl.`)
  if (!Array.isArray(profile.routes) || profile.routes.length === 0)
    throw new Error(`Profile ${siteId} needs at least one route.`)

  for (const route of profile.routes) {
    if (!isObject(route) || typeof route.name !== 'string' || typeof route.path !== 'string')
      throw new Error(`Every route needs a name and a path.`)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route.name))
      throw new Error(`Route name "${route.name}" must be a lowercase slug.`)
    if (route.mode !== 'strict' && route.mode !== 'adapt')
      throw new Error(`Route "${route.name}" mode must be "strict" or "adapt".`)
    if (route.mode === 'strict' && Array.isArray(route.accepted) && route.accepted.length > 0) {
      throw new Error(
        `Route "${route.name}" is strict and cannot list accepted diffs. Fix the clone instead of waiving it.`,
      )
    }
  }

  return profile
}

export function structureDocument(profile, root = repoRoot) {
  const relative = profile.structure ?? `fixtures/sites/${profile.siteId}/structure.json`
  const file = resolve(root, relative)
  return {
    file,
    document: JSON.parse(readFileSync(file, 'utf8')),
  }
}
