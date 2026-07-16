import { describe, expect, test } from "vitest"
import { flowResource } from "@/features/flows/schemas/resource"

describe("flowResource", () => {
  test("accepts timestamps from a JSON-roundtripped flow", () => {
    const flow = {
      id: "1",
      createdAt: new Date("2026-07-16T10:00:00.000Z"),
      updatedAt: new Date("2026-07-16T11:00:00.000Z"),
      name: "Welcome",
      active: true,
      enableInInbox: true,
      currentVersionId: null,
      draftVersionId: null,
      workspaceId: "1",
      folderId: null,
    }
    const cachedFlow = JSON.parse(JSON.stringify(flow))

    const result = flowResource.safeParse(cachedFlow)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date)
      expect(result.data.updatedAt).toBeInstanceOf(Date)
    }
  })
})
