import { afterEach, describe, expect, test, vi } from "vitest"

type HandlerArgs = {
  input: Record<string, unknown>
}

type ProcedureRecord = {
  handler?: (args: HandlerArgs) => Promise<unknown>
  method: string
  path: string
}

const { fakeSchema, procedures, serviceMocks } = vi.hoisted(() => {
  // biome-ignore lint/suspicious/noExplicitAny: minimal zod stand-in for .and() chains
  const fakeSchema: any = {}
  fakeSchema.and = () => fakeSchema
  return {
    fakeSchema,
    procedures: [] as ProcedureRecord[],
    serviceMocks: {
      findMessengerIntegrationsByWorkspaceId: vi.fn(),
      listInstagramMediaForWorkspace: vi.fn(),
    },
  }
})

vi.mock("@chatbotx.io/business", () => ({
  findMessengerIntegrationsByWorkspaceId:
    serviceMocks.findMessengerIntegrationsByWorkspaceId,
}))

vi.mock("@chatbotx.io/integration-messenger/apis/post", () => ({
  listAdsPosts: vi.fn(),
  listPublishedPosts: vi.fn(),
  listReelsPosts: vi.fn(),
}))

vi.mock("@chatbotx.io/utils", () => ({
  zodBigintAsString: () => ({}),
}))

vi.mock("@/features/workspaces/schema/resource", () => ({
  withWorkspaceIdSchema: fakeSchema,
}))

vi.mock("@/features/instagram-media/service", () => ({
  listInstagramMediaForWorkspace: serviceMocks.listInstagramMediaForWorkspace,
}))

vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: {},
}))

vi.mock("@/features/fb-comments/actions/create-fb-comment.action", () => ({
  createFbComment: vi.fn(),
}))

vi.mock("@/features/fb-comments/actions/delete-fb-comment.action", () => ({
  deleteFbComment: vi.fn(),
}))

vi.mock("@/features/fb-comments/actions/update-fb-comment.action", () => ({
  updateFbComment: vi.fn(),
}))

vi.mock("@/features/fb-comments/queries", () => ({
  listFbComments: vi.fn(),
}))

vi.mock("@/features/fb-comments/schema/action", () => ({
  createFbCommentRequest: fakeSchema,
  listFbCommentsRequest: fakeSchema,
  listFbCommentsResponse: fakeSchema,
  updateFbCommentRequest: fakeSchema,
}))

vi.mock("@/features/fb-comments/schema/resource", () => ({
  fbCommentResource: fakeSchema,
}))

vi.mock("@/orpc", () => ({
  authorizedAPI: {
    route: ({ method, path }: { method: string; path: string }) => {
      const procedure: ProcedureRecord = { method, path }
      procedures.push(procedure)
      const chain = {
        handler: (
          handler: (args: HandlerArgs) => Promise<unknown>,
        ): ProcedureRecord => {
          procedure.handler = handler
          return procedure
        },
        input: () => chain,
        output: () => chain,
        use: () => chain,
      }
      return chain
    },
  },
}))

await import("@/features/fb-comments/api/authenticated")

const getHandler = (method: string, path: string) => {
  const handler = procedures.find(
    (procedure) => procedure.method === method && procedure.path === path,
  )?.handler
  if (!handler) {
    throw new Error(`Missing ${method} ${path} handler`)
  }
  return handler
}

const instagramPostsPath =
  "/workspaces/{workspaceId}/fb-comments/instagram-posts"

describe("fb-comments instagramPostsAPI", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("registers GET instagram-posts route", () => {
    expect(() => getHandler("GET", instagramPostsPath)).not.toThrow()
  })

  test("maps IG media to the FacebookPost shape, preferring thumbnail_url", async () => {
    serviceMocks.listInstagramMediaForWorkspace.mockResolvedValue([
      {
        id: "media-1",
        caption: "hello reel",
        media_url: "https://cdn/video.mp4",
        thumbnail_url: "https://cdn/thumb.jpg",
        timestamp: "2026-02-01T00:00:00+0000",
        permalink: "https://instagram.com/reel/DZk-_g9s5Vj/",
      },
    ])

    await expect(
      getHandler("GET", instagramPostsPath)({
        input: { workspaceId: "workspace-a" },
      }),
    ).resolves.toEqual({
      posts: [
        {
          id: "media-1",
          message: "hello reel",
          full_picture: "https://cdn/thumb.jpg",
          created_time: "2026-02-01T00:00:00+0000",
          permalink_url: "https://instagram.com/reel/DZk-_g9s5Vj/",
        },
      ],
    })

    expect(serviceMocks.listInstagramMediaForWorkspace).toHaveBeenCalledWith(
      "workspace-a",
    )
  })

  test("falls back to media_url when thumbnail_url is missing", async () => {
    serviceMocks.listInstagramMediaForWorkspace.mockResolvedValue([
      {
        id: "media-2",
        media_url: "https://cdn/image.jpg",
        timestamp: "2026-02-02T00:00:00+0000",
      },
    ])

    const result = (await getHandler("GET", instagramPostsPath)({
      input: { workspaceId: "workspace-a" },
    })) as { posts: Array<{ full_picture?: string }> }

    expect(result.posts[0]?.full_picture).toBe("https://cdn/image.jpg")
  })

  test("facebookPostsAPI still returns no posts for IG-direct workspaces", async () => {
    // Documents the F5 root cause: messenger-integration lookup is empty for
    // IG-direct workspaces, which is why the dedicated IG route exists.
    serviceMocks.findMessengerIntegrationsByWorkspaceId.mockResolvedValue([])

    await expect(
      getHandler(
        "GET",
        "/workspaces/{workspaceId}/fb-comments/facebook-posts",
      )({ input: { workspaceId: "workspace-a", type: "published" } }),
    ).resolves.toEqual({ posts: [] })
  })
})
