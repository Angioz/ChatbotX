import { describe, expect, test } from "vitest"
import {
  createAutomatedResponseRequest,
  updateAutomatedResponseRequest,
} from "@/features/automated-response/schema/action"
import { keywordResource } from "@/features/automated-response/schema/keyword-resource"

describe("Keywords CRUD schema roundtrip", () => {
  test("createAutomatedResponseRequest accepts a flow-linked payload", () => {
    const result = createAutomatedResponseRequest.safeParse({
      folderId: null,
      keywords: [{ value: "hello" }],
      flowId: "1",
      text: null,
    })

    expect(result.success).toBe(true)
  })

  test("createAutomatedResponseRequest accepts a text-only payload", () => {
    const result = createAutomatedResponseRequest.safeParse({
      folderId: null,
      keywords: [{ value: "hello" }],
      flowId: null,
      text: "Hi there!",
    })

    expect(result.success).toBe(true)
  })

  test("createAutomatedResponseRequest rejects payload missing both flowId and text", () => {
    const result = createAutomatedResponseRequest.safeParse({
      folderId: null,
      keywords: [{ value: "hello" }],
      flowId: null,
      text: null,
    })

    expect(result.success).toBe(false)
  })

  test("updateAutomatedResponseRequest accepts a partial-shaped update payload", () => {
    const result = updateAutomatedResponseRequest.safeParse({
      folderId: null,
      keywords: [{ value: "renamed" }],
      flowId: "1",
      text: null,
    })

    expect(result.success).toBe(true)
  })

  test("keywordResource accepts a JSON-roundtripped cached keyword (AP-CBX-006 pattern)", () => {
    const keyword = {
      id: "1",
      workspaceId: "1",
      folderId: null,
      flowId: null,
      text: "Hi there!",
      keywords: ["hello"],
      status: true,
      createdAt: new Date("2026-07-16T10:00:00.000Z"),
      updatedAt: new Date("2026-07-16T11:00:00.000Z"),
    }
    const cachedKeyword = JSON.parse(JSON.stringify(keyword))

    const result = keywordResource.safeParse(cachedKeyword)

    expect(result.success).toBe(true)
  })
})
