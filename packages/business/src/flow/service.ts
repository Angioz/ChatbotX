import { and, type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import {
  flowAnalyticsSessionModel,
  flowModel,
  flowVersionModel,
} from "@chatbotx.io/database/schema"
import type { FlowModel, FlowVersionModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { flowVersionService } from "../flow-version"
import { folderService } from "../folder"

export type CreateFlowInput = {
  folderId: string | null
  name: string
}

export type UpdateFlowInput = Partial<
  Pick<FlowModel, "active" | "enableInInbox" | "name">
>

export type PublishFlowInput = Pick<FlowVersionModel, "edges" | "nodes">

const createDefaultSendMessageNode = () => ({
  id: createId(),
  position: { x: 100, y: 300 },
  measured: { width: 288, height: 100 },
  type: "sendMessage",
  data: {
    name: "Send Message #1",
    isStartNode: true,
    details: {
      beforeStep: {
        id: createId(),
        stepType: "chooseChannel",
        channel: "omnichannel",
      },
      steps: [],
      quickReplies: [],
    },
  },
})

class FlowService extends BaseService {
  async findBy(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<FlowModel | undefined> {
    const client = tx ?? db
    return await client.query.flowModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
  }

  async exists(
    workspaceId: string,
    flowId: string,
    tx?: DatabaseClient,
  ): Promise<boolean> {
    const row = await this.findBy({ workspaceId, id: flowId }, tx)
    return Boolean(row)
  }

  async getFlow(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<FlowModel> {
    const flow = await this.findBy(input, tx)
    if (!flow) {
      throw notFoundException("Flow not found")
    }
    return flow
  }

  async createFlow(
    workspaceId: string,
    input: CreateFlowInput,
    tx?: DatabaseClient,
  ): Promise<FlowModel> {
    if (input.folderId) {
      await folderService.ensureExists({
        id: input.folderId,
        workspaceId,
        folderType: "flow",
        tx,
      })
    }

    const defaultNode = createDefaultSendMessageNode()
    const execute = async (client: DatabaseClient) => {
      const flowId = createId()
      const [flow] = await client
        .insert(flowModel)
        .values({ ...input, id: flowId, workspaceId })
        .returning()

      await client.insert(flowAnalyticsSessionModel).values({
        id: createId(),
        workspaceId,
        flowId,
      })

      await client.insert(flowVersionModel).values({
        id: createId(),
        workspaceId,
        flowId,
        nodes: [defaultNode],
        edges: [],
        isDraft: true,
        startNodeId: defaultNode.id,
      })

      return flow
    }

    return await (tx ? execute(tx) : db.transaction(execute))
  }

  async updateFlow(
    input: { workspaceId: string; id: string },
    data: UpdateFlowInput,
    tx?: DatabaseClient,
  ): Promise<FlowModel> {
    const client = tx ?? db
    await this.getFlow(input, client)

    const [flow] = await client
      .update(flowModel)
      .set(data)
      .where(
        and(
          eq(flowModel.id, input.id),
          eq(flowModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()

    if (!flow) {
      throw notFoundException("Flow not found")
    }
    return flow
  }

  async cloneFlow(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<string> {
    const execute = async (client: DatabaseClient) => {
      const flow = await this.getFlow(input, client)

      const draftVersion = await flowVersionService.findDraft(
        {
          flowId: flow.id,
          workspaceId: flow.workspaceId,
        },
        client,
      )
      if (!draftVersion) {
        throw notFoundException("Draft version not found")
      }

      const newFlowId = createId()
      const draftVersionId = createId()
      await client.insert(flowModel).values({
        id: newFlowId,
        name: `${flow.name} _copy`,
        active: flow.active,
        enableInInbox: flow.enableInInbox,
        workspaceId: flow.workspaceId,
        folderId: flow.folderId,
        currentVersionId: null,
        draftVersionId,
      })
      await client.insert(flowAnalyticsSessionModel).values({
        id: createId(),
        flowId: newFlowId,
        workspaceId: flow.workspaceId,
      })
      await client.insert(flowVersionModel).values({
        id: draftVersionId,
        workspaceId: flow.workspaceId,
        flowId: newFlowId,
        nodes: draftVersion.nodes,
        edges: draftVersion.edges,
        isDraft: true,
        isLatest: false,
        startNodeId: draftVersion.startNodeId,
      })

      return newFlowId
    }

    return await (tx ? execute(tx) : db.transaction(execute))
  }

  async publishFlow(
    input: { workspaceId: string; id: string },
    data: PublishFlowInput,
    tx?: DatabaseClient,
  ): Promise<void> {
    const execute = async (client: DatabaseClient) => {
      const flow = await client.query.flowModel.findFirst({
        where: { id: input.id, workspaceId: input.workspaceId },
        with: {
          flowVersions: {
            where: { workspaceId: input.workspaceId, isDraft: true },
          },
        },
      })

      if (!flow || flow.flowVersions.length === 0) {
        throw notFoundException("Flow not found")
      }

      const draftVersion = flow.flowVersions[0]
      await client
        .update(flowVersionModel)
        .set({ isLatest: false })
        .where(
          and(
            eq(flowVersionModel.flowId, flow.id),
            eq(flowVersionModel.workspaceId, input.workspaceId),
            eq(flowVersionModel.isLatest, true),
          ),
        )

      await client
        .update(flowVersionModel)
        .set({ nodes: data.nodes, edges: data.edges })
        .where(
          and(
            eq(flowVersionModel.id, draftVersion.id),
            eq(flowVersionModel.flowId, flow.id),
            eq(flowVersionModel.workspaceId, input.workspaceId),
            eq(flowVersionModel.isDraft, true),
          ),
        )

      const newVersionId = createId()
      await client.insert(flowVersionModel).values({
        id: newVersionId,
        workspaceId: input.workspaceId,
        flowId: flow.id,
        isDraft: false,
        isLatest: true,
        ...data,
        startNodeId: draftVersion.startNodeId,
      })

      await client
        .update(flowModel)
        .set({ currentVersionId: newVersionId })
        .where(
          and(
            eq(flowModel.id, flow.id),
            eq(flowModel.workspaceId, input.workspaceId),
          ),
        )
    }

    await (tx ? execute(tx) : db.transaction(execute))
    await flowVersionService.invalidateList(input.id)
  }

  duplicate(input: { workspaceId: string; id: string }): Promise<string> {
    return this.cloneFlow(input)
  }
}

export const flowService = new FlowService()
