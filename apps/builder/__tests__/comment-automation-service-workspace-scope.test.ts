import { beforeEach, describe, expect, test, vi } from "vitest"

const { findFirstMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  db: {
    query: {
      fbCommentAutomationModel: {
        findFirst: findFirstMock,
      },
    },
  },
  eq: vi.fn(),
  ne: vi.fn(),
  relationsFilterToSQL: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

const { fbCommentAutomationService } = await import(
  "../../../packages/business/src/fb-comment-automation/service"
)

describe("fbCommentAutomationService workspace scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findFirstMock.mockImplementation(
      ({ where }: { where: { id: string; workspaceId: string } }) =>
        where.id === "automation-1" && where.workspaceId === "workspace-owner"
          ? { id: "automation-1", workspaceId: "workspace-owner" }
          : undefined,
    )
  })

  test("returns NOT_FOUND when an id belongs to another workspace", async () => {
    await expect(
      fbCommentAutomationService.get({
        id: "automation-1",
        workspaceId: "workspace-attacker",
      }),
    ).rejects.toMatchObject({
      code: "notFound",
      httpStatusCode: 404,
      message: "Comment automation not found",
    })

    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        id: "automation-1",
        workspaceId: "workspace-attacker",
      },
    })
  })
})
