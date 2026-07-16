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

const { procedures, queryMocks, serviceMocks } = vi.hoisted(() => ({
  procedures: [] as ProcedureRecord[],
  queryMocks: {
    getSequence: vi.fn(),
    listSequences: vi.fn(),
  },
  serviceMocks: {
    createSequence: vi.fn(),
    deleteSequence: vi.fn(),
    updateSequence: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  sequenceService: serviceMocks,
}))

vi.mock("@/features/sequences/queries", () => queryMocks)

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

await import("@/features/sequences/api/workspace-token")

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

describe("sequences workspace-token API", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("create returns the row created in the token workspace", async () => {
    const sequence = { id: "sequence-1", name: "Welcome series" }
    serviceMocks.createSequence.mockResolvedValue(sequence)

    await expect(
      getHandler(
        "POST",
        "/v1/sequences",
      )({
        context,
        input: { name: "Welcome series", folderId: null },
      }),
    ).resolves.toBe(sequence)

    expect(serviceMocks.createSequence).toHaveBeenCalledWith("workspace-a", {
      name: "Welcome series",
      folderId: null,
    })
  })

  test("update changes fields through an id scoped to the token workspace", async () => {
    const updated = { id: "sequence-1", active: false }
    serviceMocks.updateSequence.mockResolvedValue(updated)

    await expect(
      getHandler(
        "PUT",
        "/v1/sequences/{id}",
      )({
        context,
        input: { id: "sequence-1", active: false },
      }),
    ).resolves.toBe(updated)

    expect(serviceMocks.updateSequence).toHaveBeenCalledWith(
      { workspaceId: "workspace-a", id: "sequence-1" },
      { active: false },
    )
  })

  test("update propagates rejection for a cross-workspace id", async () => {
    serviceMocks.updateSequence.mockRejectedValue(
      new Error("Sequence not found"),
    )

    await expect(
      getHandler(
        "PUT",
        "/v1/sequences/{id}",
      )({
        context,
        input: { id: "foreign-sequence", active: false },
      }),
    ).rejects.toThrow("Sequence not found")

    expect(serviceMocks.updateSequence).toHaveBeenCalledWith(
      { workspaceId: "workspace-a", id: "foreign-sequence" },
      { active: false },
    )
  })

  test("delete calls the scoped mutation for an owned sequence", async () => {
    serviceMocks.deleteSequence.mockResolvedValue(undefined)

    await expect(
      getHandler(
        "DELETE",
        "/v1/sequences/{id}",
      )({
        context,
        input: { id: "sequence-1" },
      }),
    ).resolves.toBeUndefined()

    expect(serviceMocks.deleteSequence).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      id: "sequence-1",
    })
  })
})
