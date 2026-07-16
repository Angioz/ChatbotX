import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  type SQL,
} from "@chatbotx.io/database/client"
import {
  type ChannelType,
  requiresRecentInteractionWindow,
} from "@chatbotx.io/database/partials"
import {
  buildContactInboxContactFilterSQL,
  contactInboxInteractedWithin24hSQL,
} from "@chatbotx.io/database/queries"
import {
  broadcastModel,
  contactInboxModel,
  contactModel,
  conversationModel,
  integrationMessengerModel,
  integrationWhatsappModel,
  messengerMessageTemplateModel,
  whatsappMessageTemplateModel,
} from "@chatbotx.io/database/schema"
import type { BroadcastModel } from "@chatbotx.io/database/types"
import { chunkById } from "@chatbotx.io/database/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { inboxService } from "../inbox/service"
import type {
  BroadcastAudienceInput,
  BroadcastAudiencePreviewRow,
  BroadcastTemplateDetail,
  CreateBroadcastInput,
  UpdateBroadcastInput,
} from "./schema"

const DEFAULT_CHUNK_SIZE = 1000
const OPTION_LIST_LIMIT = 500
const DEFAULT_PREVIEW_PER_PAGE = 20
const MAX_PREVIEW_PER_PAGE = 50

type ContactInboxRow = typeof contactInboxModel.$inferSelect
type SelectOptionRow = { id: string; name: string }

// Truncates seconds/ms so schedulesAt lines up with the minute-granularity
// scheduler, mirroring date-fns' startOfMinute() used by the action this was
// ported from — inlined to avoid adding a new dependency to this package.
const toStartOfMinute = (date: Date): Date => {
  const truncated = new Date(date)
  truncated.setSeconds(0, 0)
  return truncated
}

