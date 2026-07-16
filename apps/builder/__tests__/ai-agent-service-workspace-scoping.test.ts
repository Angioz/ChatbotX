// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set: updateSet })

  return {
    aiAgentFindFirst: vi.fn(),
    updateWhere,
    updateSet,
    update,
    transaction: vi.fn(async (cb: (tx: { update: typeof update }) => unknown) =>
      cb({ update }),
    ),
  }
})

vi.mock("@chatbotx.io/database/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/client")>()
  return {
    ...actual,
    // Fake identity trackers (not real drizzle SQL builders) so the test can
    // assert exactly which columns the mutating UPDATE's WHERE scopes by,
    // mirroring the pattern in update-sequence.action.test.ts.
    eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
    and: (...args: unknown[]) => ({ and: args }),
    db: {
      ...actual.db,
      query: {
        ...actual.db.query,
        aiAgentModel: { findFirst: mocks.aiAgentFindFirst },
      },
      transaction: mocks.transaction,
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

const { aiAgentService } = await import("@chatbotx.io/business")

describe("aiAgentService workspace scoping (real service, mocked db)", () => {
  beforeEach(() => {
    mocks.aiAgentFindFirst.mockReset()
    mocks.update.mockClear()
    mocks.updateSet.mockClear()
    mocks.updateWhere.mockClear()
    mocks.transaction.mockClear()
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

  test("updateAIAgent scopes the mutating UPDATE by both id AND workspaceId (TOCTOU hardening)", async () => {
    // The pre-check passes (agent exists in the caller's own workspace) —
    // this test asserts the transaction's WHERE clause itself, which is the
    // actual gap: a stale/forged id must not survive to the UPDATE.
    mocks.aiAgentFindFirst.mockResolvedValue({
      id: "own-agent",
      workspaceId: "own-workspace",
    })

    await aiAgentService.updateAIAgent(
      { workspaceId: "own-workspace", id: "own-agent" },
      { name: "Renamed" },
    )

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledTimes(1)

    const whereArg = mocks.updateWhere.mock.calls[0]?.[0] as {
      and: Array<{ eq: [{ name: string }, string] }>
    }
    expect(whereArg.and).toHaveLength(2)
    expect(whereArg.and[0]?.eq[1]).toBe("own-agent")
    expect(whereArg.and[1]?.eq[1]).toBe("own-workspace")
  })
})
