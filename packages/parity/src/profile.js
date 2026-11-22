import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertSiteId, repoRoot } from './paths.js'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}


export function requiredViewports(profile) {
  return profile.viewports
}

export function structureKeyFor(route, viewport, document) {
  const base = route.structureKey ?? route.name
  const named = `${base}.${viewport.name}`
  if (document && Object.hasOwn(document, named)) return named
  return base
}

function validateViewports(profile, siteId) {
  if (!Array.isArray(profile.viewports) || profile.viewports.length === 0) {
    throw new Error(
      `Profile ${siteId} needs viewports, including desktop width 1440 and mobile width 390.`,
    )
  }
  const seen = new Set()
  for (const viewport of profile.viewports) {
    if (
      !isObject(viewport) ||
      typeof viewport.name !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(viewport.name)
    ) {
      throw new Error(`Profile ${siteId} has a viewport without a lowercase slug name.`)
    }
    if (!Number.isInteger(viewport.width) || viewport.width < 1) {
      throw new Error(`Viewport "${viewport.name}" needs a positive integer width.`)
    }
    if (!Number.isInteger(viewport.height) || viewport.height < 1) {
      throw new Error(`Viewport "${viewport.name}" needs a positive integer height.`)
    }
    if (seen.has(viewport.name)) {
      throw new Error(`Profile ${siteId} repeats viewport "${viewport.name}".`)
    }
    seen.add(viewport.name)
  }
  const desktop = profile.viewports.find((item) => item.name === 'desktop')
  const mobile = profile.viewports.find((item) => item.name === 'mobile')
  if (!desktop || desktop.width !== 1440) {
    throw new Error(`Profile ${siteId} must include a desktop viewport with width 1440.`)
  }
  if (!mobile || mobile.width !== 390) {
    throw new Error(`Profile ${siteId} must include a mobile viewport with width 390.`)
  }
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

  validateViewports(profile, siteId)

  if (profile.targetBaseUrl != null) {
    if (typeof profile.targetBaseUrl !== 'string' || profile.targetBaseUrl.length === 0) {
      throw new Error(`Profile ${siteId} targetBaseUrl must be an http(s) origin.`)
    }
    let target
    try {
      target = new URL(profile.targetBaseUrl)
    } catch {
      throw new Error(`Profile ${siteId} targetBaseUrl must be an http(s) origin.`)
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new Error(`Profile ${siteId} targetBaseUrl must be an http(s) origin.`)
    }
    if (target.username || target.password) {
      throw new Error(`Profile ${siteId} targetBaseUrl must not include credentials.`)
    }
    profile.targetBaseUrl = target.origin
  }

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
