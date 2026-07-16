import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createWebhookWorkspaceTokenRequest,
  webhookResource,
} from "@/features/webhooks/schemas/workspace-token-schema"

type HandlerArgs = {
  context: { workspace: { id: string } }
  input: Record<string, unknown>
}

type ProcedureRecord = {
  handler?: (args: HandlerArgs) => Promise<unknown>
  method: string
  path: string
}

const { procedures, webhookServiceMocks } = vi.hoisted(() => ({
  procedures: [] as ProcedureRecord[],
  webhookServiceMocks: {
    createWebhook: vi.fn(),
    deleteWebhook: vi.fn(),
    listByWorkspaceId: vi.fn(),
    updateWebhook: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  webhookService: webhookServiceMocks,
}))

vi.mock("@/orpc", () => ({
  workspaceTokenAuthAPI: {
    route: ({ method, path }: { method: string; path: string }) => {
      const procedure: ProcedureRecord = { method, path }
      procedures.push(procedure)
      const chain = {
        errors: () => chain,
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

await import("@/features/webhooks/api/workspace-token")

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

describe("webhooks workspace-token API", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("resource schema roundtrips timestamps as dates", () => {
    const webhook = webhookResource.parse({
      id: "1",
      workspaceId: "2",
      folderId: null,
      name: "Orders",
      active: true,
      url: "",
      createdAt: "2026-07-16T08:00:00.000Z",
      updatedAt: "2026-07-16T09:00:00.000Z",
    })

    const roundtripped = webhookResource.parse(webhook)
    expect(roundtripped.createdAt).toBeInstanceOf(Date)
    expect(roundtripped.updatedAt).toBeInstanceOf(Date)
  })

  test("create input rejects workspaceId", () => {
    expect(
      createWebhookWorkspaceTokenRequest.safeParse({
        name: "Orders",
        folderId: null,
        workspaceId: "workspace-b",
      }).success,
    ).toBe(false)
  })

  test("create invokes the service with the token workspace", async () => {
    const webhook = { id: "1" }
    webhookServiceMocks.createWebhook.mockResolvedValue(webhook)

    await expect(
      getHandler(
        "POST",
        "/v1/webhooks",
      )({
        context,
        input: { name: "Orders", folderId: null },
      }),
    ).resolves.toBe(webhook)

    expect(webhookServiceMocks.createWebhook).toHaveBeenCalledWith(
      "workspace-a",
      { name: "Orders", folderId: null },
    )
  })

  test("update cannot target a webhook outside the token workspace", async () => {
    webhookServiceMocks.updateWebhook.mockRejectedValue(
      new Error("Webhook not found"),
    )

    await expect(
      getHandler(
        "PUT",
        "/v1/webhooks/{id}",
      )({
        context,
        input: {
          id: "2",
          workspaceId: "workspace-b",
          url: "https://example.com/webhook",
          conditions: [{ type: "newContact" }],
        },
      }),
    ).rejects.toThrow("Webhook not found")

    expect(webhookServiceMocks.updateWebhook).toHaveBeenCalledWith(
      { workspaceId: "workspace-a", id: "2" },
      {
        url: "https://example.com/webhook",
        conditions: [{ type: "newContact" }],
      },
    )
  })

  test("delete invokes the service with the token workspace", async () => {
    webhookServiceMocks.deleteWebhook.mockResolvedValue(undefined)

    await getHandler(
      "DELETE",
      "/v1/webhooks/{id}",
    )({
      context,
      input: { id: "3" },
    })

    expect(webhookServiceMocks.deleteWebhook).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      id: "3",
    })
  })
})
