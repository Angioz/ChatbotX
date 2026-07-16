import { flowService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { workspaceTokenAuthAPI } from "@/orpc"
import { listFlows } from "../queries"
import {
  createFlowSchema,
  publishFlowSchema,
  updateFlowSchema,
} from "../schemas/action"
import { flowResource } from "../schemas/resource"

const flowIdInput = z.object({ id: zodBigintAsString() })

const flowWorkspaceTokenAPIs = {
  listFlowsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/flows",
      summary: "Get all flows",
      tags: ["Flows"],
    })
    .input(z.object({}))
    .output(
      z.object({
        data: z.array(flowResource.pick({ id: true, name: true })),
      }),
    )
    .handler(
      async ({ context, input }) =>
        await listFlows({
          ...input,
          workspaceId: context.workspace.id,
          active: true,
        }),
    ),

  createFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/flows",
      summary: "Create a flow",
      successStatus: 201,
      tags: ["Flows"],
    })
    .input(createFlowSchema)
    .output(flowResource)
    .handler(
      async ({ context, input }) =>
        await flowService.createFlow(context.workspace.id, input),
    ),

  getFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/flows/{id}",
      summary: "Get a flow",
      tags: ["Flows"],
    })
    .input(flowIdInput)
    .output(flowResource)
    .handler(
      async ({ context, input }) =>
        await flowService.getFlow({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  updateFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/flows/{id}",
      summary: "Update a flow",
      tags: ["Flows"],
    })
    .input(flowIdInput.and(updateFlowSchema))
    .output(flowResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await flowService.updateFlow(
        { workspaceId: context.workspace.id, id },
        data,
      )
    }),

  cloneFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/flows/{id}/clone",
      summary: "Clone a flow",
      successStatus: 201,
      tags: ["Flows"],
    })
    .input(flowIdInput)
    .output(flowResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const id = await flowService.cloneFlow({ workspaceId, id: input.id })
      return await flowService.getFlow({ workspaceId, id })
    }),

  publishFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/flows/{id}/publish",
      summary: "Publish a flow",
      tags: ["Flows"],
    })
    .input(flowIdInput.and(publishFlowSchema))
    .output(flowResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const { id, ...data } = input
      await flowService.publishFlow({ workspaceId, id }, data)
      return await flowService.getFlow({ workspaceId, id })
    }),
}

export default flowWorkspaceTokenAPIs
