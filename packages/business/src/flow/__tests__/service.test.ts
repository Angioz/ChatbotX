import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  flowModelFindFirst: vi.fn(),
  flowVersionModelFindFirst: vi.fn(),
  ensureExists: vi.fn(),
  findDraft: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      flowModel: { findFirst: mocks.flowModelFindFirst },
      flowVersionModel: { findFirst: mocks.flowVersionModelFindFirst },
    },
    transaction: mocks.transaction,
  },
  and: vi.fn((...args) => ({ and: args })),
  eq: vi.fn((column, value) => ({ column, value })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowModel: { id: "id" },
  flowAnalyticsSessionModel: { id: "id" },
  flowVersionModel: { id: "id" },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "generated-id"),
}))

vi.mock("../../folder", () => ({
  folderService: { ensureExists: mocks.ensureExists },
}))

vi.mock("../../flow-version", () => ({
  flowVersionService: {
    findDraft: mocks.findDraft,
    invalidateList: vi.fn(),
  },
}))

const { flowService } = await import("../service")

beforeEach(() => {
  mocks.transaction.mockReset()
  mocks.insert.mockReset()
  mocks.insertValues.mockReset()
  mocks.insertReturning.mockReset()
  mocks.flowModelFindFirst.mockReset()
  mocks.flowVersionModelFindFirst.mockReset()
  mocks.ensureExists.mockReset()
  mocks.findDraft.mockReset()

  mocks.insert.mockReturnValue({
    values: mocks.insertValues.mockReturnValue({
      returning: mocks.insertReturning,
    }),
  })

  mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ insert: mocks.insert }),
  )
})

describe("FlowService.createFlow", () => {
  test("creates a root-level flow when folderId is omitted", async () => {
    mocks.insertReturning.mockResolvedValue([
      { id: "generated-id", name: "Root flow", folderId: null },
    ])

    await flowService.createFlow("ws-1", { name: "Root flow" })

    expect(mocks.ensureExists).not.toHaveBeenCalled()
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: null }),
    )
  })

  test("creates a root-level flow when folderId is explicitly null", async () => {
    mocks.insertReturning.mockResolvedValue([
      { id: "generated-id", name: "Root flow", folderId: null },
    ])

    await flowService.createFlow("ws-1", { name: "Root flow", folderId: null })

    expect(mocks.ensureExists).not.toHaveBeenCalled()
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: null }),
    )
  })

  test("still validates and persists folderId when provided", async () => {
    mocks.ensureExists.mockResolvedValue(undefined)
    mocks.insertReturning.mockResolvedValue([
      { id: "generated-id", name: "Nested flow", folderId: "42" },
    ])

    await flowService.createFlow("ws-1", {
      name: "Nested flow",
      folderId: "42",
    })

    expect(mocks.ensureExists).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "42",
        workspaceId: "ws-1",
        folderType: "flow",
      }),
    )
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: "42" }),
    )
  })
})

describe("FlowService.getFlowWithGraph", () => {
  test("returns published nodes/edges and draft graph when both exist", async () => {
    mocks.flowModelFindFirst.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      currentVersionId: "version-published",
    })
    mocks.flowVersionModelFindFirst.mockResolvedValue({
      id: "version-published",
      nodes: [{ id: "n1" }],
      edges: [{ id: "e1" }],
    })
    mocks.findDraft.mockResolvedValue({
      id: "version-draft",
      nodes: [{ id: "draft-n1" }],
      edges: [{ id: "draft-e1" }],
    })

    const result = await flowService.getFlowWithGraph({
      workspaceId: "ws-1",
      id: "flow-1",
    })

    expect(result.nodes).toEqual([{ id: "n1" }])
    expect(result.edges).toEqual([{ id: "e1" }])
    expect(result.draft).toEqual({
      nodes: [{ id: "draft-n1" }],
      edges: [{ id: "draft-e1" }],
    })
  })

  test("returns null graph fields when the flow has never been published", async () => {
    mocks.flowModelFindFirst.mockResolvedValue({
      id: "flow-2",
      workspaceId: "ws-1",
      currentVersionId: null,
    })
    mocks.findDraft.mockResolvedValue(undefined)

    const result = await flowService.getFlowWithGraph({
      workspaceId: "ws-1",
      id: "flow-2",
    })

    expect(result.nodes).toBeNull()
    expect(result.edges).toBeNull()
    expect(result.draft).toBeNull()
    expect(mocks.flowVersionModelFindFirst).not.toHaveBeenCalled()
  })
})
