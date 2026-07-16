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

const { broadcastServiceMocks, queriesMocks, procedures } = vi.hoisted(
  () => ({
    broadcastServiceMocks: {
      createBroadcast: vi.fn(),
      updateBroadcast: vi.fn(),
      deleteBroadcast: vi.fn(),
    },
    queriesMocks: {
      listBroadcastAudience: vi.fn(),
      listBroadcasts: vi.fn(),
      publicGetBroadcast: vi.fn(),
    },
    procedures: [] as ProcedureRecord[],
  }),
)

vi.mock("@chatbotx.io/business", () => ({
  broadcastService: broadcastServiceMocks,
}))

vi.mock("@/features/broadcasts/queries", () => queriesMocks)

vi.mock("@/orpc", () => ({
  workspaceTokenAuthAPI: {
    route: ({ method, path }: { method: string; path: string }) => {
      const procedure: ProcedureRecord = { method, path }
      procedures.push(procedure)
      const chain = {
        errors: () => chain,
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

await import("@/features/broadcasts/api/workspace-token")

const getHandler = (method: string, path: string) => {
  const handler = procedures.find(
    (procedure) => procedure.method === method && procedure.path === path,
  )?.handler
  if (!handler) {
    throw new Error(`Missing ${method} ${path} handler`)
  }
  return handler
}

const context = { workspace: { id: "workspace-a" } }

describe("broadcasts workspace-token API", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("create scopes the new broadcast to the token workspace and forwards the input as-is", async () => {
    const broadcast = { id: "1", name: "Broadcast" }
    broadcastServiceMocks.createBroadcast.mockResolvedValue(broadcast)

    const input = {
      channel: "whatsapp",
      flowId: "flow-1",
      subaction: "allContacts",
      schedulesType: "now",
      schedulesAt: null,
      contactFilter: null,
    }

    await expect(
      getHandler("POST", "/v1/broadcasts")({ context, input }),
    ).resolves.toBe(broadcast)

    expect(broadcastServiceMocks.createBroadcast).toHaveBeenCalledWith(
      "workspace-a",
      input,
    )
  })

  test("create propagates a not-found rejection from the service (e.g. a foreign flowId)", async () => {
    broadcastServiceMocks.createBroadcast.mockRejectedValue(
      new Error("Flow not found"),
    )

    await expect(
      getHandler("POST", "/v1/broadcasts")({
        context,
        input: {
          channel: "whatsapp",
          flowId: "other-workspace-flow",
          subaction: "allContacts",
          schedulesType: "now",
          schedulesAt: null,
          contactFilter: null,
        },
      }),
    ).rejects.toThrow("Flow not found")
  })

  test("update splits the path id from the body and scopes the lookup to the token workspace", async () => {
    const updated = { id: "1", name: "Renamed" }
    broadcastServiceMocks.updateBroadcast.mockResolvedValue(updated)

    await expect(
      getHandler("PUT", "/v1/broadcasts/{id}")({
        context,
        input: { id: "1", name: "Renamed" },
      }),
    ).resolves.toBe(updated)

    expect(broadcastServiceMocks.updateBroadcast).toHaveBeenCalledWith(
      { workspaceId: "workspace-a", id: "1" },
      { name: "Renamed" },
    )
  })

  test("update rejects a cross-workspace id instead of silently succeeding", async () => {
    broadcastServiceMocks.updateBroadcast.mockRejectedValue(
      new Error("Broadcast not found"),
    )

    await expect(
      getHandler("PUT", "/v1/broadcasts/{id}")({
        context,
        input: { id: "foreign-broadcast", name: "Hijacked" },
      }),
    ).rejects.toThrow("Broadcast not found")

    expect(broadcastServiceMocks.updateBroadcast).toHaveBeenCalledWith(
      { workspaceId: "workspace-a", id: "foreign-broadcast" },
      { name: "Hijacked" },
    )
  })

  test("delete scopes the deletion to the token workspace", async () => {
    broadcastServiceMocks.deleteBroadcast.mockResolvedValue(undefined)

    await getHandler("DELETE", "/v1/broadcasts/{id}")({
      context,
      input: { id: "1" },
    })

    expect(broadcastServiceMocks.deleteBroadcast).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      id: "1",
    })
  })

  test("delete propagates a not-found rejection for a cross-workspace id", async () => {
    broadcastServiceMocks.deleteBroadcast.mockRejectedValue(
      new Error("Broadcast not found"),
    )

    await expect(
      getHandler("DELETE", "/v1/broadcasts/{id}")({
        context,
        input: { id: "foreign-broadcast" },
      }),
    ).rejects.toThrow("Broadcast not found")
  })
})
