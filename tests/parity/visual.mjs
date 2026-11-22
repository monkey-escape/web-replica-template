import { resolve } from 'node:path'
import { parseArgs } from '@replica/parity/args'
import { repoRoot } from '@replica/parity/paths'
import { writeJson } from '@replica/parity/report'
import { compareSite } from '@replica/parity/shoot'

const args = parseArgs(process.argv.slice(2))

if (args.help || args.site === true || !args.site) {
  console.log(`Usage: node tests/parity/visual.mjs --site <site-id> [--out <file>]
       node tests/parity/visual.mjs --site <site-id> --capture-reference [--allow-strict-capture]

Compares full-page screenshots with the reference PNGs in the site baseline folder.
--capture-reference is an analysis step. It writes references and still exits 1.
The fix loop must not use it to make a strict route look done.`)
  process.exit(args.help ? 0 : 1)
}

const siteId = args.site
const out =
  typeof args.out === 'string'
    ? resolve(args.out)
    : resolve(repoRoot, 'temp/clone-loop', siteId, 'visual.json')

let result
try {
  result = await compareSite(siteId, {
    captureReference: args['capture-reference'] === true,
    allowStrictCapture: args['allow-strict-capture'] === true,
  })
} catch (error) {
  result = {
    phase: 'visual',
    siteId,
    complete: false,
    error: error.message,
    results: [],
  }
}

writeJson(out, result)

const failed = result.results.filter((item) => !item.pass)
if (!result.complete) {
  console.error(`visual compare incomplete: ${result.error}`)
  process.exit(1)
}

if (failed.length === 0) {
  console.log(`visual compare passed (${result.results.length} routes) -> ${out}`)
  process.exit(0)
}

console.error(`visual compare failed ${failed.length} route(s). Fix only these:`)
for (const item of failed) {
  console.error(`- [${item.mode}] ${item.route}${item.viewport ? '@' + item.viewport : ''} ${item.path}`)
  for (const failure of item.failures)
    console.error(`    ${failure.kind} ${failure.key}: ${failure.item}`)
}
console.error(`details: ${out}`)
process.exit(1)
