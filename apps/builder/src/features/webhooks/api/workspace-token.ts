import { webhookService } from "@chatbotx.io/business"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import {
  createWebhookWorkspaceTokenRequest,
  deleteWebhookWorkspaceTokenRequest,
  updateWebhookWorkspaceTokenRequest,
  webhookResource,
} from "../schemas/workspace-token-schema"

const listWebhooksWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/webhooks",
    summary: "List webhooks",
    tags: ["Webhooks"],
  })
  .output(z.object({ data: z.array(webhookResource) }))
  .handler(async ({ context }) => {
    const data = await webhookService.listByWorkspaceId(context.workspace.id)
    return { data }
  })

const createWebhookWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "POST",
    path: "/v1/webhooks",
    summary: "Create a webhook",
    successStatus: 201,
    tags: ["Webhooks"],
  })
  .input(createWebhookWorkspaceTokenRequest)
  .output(webhookResource)
  .errors(possibleErrorsOnCreatingResource)
  .handler(
    async ({ context, input }) =>
      await webhookService.createWebhook(context.workspace.id, input),
  )

const updateWebhookWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "PUT",
    path: "/v1/webhooks/{id}",
    summary: "Update a webhook",
    tags: ["Webhooks"],
  })
  .input(updateWebhookWorkspaceTokenRequest)
  .output(webhookResource)
  .errors(possibleErrorsOnUpdatingResource)
  .handler(async ({ context, input }) => {
    const { conditions, id, url } = input
    return await webhookService.updateWebhook(
      { workspaceId: context.workspace.id, id },
      { conditions, url },
    )
  })

const deleteWebhookWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "DELETE",
    path: "/v1/webhooks/{id}",
    summary: "Delete a webhook",
    successStatus: 204,
    tags: ["Webhooks"],
  })
  .input(deleteWebhookWorkspaceTokenRequest)
  .errors(possibleErrorsOnDeletingResource)
  .handler(async ({ context, input }) => {
    await webhookService.deleteWebhook({
      workspaceId: context.workspace.id,
      id: input.id,
    })
  })

export const webhooksWorkspaceTokenAPIs = {
  listWebhooksWorkspaceTokenAPI,
  createWebhookWorkspaceTokenAPI,
  updateWebhookWorkspaceTokenAPI,
  deleteWebhookWorkspaceTokenAPI,
}

export default webhooksWorkspaceTokenAPIs
