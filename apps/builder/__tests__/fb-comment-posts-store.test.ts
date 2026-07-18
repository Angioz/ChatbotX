import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockFacebookPostsAPI, mockInstagramPostsAPI } = vi.hoisted(() => ({
  mockFacebookPostsAPI: vi.fn(),
  mockInstagramPostsAPI: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    fbCommentsAPI: {
      facebookPostsAPI: mockFacebookPostsAPI,
      instagramPostsAPI: mockInstagramPostsAPI,
    },
  },
}))

const { createFbCommentPostsStore } = await import(
  "../src/features/fb-comments/provider/fb-comment-posts-store"
)

const fbPost = (id: string) => ({
  id,
  message: `fb ${id}`,
  created_time: "2026-01-01T00:00:00+0000",
})

const igPost = (id: string) => ({
  id,
  message: `ig ${id}`,
  created_time: "2026-02-01T00:00:00+0000",
  permalink_url: `https://instagram.com/p/${id}/`,
})

describe("fb-comment-posts-store", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFacebookPostsAPI.mockResolvedValue({ posts: [] })
    mockInstagramPostsAPI.mockResolvedValue({ posts: [] })
  })

  test("initialize merges Instagram media into publishedPosts", async () => {
    mockFacebookPostsAPI.mockImplementation(async ({ type }) =>
      type === "published" ? { posts: [fbPost("fb-1")] } : { posts: [] },
    )
    mockInstagramPostsAPI.mockResolvedValue({ posts: [igPost("ig-1")] })

    const store = createFbCommentPostsStore({ workspaceId: "ws-1" })
    await store.getState().initialize()

    const { publishedPosts, error, initialized } = store.getState()
    expect(error).toBeNull()
    expect(initialized).toBe(true)
    expect(publishedPosts.map((p) => p.id)).toEqual(["fb-1", "ig-1"])
    expect(mockInstagramPostsAPI).toHaveBeenCalledWith({ workspaceId: "ws-1" })
  })

  test("initialize keeps working for IG-direct workspaces with zero FB posts", async () => {
    mockInstagramPostsAPI.mockResolvedValue({
      posts: [igPost("ig-1"), igPost("ig-2")],
    })

    const store = createFbCommentPostsStore({ workspaceId: "ws-ig" })
    await store.getState().initialize()

    expect(store.getState().publishedPosts.map((p) => p.id)).toEqual([
      "ig-1",
      "ig-2",
    ])
  })

  test("fetchPublishedPosts re-merges Instagram media on tab refresh", async () => {
    mockFacebookPostsAPI.mockResolvedValue({ posts: [fbPost("fb-1")] })
    mockInstagramPostsAPI.mockResolvedValue({ posts: [igPost("ig-1")] })

    const store = createFbCommentPostsStore({ workspaceId: "ws-1" })
    await store.getState().fetchPublishedPosts()

    const { publishedPosts, error } = store.getState()
    expect(error).toBeNull()
    expect(publishedPosts.map((p) => p.id)).toEqual(["fb-1", "ig-1"])
    expect(mockInstagramPostsAPI).toHaveBeenCalledWith({ workspaceId: "ws-1" })
  })

  test("merge dedupes posts that appear in both sources", async () => {
    mockFacebookPostsAPI.mockResolvedValue({ posts: [fbPost("same-id")] })
    mockInstagramPostsAPI.mockResolvedValue({ posts: [igPost("same-id")] })

    const store = createFbCommentPostsStore({ workspaceId: "ws-1" })
    await store.getState().fetchPublishedPosts()

    const { publishedPosts } = store.getState()
    expect(publishedPosts).toHaveLength(1)
    // First list wins on collision.
    expect(publishedPosts[0]?.message).toBe("fb same-id")
  })

  test("fetchPublishedPosts surfaces errors", async () => {
    mockFacebookPostsAPI.mockRejectedValue(new Error("boom"))

    const store = createFbCommentPostsStore({ workspaceId: "ws-1" })
    await store.getState().fetchPublishedPosts()

    expect(store.getState().error).toBe("boom")
    expect(store.getState().loading).toBe(false)
  })
})
