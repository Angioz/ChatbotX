import {
  and,
  type DatabaseClient,
  db,
  eq,
  isDatabaseError,
} from "@chatbotx.io/database/client"
import { sequenceModel } from "@chatbotx.io/database/schema"
import type { SequenceModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { folderService } from "../folder"

export type CreateSequenceInput = {
  name: string
  folderId: string | null
}

export type UpdateSequenceInput = Partial<
  Pick<SequenceModel, "name" | "active">
>

const WORKSPACE_NAME_UNIQUE_CONSTRAINT = "Sequence_workspaceId_name_key"

const isNameUniqueViolation = (error: unknown): boolean => {
  if (!(isDatabaseError(error) && error.cause.code === "23505")) {
    return false
  }
  return (
    "constraint" in error.cause &&
    error.cause.constraint === WORKSPACE_NAME_UNIQUE_CONSTRAINT
  )
}

class SequenceService extends BaseService {
  async findBy(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<SequenceModel | undefined> {
    const client = tx ?? db
    return await client.query.sequenceModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
  }

  async findOrFail(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<SequenceModel> {
    const sequence = await this.findBy(input, tx)
    if (!sequence) {
      throw notFoundException("Sequence not found")
    }
    return sequence
  }

  async createSequence(
    workspaceId: string,
    input: CreateSequenceInput,
    tx?: DatabaseClient,
  ): Promise<SequenceModel> {
    if (input.folderId) {
      await folderService.ensureExists({
        id: input.folderId,
        workspaceId,
        folderType: "sequence",
        tx,
      })
    }

    const client = tx ?? db

    try {
      const [sequence] = await client
        .insert(sequenceModel)
        .values({ ...input, id: createId(), workspaceId })
        .returning()

      return sequence
    } catch (error) {
      if (isNameUniqueViolation(error)) {
        throw new ChatbotXException(
          "A sequence with this name already exists",
          "invalidRequestData",
          422,
        )
      }
      throw error
    }
  }

  async updateSequence(
    input: { workspaceId: string; id: string },
    data: UpdateSequenceInput,
    tx?: DatabaseClient,
  ): Promise<SequenceModel> {
    const client = tx ?? db
    await this.findOrFail(input, client)

    try {
      const [sequence] = await client
        .update(sequenceModel)
        .set(data)
        .where(
          and(
            eq(sequenceModel.id, input.id),
            eq(sequenceModel.workspaceId, input.workspaceId),
          ),
        )
        .returning()

      if (!sequence) {
        throw notFoundException("Sequence not found")
      }
      return sequence
    } catch (error) {
      if (isNameUniqueViolation(error)) {
        throw new ChatbotXException(
          "A sequence with this name already exists",
          "invalidRequestData",
          422,
        )
      }
      throw error
    }
  }

  async deleteSequence(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = tx ?? db
    await this.findOrFail(input, client)

    await client
      .delete(sequenceModel)
      .where(
        and(
          eq(sequenceModel.id, input.id),
          eq(sequenceModel.workspaceId, input.workspaceId),
        ),
      )
  }
}

export const sequenceService = new SequenceService()
