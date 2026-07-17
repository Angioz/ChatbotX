import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  fetchNativeInstagramContactProfile: vi.fn(),
  fetchFacebookInstagramContactProfile: vi.fn(),
  isInstagramViaFacebook: vi.fn(),
  resolveIntegrationContextFromContactInbox: vi.fn(),
  withCache: vi.fn(),
  distributedStoreDelete: vi.fn(async () => undefined),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { instagram: "instagram", whatsapp: "whatsapp" } },
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  fetchInstagramContactProfile: mocks.fetchNativeInstagramContactProfile,
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  fetchInstagramContactProfile: mocks.fetchFacebookInstagramContactProfile,
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: mocks.withCache,
  distributedStore: { delete: mocks.distributedStoreDelete },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError },
}))

vi.mock("../src/services/integrations", () => ({
  isInstagramViaFacebook: mocks.isInstagramViaFacebook,
  resolveIntegrationContextFromContactInbox:
    mocks.resolveIntegrationContextFromContactInbox,
}))

const { stepIgFollowCheck } = await import(
  "../src/integration/handlers/ig-follow-check"
)

type Props = Parameters<typeof stepIgFollowCheck>[0]

const createProps = (
  overrides: {
    contactInbox?: Record<string, unknown>
    conversation?: Record<string, unknown>
    step?: Record<string, unknown>
  } = {},
) =>
  ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      ...overrides.conversation,
    },
    contactInbox: {
      id: "contact-inbox-1",
      channel: "instagram",
      sourceId: "igsid-123",
      ...overrides.contactInbox,
    },
    step: {
      id: "step-1",
      recheck: false,
      ...overrides.step,
    },
  }) as unknown as Props

