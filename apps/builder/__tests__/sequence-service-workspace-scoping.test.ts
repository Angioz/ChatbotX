// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  sequenceFindFirst: vi.fn(),
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
        sequenceModel: { findFirst: mocks.sequenceFindFirst },
      },
    },
  }
})

const { sequenceService } = await import("@chatbotx.io/business")

describe("sequenceService workspace scoping (real service, mocked db)", () => {
  beforeEach(() => {
    mocks.sequenceFindFirst.mockReset()
  })

  test("findOrFail throws NOT_FOUND for a cross-workspace id instead of silently succeeding", async () => {
    // Simulates the cached/foreign-id scenario the update/delete API handlers must
    // reject: the sequence exists in the DB but under a different workspace, so
    // the scoped lookup inside findOrFail (called before both updateSequence()
    // and deleteSequence()) finds nothing.
    mocks.sequenceFindFirst.mockResolvedValue(undefined)

    await expect(
      sequenceService.findOrFail({
        workspaceId: "own-workspace",
        id: "foreign-sequence",
      }),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })

    expect(mocks.sequenceFindFirst).toHaveBeenCalledWith({
      where: { id: "foreign-sequence", workspaceId: "own-workspace" },
    })
  })

  test("findBy returns undefined for an id that belongs to another workspace", async () => {
    mocks.sequenceFindFirst.mockResolvedValue(undefined)

    const result = await sequenceService.findBy({
      workspaceId: "own-workspace",
      id: "foreign-sequence",
    })

    expect(result).toBeUndefined()
  })
})
