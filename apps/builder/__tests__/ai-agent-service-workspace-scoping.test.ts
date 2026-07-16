// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  aiAgentFindFirst: vi.fn(),
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
        aiAgentModel: { findFirst: mocks.aiAgentFindFirst },
      },
    },
  }
})

const { aiAgentService } = await import("@chatbotx.io/business")

describe("aiAgentService workspace scoping (real service, mocked db)", () => {
  beforeEach(() => {
    mocks.aiAgentFindFirst.mockReset()
  })

  test("updateAIAgent throws NOT_FOUND for a cross-workspace id instead of silently succeeding", async () => {
    // Simulates the cached/foreign-id scenario this endpoint must reject: the
    // agent exists in the DB but under a different workspace, so the scoped
    // lookup inside updateAIAgent finds nothing.
    mocks.aiAgentFindFirst.mockResolvedValue(undefined)

    await expect(
      aiAgentService.updateAIAgent(
        { workspaceId: "own-workspace", id: "foreign-agent" },
        { name: "Hijacked" },
      ),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })

    expect(mocks.aiAgentFindFirst).toHaveBeenCalledWith({
      where: { id: "foreign-agent", workspaceId: "own-workspace" },
    })
  })

  test("findBy returns undefined for an id that belongs to another workspace", async () => {
    mocks.aiAgentFindFirst.mockResolvedValue(undefined)

    const result = await aiAgentService.findBy({
      where: { id: "foreign-agent", workspaceId: "own-workspace" },
    })

    expect(result).toBeUndefined()
  })
})
