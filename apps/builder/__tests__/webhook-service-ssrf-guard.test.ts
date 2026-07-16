// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  webhookFindFirst: vi.fn(),
  transaction: vi.fn(),
  updateWebhookCache: vi.fn(),
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
        webhookModel: { findFirst: mocks.webhookFindFirst },
      },
      transaction: mocks.transaction,
    },
  }
})

vi.mock("@chatbotx.io/events", () => ({
  removeWebhookCache: vi.fn(),
  updateWebhookCache: mocks.updateWebhookCache,
}))

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  mocks.webhookFindFirst.mockReset()
  mocks.transaction.mockReset()
  mocks.updateWebhookCache.mockReset()
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

const { webhookService } = await import(
  "../../../packages/business/src/webhook/service"
)

describe("webhookService.updateWebhook SSRF guard", () => {
  test("rejects an unsafe url with a 422 before touching the database", async () => {
    await expect(
      webhookService.updateWebhook(
        { workspaceId: "own-workspace", id: "webhook-1" },
        { url: "http://169.254.169.254/latest/meta-data", conditions: [] },
      ),
    ).rejects.toMatchObject({ code: "invalidRequestData", httpStatusCode: 422 })

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.webhookFindFirst).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("proceeds to the transaction for a safe public url", async () => {
    const record = { id: "webhook-1", workspaceId: "own-workspace", url: "" }
    mocks.webhookFindFirst.mockResolvedValue(record)
    mocks.transaction.mockImplementation(
      async (cb: (tx: unknown) => unknown) => cb({}),
    )

    // The transaction body itself is exercised by the pre-existing webhook
    // service tests; this only asserts the guard lets a safe literal-IP url
    // reach the transaction instead of short-circuiting with a 422.
    await webhookService
      .updateWebhook(
        { workspaceId: "own-workspace", id: "webhook-1" },
        { url: "https://93.184.216.34/deliver", conditions: [] },
      )
      .catch(() => undefined)

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
