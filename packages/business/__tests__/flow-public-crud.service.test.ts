// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockAnd,
  mockCreateId,
  mockDbTransaction,
  mockEq,
  mockFindDraft,
  mockFlowFindFirst,
  mockFolderEnsureExists,
  mockInsert,
  mockInsertReturning,
  mockInsertValues,
  mockInvalidateList,
  mockUpdate,
  mockUpdateReturning,
  mockUpdateSet,
  mockUpdateWhere,
} = vi.hoisted(() => {
  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn()
  const mockInsert = vi.fn()
  const mockUpdateReturning = vi.fn()
  const mockUpdateWhere = vi.fn()
  const mockUpdateSet = vi.fn()
  const mockUpdate = vi.fn()

  return {
    mockAnd: vi.fn((...conditions) => ({ conditions })),
    mockCreateId: vi.fn(),
    mockDbTransaction: vi.fn(),
    mockEq: vi.fn((column, value) => ({ column, value })),
    mockFindDraft: vi.fn(),
    mockFlowFindFirst: vi.fn(),
    mockFolderEnsureExists: vi.fn(),
    mockInsert,
    mockInsertReturning,
    mockInsertValues,
    mockInvalidateList: vi.fn(),
    mockUpdate,
    mockUpdateReturning,
    mockUpdateSet,
    mockUpdateWhere,
  }
})

const flowModel = {
  table: "flow",
  id: "flow.id",
  workspaceId: "flow.workspaceId",
}
const flowAnalyticsSessionModel = { table: "analytics" }
const flowVersionModel = {
  table: "version",
  id: "version.id",
  flowId: "version.flowId",
  workspaceId: "version.workspaceId",
  isDraft: "version.isDraft",
  isLatest: "version.isLatest",
}

const client = {
  query: {
    flowModel: {
      findFirst: mockFlowFindFirst,
    },
  },
  insert: mockInsert,
  update: mockUpdate,
}

vi.mock("@chatbotx.io/database/client", () => ({
  and: mockAnd,
  db: {
    ...client,
    transaction: mockDbTransaction,
  },
  eq: mockEq,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowAnalyticsSessionModel,
  flowModel,
  flowVersionModel,
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mockCreateId,
}))

vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {},
}))

vi.mock("../src/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("../src/flow-version", () => ({
  flowVersionService: {
    findDraft: mockFindDraft,
    invalidateList: mockInvalidateList,
  },
}))

vi.mock("../src/folder", () => ({
  folderService: {
    ensureExists: mockFolderEnsureExists,
  },
}))

const { flowService } = await import("../src/flow/service")

