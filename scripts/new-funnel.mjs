#!/usr/bin/env node
// Instantiate a flow-as-code template (e.g. flows/ig-comment-dm-v2.json) into
// a brand-new live flow via the ChatbotX public API. Reuses the CLI's real
// applyFlow (upsert-by-name, apps/cli/src/commands/flows.ts) instead of
// reimplementing the create/update decision.
//
//   node scripts/new-funnel.mjs --template flows/ig-comment-dm-v2.json \
//     --name "IG Comment to DM v2 - Client A" \
//     --var ig_media_id=178412 \
//     [--dry-run]
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

export function parseArgs(argv) {
  const opts = { vars: {}, dryRun: false }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--template") {
      opts.template = argv[++i]
    } else if (arg === "--name") {
      opts.name = argv[++i]
    } else if (arg === "--var") {
      const kv = argv[++i]
      const eq = typeof kv === "string" ? kv.indexOf("=") : -1
      if (eq === -1) {
        throw new Error(`--var must be key=value, got: ${kv}`)
      }
      opts.vars[kv.slice(0, eq)] = kv.slice(eq + 1)
    } else if (arg === "--dry-run") {
      opts.dryRun = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!opts.template) {
    throw new Error("--template is required")
  }
  if (!opts.name || !opts.name.trim()) {
    throw new Error("--name is required")
  }

  return opts
}

// Simple {{key}} token substitution over the raw template text, done before
// JSON.parse so a template can carry {{ig_media_id}} etc. anywhere in the file.
export function substituteVars(text, vars) {
  let result = text
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{{${key}}}`).join(value)
  }
  return result
}

// Load flows.ts (a TypeScript source file) from a plain .mjs entry point
// without a build step, via tsx's one-off dynamic-import API. This is what
// lets the script reuse the CLI's real applyFlow instead of duplicating it.
export async function loadFlowsModule() {
  const { tsImport } = await import("tsx/esm/api")
  const flowsUrl = new URL("../apps/cli/src/commands/flows.ts", import.meta.url).href
  return tsImport(flowsUrl, import.meta.url)
}

// Core orchestration, fully injectable for tests: readFile, applyFlow, and
// client are all passed in so no real file I/O or network call is required
// to exercise the logic.
export async function instantiate({
  templatePath,
  name,
  vars = {},
  dryRun = false,
  applyFlow,
  client,
  config,
  readFile = readFileSync,
  log = console.log,
}) {
  const rawTemplate = readFile(templatePath, "utf8")
  const substituted = substituteVars(rawTemplate, vars)
  const parsed = JSON.parse(substituted)
  parsed.name = name
  const fileContents = JSON.stringify(parsed)

  if (dryRun) {
    log(JSON.stringify(parsed, null, 2))
    log(`[dry-run] would apply as: create (POST) — new flow "${name}" (no network call made)`)
    return { dryRun: true, flow: null, action: "create (dry-run)" }
  }

  const { flow, action } = await applyFlow(config, fileContents, client)
  log(`Flow ${action}: ${flow.id} (${flow.name})`)
  return { flow, action }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  const config = {
    apiKey: process.env.CHATBOTX_API_KEY,
    apiUrl: process.env.CHATBOTX_API_URL,
  }

  if (!opts.dryRun && (!config.apiKey || !config.apiUrl)) {
    throw new Error(
      "Missing CHATBOTX_API_KEY / CHATBOTX_API_URL env vars (same as the CLI's config.ts)",
    )
  }

  const { applyFlow, defaultFlowsApiClient } = await loadFlowsModule()

  await instantiate({
    templatePath: opts.template,
    name: opts.name,
    vars: opts.vars,
    dryRun: opts.dryRun,
    applyFlow,
    client: defaultFlowsApiClient,
    config,
  })
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err)
    process.exitCode = 1
  })
}
