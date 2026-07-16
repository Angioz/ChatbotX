import { describe, expect, test } from "vitest"
import { publicBroadcastResource } from "@/features/broadcasts/schemas/resource"

describe("publicBroadcastResource", () => {
  // Unlike flows/ai-agents, broadcasts have no redis cache layer in front of
  // this endpoint (apps/builder/src/features/broadcasts/queries hits the DB
  // directly), so schedulesAt is never JSON-roundtripped before validation —
  // it stays a real Date all the way from drizzle to the output schema. This
  // asserts the schema matches that actual driver-shaped row.
  test("accepts a real driver-shaped broadcast row", () => {
    const broadcast = {
      id: "1",
      name: "Welcome broadcast",
      status: "scheduled",
      schedulesType: "future",
      schedulesAt: new Date("2026-07-16T10:00:00.000Z"),
      flowId: "2",
      contactCount: 42,
    }

    const result = publicBroadcastResource.safeParse(broadcast)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.schedulesAt).toBeInstanceOf(Date)
    }
  })
})
