import {
  and,
  type DatabaseClient,
  db,
  eq,
  ne,
  relationsFilterToSQL,
  sql,
} from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  fbCommentAutomationModel,
  fbCommentAutomationReplyModel,
} from "@chatbotx.io/database/schema"
import type { FBCommentAutomationModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { formatInTimeZone } from "date-fns-tz"
import { aiAgentService } from "../ai-agent/service"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { flowService } from "../flow/service"
import type { PaginatedResult } from "../types"

export type CreateFbCommentAutomationInput = Pick<
  FBCommentAutomationModel,
  | "excludeKeywords"
  | "hideComments"
  | "includeKeywords"
  | "name"
  | "options"
  | "post"
  | "privateReply"
  | "publicReply"
  | "replyAfter"
> & { folderId?: string | null }

export type ListFbCommentAutomationsInput = {
  workspaceId: string
  folderId?: string | null
  isActive?: boolean | null
  name?: string | null
  page: number
  perPage: number
  sort: Array<{ id: string; desc: boolean }>
}

class FbCommentAutomationService extends BaseService {
  private async assertReplyReferencesExist(
    workspaceId: string,
    reply: Pick<FBCommentAutomationModel["publicReply"], "type" | "value">,
    tx?: DatabaseClient,
  ): Promise<void> {
    if (reply.type === "flow" && reply.value) {
      const exists = await flowService.exists(workspaceId, reply.value, tx)
      if (!exists) {
        throw new ChatbotXException(
          "Reply references a flow that does not exist in this workspace",
          "invalidRequestData",
          422,
        )
      }
    }

    if (reply.type === "AIAgent" && reply.value) {
      const agent = await aiAgentService.findBy({
        tx,
        where: { id: reply.value, workspaceId },
      })
      if (!agent) {
        throw new ChatbotXException(
          "Reply references an AI agent that does not exist in this workspace",
          "invalidRequestData",
          422,
        )
      }
    }
  }

  async create(
    workspaceId: string,
    input: CreateFbCommentAutomationInput,
    tx?: DatabaseClient,
  ): Promise<FBCommentAutomationModel> {
    await this.assertReplyReferencesExist(workspaceId, input.publicReply, tx)
    await this.assertReplyReferencesExist(workspaceId, input.privateReply, tx)

    const client = tx ?? db
    const [record] = await client
      .insert(fbCommentAutomationModel)
      .values({ ...input, id: createId(), workspaceId })
      .returning()

    return record
  }

  async list(
    input: ListFbCommentAutomationsInput,
    tx?: DatabaseClient,
  ): Promise<PaginatedResult<FBCommentAutomationModel>> {
    const client = tx ?? db
    let folderId: string | { isNull: true } | undefined
    if (input.folderId) {
      folderId =
        input.folderId === rootFolderId
          ? { isNull: true as const }
          : input.folderId
    }
    const where = {
      workspaceId: input.workspaceId,
      folderId,
      name: input.name ? { ilike: likeContains(input.name) } : undefined,
      isActive: input.isActive ?? undefined,
    }
    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(fbCommentAutomationModel, input)
    const [data, total] = await Promise.all([
      client.query.fbCommentAutomationModel.findMany({
        where,
        orderBy,
        ...pagination,
      }),
      client.$count(
        fbCommentAutomationModel,
        relationsFilterToSQL(fbCommentAutomationModel, where),
      ),
    ])

    return { data, pageCount: Math.ceil(total / pagination.limit) }
  }

  async get(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<FBCommentAutomationModel> {
    const client = tx ?? db
    const record = await client.query.fbCommentAutomationModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })

    if (!record) {
      throw notFoundException("Comment automation not found")
    }
    return record
  }

  async setStatus(
    input: { workspaceId: string; id: string },
    enabled: boolean,
    tx?: DatabaseClient,
  ): Promise<FBCommentAutomationModel> {
    const client = tx ?? db
    const [record] = await client
      .update(fbCommentAutomationModel)
      .set({ isActive: enabled })
      .where(
        and(
          eq(fbCommentAutomationModel.id, input.id),
          eq(fbCommentAutomationModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()

    if (!record) {
      throw notFoundException("Comment automation not found")
    }
    return record
  }

  async delete(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = tx ?? db
    const [record] = await client
      .delete(fbCommentAutomationModel)
      .where(
        and(
          eq(fbCommentAutomationModel.id, input.id),
          eq(fbCommentAutomationModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: fbCommentAutomationModel.id })

    if (!record) {
      throw notFoundException("Comment automation not found")
    }
  }

  findActiveAutomations(props: {
    workspaceId: string
    channelType: "messenger" | "instagram"
  }) {
    return db.query.fbCommentAutomationModel.findMany({
      where: {
        workspaceId: props.workspaceId,
        isActive: true,
        type: props.channelType,
      },
    })
  }

  isWithinSchedule(
    automation: { startTime: string | null; endTime: string | null },
    timezone: string,
  ): boolean {
    const { startTime, endTime } = automation
    if (!(startTime && endTime)) {
      return true
    }
    const currentTime = formatInTimeZone(new Date(), timezone, "HH:mm")

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime
    }
    // Overnight window (endTime is earlier than startTime, e.g. 22:00-06:00).
    return currentTime >= startTime || currentTime <= endTime
  }

  getPriorContactInboxCount(props: { contactId: string }) {
    return db.$count(
      contactInboxModel,
      eq(contactInboxModel.contactId, props.contactId),
    )
  }

  findDedup(props: {
    automationId: string
    contactId: string
    postId: string
  }) {
    return db.query.fbCommentAutomationReplyModel.findFirst({
      where: {
        automationId: props.automationId,
        contactId: props.contactId,
        postId: props.postId,
      },
    })
  }

  async insertDedup(props: {
    automationId: string
    contactId: string
    postId: string
    workspaceId: string
  }) {
    await db
      .insert(fbCommentAutomationReplyModel)
      .values({ id: createId(), ...props })
      .onConflictDoNothing()
  }

  async hasRepliedOnOtherPost(props: {
    automationId: string
    contactId: string
    postId: string
  }): Promise<boolean> {
    const rows = await db
      .select({ one: sql`1` })
      .from(fbCommentAutomationReplyModel)
      .where(
        and(
          eq(fbCommentAutomationReplyModel.automationId, props.automationId),
          eq(fbCommentAutomationReplyModel.contactId, props.contactId),
          ne(fbCommentAutomationReplyModel.postId, props.postId),
        ),
      )
      .limit(1)
    return rows.length > 0
  }

  async incrementRepliesCount(automationId: string) {
    await db
      .update(fbCommentAutomationModel)
      .set({
        repliesCount: sql`${fbCommentAutomationModel.repliesCount} + 1`,
      })
      .where(eq(fbCommentAutomationModel.id, automationId))
  }
}

export const fbCommentAutomationService = new FbCommentAutomationService()