describe("flowService public CRUD methods", () => {
  beforeEach(() => {
    mockDbTransaction.mockImplementation(async (callback) => callback(client))
    mockInsert.mockImplementation(() => ({ values: mockInsertValues }))
    mockInsertValues.mockImplementation(() => ({
      returning: mockInsertReturning,
    }))
    mockUpdate.mockImplementation(() => ({ set: mockUpdateSet }))
    mockUpdateSet.mockImplementation(() => ({ where: mockUpdateWhere }))
    mockUpdateWhere.mockImplementation(() => ({
      returning: mockUpdateReturning,
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test("getFlow hides a flow outside the requested workspace", async () => {
    mockFlowFindFirst.mockResolvedValue(undefined)

    await expect(
      flowService.getFlow({ workspaceId: "workspace-a", id: "flow-b" }),
    ).rejects.toThrow("Flow not found")

    expect(mockFlowFindFirst).toHaveBeenCalledWith({
      where: { id: "flow-b", workspaceId: "workspace-a" },
    })
  })

  test("createFlow validates the workspace folder and creates the default draft transactionally", async () => {
    const flow = {
      id: "flow-1",
      workspaceId: "workspace-a",
      folderId: "folder-1",
      name: "Welcome",
    }
    mockInsertReturning.mockResolvedValue([flow])
    mockCreateId
      .mockReturnValueOnce("node-1")
      .mockReturnValueOnce("choose-channel-1")
      .mockReturnValueOnce("flow-1")
      .mockReturnValueOnce("analytics-1")
      .mockReturnValueOnce("version-1")

    await expect(
      flowService.createFlow("workspace-a", {
        folderId: "folder-1",
        name: "Welcome",
      }),
    ).resolves.toBe(flow)

    expect(mockFolderEnsureExists).toHaveBeenCalledWith({
      id: "folder-1",
      workspaceId: "workspace-a",
      folderType: "flow",
      tx: undefined,
    })
    expect(mockDbTransaction).toHaveBeenCalledTimes(1)
    expect(mockInsertValues).toHaveBeenNthCalledWith(1, {
      folderId: "folder-1",
      id: "flow-1",
      name: "Welcome",
      workspaceId: "workspace-a",
    })
    expect(mockInsertValues).toHaveBeenNthCalledWith(2, {
      id: "analytics-1",
      workspaceId: "workspace-a",
      flowId: "flow-1",
    })
    expect(mockInsertValues).toHaveBeenNthCalledWith(3, {
      id: "version-1",
      workspaceId: "workspace-a",
      flowId: "flow-1",
      nodes: [
        {
          id: "node-1",
          position: { x: 100, y: 300 },
          measured: { width: 288, height: 100 },
          type: "sendMessage",
          data: {
            name: "Send Message #1",
            isStartNode: true,
            details: {
              beforeStep: {
                id: "choose-channel-1",
                stepType: "chooseChannel",
                channel: "omnichannel",
              },
              steps: [],
              quickReplies: [],
            },
          },
        },
      ],
      edges: [],
      isDraft: true,
      startNodeId: "node-1",
    })
  })

  test("updateFlow scopes both lookup and mutation to the workspace", async () => {
    const original = {
      id: "flow-1",
      workspaceId: "workspace-a",
      name: "Before",
    }
    const updated = { ...original, name: "After" }
    mockFlowFindFirst.mockResolvedValue(original)
    mockUpdateReturning.mockResolvedValue([updated])

    await expect(
      flowService.updateFlow(
        { workspaceId: "workspace-a", id: "flow-1" },
        { name: "After" },
      ),
    ).resolves.toBe(updated)

    expect(mockFlowFindFirst).toHaveBeenCalledWith({
      where: { id: "flow-1", workspaceId: "workspace-a" },
    })
    expect(mockEq).toHaveBeenCalledWith(flowModel.id, "flow-1")
    expect(mockEq).toHaveBeenCalledWith(flowModel.workspaceId, "workspace-a")
  })

  test("publishFlow returns not found without mutating for another workspace", async () => {
    mockFlowFindFirst.mockResolvedValue(undefined)

    await expect(
      flowService.publishFlow(
        { workspaceId: "workspace-a", id: "flow-b" },
        { nodes: [], edges: [] },
      ),
    ).rejects.toThrow("Flow not found")

    expect(mockFlowFindFirst).toHaveBeenCalledWith({
      where: { id: "flow-b", workspaceId: "workspace-a" },
      with: {
        flowVersions: {
          where: { workspaceId: "workspace-a", isDraft: true },
        },
      },
    })
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockInvalidateList).not.toHaveBeenCalled()
  })

  test("publishFlow scopes every update and invalidates the version cache", async () => {
    mockFlowFindFirst.mockResolvedValue({
      id: "flow-1",
      workspaceId: "workspace-a",
      flowVersions: [{ id: "draft-1", startNodeId: "node-1" }],
    })
    mockCreateId.mockReturnValue("published-1")
    const data = {
      nodes: [{ id: "node-1" }],
      edges: [{ id: "edge-1" }],
    }

    await flowService.publishFlow(
      { workspaceId: "workspace-a", id: "flow-1" },
      data,
    )

    expect(mockEq).toHaveBeenCalledWith(
      flowVersionModel.workspaceId,
      "workspace-a",
    )
    expect(mockEq).toHaveBeenCalledWith(flowModel.workspaceId, "workspace-a")
    expect(mockInsertValues).toHaveBeenCalledWith({
      id: "published-1",
      workspaceId: "workspace-a",
      flowId: "flow-1",
      isDraft: false,
      isLatest: true,
      ...data,
      startNodeId: "node-1",
    })
    expect(mockInvalidateList).toHaveBeenCalledWith("flow-1")
  })
})
