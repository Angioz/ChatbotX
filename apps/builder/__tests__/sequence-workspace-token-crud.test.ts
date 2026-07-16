import { describe, expect, test } from "vitest"
import {
  createSequenceRequest,
  updateSequenceSchema,
} from "@/features/sequences/schema/action"
import { sequenceResource } from "@/features/sequences/schema/resource"

describe("Sequences CRUD schema roundtrip", () => {
  test("createSequenceRequest accepts a name-only payload", () => {
    const result = createSequenceRequest.safeParse({
      name: "Welcome series",
      folderId: null,
    })

    expect(result.success).toBe(true)
  })

  test("createSequenceRequest rejects an empty name", () => {
    const result = createSequenceRequest.safeParse({
      name: "",
      folderId: null,
    })

    expect(result.success).toBe(false)
  })

  test("updateSequenceSchema accepts a partial-shaped update payload", () => {
    const result = updateSequenceSchema.safeParse({ active: false })

    expect(result.success).toBe(true)
  })

  test("updateSequenceSchema accepts an empty object (no-op update)", () => {
    const result = updateSequenceSchema.safeParse({})

    expect(result.success).toBe(true)
  })

  test("sequenceResource accepts a JSON-roundtripped cached sequence (AP-CBX-006 pattern)", () => {
    const sequence = {
      id: "1",
      workspaceId: "1",
      folderId: null,
      name: "Welcome series",
      active: true,
      subscribers: 0,
      messages: 0,
      createdAt: new Date("2026-07-16T10:00:00.000Z"),
      updatedAt: new Date("2026-07-16T11:00:00.000Z"),
    }
    const cachedSequence = JSON.parse(JSON.stringify(sequence))

    const result = sequenceResource.safeParse(cachedSequence)

    expect(result.success).toBe(true)
  })
})
