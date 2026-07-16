import {
  createSelectSchema,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

export const chatbotResource = createSelectSchema(workspaceModel, {
  createdAt: z.coerce.date(),
  id: zodBigintAsString(),
  updatedAt: z.coerce.date(),
})
export type WorkspaceResource = z.infer<typeof chatbotResource>

export const withWorkspaceIdSchema = z.object({
  workspaceId: zodBigintAsString(),
})

export const withWorkspaceIdAndIdSchema = z.object({
  workspaceId: zodBigintAsString(),
  id: zodBigintAsString(),
})
