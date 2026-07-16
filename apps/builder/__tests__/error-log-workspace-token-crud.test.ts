import { describe, expect, test } from "vitest"
import {
  errorLogResource,
  type ErrorLogResource,
} from "@/features/error-logs/schemas/resource"
import {
  errorLogHealthRequest,
  errorLogHealthResponse,
  listErrorLogsRequest,
} from "@/features/error-logs/schemas/query"

describe("Error Logs read API schema roundtrip", () => {
  test("listErrorLogsRequest accepts pagination + keyword filter payload", () => {
    const result = listErrorLogsRequest.safeParse({
      page: 1,
      perPage: 10,
      keyword: "timeout",
      workspaceId: "1",
    })

    expect(result.success).toBe(true)
  })

  test("errorLogResource accepts a JSON-roundtripped cached error log (AP-CBX-006 pattern)", () => {
    const errorLog: ErrorLogResource = {
      id: "1",
      workspaceId: "1",
      contactId: null,
      action: "sendMessage",
      detail: "Upstream provider timeout",
      httpCode: "504",
      createdAt: new Date("2026-07-16T10:00:00.000Z"),
      updatedAt: new Date("2026-07-16T11:00:00.000Z"),
    }
    const cachedErrorLog = JSON.parse(JSON.stringify(errorLog))

    const result = errorLogResource.safeParse(cachedErrorLog)

    expect(result.success).toBe(true)
  })

  test("errorLogHealthRequest defaults windowMinutes to 60 when omitted", () => {
    const result = errorLogHealthRequest.safeParse({ workspaceId: "1" })

    expect(result.success).toBe(true)
    expect(result.success && result.data.windowMinutes).toBe(60)
  })

  test("errorLogHealthRequest rejects a windowMinutes above the 1440 max", () => {
    const result = errorLogHealthRequest.safeParse({
      workspaceId: "1",
      windowMinutes: 1441,
    })

    expect(result.success).toBe(false)
  })

  test("errorLogHealthResponse accepts a JSON-roundtripped healthy signal (AP-CBX-006 pattern)", () => {
    const health = {
      windowMinutes: 60,
      errorCount: 0,
      lastErrorAt: null,
      healthy: true,
    }
    const cachedHealth = JSON.parse(JSON.stringify(health))

    const result = errorLogHealthResponse.safeParse(cachedHealth)

    expect(result.success).toBe(true)
  })

  test("errorLogHealthResponse coerces a JSON-roundtripped lastErrorAt timestamp", () => {
    const health = {
      windowMinutes: 60,
      errorCount: 3,
      lastErrorAt: new Date("2026-07-16T12:00:00.000Z"),
      healthy: false,
    }
    const cachedHealth = JSON.parse(JSON.stringify(health))

    const result = errorLogHealthResponse.safeParse(cachedHealth)

    expect(result.success).toBe(true)
    expect(result.success && result.data.lastErrorAt).toBeInstanceOf(Date)
  })
})
