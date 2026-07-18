import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { executeDynamicCommand } from "../src/dynamic-executor"
import type { DynamicTool } from "../src/openapi-loader"

const config = { apiKey: "test-key", apiUrl: "https://api.test" }

function makeTool(
  properties: Record<string, unknown>,
  bodyParamNames: string[],
): DynamicTool {
  return {
    baseUrl: "",
    bodyParamNames,
    commandName: "comment-automations:create",
    description: "",
    inputSchema: { type: "object", properties },
    method: "POST",
    pathParamNames: [],
    pathTemplate: "/v1/comment-automations",
    queryParamNames: [],
  }
}

function lastFetchBody(): Record<string, unknown> {
  const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)
  const init = call?.[1] as RequestInit
  return JSON.parse(init.body as string)
}

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({ ok: true }),
    text: async () => "",
  }) as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("executeDynamicCommand body serialization", () => {
  test("JSON.parses a union-typed (anyOf) flag passed as a JSON string", async () => {
    // A discriminated union serializes to OpenAPI `anyOf` with no top-level type.
    const tool = makeTool(
      { privateReply: { anyOf: [{ type: "object" }, { type: "object" }] } },
      ["privateReply"],
    )

    await executeDynamicCommand(
      tool,
      { privateReply: '{"kind":"text","text":"hi"}' },
      config,
    )

    expect(lastFetchBody()).toEqual({
      privateReply: { kind: "text", text: "hi" },
    })
  })

  test("JSON.parses an explicit object-typed flag (existing behavior)", async () => {
    const tool = makeTool(
      { options: { type: "object" } },
      ["options"],
    )

    await executeDynamicCommand(tool, { options: '{"a":1}' }, config)

    expect(lastFetchBody()).toEqual({ options: { a: 1 } })
  })

  test("leaves a plain string flag untouched even with no type on schema", async () => {
    const tool = makeTool({ name: {} }, ["name"])

    await executeDynamicCommand(tool, { name: "My Automation" }, config)

    expect(lastFetchBody()).toEqual({ name: "My Automation" })
  })

  test("keeps a string primitive as a string", async () => {
    const tool = makeTool({ name: { type: "string" } }, ["name"])

    await executeDynamicCommand(tool, { name: "hello" }, config)

    expect(lastFetchBody()).toEqual({ name: "hello" })
  })
})
