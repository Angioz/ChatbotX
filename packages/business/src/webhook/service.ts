import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import { conditionModel, webhookModel } from "@chatbotx.io/database/schema"
import type { ConditionModel, WebhookModel } from "@chatbotx.io/database/types"
import { removeWebhookCache, updateWebhookCache } from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { folderService } from "../folder"
import { assertWebhookUrlIsSafe } from "./ssrf"

export type CreateWebhookInput = Pick<WebhookModel, "folderId" | "name">

export type WebhookConditionInput = Pick<ConditionModel, "type"> &
  Partial<Pick<ConditionModel, "id" | "operator" | "sourceId" | "value">>

export type UpdateWebhookInput = {
  conditions: WebhookConditionInput[]
  url: string
}

const MAX_WEBHOOKS_PER_WORKSPACE = 10

class WebhookService extends BaseService {
  async listByWorkspaceId(
    workspaceId: string,
    tx?: DatabaseClient,
  ): Promise<WebhookModel[]> {
    const client = tx ?? db
    return await client
      .select()
      .from(webhookModel)
      .where(eq(webhookModel.workspaceId, workspaceId))
  }

  async findBy(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<WebhookModel | undefined> {
    const client = tx ?? db
    return await client.query.webhookModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
  }

  async findOrFail(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<WebhookModel> {
    const webhook = await this.findBy(input, tx)
    if (!webhook) {
      throw notFoundException("Webhook not found")
    }
    return webhook
  }

  async createWebhook(
    workspaceId: string,
    input: CreateWebhookInput,
    tx?: DatabaseClient,
  ): Promise<WebhookModel> {
    const client = tx ?? db
    const existingWebhooksCount = await client.$count(
      webhookModel,
      eq(webhookModel.workspaceId, workspaceId),
    )

    if (existingWebhooksCount >= MAX_WEBHOOKS_PER_WORKSPACE) {
      throw new ChatbotXException(
        `Maximum ${MAX_WEBHOOKS_PER_WORKSPACE} webhooks allowed per workspace`,
      )
    }

    if (input.folderId) {
      await folderService.ensureExists({
        id: input.folderId,
        workspaceId,
        folderType: "webhook",
        tx: client,
      })
    }

    const [webhook] = await client
      .insert(webhookModel)
      .values({
        id: createId(),
        ...input,
        workspaceId,
        url: "",
      })
      .returning()

    await updateWebhookCache(workspaceId)
    return webhook
  }

  async updateWebhook(
    input: { workspaceId: string; id: string },
    data: UpdateWebhookInput,
    tx?: DatabaseClient,
  ): Promise<WebhookModel> {
    if (data.url) {
      await assertWebhookUrlIsSafe(data.url)
    }

    const execute = async (client: DatabaseClient) => {
      await this.findOrFail(input, client)

      const existingConditions = await client.query.conditionModel.findMany({
        where: { webhookId: input.id },
      })
      const existingIds = new Set(existingConditions.map(({ id }) => id))
      const submittedIds = new Set(
        data.conditions.flatMap(({ id }) => (id ? [id] : [])),
      )
      const conditionsToDelete = existingConditions.filter(
        ({ id }) => !submittedIds.has(id),
      )
      const conditionsToUpdate = data.conditions.filter(
        (condition): condition is WebhookConditionInput & { id: string } =>
          Boolean(condition.id && existingIds.has(condition.id)),
      )
      const conditionsToCreate = data.conditions.filter(
        (condition) => !condition.id,
      )

      await client
        .update(webhookModel)
        .set({ url: data.url })
        .where(
          and(
            eq(webhookModel.id, input.id),
            eq(webhookModel.workspaceId, input.workspaceId),
          ),
        )

      if (conditionsToDelete.length > 0) {
        await client.delete(conditionModel).where(
          and(
            eq(conditionModel.webhookId, input.id),
            inArray(
              conditionModel.id,
              conditionsToDelete.map(({ id }) => id),
            ),
          ),
        )
      }

      for (const condition of conditionsToUpdate) {
        await client
          .update(conditionModel)
          .set({
            type: condition.type,
            sourceId: "sourceId" in condition ? condition.sourceId : null,
            operator: "operator" in condition ? condition.operator : null,
            value:
              "value" in condition && condition.value !== null
                ? condition.value
                : null,
          })
          .where(
            and(
              eq(conditionModel.id, condition.id),
              eq(conditionModel.webhookId, input.id),
            ),
          )
      }

      if (conditionsToCreate.length > 0) {
        await client.insert(conditionModel).values(
          conditionsToCreate.map((condition) => ({
            id: createId(),
            webhookId: input.id,
            type: condition.type,
            sourceId: "sourceId" in condition ? condition.sourceId : null,
            operator: "operator" in condition ? condition.operator : null,
            value:
              "value" in condition && condition.value !== null
                ? condition.value
                : null,
          })),
        )
      }

      return await this.findOrFail(input, client)
    }

    const webhook = await (tx ? execute(tx) : db.transaction(execute))
    await updateWebhookCache(input.workspaceId)
    return webhook
  }

  async deleteWebhook(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = tx ?? db
    await this.findOrFail(input, client)
    await client
      .delete(webhookModel)
      .where(
        and(
          eq(webhookModel.id, input.id),
          eq(webhookModel.workspaceId, input.workspaceId),
        ),
      )
    await removeWebhookCache(input.workspaceId)
  }
}

export const webhookService = new WebhookService()
