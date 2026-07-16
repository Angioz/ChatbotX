import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isDatabaseError,
} from "@chatbotx.io/database/client"
import { conditionModel, triggerModel } from "@chatbotx.io/database/schema"
import type { TriggerModel } from "@chatbotx.io/database/types"
import { removeTriggerCache, updateTriggerCache } from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { folderService } from "../folder"

// Mirrors apps/builder/src/features/triggers/constants.ts MAX_TRIGGERS_PER_CHATBOT.
// The business layer cannot depend on the app package, so the literal is duplicated here.
const MAX_TRIGGERS_PER_CHATBOT = 50

const WORKSPACE_NAME_UNIQUE_CONSTRAINT = "Trigger_workspaceId_name_key"

const isNameUniqueViolation = (error: unknown): boolean => {
  if (!(isDatabaseError(error) && error.cause.code === "23505")) {
    return false
  }
  return (
    "constraint" in error.cause &&
    error.cause.constraint === WORKSPACE_NAME_UNIQUE_CONSTRAINT
  )
}

export type CreateTriggerInput = {
  name: string
  folderId: string | null
}

export type ConditionInput = {
  id?: string
  type: string
  sourceId?: string | null
  operator?: string | null
  value?: unknown
}

export type UpdateTriggerInput = {
  conditions: ConditionInput[]
  actions: unknown[]
}

class TriggerService extends BaseService {
  async listByWorkspaceId(workspaceId: string): Promise<TriggerModel[]> {
    return await db
      .select()
      .from(triggerModel)
      .where(eq(triggerModel.workspaceId, workspaceId))
  }

  async findBy(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<TriggerModel | undefined> {
    const client = tx ?? db
    return await client.query.triggerModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
  }

  async findOrFail(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<TriggerModel> {
    const trigger = await this.findBy(input, tx)
    if (!trigger) {
      throw notFoundException("Trigger not found")
    }
    return trigger
  }

  async createTrigger(
    workspaceId: string,
    input: CreateTriggerInput,
    tx?: DatabaseClient,
  ): Promise<TriggerModel> {
    const client = tx ?? db

    const existingTriggersCount = await client.$count(
      triggerModel,
      eq(triggerModel.workspaceId, workspaceId),
    )

    if (existingTriggersCount >= MAX_TRIGGERS_PER_CHATBOT) {
      throw new ChatbotXException(
        `Maximum of ${MAX_TRIGGERS_PER_CHATBOT} triggers reached for this workspace`,
        "businessError",
        400,
      )
    }

    if (input.folderId) {
      await folderService.ensureExists({
        id: input.folderId,
        workspaceId,
        folderType: "trigger",
        tx,
      })
    }

    try {
      const [trigger] = await client
        .insert(triggerModel)
        .values({
          id: createId(),
          name: input.name,
          folderId: input.folderId,
          actions: [],
          workspaceId,
        })
        .returning()

      await updateTriggerCache(workspaceId)

      return trigger
    } catch (error) {
      if (isNameUniqueViolation(error)) {
        throw new ChatbotXException(
          "A trigger with this name already exists",
          "invalidRequestData",
          422,
        )
      }
      throw error
    }
  }

  async updateTrigger(
    input: { workspaceId: string; id: string },
    data: UpdateTriggerInput,
    tx?: DatabaseClient,
  ): Promise<TriggerModel> {
    const { workspaceId, id } = input
    const { conditions, actions } = data

    const execute = async (client: DatabaseClient) => {
      // Cross-workspace scoping the original action's final unscoped select lacked.
      await this.findOrFail({ workspaceId, id }, client)

      const existingConditions = await client.query.conditionModel.findMany({
        where: { triggerId: id },
      })

      const existingIds = new Set(existingConditions.map((c) => c.id))
      const submittedIds = new Set(
        conditions.filter((c) => c.id).map((c) => c.id),
      )

      const conditionsToDelete = existingConditions.filter(
        (existing) => !submittedIds.has(existing.id.toString()),
      )

      const conditionsToUpdate = conditions.filter(
        (c) => c.id && existingIds.has(c.id),
      )

      const conditionsToCreate = conditions.filter((c) => !c.id)

      await client
        .update(triggerModel)
        .set({ actions })
        .where(
          and(
            eq(triggerModel.id, id),
            eq(triggerModel.workspaceId, workspaceId),
          ),
        )

      if (conditionsToDelete.length > 0) {
        await client.delete(conditionModel).where(
          inArray(
            conditionModel.id,
            conditionsToDelete.map((c) => c.id),
          ),
        )
      }

      for (const condition of conditionsToUpdate) {
        await client
          .update(conditionModel)
          .set({
            type: condition.type,
            sourceId: condition.sourceId ?? null,
            operator: condition.operator ?? null,
            value: condition.value ?? null,
          })
          .where(eq(conditionModel.id, condition.id ?? ""))
      }

      if (conditionsToCreate.length > 0) {
        await client.insert(conditionModel).values(
          conditionsToCreate.map((c) => ({
            id: createId(),
            triggerId: id,
            type: c.type,
            sourceId: c.sourceId ?? null,
            operator: c.operator ?? null,
            value: c.value ?? null,
          })),
        )
      }

      const updated = await client.query.triggerModel.findFirst({
        where: { id, workspaceId },
      })
      if (!updated) {
        throw notFoundException("Trigger not found")
      }
      return updated
    }

    const result = tx ? await execute(tx) : await db.transaction(execute)

    await updateTriggerCache(workspaceId)

    return result
  }

  async deleteTrigger(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = tx ?? db
    await this.findOrFail(input, client)

    // Condition rows cascade-delete via the Condition_triggerId FK (onDelete: cascade).
    await client.delete(triggerModel).where(
      and(
        eq(triggerModel.id, input.id),
        eq(triggerModel.workspaceId, input.workspaceId),
      ),
    )

    await removeTriggerCache(input.workspaceId)
  }
}

export const triggerService = new TriggerService()
