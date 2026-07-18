import { afterEach, describe, expect, test, vi } from "vitest"

type HandlerArgs = {
  context: { workspace: { id: string } }
  input: Record<string, unknown>
}

type ProcedureRecord = {
  handler?: (args: HandlerArgs) => Promise<unknown>
  method: string
  path: string
}

const { serviceMocks, procedures } = vi.hoisted(() => ({
  serviceMocks: {
    listInstagramMediaForWorkspace: vi.fn(),
    resolveInstagramMediaId: vi.fn(),
  },
  procedures: [] as ProcedureRecord[],
}))

vi.mock("@/features/instagram-media/service", () => ({
  listInstagramMediaForWorkspace: serviceMocks.listInstagramMediaForWorkspace,
  resolveInstagramMediaId: serviceMocks.resolveInstagramMediaId,
}))

vi.mock("@/orpc", () => ({
  workspaceTokenAuthAPI: {
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
      }
      return chain
    },
  },
}))

await import("@/features/instagram-media/api/workspace-token")

const getHandler = (method: string, path: string) => {
  const handler = procedures.find(
    (procedure) => procedure.method === method && procedure.path === path,
  )?.handler
  if (!handler) {
    throw new Error(`Missing ${method} ${path} handler`)
  }
  return handler
}

const context = { workspace: { id: "workspace-a" } }

describe("instagram-media workspace-token API", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("registers GET /v1/instagram/media", () => {
    expect(() => getHandler("GET", "/v1/instagram/media")).not.toThrow()
  })

  test("lists media scoped to the token workspace", async () => {
    const media = [{ id: "m1", timestamp: "2026-01-01T00:00:00Z" }]
    serviceMocks.listInstagramMediaForWorkspace.mockResolvedValue(media)

    await expect(
      getHandler("GET", "/v1/instagram/media")({ context, input: {} }),
    ).resolves.toEqual({ data: media })

    expect(serviceMocks.listInstagramMediaForWorkspace).toHaveBeenCalledWith(
      "workspace-a",
    )
    expect(serviceMocks.resolveInstagramMediaId).not.toHaveBeenCalled()
  })

  test("resolves a permalink to a single media item", async () => {
    const item = { id: "3919534619324814691", timestamp: "2026-01-01T00:00:00Z" }
    serviceMocks.resolveInstagramMediaId.mockResolvedValue(item)

    await expect(
      getHandler("GET", "/v1/instagram/media")({
        context,
        input: { permalink: "https://instagram.com/reel/DZk-_g9s5Vj/" },
      }),
    ).resolves.toEqual({ data: [item] })

    expect(serviceMocks.resolveInstagramMediaId).toHaveBeenCalledWith(
      "workspace-a",
      "https://instagram.com/reel/DZk-_g9s5Vj/",
    )
    expect(
      serviceMocks.listInstagramMediaForWorkspace,
    ).not.toHaveBeenCalled()
  })

  test("returns an empty list when the permalink resolves to nothing", async () => {
    serviceMocks.resolveInstagramMediaId.mockResolvedValue(null)

    await expect(
      getHandler("GET", "/v1/instagram/media")({
        context,
        input: { permalink: "nope" },
      }),
    ).resolves.toEqual({ data: [] })
  })
})
