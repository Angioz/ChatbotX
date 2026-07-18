import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: mocks.insert,
  },
  and: vi.fn((...args) => ({ and: args })),
  eq: vi.fn((column, value) => ({ column, value })),
  ne: vi.fn((column, value) => ({ ne: column, value })),
  relationsFilterToSQL: vi.fn((_, where) => where),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  fbCommentAutomationModel: { id: "id" },
  fbCommentAutomationReplyModel: { id: "id" },
  contactInboxModel: { id: "id" },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "0",
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "generated-id"),
}))

vi.mock("../../ai-agent/service", () => ({
  aiAgentService: { findBy: vi.fn() },
}))

vi.mock("../../flow/service", () => ({
  flowService: { exists: vi.fn() },
}))

const { fbCommentAutomationService } = await import("../service")

const baseInput = {
  name: "Test automation",
  post: { type: "all" as const, value: [] },
  privateReply: { type: "none" as const, value: null },
  publicReply: { type: "none" as const, value: null },
  includeKeywords: { type: "all" as const, value: [] },
  excludeKeywords: [],
  options: {} as never,
  hideComments: {} as never,
  replyAfter: {} as never,
}

beforeEach(() => {
  mocks.insert.mockReset()
  mocks.insertValues.mockReset()
  mocks.insertReturning.mockReset()

  mocks.insert.mockReturnValue({
    values: mocks.insertValues.mockReturnValue({
      returning: mocks.insertReturning,
    }),
  })
})

describe("FbCommentAutomationService.create", () => {
  test("persists the requested type when provided (instagram)", async () => {
    mocks.insertReturning.mockResolvedValue([
      { ...baseInput, id: "generated-id", workspaceId: "ws-1", type: "instagram" },
    ])

    await fbCommentAutomationService.create("ws-1", {
      ...baseInput,
      type: "instagram",
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ type: "instagram" }),
    )
  })

  test("does not force type when omitted (DB default handles messenger)", async () => {
    mocks.insertReturning.mockResolvedValue([
      { ...baseInput, id: "generated-id", workspaceId: "ws-1" },
    ])

    await fbCommentAutomationService.create("ws-1", { ...baseInput })

    const insertedValues = mocks.insertValues.mock.calls[0]?.[0]
    expect(insertedValues).not.toHaveProperty("type")
  })
})
