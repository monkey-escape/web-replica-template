import { parseArgs } from '@replica/parity/args'
import { checkGates } from '@replica/parity/gates'

function help() {
  console.log(`Usage:
  node scripts/check-gates.mjs --self-test
  node scripts/check-gates.mjs --site <site-id>

Run the analysis gate (the same check clone-loop uses) and print JSON.
Exit 0 when the site may start implementation; exit 1 when analysis is incomplete
(missing files, shell components.md, pending shared-components, or an undecided
API mock). This does not edit fixtures or apps/web.`)
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  help()
  process.exit(0)
}

if (args['self-test']) {
  const text = help.toString()
  if (!text.includes('--site') || !text.includes('clone-loop')) {
    throw new Error('help text must mention --site and clone-loop')
  }
  const example = checkGates('example')
  if (!example.ok) {
    console.error(example.errors.join('\n'))
    throw new Error('example must still pass checkGates')
  }
  console.log('check-gates self-test passed')
  process.exit(0)
}

if (typeof args.site !== 'string') {
  help()
  process.exit(1)
}

const result = checkGates(args.site)
console.log(JSON.stringify(result, null, 2))
process.exit(result.ok ? 0 : 1)