class BroadcastService extends BaseService {
  async getBroadcast(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<BroadcastModel> {
    const client = tx ?? db
    const broadcast = await client.query.broadcastModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
    if (!broadcast) {
      throw notFoundException("Broadcast not found")
    }
    return broadcast
  }

  // Ported from create-broadcast.action.ts (db.transaction at :122) — no
  // session/user id is persisted anywhere on this path (broadcastModel has no
  // createdBy column), so there is nothing to fabricate here.
  async createBroadcast(
    workspaceId: string,
    input: CreateBroadcastInput,
    tx?: DatabaseClient,
  ): Promise<BroadcastModel> {
    const client = tx ?? db
    let name = "Broadcast"

    // Never trust integration/flow/template ids from the client: they scope
    // the audience and message content, so a foreign id would let a
    // broadcast target another workspace's resources.
    if (input.integrationMessengerId) {
      const integration =
        await client.query.integrationMessengerModel.findFirst({
          where: { id: input.integrationMessengerId, workspaceId },
          columns: { id: true },
        })
      if (!integration) {
        throw notFoundException("Integration not found")
      }
    }

    if (input.integrationWhatsappId) {
      const integration =
        await client.query.integrationWhatsappModel.findFirst({
          where: { id: input.integrationWhatsappId, workspaceId },
          columns: { id: true },
        })
      if (!integration) {
        throw notFoundException("Integration not found")
      }
    }

    if (input.flowId) {
      const flow = await client.query.flowModel.findFirst({
        where: { workspaceId, id: input.flowId },
      })
      if (!flow) {
        throw notFoundException("Flow not found")
      }
      name = flow.name
    }

    if (input.templateId) {
      if (input.channel === "messenger") {
        const template =
          await client.query.messengerMessageTemplateModel.findFirst({
            where: {
              id: input.templateId,
              integrationMessengerId: input.integrationMessengerId ?? undefined,
              integrationMessenger: { workspaceId },
            },
          })
        if (!template) {
          throw notFoundException("Template not found")
        }
        name = template.name
      } else {
        const template =
          await client.query.whatsappMessageTemplateModel.findFirst({
            where: {
              id: input.templateId,
              integrationWhatsapp: {
                workspaceId,
                id: input.integrationWhatsappId ?? undefined,
              },
            },
          })
        if (!template) {
          throw notFoundException("Template not found")
        }
        name = template.name
      }
    }

    const [broadcast] = await client
      .insert(broadcastModel)
      .values({
        channel: input.channel,
        flowId: input.flowId ?? null,
        templateId: input.templateId ?? null,
        integrationWhatsappId: input.integrationWhatsappId ?? null,
        integrationMessengerId: input.integrationMessengerId ?? null,
        subaction: input.subaction,
        schedulesType: input.schedulesType,
        contactFilter: input.contactFilter ?? null,
        name,
        workspaceId,
        status: "scheduled",
        schedulesAt: toStartOfMinute(new Date(input.schedulesAt ?? new Date())),
        templateData: input.templateData
          ? { ...input.templateData, buttons: input.buttons ?? [] }
          : null,
      })
      .returning()

    return broadcast
  }

  async updateBroadcast(
    input: { workspaceId: string; id: string },
    data: UpdateBroadcastInput,
    tx?: DatabaseClient,
  ): Promise<BroadcastModel> {
    const client = tx ?? db
    await this.getBroadcast(input, client)

    const [broadcast] = await client
      .update(broadcastModel)
      .set(data)
      .where(
        and(
          eq(broadcastModel.id, input.id),
          eq(broadcastModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()

    if (!broadcast) {
      throw notFoundException("Broadcast not found")
    }
    return broadcast
  }

  async deleteBroadcast(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = tx ?? db
    await this.getBroadcast(input, client)

    await client
      .delete(broadcastModel)
      .where(
        and(
          eq(broadcastModel.id, input.id),
          eq(broadcastModel.workspaceId, input.workspaceId),
        ),
      )
  }

  async listOptions(input: {
    workspaceId: string
    channel: ChannelType
  }): Promise<SelectOptionRow[]> {
    return await db
      .select({
        id: broadcastModel.id,
        name: broadcastModel.name,
      })
      .from(broadcastModel)
      .where(
        and(
          eq(broadcastModel.workspaceId, input.workspaceId),
          eq(broadcastModel.channel, input.channel),
        ),
      )
      .orderBy(desc(broadcastModel.createdAt))
      .limit(OPTION_LIST_LIMIT)
  }

  private buildAudienceWhere(
    inboxIds: string[],
    input: BroadcastAudienceInput,
  ): SQL | undefined {
    return and(
      inArray(contactInboxModel.inboxId, inboxIds),
      input.contactFilter
        ? buildContactInboxContactFilterSQL({
            contactIdColumn: contactInboxModel.contactId,
            workspaceId: input.workspaceId,
            contactFilter: input.contactFilter,
          })
        : undefined,
      requiresRecentInteractionWindow(input.subaction)
        ? contactInboxInteractedWithin24hSQL()
        : undefined,
    )
  }

  private resolveInboxIds(input: BroadcastAudienceInput): Promise<string[]> {
    return inboxService.resolveBroadcastInboxIds({
      workspaceId: input.workspaceId,
      channels: input.channels,
      integrationWhatsappId: input.integrationWhatsappId,
      integrationMessengerId: input.integrationMessengerId,
    })
  }

  private buildDmConversationJoin(): SQL | undefined {
    return and(
      eq(conversationModel.contactId, contactInboxModel.contactId),
      isNull(conversationModel.sourceId),
    )
  }

  private buildAssignedConversationWhere(
    input: BroadcastAudienceInput,
  ): SQL | undefined {
    return input.restrictToAssignedUserId
      ? and(
          eq(conversationModel.workspaceId, input.workspaceId),
          eq(conversationModel.assignedUserId, input.restrictToAssignedUserId),
        )
      : undefined
  }

  async countAudience(input: BroadcastAudienceInput): Promise<number> {
    const inboxIds = await this.resolveInboxIds(input)
    if (inboxIds.length === 0) {
      return 0
    }

    if (input.restrictToAssignedUserId) {
      const [result] = await db
        .select({ count: count() })
        .from(contactInboxModel)
        .innerJoin(conversationModel, this.buildDmConversationJoin())
        .where(
          and(
            this.buildAudienceWhere(inboxIds, input),
            this.buildAssignedConversationWhere(input),
          ),
        )

      return result?.count ?? 0
    }

    return db.$count(
      contactInboxModel,
      this.buildAudienceWhere(inboxIds, input),
    )
  }

  async listAudiencePreview(
    input: BroadcastAudienceInput & {
      page?: number | null
      perPage?: number | null
    },
  ): Promise<BroadcastAudiencePreviewRow[]> {
    const inboxIds = await this.resolveInboxIds(input)
    if (inboxIds.length === 0) {
      return []
    }

    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(
      MAX_PREVIEW_PER_PAGE,
      Math.max(1, input.perPage ?? DEFAULT_PREVIEW_PER_PAGE),
    )

    const rows = await db
      .select({
        contactId: contactModel.id,
        contactInboxId: contactInboxModel.id,
        firstName: contactModel.firstName,
        lastName: contactModel.lastName,
        fullName: contactModel.fullName,
        avatar: contactModel.avatar,
        createdAt: contactModel.createdAt,
        channel: contactInboxModel.channel,
        conversationId: conversationModel.id,
      })
      .from(contactInboxModel)
      .innerJoin(contactModel, eq(contactModel.id, contactInboxModel.contactId))
      .leftJoin(conversationModel, this.buildDmConversationJoin())
      .where(
        and(
          this.buildAudienceWhere(inboxIds, input),
          eq(contactModel.workspaceId, input.workspaceId),
          this.buildAssignedConversationWhere(input),
        ),
      )
      .orderBy(asc(contactInboxModel.id))
      .limit(perPage)
      .offset((page - 1) * perPage)

    return rows.map((row) => ({
      ...row,
      channel: row.channel as ChannelType,
    }))
  }

  async getTemplateDetail(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<BroadcastTemplateDetail | null> {
    const broadcast = await db.query.broadcastModel.findFirst({
      where: {
        id: input.broadcastId,
        workspaceId: input.workspaceId,
      },
      columns: {
        templateId: true,
        channel: true,
      },
    })

    if (!broadcast?.templateId) {
      return null
    }

    if (broadcast.channel === "whatsapp") {
      const [template] = await db
        .select({
          id: whatsappMessageTemplateModel.id,
          name: whatsappMessageTemplateModel.name,
          language: whatsappMessageTemplateModel.language,
          category: whatsappMessageTemplateModel.category,
          status: whatsappMessageTemplateModel.status,
          components: whatsappMessageTemplateModel.components,
          integrationName: integrationWhatsappModel.name,
        })
        .from(whatsappMessageTemplateModel)
        .innerJoin(
          integrationWhatsappModel,
          eq(
            integrationWhatsappModel.id,
            whatsappMessageTemplateModel.integrationWhatsappId,
          ),
        )
        .where(
          and(
            eq(whatsappMessageTemplateModel.id, broadcast.templateId),
            eq(integrationWhatsappModel.workspaceId, input.workspaceId),
          ),
        )
        .limit(1)

      return template ? { ...template, channel: "whatsapp" } : null
    }

    if (broadcast.channel === "messenger") {
      const [template] = await db
        .select({
          id: messengerMessageTemplateModel.id,
          name: messengerMessageTemplateModel.name,
          language: messengerMessageTemplateModel.language,
          category: messengerMessageTemplateModel.category,
          status: messengerMessageTemplateModel.status,
          parameterFormat: messengerMessageTemplateModel.parameterFormat,
          components: messengerMessageTemplateModel.components,
          integrationName: integrationMessengerModel.name,
        })
        .from(messengerMessageTemplateModel)
        .innerJoin(
          integrationMessengerModel,
          eq(
            integrationMessengerModel.id,
            messengerMessageTemplateModel.integrationMessengerId,
          ),
        )
        .where(
          and(
            eq(messengerMessageTemplateModel.id, broadcast.templateId),
            eq(integrationMessengerModel.workspaceId, input.workspaceId),
          ),
        )
        .limit(1)

      return template ? { ...template, channel: "messenger" } : null
    }

    return null
  }

  async forEachAudienceChunk(
    input: BroadcastAudienceInput & { chunkSize?: number },
    onChunk: (rows: ContactInboxRow[]) => Promise<boolean | undefined>,
  ): Promise<void> {
    const inboxIds = await this.resolveInboxIds(input)
    if (inboxIds.length === 0) {
      return
    }

    const where = this.buildAudienceWhere(inboxIds, input)
    const chunkSize = input.chunkSize ?? DEFAULT_CHUNK_SIZE

    await chunkById<ContactInboxRow>(
      (lastId) =>
        db
          .select()
          .from(contactInboxModel)
          .where(
            and(where, lastId ? gt(contactInboxModel.id, lastId) : undefined),
          )
          .orderBy(asc(contactInboxModel.id))
          .limit(chunkSize),
      { chunkSize, callback: onChunk },
    )
  }
}

export const broadcastService = new BroadcastService()