const defaultResolvedContext = () => ({
  ctx: {
    auth: {
      tokens: { accessToken: "token-abc" },
      metadata: {
        igId: "ig-1",
        igName: "biz",
        pageId: "page-1",
        version: "v19.0",
      },
    },
  },
  integrationRow: {
    id: "integration-1",
    type: "instagram",
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveIntegrationContextFromContactInbox.mockResolvedValue(
    defaultResolvedContext(),
  )
  mocks.isInstagramViaFacebook.mockImplementation(
    (integrationRow: { type?: string }) => integrationRow.type === "facebook",
  )
  mocks.withCache.mockImplementation(async (_key: string, fn: () => unknown) =>
    fn(),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("stepIgFollowCheck handler", () => {
  test("fails closed when contactInbox channel is not instagram", async () => {
    const result = await stepIgFollowCheck(
      createProps({ contactInbox: { channel: "whatsapp" } }),
    )

    expect(result).toEqual({
      status: "error",
      result: null,
      errorMessage: "Instagram follow check requires an Instagram DM",
    })
    expect(
      mocks.resolveIntegrationContextFromContactInbox,
    ).not.toHaveBeenCalled()
  })

  test("fails closed when contactInbox has no sourceId (igsid)", async () => {
    const result = await stepIgFollowCheck(
      createProps({ contactInbox: { sourceId: undefined } }),
    )

    expect(result).toEqual({
      status: "error",
      result: null,
      errorMessage: "Instagram conversation participant IGSID is missing",
    })
    expect(
      mocks.resolveIntegrationContextFromContactInbox,
    ).not.toHaveBeenCalled()
  })

  test("resolves Instagram auth from the active DM conversation context", async () => {
    mocks.fetchNativeInstagramContactProfile.mockResolvedValue({
      followsBusiness: true,
    })
    const props = createProps()

    await stepIgFollowCheck(props)

    expect(
      mocks.resolveIntegrationContextFromContactInbox,
    ).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactInbox: props.contactInbox,
    })
  })

  test("fails closed when the resolved integration has no access token", async () => {
    mocks.resolveIntegrationContextFromContactInbox.mockResolvedValue({
      ...defaultResolvedContext(),
      ctx: {
        auth: {
          tokens: {},
          metadata: { version: "v19.0" },
        },
      },
    })

    const result = await stepIgFollowCheck(createProps())

    expect(result).toEqual({
      status: "error",
      result: null,
      errorMessage: "Instagram integration access token is missing",
    })
    expect(mocks.fetchNativeInstagramContactProfile).not.toHaveBeenCalled()
  })

  test("routes to the success branch when is_user_follow_business is true", async () => {
    mocks.fetchNativeInstagramContactProfile.mockResolvedValue({
      followsBusiness: true,
    })

    const result = await stepIgFollowCheck(createProps())

    expect(result).toEqual({
      status: "success",
      result: { followsBusiness: true },
    })
    expect(mocks.fetchNativeInstagramContactProfile).toHaveBeenCalledWith({
      igsid: "igsid-123",
      accessToken: "token-abc",
      version: "v19.0",
    })
  })

  test("routes to the error branch when is_user_follow_business is false", async () => {
    mocks.fetchNativeInstagramContactProfile.mockResolvedValue({
      followsBusiness: false,
    })

    const result = await stepIgFollowCheck(createProps())

    expect(result).toEqual({
      status: "error",
      result: { followsBusiness: false },
    })
  })

  test("uses the Facebook Graph profile client for a Facebook-backed Instagram inbox", async () => {
    mocks.resolveIntegrationContextFromContactInbox.mockResolvedValue({
      ...defaultResolvedContext(),
      integrationRow: {
        id: "integration-1",
        type: "facebook",
      },
    })
    mocks.fetchFacebookInstagramContactProfile.mockResolvedValue({
      followsBusiness: true,
    })

    const result = await stepIgFollowCheck(createProps())

    expect(result.status).toBe("success")
    expect(mocks.fetchFacebookInstagramContactProfile).toHaveBeenCalledWith({
      igsid: "igsid-123",
      accessToken: "token-abc",
      version: "v19.0",
    })
    expect(mocks.fetchNativeInstagramContactProfile).not.toHaveBeenCalled()
  })

  test("fails closed when Instagram omits is_user_follow_business", async () => {
    mocks.fetchNativeInstagramContactProfile.mockResolvedValue({
      followsBusiness: null,
    })

    const result = await stepIgFollowCheck(createProps())

    expect(result).toEqual({
      status: "error",
      result: null,
      errorMessage:
        "Instagram did not return is_user_follow_business for this participant",
    })
  })

  test("fails closed when the profile fetch throws", async () => {
    mocks.fetchNativeInstagramContactProfile.mockRejectedValue(
      new Error("graph api down"),
    )

    const result = await stepIgFollowCheck(createProps())

    expect(result).toEqual({
      status: "error",
      result: null,
      errorMessage: "Instagram follow check failed",
    })
    expect(mocks.loggerError).toHaveBeenCalled()
  })

  test("caches the follow status under integration:instagram:<igsid>", async () => {
    mocks.fetchNativeInstagramContactProfile.mockResolvedValue({
      followsBusiness: true,
    })

    await stepIgFollowCheck(createProps())

    expect(mocks.withCache).toHaveBeenCalledWith(
      "integration:instagram:igsid-123",
      expect.any(Function),
      expect.objectContaining({
        ttl: 300,
        tags: ["integration:instagram:integration-1"],
      }),
    )
  })
})

describe("stepIgFollowCheck cache-bust (recheck)", () => {
  test("invalidates the exact cache key before re-querying when step.recheck is true", async () => {
    mocks.fetchNativeInstagramContactProfile.mockResolvedValue({
      followsBusiness: true,
    })

    await stepIgFollowCheck(createProps({ step: { recheck: true } }))

    expect(mocks.distributedStoreDelete).toHaveBeenCalledWith(
      "integration:instagram:igsid-123",
    )
    const deleteOrder = mocks.distributedStoreDelete.mock.invocationCallOrder[0]
    const withCacheOrder = mocks.withCache.mock.invocationCallOrder[0]
    expect(deleteOrder).toBeLessThan(withCacheOrder)
  })

  test("does not invalidate the cache when step.recheck is false", async () => {
    mocks.fetchNativeInstagramContactProfile.mockResolvedValue({
      followsBusiness: true,
    })

    await stepIgFollowCheck(createProps({ step: { recheck: false } }))

    expect(mocks.distributedStoreDelete).not.toHaveBeenCalled()
  })
})
