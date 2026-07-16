import { triggerService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createTriggerSchema, updateTriggerSchema } from "../schema/mutation"
import { triggerResource } from "../schema/resource"

const listTriggersWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/triggers",
    summary: "List triggers",
    tags: ["Triggers"],
  })
  .output(z.object({ data: z.array(triggerResource) }))
  .handler(async ({ context }) => {
    const triggers = await triggerService.listByWorkspaceId(
      context.workspace.id,
    )
    return {
      data: triggers.map((trigger) => ({
        ...trigger,
        conditions: [],
        actions: [],
      })),
    }
  })

const createTriggerWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "POST",
    path: "/v1/triggers",
    summary: "Create a trigger",
    tags: ["Triggers"],
    successStatus: 201,
  })
  .input(createTriggerSchema)
  .output(triggerResource)
  .errors(possibleErrorsOnCreatingResource)
  .handler(async ({ context, input }) => {
    const trigger = await triggerService.createTrigger(context.workspace.id, {
      name: input.name,
      folderId: input.folderId,
    })

    return { ...trigger, conditions: [] }
  })

const updateTriggerWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "PUT",
    path: "/v1/triggers/{id}",
    summary: "Update a trigger",
    tags: ["Triggers"],
  })
  .input(updateTriggerSchema.and(z.object({ id: zodBigintAsString() })))
  .output(triggerResource)
  .errors(possibleErrorsOnUpdatingResource)
  .handler(async ({ context, input }) => {
    const { id, conditions, actions } = input

    const trigger = await triggerService.updateTrigger(
      { workspaceId: context.workspace.id, id },
      { conditions, actions },
    )

    return { ...trigger, conditions: [] }
  })

const deleteTriggerWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "DELETE",
    path: "/v1/triggers/{id}",
    summary: "Delete a trigger",
    tags: ["Triggers"],
    successStatus: 204,
  })
  .input(z.object({ id: zodBigintAsString() }))
  .errors(possibleErrorsOnDeletingResource)
  .handler(async ({ context, input }) => {
    await triggerService.deleteTrigger({
      workspaceId: context.workspace.id,
      id: input.id,
    })
  })

export const triggersWorkspaceTokenAPIs = {
  listTriggersWorkspaceTokenAPI,
  createTriggerWorkspaceTokenAPI,
  updateTriggerWorkspaceTokenAPI,
  deleteTriggerWorkspaceTokenAPI,
}

export default triggersWorkspaceTokenAPIs
