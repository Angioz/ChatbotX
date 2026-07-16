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

const { automatedResponseServiceMocks, flowServiceMocks, folderServiceMocks, procedures } =
  vi.hoisted(() => ({
    automatedResponseServiceMocks: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findOrFail: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
    },
    flowServiceMocks: {
      exists: vi.fn(),
    },
    folderServiceMocks: {
      ensureExists: vi.fn(),
    },
    procedures: [] as ProcedureRecord[],
  }))

vi.mock("@chatbotx.io/business", () => ({
  automatedResponseService: automatedResponseServiceMocks,
  flowService: flowServiceMocks,
  folderService: folderServiceMocks,
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

await import("@/features/automated-response/api/workspace-token")

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

describe("keywords workspace-token API", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("create rejects when folderId does not resolve in this workspace", async () => {
    folderServiceMocks.ensureExists.mockRejectedValue(
      new Error("Folder not found"),
    )

    await expect(
      getHandler(
        "POST",
        "/v1/keywords",
      )({
        context,
        input: {
          folderId: "other-workspace-folder",
          keywords: [{ value: "hello" }],
          flowId: null,
          text: "Hi there!",
        },
      }),
    ).rejects.toThrow("Folder not found")

    expect(folderServiceMocks.ensureExists).toHaveBeenCalledWith({
      id: "other-workspace-folder",
      workspaceId: "workspace-a",
      folderType: "automatedResponse",
    })
    expect(automatedResponseServiceMocks.create).not.toHaveBeenCalled()
  })

  test("create with a valid folderId scopes ensureExists to the token workspace", async () => {
    const keyword = { id: "1" }
    folderServiceMocks.ensureExists.mockResolvedValue(undefined)
    automatedResponseServiceMocks.create.mockResolvedValue(keyword)

    await expect(
      getHandler(
        "POST",
        "/v1/keywords",
      )({
        context,
        input: {
          folderId: "folder-1",
          keywords: [{ value: "hello" }],
          flowId: null,
          text: "Hi there!",
        },
      }),
    ).resolves.toBe(keyword)

    expect(folderServiceMocks.ensureExists).toHaveBeenCalledWith({
      id: "folder-1",
      workspaceId: "workspace-a",
      folderType: "automatedResponse",
    })
  })

  test("create prefers flowId over text when both are supplied", async () => {
    flowServiceMocks.exists.mockResolvedValue(true)
    automatedResponseServiceMocks.create.mockResolvedValue({ id: "1" })

    await getHandler(
      "POST",
      "/v1/keywords",
    )({
      context,
      input: {
        folderId: null,
        keywords: [{ value: "hello" }],
        flowId: "flow-1",
        text: "Hi there!",
      },
    })

    expect(automatedResponseServiceMocks.create).toHaveBeenCalledWith(
      "workspace-a",
      {
        text: undefined,
        flowId: "flow-1",
        folderId: null,
        keywords: ["hello"],
      },
    )
  })

  test("create rejects an unknown flowId", async () => {
    flowServiceMocks.exists.mockResolvedValue(false)

    await expect(
      getHandler(
        "POST",
        "/v1/keywords",
      )({
        context,
        input: {
          folderId: null,
          keywords: [{ value: "hello" }],
          flowId: "missing-flow",
          text: null,
        },
      }),
    ).rejects.toThrow("Flow not found")

    expect(automatedResponseServiceMocks.create).not.toHaveBeenCalled()
  })

  test("create falls back to text-only when no flowId is supplied", async () => {
    automatedResponseServiceMocks.create.mockResolvedValue({ id: "1" })

    await getHandler(
      "POST",
      "/v1/keywords",
    )({
      context,
      input: {
        folderId: null,
        keywords: [{ value: "hello" }],
        flowId: null,
        text: "Hi there!",
      },
    })

    expect(flowServiceMocks.exists).not.toHaveBeenCalled()
    expect(automatedResponseServiceMocks.create).toHaveBeenCalledWith(
      "workspace-a",
      {
        text: "Hi there!",
        flowId: undefined,
        folderId: null,
        keywords: ["hello"],
      },
    )
  })

  test("update rejects when folderId does not resolve in this workspace", async () => {
    automatedResponseServiceMocks.findOrFail.mockResolvedValue({ id: "1" })
    folderServiceMocks.ensureExists.mockRejectedValue(
      new Error("Folder not found"),
    )

    await expect(
      getHandler(
        "PUT",
        "/v1/keywords/{id}",
      )({
        context,
        input: {
          id: "1",
          folderId: "other-workspace-folder",
          keywords: [{ value: "hello" }],
          flowId: null,
          text: "Hi there!",
        },
      }),
    ).rejects.toThrow("Folder not found")

    expect(automatedResponseServiceMocks.findOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      id: "1",
    })
    expect(folderServiceMocks.ensureExists).toHaveBeenCalledWith({
      id: "other-workspace-folder",
      workspaceId: "workspace-a",
      folderType: "automatedResponse",
    })
    expect(automatedResponseServiceMocks.update).not.toHaveBeenCalled()
  })

  test("update with a valid folderId scopes ensureExists to the token workspace", async () => {
    automatedResponseServiceMocks.findOrFail.mockResolvedValue({ id: "1" })
    folderServiceMocks.ensureExists.mockResolvedValue(undefined)
    const updated = { id: "1" }
    automatedResponseServiceMocks.update.mockResolvedValue(updated)

    await expect(
      getHandler(
        "PUT",
        "/v1/keywords/{id}",
      )({
        context,
        input: {
          id: "1",
          folderId: "folder-1",
          keywords: [{ value: "hello" }],
          flowId: null,
          text: "Hi there!",
        },
      }),
    ).resolves.toBe(updated)

    expect(folderServiceMocks.ensureExists).toHaveBeenCalledWith({
      id: "folder-1",
      workspaceId: "workspace-a",
      folderType: "automatedResponse",
    })
  })

  test("update clears flowId when text is supplied", async () => {
    automatedResponseServiceMocks.findOrFail.mockResolvedValue({ id: "1" })
    automatedResponseServiceMocks.update.mockResolvedValue({ id: "1" })

    await getHandler(
      "PUT",
      "/v1/keywords/{id}",
    )({
      context,
      input: {
        id: "1",
        folderId: null,
        keywords: [{ value: "hello" }],
        flowId: "flow-1",
        text: "Hi there!",
      },
    })

    expect(flowServiceMocks.exists).not.toHaveBeenCalled()
    expect(automatedResponseServiceMocks.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-a", id: "1" },
      {
        folderId: null,
        keywords: [{ value: "hello" }],
        flowId: undefined,
        text: "Hi there!",
      },
    )
  })

  test("update rejects an unknown flowId and does not persist", async () => {
    automatedResponseServiceMocks.findOrFail.mockResolvedValue({ id: "1" })
    flowServiceMocks.exists.mockResolvedValue(false)

    await expect(
      getHandler(
        "PUT",
        "/v1/keywords/{id}",
      )({
        context,
        input: {
          id: "1",
          folderId: null,
          keywords: [{ value: "hello" }],
          flowId: "missing-flow",
          text: null,
        },
      }),
    ).rejects.toThrow("Flow not found")

    expect(automatedResponseServiceMocks.update).not.toHaveBeenCalled()
  })

  test("delete looks up the keyword before removing it, scoped to the token workspace", async () => {
    const callOrder: string[] = []
    automatedResponseServiceMocks.findOrFail.mockImplementation(async () => {
      callOrder.push("findOrFail")
      return { id: "1" }
    })
    automatedResponseServiceMocks.deleteMany.mockImplementation(async () => {
      callOrder.push("deleteMany")
    })

    await getHandler(
      "DELETE",
      "/v1/keywords/{id}",
    )({
      context,
      input: { id: "1" },
    })

    expect(callOrder).toEqual(["findOrFail", "deleteMany"])
    expect(automatedResponseServiceMocks.findOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      id: "1",
    })
    expect(automatedResponseServiceMocks.deleteMany).toHaveBeenCalledWith(
      "workspace-a",
      ["1"],
    )
  })
})
