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
    list: vi.fn(),
    setStatus: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  fbCommentAutomationService: serviceMocks,
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

await import("@/features/fb-comments/api/workspace-token")

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

describe("comment automation workspace-token API", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("create uses only the token workspace", async () => {
    const input = { name: "Comment to DM" }
    const automation = { id: "automation-1" }
    serviceMocks.create.mockResolvedValue(automation)

    await expect(
      getHandler("POST", "/v1/comment-automations")({ context, input }),
    ).resolves.toBe(automation)

    expect(serviceMocks.create).toHaveBeenCalledWith("workspace-token", input)
  })

  test("list injects token workspace and public defaults", async () => {
    const result = { data: [], pageCount: 0 }
    serviceMocks.list.mockResolvedValue(result)

    await expect(
      getHandler(
        "GET",
        "/v1/comment-automations",
      )({
        context,
        input: { isActive: true },
      }),
    ).resolves.toBe(result)

    expect(serviceMocks.list).toHaveBeenCalledWith({
      workspaceId: "workspace-token",
      isActive: true,
      page: 1,
      perPage: 100,
      sort: [{ id: "createdAt", desc: true }],
    })
  })

  test("status update scopes the id to the token workspace", async () => {
    const automation = { id: "automation-1", isActive: false }
    serviceMocks.setStatus.mockResolvedValue(automation)

    await expect(
      getHandler(
        "PATCH",
        "/v1/comment-automations/{id}/status",
      )({
        context,
        input: { id: "automation-1", enabled: false },
      }),
    ).resolves.toBe(automation)

    expect(serviceMocks.setStatus).toHaveBeenCalledWith(
      { workspaceId: "workspace-token", id: "automation-1" },
      false,
    )
  })

  test("delete scopes the id to the token workspace", async () => {
    serviceMocks.delete.mockResolvedValue(undefined)

    await expect(
      getHandler(
        "DELETE",
        "/v1/comment-automations/{id}",
      )({
        context,
        input: { id: "automation-1" },
      }),
    ).resolves.toBeUndefined()

    expect(serviceMocks.delete).toHaveBeenCalledWith({
      workspaceId: "workspace-token",
      id: "automation-1",
    })
  })
})
