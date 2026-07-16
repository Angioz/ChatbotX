import { describe, expect, test } from "vitest"
import { commentAutomationResource } from "@/features/fb-comments/api/schema"

describe("commentAutomationResource", () => {
  test("accepts timestamps from a JSON-roundtripped comment automation", () => {
    const automation = {
      id: "automation-1",
      createdAt: new Date("2026-07-16T10:00:00.000Z"),
      updatedAt: new Date("2026-07-16T11:00:00.000Z"),
      name: "IG comment to DM",
      workspaceId: "workspace-1",
      folderId: null,
      type: "messenger",
      isActive: true,
      startTime: null,
      endTime: null,
      repliesCount: 0,
      post: { type: "postIds", value: ["page_post"] },
      privateReply: { type: "flow", value: "flow-1" },
      publicReply: { type: "text", value: "Check your DMs" },
      includeKeywords: { type: "contain", value: ["guide"] },
      excludeKeywords: ["spam"],
      options: {
        replyToNewContactsOnly: false,
        replyOncePerUserPerPost: true,
        likeUserComment: true,
        replyToUsersWhoCommentedOnOtherPosts: true,
        ignoreCommentReplies: true,
        trackUserTags: false,
      },
      hideComments: {
        all: false,
        hasPhoneNumber: false,
        hasImage: false,
        hasVideo: false,
        hasLink: false,
        hasKeywords: false,
        keywords: [],
        showCommentsAfter: "none",
      },
      replyAfter: { type: "immediately", value: 0 },
    }
    const cachedAutomation = JSON.parse(JSON.stringify(automation))

    const result = commentAutomationResource.safeParse(cachedAutomation)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date)
      expect(result.data.updatedAt).toBeInstanceOf(Date)
    }
  })
})
