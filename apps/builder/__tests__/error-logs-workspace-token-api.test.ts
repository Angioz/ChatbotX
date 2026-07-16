import { afterEach, describe, expect, test, vi } from "vitest"

type HandlerArgs = {
  context: { workspace: { id: string } }
  input: Record<string, unknown>
}

type ProcedureRecord = {
  handler?: (args: HandlerArgs) => Promise<unknown>
  method: string
  path: string
}

const { procedures, queryMocks } = vi.hoisted(() => ({
  procedures: [] as ProcedureRecord[],
  queryMocks: {
    getErrorLogHealth: vi.fn(),
    listErrorLogs: vi.fn(),
  },
}))

vi.mock("@/features/error-logs/queries", () => queryMocks)

vi.mock("@/orpc", () => ({
  workspaceTokenAuthAPI: {
    route: ({ method, path }: { method: string; path: string }) => {
      const procedure: ProcedureRecord = { method, path }
      procedures.push(procedure)
      const chain = {
        handler: (
          handler: (args: HandlerArgs) => Promise<unknown>,
        ): ProcedureRecord => {
          procedure.handler = handler
          return procedure
        },
        input: () => chain,
        output: () => chain,
      }
      return chain
    },
  },
}))

await import("@/features/error-logs/api/workspace-token")

const getHandler = (method: string, path: string) => {
  const handler = procedures.find(
    (procedure) => procedure.method === method && procedure.path === path,
  )?.handler
  if (!handler) {
    throw new Error(`Missing ${method} ${path} handler`)
  }
  return handler
}

const context = { workspace: { id: "workspace-token" } }

describe("error logs workspace-token API", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("health scopes the read to the token workspace and forwards windowMinutes", async () => {
    const health = {
      windowMinutes: 30,
      errorCount: 2,
      lastErrorAt: new Date("2026-07-16T10:00:00.000Z"),
      healthy: false,
    }
    queryMocks.getErrorLogHealth.mockResolvedValue(health)

    await expect(
      getHandler(
        "GET",
        "/v1/error-logs/health",
      )({
        context,
        input: { windowMinutes: 30 },
      }),
    ).resolves.toBe(health)

    expect(queryMocks.getErrorLogHealth).toHaveBeenCalledWith({
      windowMinutes: 30,
      workspaceId: "workspace-token",
    })
  })

  test("list scopes the read to the token workspace", async () => {
    const result = { data: [], pageCount: 0 }
    queryMocks.listErrorLogs.mockResolvedValue(result)

    await expect(
      getHandler(
        "GET",
        "/v1/error-logs",
      )({
        context,
        input: { page: 1, perPage: 10 },
      }),
    ).resolves.toBe(result)

    expect(queryMocks.listErrorLogs).toHaveBeenCalledWith({
      page: 1,
      perPage: 10,
      workspaceId: "workspace-token",
    })
  })
})
