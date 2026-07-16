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

const { flowServiceMocks, listFlowsMock, procedures } = vi.hoisted(() => ({
  flowServiceMocks: {
    cloneFlow: vi.fn(),
    createFlow: vi.fn(),
    getFlow: vi.fn(),
    publishFlow: vi.fn(),
    updateFlow: vi.fn(),
  },
  listFlowsMock: vi.fn(),
  procedures: [] as ProcedureRecord[],
}))

vi.mock("@chatbotx.io/business", () => ({
  flowService: flowServiceMocks,
}))

vi.mock("@/features/flows/queries", () => ({
  listFlows: listFlowsMock,
}))

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

await import("@/features/flows/api/workspace-token")

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

describe("flow workspace-token API", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("create passes only the token workspace to flowService", async () => {
    const flow = { id: "flow-1" }
    flowServiceMocks.createFlow.mockResolvedValue(flow)

    await expect(
      getHandler(
        "POST",
        "/v1/flows",
      )({
        context,
        input: { folderId: null, name: "Welcome" },
      }),
    ).resolves.toBe(flow)

    expect(flowServiceMocks.createFlow).toHaveBeenCalledWith("workspace-a", {
      folderId: null,
      name: "Welcome",
    })
  })

  test("get scopes the lookup to the token workspace", async () => {
    const flow = { id: "flow-1" }
    flowServiceMocks.getFlow.mockResolvedValue(flow)

    await expect(
      getHandler(
        "GET",
        "/v1/flows/{id}",
      )({
        context,
        input: { id: "flow-1" },
      }),
    ).resolves.toBe(flow)

    expect(flowServiceMocks.getFlow).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      id: "flow-1",
    })
  })

  test("update separates the path id and scopes the mutation", async () => {
    const flow = { id: "flow-1", name: "After" }
    flowServiceMocks.updateFlow.mockResolvedValue(flow)

    await expect(
      getHandler(
        "PUT",
        "/v1/flows/{id}",
      )({
        context,
        input: { id: "flow-1", name: "After" },
      }),
    ).resolves.toBe(flow)

    expect(flowServiceMocks.updateFlow).toHaveBeenCalledWith(
      { workspaceId: "workspace-a", id: "flow-1" },
      { name: "After" },
    )
  })

  test("clone reads the new flow back through the same token workspace", async () => {
    const flow = { id: "flow-copy" }
    flowServiceMocks.cloneFlow.mockResolvedValue("flow-copy")
    flowServiceMocks.getFlow.mockResolvedValue(flow)

    await expect(
      getHandler(
        "POST",
        "/v1/flows/{id}/clone",
      )({
        context,
        input: { id: "flow-1" },
      }),
    ).resolves.toBe(flow)

    expect(flowServiceMocks.cloneFlow).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      id: "flow-1",
    })
    expect(flowServiceMocks.getFlow).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      id: "flow-copy",
    })
  })

  test("publish scopes both the mutation and response lookup", async () => {
    const flow = { id: "flow-1" }
    flowServiceMocks.publishFlow.mockResolvedValue(undefined)
    flowServiceMocks.getFlow.mockResolvedValue(flow)

    await expect(
      getHandler(
        "POST",
        "/v1/flows/{id}/publish",
      )({
        context,
        input: { id: "flow-1", nodes: [], edges: [] },
      }),
    ).resolves.toBe(flow)

    expect(flowServiceMocks.publishFlow).toHaveBeenCalledWith(
      { workspaceId: "workspace-a", id: "flow-1" },
      { nodes: [], edges: [] },
    )
    expect(flowServiceMocks.getFlow).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      id: "flow-1",
    })
  })
})
