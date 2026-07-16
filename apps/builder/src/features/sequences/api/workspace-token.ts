import { sequenceService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { basePaginationRequest } from "@/lib/pagination"
import { workspaceTokenAuthAPI } from "@/orpc"
import { getSequence, listSequences } from "../queries"
import {
  createSequenceRequest,
  listSequencesResponse,
  updateSequenceSchema,
} from "../schema/action"
import { sequenceResource } from "../schema/resource"

export const sequencesWorkspaceTokenAPIs = {
  listSequencesWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/sequences",
      summary: "List sequences",
      tags: ["Sequences"],
    })
    .input(basePaginationRequest)
    .output(listSequencesResponse)
    .handler(
      async ({ context, input }) =>
        await listSequences({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  getSequenceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/sequences/{id}",
      summary: "Get sequence details",
      tags: ["Sequences"],
    })
    .input(z.object({ id: z.string() }))
    .output(sequenceResource)
    .handler(
      async ({ context, input }) =>
        await getSequence(context.workspace.id, input.id),
    ),

  createSequenceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/sequences",
      summary: "Create a sequence",
      tags: ["Sequences"],
      successStatus: 201,
    })
    .input(createSequenceRequest)
    .output(sequenceResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await sequenceService.createSequence(context.workspace.id, {
          name: input.name,
          folderId: input.folderId ?? null,
        }),
    ),

  updateSequenceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/sequences/{id}",
      summary: "Update a sequence",
      tags: ["Sequences"],
    })
    .input(updateSequenceSchema.and(z.object({ id: zodBigintAsString() })))
    .output(sequenceResource)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await sequenceService.updateSequence(
        { workspaceId: context.workspace.id, id },
        data,
      )
    }),

  deleteSequenceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/sequences/{id}",
      summary: "Delete a sequence",
      tags: ["Sequences"],
      successStatus: 204,
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await sequenceService.deleteSequence({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),
}
