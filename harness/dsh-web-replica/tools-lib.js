import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const SITE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const FORBIDDEN_LOOP_FLAGS = ['--capture-reference', '--update-baseline', '--accept']

export function assertSiteId(value) {
  if (typeof value !== 'string' || !SITE_ID.test(value)) {
    throw new Error('site must be a kebab-case site id, for example "example".')
  }
  return value
}

export function findRepoRoot(cwd = process.cwd()) {
  let dir = resolve(cwd)
  for (;;) {
    if (existsSync(join(dir, 'scripts/clone-loop.mjs')) && existsSync(join(dir, 'AGENTS.md'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error('Not inside a web-replica checkout (missing scripts/clone-loop.mjs and AGENTS.md).')
    }
    dir = parent
  }
}

export function rejectForbidden(args, forbidden = FORBIDDEN_LOOP_FLAGS) {
  for (const flag of args) {
    if (forbidden.includes(flag)) {
      throw new Error(
        `Flag ${flag} is not allowed here. The fix loop must not recapture baselines or accept a target-update.`,
      )
    }
  }
  return args
}

function optionalTarget(target) {
  if (target == null || target === '') return []
  if (typeof target !== 'string' || !/^https?:\/\//i.test(target)) {
    throw new Error('target must be an http(s) origin, with no credentials.')
  }
  return ['--target', target]
}

function optionalRoute(route) {
  if (route == null || route === '') return []
  if (typeof route !== 'string') throw new Error('route must be a route name.')
  return ['--route', route]
}

export function checkGatesArgs({ site }) {
  return rejectForbidden(['--site', assertSiteId(site)])
}

export function cloneLoopArgs({ site, conclude = false, writeLesson = false, slug } = {}) {
  const args = ['--site', assertSiteId(site)]
  if (conclude) args.push('--conclude')
  if (writeLesson) {
    if (typeof slug !== 'string' || !SITE_ID.test(slug)) {
      throw new Error('writeLesson requires a kebab-case slug.')
    }
    args.push('--write-lesson', '--slug', slug)
  }
  return rejectForbidden(args)
}

export function captureSectionsArgs({ site, source = 'target', target, route } = {}) {
  const args = ['--site', assertSiteId(site)]
  if (source === 'clone') args.push('--from-clone')
  else if (source === 'target') args.push('--from-target')
  else throw new Error('source must be "target" or "clone".')
  args.push(...optionalTarget(target), ...optionalRoute(route))
  return rejectForbidden(args)
}

export function captureApiArgs({ site, target, route } = {}) {
  return rejectForbidden(['--site', assertSiteId(site), ...optionalTarget(target), ...optionalRoute(route)])
}

export function compareTargetArgs({ site, action = 'compare', target, route } = {}) {
  const args = ['--site', assertSiteId(site)]
  if (action === 'accept') args.push('--accept')
  else if (action === 'from-staging') args.push('--from-staging')
  else if (action !== 'compare') throw new Error('action must be "compare", "from-staging", or "accept".')
  if (action === 'accept' && (target || route)) {
    throw new Error('--accept only applies a reviewed compare report; do not pass --target or --route.')
  }
  if (action !== 'accept') args.push(...optionalTarget(target), ...optionalRoute(route))
  // --accept is allowed only as the explicit compare-target action, never as a loop flag.
  const forbidden = action === 'accept' ? ['--capture-reference', '--update-baseline'] : FORBIDDEN_LOOP_FLAGS
  return rejectForbidden(args, forbidden)
}

export const SCRIPT = {
  checkGates: 'scripts/check-gates.mjs',
  cloneLoop: 'scripts/clone-loop.mjs',
  captureSections: 'scripts/capture-sections.mjs',
  captureApi: 'scripts/capture-api.mjs',
  compareTarget: 'scripts/compare-target.mjs',
}
