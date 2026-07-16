import { beforeEach, describe, expect, test, vi } from "vitest"

const { countMock, findFirstMock, findManyMock, relationsFilterToSQLMock } =
  vi.hoisted(() => ({
    countMock: vi.fn(),
    findFirstMock: vi.fn(),
    findManyMock: vi.fn(),
    relationsFilterToSQLMock: vi.fn(),
  }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    $count: countMock,
    query: {
      errorLogModel: {
        findFirst: findFirstMock,
        findMany: findManyMock,
      },
    },
  },
  relationsFilterToSQL: relationsFilterToSQLMock,
}))

const { getErrorLogHealth, listErrorLogs } = await import(
  "@/features/error-logs/queries"
)

describe("error log queries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    countMock.mockResolvedValue(0)
    findFirstMock.mockResolvedValue(undefined)
    findManyMock.mockResolvedValue([])
  })

  test("lists a workspace's error logs without requiring a session", async () => {
    await expect(
      listErrorLogs({
        page: 1,
        perPage: 10,
        workspaceId: "workspace-token",
      }),
    ).resolves.toEqual({ data: [], pageCount: 0 })

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "workspace-token" },
      }),
    )
  })

  test("reads a workspace's health without requiring a session", async () => {
    await expect(
      getErrorLogHealth({
        windowMinutes: 60,
        workspaceId: "workspace-token",
      }),
    ).resolves.toEqual({
      windowMinutes: 60,
      errorCount: 0,
      lastErrorAt: null,
      healthy: true,
    })

    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "workspace-token" }),
      }),
    )
  })
})
