import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { basePaginationRequest } from "@/lib/pagination"
import { fbCommentResource } from "../schema/resource"

export const commentAutomationIdInput = z.object({
  id: zodBigintAsString(),
})

export const commentAutomationResource = fbCommentResource.extend({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const listCommentAutomationsInput = basePaginationRequest.and(
  z.object({
    folderId: zodBigintAsString().nullish(),
    isActive: z.boolean().nullish(),
    name: z.string().nullish(),
  }),
)

export const listCommentAutomationsOutput = z.object({
  data: z.array(commentAutomationResource),
  pageCount: z.number().int(),
})
