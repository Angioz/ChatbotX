// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const insertReturning = vi.fn().mockResolvedValue([{ id: "automation-1" }])
  const insertValues = vi.fn().mockReturnValue({ returning: insertReturning })
  const insert = vi.fn().mockReturnValue({ values: insertValues })

  return {
    flowFindFirst: vi.fn(),
    aiAgentFindFirst: vi.fn(),
    insert,
    insertValues,
    insertReturning,
  }
})

vi.mock("@chatbotx.io/database/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/client")>()
  return {
    ...actual,
    eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
    and: (...args: unknown[]) => ({ and: args }),
    db: {
      ...actual.db,
      query: {
        ...actual.db.query,
        flowModel: { findFirst: mocks.flowFindFirst },
        aiAgentModel: { findFirst: mocks.aiAgentFindFirst },
      },
      insert: mocks.insert,
    },
  }
})

vi.mock("@chatbotx.io/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/redis")>()
  return {
    ...actual,
    invalidateCacheByTags: vi.fn(),
  }
})

const { fbCommentAutomationService } = await import(
  "../../../packages/business/src/fb-comment-automation/service"
)

const basePayload = {
  excludeKeywords: [] as string[],
  hideComments: {
    all: false,
    hasPhoneNumber: false,
    hasImage: false,
    hasVideo: false,
    hasLink: false,
    hasKeywords: false,
    keywords: [] as string[],
    showCommentsAfter: "none" as const,
  },
  includeKeywords: { type: "all" as const, value: [] as string[] },
  name: "Automation",
  options: {
    replyToNewContactsOnly: false,
    replyOncePerUserPerPost: false,
    likeUserComment: false,
    replyToUsersWhoCommentedOnOtherPosts: true,
    ignoreCommentReplies: true,
    trackUserTags: false,
  },
  post: { type: "all" as const, value: [] as string[] },
  replyAfter: { type: "immediately" as const, value: 0 },
}

describe("fbCommentAutomationService.create reply reference validation", () => {
  beforeEach(() => {
    mocks.flowFindFirst.mockReset()
    mocks.aiAgentFindFirst.mockReset()
    mocks.insert.mockClear()
    mocks.insertValues.mockClear()
    mocks.insertReturning.mockClear()
  })

  test("rejects a publicReply pointing at a flow that does not exist in this workspace", async () => {
    mocks.flowFindFirst.mockResolvedValue(undefined)

    await expect(
      fbCommentAutomationService.create("own-workspace", {
        ...basePayload,
        publicReply: { type: "flow", value: "foreign-flow" },
        privateReply: { type: "none", value: null },
      }),
    ).rejects.toMatchObject({ code: "invalidRequestData", httpStatusCode: 422 })

    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("rejects a privateReply pointing at an AI agent that does not exist in this workspace", async () => {
    mocks.aiAgentFindFirst.mockResolvedValue(undefined)

    await expect(
      fbCommentAutomationService.create("own-workspace", {
        ...basePayload,
        publicReply: { type: "none", value: null },
        privateReply: { type: "AIAgent", value: "foreign-agent" },
      }),
    ).rejects.toMatchObject({ code: "invalidRequestData", httpStatusCode: 422 })

    expect(mocks.aiAgentFindFirst).toHaveBeenCalledWith({
      where: { id: "foreign-agent", workspaceId: "own-workspace" },
    })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("allows text/none replies without any existence check, and inserts once references resolve", async () => {
    mocks.flowFindFirst.mockResolvedValue({ id: "own-flow" })

    await fbCommentAutomationService.create("own-workspace", {
      ...basePayload,
      publicReply: { type: "flow", value: "own-flow" },
      privateReply: { type: "text", value: "Thanks!" },
    })

    expect(mocks.aiAgentFindFirst).not.toHaveBeenCalled()
    expect(mocks.insert).toHaveBeenCalledTimes(1)
  })
})
