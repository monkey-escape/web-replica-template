import { existsSync } from 'node:fs'
import { parseArgs } from '@replica/parity/args'
import { repoRoot } from '@replica/parity/paths'
import {
  acceptTargetUpdate,
  compareTargetSite,
  recaptureTargetToStaging,
  reportPaths,
  writeTargetUpdateReport,
} from '@replica/parity/target-update'

function help() {
  console.log(`Usage:
  node scripts/compare-target.mjs --self-test
  node scripts/compare-target.mjs --site <site-id> [--target <origin>] [--route <name>]
  node scripts/compare-target.mjs --site <site-id> --from-staging
  node scripts/compare-target.mjs --site <site-id> --accept

On-demand target-site update flow (not a scheduled watcher):

  1. Recapture the live public target into temp/clone-loop/<site-id>/target-update/staging/
     without overwriting fixtures or baselines.
  2. Diff staging against fixtures/sites/<site-id>/ and write report.json plus report.md.
  3. After you review the delta, pass --accept to copy only added and changed fixture
     files (baselines, styles, api, assets, structure, sections). Removed routes are
     listed only; clone source is never deleted automatically.
  4. Analyze new or changed shared components and pages, then run clone-loop on the
     changed/failed routes.

Public pages only. An age-gate may be dismissed. Do not log in, do not navigate to
/requisition or other privileged paths, and do not write to the target.
--accept is never run from clone-loop. Fix-loop recapture of baselines stays forbidden.
See docs/target-update.md.`)
}

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  help()
  process.exit(0)
}

if (args['self-test']) {
  const text = help.toString()
  if (!text.includes('--accept') || !text.includes('target-update') || !text.includes('fixtures/sites/')) {
    throw new Error('help text must document staging, fixtures, and --accept')
  }
  if (!text.includes('not a scheduled watcher') || !text.includes('clone-loop')) {
    throw new Error('help text must say this is on-demand and not part of clone-loop')
  }
  // 对比和接受的行为由 packages/parity/src/target-update.test.js 覆盖；这里只确认入口和拒绝条件。
  const { acceptTargetUpdate, reportPaths: pathsFor } = await import('@replica/parity/target-update')
  const missing = pathsFor('__missing_site__', repoRoot)
  let failed = false
  try {
    acceptTargetUpdate('__missing_site__', { root: repoRoot })
  } catch (error) {
    failed = /No compare report/.test(error.message)
  }
  if (!failed) throw new Error('--accept must refuse to run when no compare report exists')
  if (existsSync(new URL('./clone-loop.mjs', import.meta.url)) === false) {
    throw new Error('expected clone-loop.mjs to exist beside this script')
  }
  if (missing.json.includes('fixtures/sites/')) throw new Error('report must live under temp/clone-loop, not fixtures')
  console.log('compare-target self-test passed')
  process.exit(0)
}

if (typeof args.site !== 'string') {
  help()
  process.exit(1)
}

const siteId = args.site
const root = repoRoot
const paths = reportPaths(siteId, root)

if (args.accept) {
  const accepted = acceptTargetUpdate(siteId, { root })
  console.log(`Accepted ${accepted.copied.length} file(s) into fixtures/sites/${siteId}/`)
  for (const file of accepted.copied) console.log(`  copied ${file}`)
  if (accepted.skippedRemoved.length) {
    console.log(
      `Removed routes were listed only, not deleted: ${accepted.skippedRemoved.join(', ')}`,
    )
  }
  console.log(`Log: ${paths.accepted}`)
  console.log('Analyze the delta (shared components first, then pages) before editing apps/web.')
  console.log('Then run node scripts/clone-loop.mjs --site ' + siteId + ' and repair only changed/failed routes.')
  process.exit(0)
}

if (!args['from-staging']) {
  const result = await recaptureTargetToStaging(siteId, {
    root,
    target: typeof args.target === 'string' ? args.target : undefined,
    route: args.route,
  })
  console.log(`Recaptured public target into ${result.staging}`)
  console.log('Current fixtures and baselines were not overwritten.')
}

const report = compareTargetSite(siteId, { root })
writeTargetUpdateReport(siteId, report, root)
console.log(report.status === 'unchanged' ? 'No target drift detected.' : `Target changes detected (${report.status}).`)
console.log(`status: ${report.status}`)
console.log(`next: ${report.next}`)
console.log(`Report: ${paths.json}`)
console.log(`Summary: ${paths.markdown}`)
if (report.status === 'changes') {
  console.log('Review the report, then run:')
  console.log(`  node scripts/compare-target.mjs --site ${siteId} --accept`)
}
process.exit(0)
