import { createSelectSchema, webhookModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { createWebhookSchema } from "./create-webhook-schema"
import { updateWebhookRequest } from "./update-webhook-schema"

export const webhookResource = createSelectSchema(webhookModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const createWebhookWorkspaceTokenRequest = createWebhookSchema.strict()

export const updateWebhookWorkspaceTokenRequest = updateWebhookRequest
  .extend({ id: zodBigintAsString() })
  .strict()

export const deleteWebhookWorkspaceTokenRequest = z
  .object({ id: zodBigintAsString() })
  .strict()
