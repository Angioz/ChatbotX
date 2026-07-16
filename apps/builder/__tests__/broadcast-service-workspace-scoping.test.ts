// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  broadcastFindFirst: vi.fn(),
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
        broadcastModel: { findFirst: mocks.broadcastFindFirst },
      },
    },
  }
})

const { broadcastService } = await import("@chatbotx.io/business")

describe("broadcastService workspace scoping (real service, mocked db)", () => {
  beforeEach(() => {
    mocks.broadcastFindFirst.mockReset()
  })

  test("getBroadcast throws NOT_FOUND for a cross-workspace id instead of leaking the row", async () => {
    // The broadcast exists in the DB but under a different workspace, so the
    // scoped lookup finds nothing — this is what a cached/foreign id looks
    // like from the caller's side.
    mocks.broadcastFindFirst.mockResolvedValue(undefined)

    await expect(
      broadcastService.getBroadcast({
        workspaceId: "own-workspace",
        id: "foreign-broadcast",
      }),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })

    expect(mocks.broadcastFindFirst).toHaveBeenCalledWith({
      where: { id: "foreign-broadcast", workspaceId: "own-workspace" },
    })
  })

  test("updateBroadcast throws NOT_FOUND for a cross-workspace id instead of silently succeeding", async () => {
    mocks.broadcastFindFirst.mockResolvedValue(undefined)

    await expect(
      broadcastService.updateBroadcast(
        { workspaceId: "own-workspace", id: "foreign-broadcast" },
        { name: "Hijacked" },
      ),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })

    expect(mocks.broadcastFindFirst).toHaveBeenCalledWith({
      where: { id: "foreign-broadcast", workspaceId: "own-workspace" },
    })
  })

  test("deleteBroadcast throws NOT_FOUND for a cross-workspace id instead of silently succeeding", async () => {
    mocks.broadcastFindFirst.mockResolvedValue(undefined)

    await expect(
      broadcastService.deleteBroadcast({
        workspaceId: "own-workspace",
        id: "foreign-broadcast",
      }),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })

    expect(mocks.broadcastFindFirst).toHaveBeenCalledWith({
      where: { id: "foreign-broadcast", workspaceId: "own-workspace" },
    })
  })
})
