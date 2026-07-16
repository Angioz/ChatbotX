import { broadcastService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import {
  listBroadcastAudience,
  listBroadcasts,
  publicGetBroadcast,
} from "../queries"
import {
  createBroadcastRequest,
  updateBroadcastSchema,
} from "../schemas/action"
import {
  listBroadcastAudienceResponse,
  publicListBroadcastsResponse,
} from "../schemas/query"
import { publicBroadcastResource } from "../schemas/resource"

const broadcastIdInput = z.object({ id: zodBigintAsString() })

export const broadcastWorkspaceTokenAPIs = {
  listBroadcastsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts",
      summary: "Get all broadcasts",
      tags: ["Broadcasts"],
    })
    .output(publicListBroadcastsResponse)
    .handler(async ({ context }) => {
      const { data } = await listBroadcasts({
        workspaceId: context.workspace.id,
        page: 1,
        perPage: 100,
        sort: [{ id: "createdAt", desc: true }],
        name: null,
      })

      return { data }
    }),

  getBroadcastWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts/{idOrName}",
      summary: "Get broadcast by id or name",
      tags: ["Broadcasts"],
    })
    .input(z.object({ idOrName: z.string() }))
    .output(publicBroadcastResource)
    .handler(
      async ({ context, input }) =>
        await publicGetBroadcast(context.workspace.id, input.idOrName),
    ),

  getBroadcastAudienceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts/{idOrName}/audience",
      summary: "Get broadcast audience",
      tags: ["Broadcasts"],
    })
    .input(
      z.object({
        idOrName: z.string(),
        page: z.coerce.number().int().min(1).optional(),
        perPage: z.coerce.number().int().min(1).optional(),
      }),
    )
    .output(listBroadcastAudienceResponse)
    .handler(async ({ context, input }) => {
      const broadcast = await publicGetBroadcast(
        context.workspace.id,
        input.idOrName,
      )
      return await listBroadcastAudience({
        broadcastId: broadcast.id,
        workspaceId: context.workspace.id,
        page: input.page,
        perPage: input.perPage,
      })
    }),

  createBroadcastWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts",
      summary: "Create a broadcast",
      successStatus: 201,
      tags: ["Broadcasts"],
    })
    .input(createBroadcastRequest)
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await broadcastService.createBroadcast(context.workspace.id, input),
    ),

  updateBroadcastWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/broadcasts/{id}",
      summary: "Update a broadcast",
      tags: ["Broadcasts"],
    })
    .input(broadcastIdInput.and(updateBroadcastSchema))
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await broadcastService.updateBroadcast(
        { workspaceId: context.workspace.id, id },
        data,
      )
    }),

  deleteBroadcastWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/broadcasts/{id}",
      summary: "Delete a broadcast",
      successStatus: 204,
      tags: ["Broadcasts"],
    })
    .input(broadcastIdInput)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await broadcastService.deleteBroadcast({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),
}
