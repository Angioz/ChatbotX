import { describe, expect, test } from "vitest"
import { getWorkspacePublicResource } from "@/features/workspaces/schema/action"

describe("getWorkspacePublicResource", () => {
  test("accepts timestamps from a JSON-roundtripped cached workspace", () => {
    const workspace = {
      id: "1",
      createdAt: new Date("2026-07-16T10:00:00.000Z"),
      updatedAt: new Date("2026-07-16T11:00:00.000Z"),
      name: "Self-hosted workspace",
      defaultReply: null,
      targetCountry: null,
      language: "en",
      timezone: "UTC",
      brandColor: "#016DFF",
      developmentMode: false,
      isActive: true,
      startTime: null,
      endTime: null,
      logo: null,
      scheduledDeletionAt: null,
      ownerId: "1",
      tenantId: "1",
      token: "workspace-token",
    }
    const cachedWorkspace = JSON.parse(JSON.stringify(workspace))

    const result = getWorkspacePublicResource.safeParse(cachedWorkspace)

    expect(result.success).toBe(true)
  })

  test("accepts a non-null scheduledDeletionAt from a JSON-roundtripped cached workspace mid-deletion-grace", () => {
    const workspace = {
      id: "1",
      createdAt: new Date("2026-07-16T10:00:00.000Z"),
      updatedAt: new Date("2026-07-16T11:00:00.000Z"),
      name: "Self-hosted workspace",
      defaultReply: null,
      targetCountry: null,
      language: "en",
      timezone: "UTC",
      brandColor: "#016DFF",
      developmentMode: false,
      isActive: true,
      startTime: null,
      endTime: null,
      logo: null,
      scheduledDeletionAt: new Date("2026-07-23T10:00:00.000Z"),
      ownerId: "1",
      tenantId: "1",
      token: "workspace-token",
    }
    const cachedWorkspace = JSON.parse(JSON.stringify(workspace))

    const result = getWorkspacePublicResource.safeParse(cachedWorkspace)

    expect(result.success).toBe(true)
  })
})
