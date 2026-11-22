import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  SCRIPT,
  captureApiArgs,
  captureSectionsArgs,
  checkGatesArgs,
  cloneLoopArgs,
  compareTargetArgs,
  findRepoRoot,
} from './tools-lib.js'

export const name = 'web-replica-tools'
export const inject = ['tools']

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      exitCode: { type: 'number' },
      command: { type: 'string' },
      stdout: { type: 'string' },
      stderr: { type: 'string' },
    },
  },
  render(_args, value) {
    const text = [`$ ${value.command}`, value.stdout, value.stderr, `exit ${value.exitCode}`]
      .filter((part) => part != null && String(part).length > 0)
      .join('\n')
    return [{ type: 'text', text }]
  },
}

function runScript(root, script, args, signal) {
  const command = `node ${script} ${args.join(' ')}`.trim()
  return new Promise((settle) => {
    const child = spawn(process.execPath, [join(root, script), ...args], {
      cwd: root,
      env: process.env,
      signal,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      settle({ exitCode: 1, command, stdout, stderr: `${stderr}${error.message}` })
    })
    child.on('close', (code) => {
      settle({ exitCode: code ?? 1, command, stdout, stderr })
    })
  })
}

function registerScriptTool(ctx, spec) {
  ctx.tools.register(
    defineTool({
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      output: OUTPUT,
      presentCall(args) {
        return { card: 'terminal', title: spec.name, description: spec.title(args) }
      },
      async execute(args, exec) {
        const root = findRepoRoot(process.cwd())
        const argv = spec.args(args)
        return runScript(root, spec.script, argv, exec?.signal)
      },
    }),
  )
}

export function apply(ctx) {
  registerScriptTool(ctx, {
    name: 'replica_check_gates',
    script: SCRIPT.checkGates,
    title: (args) => `check-gates --site ${args.site}`,
    description:
      'Run the repo analysis gate for a site id (same check as clone-loop). Use before editing apps/web. Does not capture or overwrite fixtures. Public analysis must already include shared components (or shared-components: none) and an API-mock decision.',
    parameters: {
      site: { type: 'string', required: true, description: 'Kebab-case site id.' },
    },
    args: checkGatesArgs,
  })

  registerScriptTool(ctx, {
    name: 'replica_capture_sections',
    script: SCRIPT.captureSections,
    title: (args) => `capture-sections --site ${args.site} --from-${args.source ?? 'target'}`,
    description:
      'Capture section boxes and computed styles from public pages. source=target writes fixtures (analysis). source=clone writes temp/ only and must not overwrite target fixtures. Public pages only: no login, do not navigate to /requisition or privileged paths, no writes to the target. An age-gate may be dismissed.',
    parameters: {
      site: { type: 'string', required: true, description: 'Kebab-case site id.' },
      source: {
        type: 'string',
        description: '"target" (default, analysis fixtures) or "clone" (temp only).',
      },
      target: { type: 'string', description: 'Optional http(s) origin override.' },
      route: { type: 'string', description: 'Optional route name; merges into the existing summary.' },
    },
    args: (args) => captureSectionsArgs({ ...args, source: args.source ?? 'target' }),
  })

  registerScriptTool(ctx, {
    name: 'replica_capture_api',
    script: SCRIPT.captureApi,
    title: (args) => `capture-api --site ${args.site}`,
    description:
      'Passively record public JSON/XHR/fetch responses while loading public pages, into fixtures/sites/<site-id>/api/. GET/read only. Does not navigate to /api/ or /requisition, log in, or write to the target. If the public site has no data APIs, record apiMocks: "none" instead.',
    parameters: {
      site: { type: 'string', required: true, description: 'Kebab-case site id.' },
      target: { type: 'string', description: 'Optional http(s) origin override.' },
      route: { type: 'string', description: 'Optional route name.' },
    },
    args: captureApiArgs,
  })

  registerScriptTool(ctx, {
    name: 'replica_compare_target',
    script: SCRIPT.compareTarget,
    title: (args) => `compare-target --site ${args.site}${args.action === 'accept' ? ' --accept' : ''}`,
    description:
      'On-demand target-site update. action=compare recaptures the live public target into staging and writes a report (does not overwrite fixtures). action=from-staging reuses staging. action=accept copies only added and changed fixture files after you review the report; it never deletes clone source and is never run from clone-loop. Public pages only; no login or privileged paths.',
    parameters: {
      site: { type: 'string', required: true, description: 'Kebab-case site id.' },
      action: {
        type: 'string',
        description: '"compare" (default), "from-staging", or "accept".',
      },
      target: { type: 'string', description: 'Optional http(s) origin for compare.' },
      route: { type: 'string', description: 'Optional route name for compare.' },
    },
    args: (args) => compareTargetArgs({ ...args, action: args.action ?? 'compare' }),
  })

  registerScriptTool(ctx, {
    name: 'replica_clone_loop',
    script: SCRIPT.cloneLoop,
    title: (args) => `clone-loop --site ${args.site}`,
    description:
      'Run the repo oracle (measure, visual, maintainability, report.next). Repair only next. Do not declare the clone done yourself. This tool refuses --capture-reference, --update-baseline, and --accept. Optional conclude records failed_with_residuals; writeLesson is only for a green loop.',
    parameters: {
      site: { type: 'string', required: true, description: 'Kebab-case site id.' },
      conclude: { type: 'boolean', description: 'Record failed_with_residuals and exit 4.' },
      writeLesson: { type: 'boolean', description: 'Write a lesson file after a green loop.' },
      slug: { type: 'string', description: 'Kebab-case lesson slug, required with writeLesson.' },
    },
    args: cloneLoopArgs,
  })
}
