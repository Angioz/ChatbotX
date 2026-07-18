import { beforeEach, describe, expect, test, vi } from "vitest"

const { mocks } = vi.hoisted(() => ({
  mocks: {
    findInstagramIntegrationsByWorkspaceId: vi.fn(),
    listInstagramMedia: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  findInstagramIntegrationsByWorkspaceId:
    mocks.findInstagramIntegrationsByWorkspaceId,
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  listInstagramMedia: mocks.listInstagramMedia,
}))

const { listInstagramMediaForWorkspace, resolveInstagramMediaId } =
  await import("@/features/instagram-media/service")

const integration = (igId: string, accessToken = "tok") => ({
  auth: { metadata: { igId, version: "v21.0" }, tokens: { accessToken } },
})

const media = (id: string, permalink: string) => ({
  id,
  permalink,
  timestamp: "2026-01-01T00:00:00Z",
})

beforeEach(() => {
  mocks.findInstagramIntegrationsByWorkspaceId.mockReset()
  mocks.listInstagramMedia.mockReset()
})

describe("listInstagramMediaForWorkspace", () => {
  test("returns empty when the workspace has no instagram integration", async () => {
    mocks.findInstagramIntegrationsByWorkspaceId.mockResolvedValue([])

    const result = await listInstagramMediaForWorkspace("ws-1")

    expect(result).toEqual([])
    expect(mocks.listInstagramMedia).not.toHaveBeenCalled()
  })

  test("lists media via the IG user node for each integration", async () => {
    mocks.findInstagramIntegrationsByWorkspaceId.mockResolvedValue([
      integration("ig-100"),
    ])
    mocks.listInstagramMedia.mockResolvedValue([
      media("m1", "https://instagram.com/reel/DZk-_g9s5Vj/"),
    ])

    const result = await listInstagramMediaForWorkspace("ws-1")

    expect(mocks.listInstagramMedia).toHaveBeenCalledWith(
      expect.objectContaining({ igUserId: "ig-100" }),
    )
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("m1")
  })

  test("skips a failing integration and keeps the others (allSettled)", async () => {
    mocks.findInstagramIntegrationsByWorkspaceId.mockResolvedValue([
      integration("ig-a"),
      integration("ig-b"),
    ])
    mocks.listInstagramMedia
      .mockRejectedValueOnce(new Error("graph down"))
      .mockResolvedValueOnce([media("m2", "https://instagram.com/reel/x/")])

    const result = await listInstagramMediaForWorkspace("ws-1")

    expect(result.map((m) => m.id)).toEqual(["m2"])
  })
})

describe("resolveInstagramMediaId", () => {
  test("resolves a permalink to its media item", async () => {
    mocks.findInstagramIntegrationsByWorkspaceId.mockResolvedValue([
      integration("ig-100"),
    ])
    mocks.listInstagramMedia.mockResolvedValue([
      media("3919534619324814691", "https://www.instagram.com/reel/DZk-_g9s5Vj/"),
    ])

    const result = await resolveInstagramMediaId(
      "ws-1",
      "https://www.instagram.com/reel/DZk-_g9s5Vj/",
    )

    expect(result?.id).toBe("3919534619324814691")
  })

  test("returns null when nothing matches", async () => {
    mocks.findInstagramIntegrationsByWorkspaceId.mockResolvedValue([
      integration("ig-100"),
    ])
    mocks.listInstagramMedia.mockResolvedValue([
      media("m1", "https://instagram.com/reel/other/"),
    ])

    const result = await resolveInstagramMediaId("ws-1", "nope-nomatch")

    expect(result).toBeNull()
  })
})
