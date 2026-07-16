import { aiAgentService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createAIAgentRequest, updateAIAgentRequest } from "../schemas/action"
import { listAIAgentsResponse } from "../schemas/query"
import { aiAgentResourceSchema } from "../schemas/resource"

const listAIAgentsWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/ai-agents",
    summary: "List AI agents",
    tags: ["AI Agents"],
  })
  .output(listAIAgentsResponse)
  .handler(
    async ({ context }) =>
      await aiAgentService.listAIAgents({
        workspaceId: context.workspace.id,
        page: 1,
        perPage: 100,
        sort: [{ id: "createdAt", desc: true }],
      }),
  )

// aiAgentService.create() persists via an internally-generated id and returns
// void (unlike custom-fields/bot-fields, it has no `.returning()`) — no
// deterministic way to read the created row back (name isn't unique), so this
// mirrors the void/no-output convention already used by the DELETE procedures
// below rather than guessing at a resource body.
const createAIAgentWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "POST",
    path: "/v1/ai-agents",
    summary: "Create an AI agent",
    successStatus: 201,
    tags: ["AI Agents"],
  })
  .input(createAIAgentRequest)
  .errors(possibleErrorsOnCreatingResource)
  .handler(
    async ({ context, input }) =>
      await aiAgentService.create(context.workspace.id, input),
  )

const updateAIAgentWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "PUT",
    path: "/v1/ai-agents/{id}",
    summary: "Update an AI agent",
    tags: ["AI Agents"],
  })
  .input(updateAIAgentRequest.and(z.object({ id: zodBigintAsString() })))
  .output(aiAgentResourceSchema)
  .errors(possibleErrorsOnUpdatingResource)
  .handler(async ({ context, input }) => {
    const { id, ...rest } = input
    const workspaceId = context.workspace.id

    // updateAIAgent itself scopes the lookup by workspaceId and throws
    // notFoundException for a cross-workspace id — never trust input.id alone.
    await aiAgentService.updateAIAgent({ workspaceId, id }, rest)

    const updated = await aiAgentService.findBy({ where: { id, workspaceId } })
    if (!updated) {
      throw notFoundException("AI agent not found")
    }
    return updated
  })

const deleteAIAgentWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "DELETE",
    path: "/v1/ai-agents/{id}",
    summary: "Delete an AI agent",
    successStatus: 204,
    tags: ["AI Agents"],
  })
  .input(z.object({ id: zodBigintAsString() }))
  .errors(possibleErrorsOnDeletingResource)
  .handler(async ({ context, input }) => {
    const workspaceId = context.workspace.id

    // aiAgentService.delete() silently no-ops on a cross-workspace id (its
    // WHERE clause just matches zero rows) — verify workspace ownership first
    // so a foreign id surfaces as NOT_FOUND instead of a fake success.
    const existing = await aiAgentService.findBy({
      where: { id: input.id, workspaceId },
    })
    if (!existing) {
      throw notFoundException("AI agent not found")
    }

    await aiAgentService.delete({ workspaceId, ids: [input.id] })
  })

export const aiAgentsWorkspaceTokenAPIs = {
  listAIAgentsWorkspaceTokenAPI,
  createAIAgentWorkspaceTokenAPI,
  updateAIAgentWorkspaceTokenAPI,
  deleteAIAgentWorkspaceTokenAPI,
}

export default aiAgentsWorkspaceTokenAPIs
