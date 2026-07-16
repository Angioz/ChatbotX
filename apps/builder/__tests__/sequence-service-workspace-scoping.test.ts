// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  sequenceDelete: vi.fn(),
  sequenceFindFirst: vi.fn(),
  sequenceUpdate: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/client")>()
  return {
    ...actual,
    db: {
      ...actual.db,
      delete: mocks.sequenceDelete,
      query: {
        ...actual.db.query,
        sequenceModel: { findFirst: mocks.sequenceFindFirst },
      },
      update: mocks.sequenceUpdate,
    },
  }
})

const { sequenceService } = await import("@chatbotx.io/business")

describe("sequenceService workspace scoping (real service, mocked db)", () => {
  beforeEach(() => {
    mocks.sequenceDelete.mockReset()
    mocks.sequenceFindFirst.mockReset()
    mocks.sequenceUpdate.mockReset()
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

  test(
    "updateSequence rejects a cross-workspace id before issuing a mutation",
    async () => {
      mocks.sequenceFindFirst.mockResolvedValue(undefined)

      await expect(
        sequenceService.updateSequence(
          { workspaceId: "own-workspace", id: "foreign-sequence" },
          { name: "Hijacked" },
        ),
      ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })

      expect(mocks.sequenceFindFirst).toHaveBeenCalledWith({
        where: { id: "foreign-sequence", workspaceId: "own-workspace" },
      })
      expect(mocks.sequenceUpdate).not.toHaveBeenCalled()
    },
  )

  test(
    "deleteSequence rejects a cross-workspace id before issuing a mutation",
    async () => {
      mocks.sequenceFindFirst.mockResolvedValue(undefined)

      await expect(
        sequenceService.deleteSequence({
          workspaceId: "own-workspace",
          id: "foreign-sequence",
        }),
      ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })

      expect(mocks.sequenceFindFirst).toHaveBeenCalledWith({
        where: { id: "foreign-sequence", workspaceId: "own-workspace" },
      })
      expect(mocks.sequenceDelete).not.toHaveBeenCalled()
    },
  )
})
