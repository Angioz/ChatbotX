import { describe, expect, test } from "vitest"
import {
  createTriggerSchema,
  updateTriggerSchema,
} from "@/features/triggers/schema/mutation"
import { triggerResource } from "@/features/triggers/schema/resource"

describe("Triggers CRUD schema roundtrip", () => {
  test("createTriggerSchema accepts a payload without a folder", () => {
    const result = createTriggerSchema.safeParse({
      name: "New lead trigger",
      folderId: null,
    })

    expect(result.success).toBe(true)
  })

  test("createTriggerSchema accepts a payload with a folderId", () => {
    const result = createTriggerSchema.safeParse({
      name: "New lead trigger",
      folderId: "1",
    })

    expect(result.success).toBe(true)
  })

  test("createTriggerSchema rejects an empty name", () => {
    const result = createTriggerSchema.safeParse({
      name: "",
      folderId: null,
    })

    expect(result.success).toBe(false)
  })

  test("updateTriggerSchema accepts an empty conditions/actions payload", () => {
    const result = updateTriggerSchema.safeParse({
      conditions: [],
      actions: [],
    })

    expect(result.success).toBe(true)
  })

  test("triggerResource accepts a JSON-roundtripped cached trigger (AP-CBX-006 pattern)", () => {
    const trigger = {
      id: "1",
      workspaceId: "1",
      name: "New lead trigger",
      active: true,
      folderId: null,
      actions: [],
      conditions: [],
      createdAt: new Date("2026-07-16T10:00:00.000Z"),
      updatedAt: new Date("2026-07-16T11:00:00.000Z"),
    }
    const cachedTrigger = JSON.parse(JSON.stringify(trigger))

    const result = triggerResource.safeParse(cachedTrigger)

    expect(result.success).toBe(true)
  })
})
