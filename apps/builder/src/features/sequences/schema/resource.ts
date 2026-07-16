import { createSelectSchema, sequenceModel } from "@chatbotx.io/database/schema"
import z from "zod"

export const sequenceResource = createSelectSchema(sequenceModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type SequenceResource = typeof sequenceModel.$inferSelect
