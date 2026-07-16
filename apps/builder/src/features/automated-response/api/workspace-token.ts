import { automatedResponseService, flowService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { maxPerPage } from "@/lib/shared-request"
import { workspaceTokenAuthAPI } from "@/orpc"
import {
  createAutomatedResponseRequest,
  updateAutomatedResponseRequest,
} from "../schema/action"
import { keywordResource } from "../schema/keyword-resource"

const listKeywordsWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/keywords",
    summary: "List keywords (automated responses)",
    tags: ["Keywords"],
  })
  .output(z.object({ data: z.array(keywordResource) }))
  .handler(async ({ context }) => {
    const { data } = await automatedResponseService.list({
      workspaceId: context.workspace.id,
      page: 1,
      perPage: maxPerPage,
      sort: [{ id: "createdAt", desc: true }],
      keyword: null,
      folderId: null,
    })

    return { data }
  })

const createKeywordWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "POST",
    path: "/v1/keywords",
    summary: "Create a keyword (automated response)",
    tags: ["Keywords"],
    successStatus: 201,
  })
  .input(createAutomatedResponseRequest)
  .output(keywordResource)
  .errors(possibleErrorsOnCreatingResource)
  .handler(async ({ context, input }) => {
    const workspaceId = context.workspace.id

    let flowId: string | undefined = input.flowId ?? undefined
    let text: string | null | undefined = input.text

    if (flowId) {
      const exists = await flowService.exists(workspaceId, flowId)
      if (!exists) {
        throw new ChatbotXException("Flow not found", "invalidRequestData", 422)
      }
      text = undefined
    } else if (text) {
      flowId = undefined
    }

    return await automatedResponseService.create(workspaceId, {
      text,
      flowId,
      folderId: input.folderId,
      keywords: input.keywords.map((m) => m.value),
    })
  })

const updateKeywordWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "PUT",
    path: "/v1/keywords/{id}",
    summary: "Update a keyword (automated response)",
    tags: ["Keywords"],
  })
  .input(updateAutomatedResponseRequest.and(z.object({ id: zodBigintAsString() })))
  .output(keywordResource)
  .errors(possibleErrorsOnUpdatingResource)
  .handler(async ({ context, input }) => {
    const workspaceId = context.workspace.id
    const { id, ...parsedInput } = input

    await automatedResponseService.findOrFail({ workspaceId, id })

    if (parsedInput.text?.length) {
      parsedInput.flowId = undefined
    } else if (parsedInput.flowId) {
      const exists = await flowService.exists(workspaceId, parsedInput.flowId)
      if (!exists) {
        throw new ChatbotXException("Flow not found", "invalidRequestData", 422)
      }
      parsedInput.text = null
    }

    return await automatedResponseService.update({ workspaceId, id }, parsedInput)
  })

const deleteKeywordWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "DELETE",
    path: "/v1/keywords/{id}",
    summary: "Delete a keyword (automated response)",
    tags: ["Keywords"],
    successStatus: 204,
  })
  .input(z.object({ id: zodBigintAsString() }))
  .errors(possibleErrorsOnDeletingResource)
  .handler(async ({ context, input }) => {
    const workspaceId = context.workspace.id

    await automatedResponseService.findOrFail({ workspaceId, id: input.id })
    await automatedResponseService.deleteMany(workspaceId, [input.id])
  })

export const keywordsWorkspaceTokenAPIs = {
  listKeywordsWorkspaceTokenAPI,
  createKeywordWorkspaceTokenAPI,
  updateKeywordWorkspaceTokenAPI,
  deleteKeywordWorkspaceTokenAPI,
}

export default keywordsWorkspaceTokenAPIs
