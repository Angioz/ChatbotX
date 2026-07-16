import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { assertWebhookUrlIsSafe } = await import("../../src/webhook/ssrf")

const dohJsonResponse = (records: { type: number; data: string }[]) =>
  new Response(JSON.stringify({ Answer: records }), {
    status: 200,
    headers: { "content-type": "application/dns-json" },
  })

const A_RECORD = 1

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("assertWebhookUrlIsSafe", () => {
  test.each([
    ["loopback literal", "http://127.0.0.1/deliver"],
    ["localhost hostname", "https://localhost/deliver"],
    ["cloud metadata IP", "http://169.254.169.254/latest/meta-data"],
    ["private 10.x IP", "https://10.1.2.3/deliver"],
    ["Tailscale CGNAT IP (VPS: 100.119.75.28)", "https://100.119.75.28/deliver"],
    ["non-http(s) scheme", "ftp://x/deliver"],
  ])("rejects %s (%s) with a 422 invalidRequestData exception", async (_label, url) => {
    await expect(assertWebhookUrlIsSafe(url)).rejects.toMatchObject({
      code: "invalidRequestData",
      httpStatusCode: 422,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("rejects a bare internal hostname with no scheme", async () => {
    await expect(
      assertWebhookUrlIsSafe("internal-service.local"),
    ).rejects.toMatchObject({ code: "invalidRequestData", httpStatusCode: 422 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("accepts a normal public https URL", async () => {
    fetchMock.mockResolvedValue(
      dohJsonResponse([{ type: A_RECORD, data: "93.184.216.34" }]),
    )

    await expect(
      assertWebhookUrlIsSafe("https://example.com/deliver"),
    ).resolves.toBeUndefined()
  })
})
