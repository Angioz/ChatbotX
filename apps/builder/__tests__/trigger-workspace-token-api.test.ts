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

const { triggerServiceMocks, procedures } = vi.hoisted(() => ({
  triggerServiceMocks: {
    createTrigger: vi.fn(),
    deleteTrigger: vi.fn(),
    listByWorkspaceId: vi.fn(),
    updateTrigger: vi.fn(),
  },
  procedures: [] as ProcedureRecord[],
}))

vi.mock("@chatbotx.io/business", () => ({
  triggerService: triggerServiceMocks,
}))

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

await import("@/features/triggers/api/workspace-token")

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

describe("triggers workspace-token API", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("list scopes the query to the token workspace and mirrors preserved empty conditions/actions shape", async () => {
    triggerServiceMocks.listByWorkspaceId.mockResolvedValue([
      { id: "1", name: "Lead trigger", workspaceId: "workspace-a" },
    ])

    const result = await getHandler(
      "GET",
      "/v1/triggers",
    )({
      context,
      input: {},
    })

    expect(triggerServiceMocks.listByWorkspaceId).toHaveBeenCalledWith(
      "workspace-a",
    )
    expect(result).toEqual({
      data: [
        {
          id: "1",
          name: "Lead trigger",
          workspaceId: "workspace-a",
          conditions: [],
          actions: [],
        },
      ],
    })
  })

  test("create scopes creation to the token workspace, not any client-supplied id", async () => {
    const trigger = { id: "1", name: "New lead trigger", workspaceId: "workspace-a" }
    triggerServiceMocks.createTrigger.mockResolvedValue(trigger)

    const result = await getHandler(
      "POST",
      "/v1/triggers",
    )({
      context,
      input: { name: "New lead trigger", folderId: null },
    })

    expect(triggerServiceMocks.createTrigger).toHaveBeenCalledWith(
      "workspace-a",
      { name: "New lead trigger", folderId: null },
    )
    expect(result).toEqual({ ...trigger, conditions: [] })
  })

  test("create propagates limit/validation errors raised by the business service", async () => {
    triggerServiceMocks.createTrigger.mockRejectedValue(
      new Error("Maximum of 50 triggers reached for this workspace"),
    )

    await expect(
      getHandler(
        "POST",
        "/v1/triggers",
      )({
        context,
        input: { name: "New lead trigger", folderId: null },
      }),
    ).rejects.toThrow("Maximum of 50 triggers reached for this workspace")
  })

  test("update scopes the lookup to the token workspace, not a cross-workspace id", async () => {
    const updated = { id: "1", name: "Lead trigger", workspaceId: "workspace-a" }
    triggerServiceMocks.updateTrigger.mockResolvedValue(updated)

    const result = await getHandler(
      "PUT",
      "/v1/triggers/{id}",
    )({
      context,
      input: { id: "1", conditions: [], actions: [] },
    })

    expect(triggerServiceMocks.updateTrigger).toHaveBeenCalledWith(
      { workspaceId: "workspace-a", id: "1" },
      { conditions: [], actions: [] },
    )
    expect(result).toEqual({ ...updated, conditions: [] })
  })

  test("update rejects when the trigger does not resolve in the token workspace", async () => {
    triggerServiceMocks.updateTrigger.mockRejectedValue(
      new Error("Trigger not found"),
    )

    await expect(
      getHandler(
        "PUT",
        "/v1/triggers/{id}",
      )({
        context,
        input: { id: "cross-workspace-id", conditions: [], actions: [] },
      }),
    ).rejects.toThrow("Trigger not found")

    expect(triggerServiceMocks.updateTrigger).toHaveBeenCalledWith(
      { workspaceId: "workspace-a", id: "cross-workspace-id" },
      { conditions: [], actions: [] },
    )
  })

  test("delete scopes removal to the token workspace, not a cross-workspace id", async () => {
    triggerServiceMocks.deleteTrigger.mockResolvedValue(undefined)

    await getHandler(
      "DELETE",
      "/v1/triggers/{id}",
    )({
      context,
      input: { id: "1" },
    })

    expect(triggerServiceMocks.deleteTrigger).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      id: "1",
    })
  })

  test("delete rejects when the trigger does not resolve in the token workspace", async () => {
    triggerServiceMocks.deleteTrigger.mockRejectedValue(
      new Error("Trigger not found"),
    )

    await expect(
      getHandler(
        "DELETE",
        "/v1/triggers/{id}",
      )({
        context,
        input: { id: "cross-workspace-id" },
      }),
    ).rejects.toThrow("Trigger not found")
  })
})
