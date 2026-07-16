import { fbCommentAutomationService } from "@chatbotx.io/business"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createFbCommentRequest } from "../schema/action"
import {
  commentAutomationIdInput,
  commentAutomationResource,
  listCommentAutomationsInput,
  listCommentAutomationsOutput,
} from "./schema"

export const fbCommentsWorkspaceTokenAPIs = {
  createCommentAutomationWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/comment-automations",
      summary: "Create a comment automation",
      successStatus: 201,
      tags: ["Comment Automations"],
    })
    .input(createFbCommentRequest)
    .output(commentAutomationResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await fbCommentAutomationService.create(context.workspace.id, input),
    ),

  listCommentAutomationsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/comment-automations",
      summary: "List comment automations",
      tags: ["Comment Automations"],
    })
    .input(listCommentAutomationsInput)
    .output(listCommentAutomationsOutput)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const { page, perPage, sort, ...filters } = input
      return await fbCommentAutomationService.list({
        ...filters,
        workspaceId: context.workspace.id,
        page: page ?? 1,
        perPage: perPage ?? 100,
        sort: sort ?? [{ id: "createdAt", desc: true }],
      })
    }),

  setCommentAutomationStatusWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/comment-automations/{id}/status",
      summary: "Enable or disable a comment automation",
      tags: ["Comment Automations"],
    })
    .input(commentAutomationIdInput.and(z.object({ enabled: z.boolean() })))
    .output(commentAutomationResource)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(
      async ({ context, input }) =>
        await fbCommentAutomationService.setStatus(
          { workspaceId: context.workspace.id, id: input.id },
          input.enabled,
        ),
    ),

  deleteCommentAutomationWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/comment-automations/{id}",
      summary: "Delete a comment automation",
      tags: ["Comment Automations"],
    })
    .input(commentAutomationIdInput)
    .output(z.void())
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await fbCommentAutomationService.delete({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),
}

export default fbCommentsWorkspaceTokenAPIs
