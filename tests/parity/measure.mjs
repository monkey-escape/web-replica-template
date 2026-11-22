import { resolve } from 'node:path'
import { parseArgs } from '@replica/parity/args'
import { measureSite } from '@replica/parity/measure'
import { repoRoot } from '@replica/parity/paths'
import { writeJson } from '@replica/parity/report'

const args = parseArgs(process.argv.slice(2))

if (args.help || args.site === true || !args.site) {
  console.log(`Usage: node tests/parity/measure.mjs --site <site-id> [--out <file>]

Compares the running clone against fixtures/sites/<site-id>/structure.json.
Start the web app first: pnpm dev:web
Routes with click checks also need the API: pnpm dev:api`)
  process.exit(args.help ? 0 : 1)
}

const siteId = args.site
const out =
  typeof args.out === 'string'
    ? resolve(args.out)
    : resolve(repoRoot, 'temp/clone-loop', siteId, 'measure.json')

let result
try {
  result = await measureSite(siteId)
} catch (error) {
  result = {
    phase: 'measure',
    siteId,
    complete: false,
    error: error.message,
    results: [],
  }
}

writeJson(out, result)

const failed = result.results.filter((item) => !item.pass)
if (!result.complete) {
  console.error(`measure incomplete: ${result.error}`)
  process.exit(1)
}

if (failed.length === 0) {
  console.log(`measure passed (${result.results.length} routes) -> ${out}`)
  process.exit(0)
}

console.error(`measure failed ${failed.length} route(s). Fix only these:`)
for (const item of failed) {
  console.error(`- [${item.mode}] ${item.route} ${item.path}`)
  for (const failure of item.failures)
    console.error(`    ${failure.kind} ${failure.key}: ${failure.item}`)
}
console.error(`details: ${out}`)
process.exit(1)
