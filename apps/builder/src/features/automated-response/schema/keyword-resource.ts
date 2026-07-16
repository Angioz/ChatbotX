import {
  automatedResponseModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import z from "zod"

export const keywordResource = createSelectSchema(automatedResponseModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
  flowId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
