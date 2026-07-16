import { readFileSync, writeFileSync } from "node:fs"
import type { Argv } from "yargs"
import { printResult } from "./utils"

export type FlowsCliConfig = { apiKey: string; apiUrl: string }

export type Flow = {
  id: string
  name: string
  [key: string]: unknown
}

async function apiRequest<T>(
  config: FlowsCliConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const contentType = response.headers.get("content-type") ?? ""
  const result = contentType.includes("application/json")
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    throw new Error(
      `Error ${response.status}: ${JSON.stringify(result, null, 2)}`,
    )
  }

  return result as T
}

// Dependency-injectable so `apply`/`export` decision logic can be unit-tested
// without a network call. Same base URL + bearer token as the generated
// commands (apps/cli/src/dynamic-executor.ts) — no separate auth path.
export type FlowsApiClient = {
  list: (config: FlowsCliConfig) => Promise<Flow[]>
  get: (config: FlowsCliConfig, id: string) => Promise<Flow>
  create: (config: FlowsCliConfig, body: Record<string, unknown>) => Promise<Flow>
  update: (
    config: FlowsCliConfig,
    id: string,
    body: Record<string, unknown>,
  ) => Promise<Flow>
}

export const defaultFlowsApiClient: FlowsApiClient = {
  list: async (config) => {
    const result = await apiRequest<{ data: Flow[] }>(config, "GET", "/v1/flows")
    return result.data
  },
  get: (config, id) =>
    apiRequest<Flow>(config, "GET", `/v1/flows/${encodeURIComponent(id)}`),
  create: (config, body) => apiRequest<Flow>(config, "POST", "/v1/flows", body),
  update: (config, id, body) =>
    apiRequest<Flow>(
      config,
      "PUT",
      `/v1/flows/${encodeURIComponent(id)}`,
      body,
    ),
}

export type ApplyResult = { flow: Flow; action: "created" | "updated" }

// Kubectl-style upsert-by-name: list flows, find an exact name match in the
// token's workspace, PUT if found else POST. Idempotent — re-applying the
// same file updates the same flow instead of duplicating it.
export async function applyFlow(
  config: FlowsCliConfig,
  fileContents: string,
  client: FlowsApiClient = defaultFlowsApiClient,
): Promise<ApplyResult> {
  const parsed = JSON.parse(fileContents) as Record<string, unknown>
  const name = parsed.name

  if (typeof name !== "string" || !name.trim()) {
    throw new Error('Flow file must have a top-level string "name" field')
  }

  const existing = await client.list(config)
  const match = existing.find((flow) => flow.name === name)

  if (match) {
    const flow = await client.update(config, match.id, parsed)
    return { flow, action: "updated" }
  }

  const flow = await client.create(config, parsed)
  return { flow, action: "created" }
}

// GET flow by id, shape matches what applyFlow sends on create/update
// (server-side zod schemas strip unknown keys — the extra fields flowResource
// returns beyond createFlowSchema/updateFlowSchema are harmless round-trip).
export async function exportFlow(
  config: FlowsCliConfig,
  id: string,
  client: FlowsApiClient = defaultFlowsApiClient,
): Promise<Flow> {
  return client.get(config, id)
}

export const registerFlowsCustomCommands = (
  groupCli: Argv,
  config: FlowsCliConfig,
): Argv =>
  groupCli
    .command(
      "apply",
      "Create or update a flow from a JSON file (upsert-by-name)",
      (applyCli: Argv) =>
        applyCli.option("file", {
          describe: "Path to the flow JSON file",
          type: "string",
          demandOption: true,
        }),
      async (argv) => {
        const filePath = argv.file as string
        const fileContents = readFileSync(filePath, "utf8")
        const { flow, action } = await applyFlow(config, fileContents)
        process.stdout.write(`Flow ${action}: ${flow.id} (${flow.name})\n`)
        printResult(flow)
      },
    )
    .command(
      "export <id>",
      "Export a flow to apply-compatible JSON (stdout or --file)",
      (exportCli: Argv) =>
        exportCli
          .positional("id", {
            describe: "Flow id",
            type: "string",
            demandOption: true,
          })
          .option("file", {
            describe: "Write to this file instead of stdout",
            type: "string",
          }),
      async (argv) => {
        const id = argv.id as string
        const filePath = argv.file as string | undefined
        const flow = await exportFlow(config, id)
        const json = JSON.stringify(flow, null, 2)

        if (filePath) {
          writeFileSync(filePath, json, "utf8")
          process.stdout.write(`Flow ${id} exported to ${filePath}\n`)
        } else {
          process.stdout.write(`${json}\n`)
        }
      },
    )
