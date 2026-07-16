// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  automatedResponseFindFirst: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/client")>()
  return {
    ...actual,
    db: {
      ...actual.db,
      query: {
        ...actual.db.query,
        automatedResponseModel: { findFirst: mocks.automatedResponseFindFirst },
      },
    },
  }
})

const { automatedResponseService } = await import("@chatbotx.io/business")

describe("automatedResponseService workspace scoping (real service, mocked db)", () => {
  beforeEach(() => {
    mocks.automatedResponseFindFirst.mockReset()
  })

  test("findOrFail throws NOT_FOUND for a cross-workspace id instead of silently succeeding", async () => {
    // Simulates the cached/foreign-id scenario the update/delete API handlers must
    // reject: the keyword exists in the DB but under a different workspace, so the
    // scoped lookup inside findOrFail (called before both update() and deleteMany())
    // finds nothing.
    mocks.automatedResponseFindFirst.mockResolvedValue(undefined)

    await expect(
      automatedResponseService.findOrFail({
        workspaceId: "own-workspace",
        id: "foreign-keyword",
      }),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })

    expect(mocks.automatedResponseFindFirst).toHaveBeenCalledWith({
      where: { workspaceId: "own-workspace", id: "foreign-keyword" },
    })
  })

  test("findBy returns undefined for an id that belongs to another workspace", async () => {
    mocks.automatedResponseFindFirst.mockResolvedValue(undefined)

    const result = await automatedResponseService.findBy({
      workspaceId: "own-workspace",
      id: "foreign-keyword",
    })

    expect(result).toBeUndefined()
  })
})
