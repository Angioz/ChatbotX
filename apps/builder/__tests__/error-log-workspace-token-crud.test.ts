import { describe, expect, test } from "vitest"
import {
  errorLogResource,
  type ErrorLogResource,
} from "@/features/error-logs/schemas/resource"
import { listErrorLogsRequest } from "@/features/error-logs/schemas/query"

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
})
