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

const { procedures, serviceMocks } = vi.hoisted(() => ({
  procedures: [] as ProcedureRecord[],
  serviceMocks: {
    create: vi.fn(),
    delete: vi.fn(),
    findBy: vi.fn(),
    listAIAgents: vi.fn(),
    updateAIAgent: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  aiAgentService: serviceMocks,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
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

await import("@/features/ai-agents/api/workspace-token")

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

describe("AI agents workspace-token API", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("create scopes the mutation to the token workspace", async () => {
    const input = {
      name: "Support",
      prompt: "Answer customer questions.",
      messages: [],
      models: [],
      temperature: 0.4,
      maxOutputTokens: 2048,
      tools: [],
      isDefault: false,
      isRichResponse: false,
    }
    serviceMocks.create.mockResolvedValue(undefined)

    await expect(
      getHandler("POST", "/v1/ai-agents")({ context, input }),
    ).resolves.toBeUndefined()

    expect(serviceMocks.create).toHaveBeenCalledWith("workspace-a", input)
  })

  test("update returns the row read back from the same token workspace", async () => {
    const updated = { id: "agent-1", name: "Renamed" }
    serviceMocks.updateAIAgent.mockResolvedValue(undefined)
    serviceMocks.findBy.mockResolvedValue(updated)

    await expect(
      getHandler(
        "PUT",
        "/v1/ai-agents/{id}",
      )({
        context,
        input: { id: "agent-1", name: "Renamed" },
      }),
    ).resolves.toBe(updated)

    expect(serviceMocks.updateAIAgent).toHaveBeenCalledWith(
      { workspaceId: "workspace-a", id: "agent-1" },
      { name: "Renamed" },
    )
    expect(serviceMocks.findBy).toHaveBeenCalledWith({
      where: { id: "agent-1", workspaceId: "workspace-a" },
    })
  })

  test("delete rejects a cross-workspace id before issuing the mutation", async () => {
    serviceMocks.findBy.mockResolvedValue(undefined)

    await expect(
      getHandler(
        "DELETE",
        "/v1/ai-agents/{id}",
      )({
        context,
        input: { id: "foreign-agent" },
      }),
    ).rejects.toThrow("AI agent not found")

    expect(serviceMocks.findBy).toHaveBeenCalledWith({
      where: { id: "foreign-agent", workspaceId: "workspace-a" },
    })
    expect(serviceMocks.delete).not.toHaveBeenCalled()
  })

  test("delete removes an owned agent through the scoped service call", async () => {
    serviceMocks.findBy.mockResolvedValue({ id: "agent-1" })
    serviceMocks.delete.mockResolvedValue(undefined)

    await expect(
      getHandler(
        "DELETE",
        "/v1/ai-agents/{id}",
      )({
        context,
        input: { id: "agent-1" },
      }),
    ).resolves.toBeUndefined()

    expect(serviceMocks.delete).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      ids: ["agent-1"],
    })
  })
})
