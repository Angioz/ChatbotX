import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  eq,
  ilike,
  inArray,
  isNull,
  isUniqueViolationError,
  sql,
} from "@chatbotx.io/database/client"
import {
  questionnaireAnswerModel,
  questionnaireModel,
  questionnaireQuestionModel,
  questionnaireSubmissionModel,
} from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { getQuestionnaireCacheTag, getQuestionnairesCacheTag } from "./cache"
import type { UpdateQuestionnaireInput } from "./types"

const ACTIVE_QUESTION_TYPES = new Set([
  "text",
  "number",
  "email",
  "phone",
  "multipleChoice",
])

const CUSTOM_FIELD_TYPES_BY_QUESTION_TYPE = {
  text: ["shortText", "longText"],
  multipleChoice: ["shortText", "longText"],
  number: ["number"],
  email: ["email"],
  phone: ["phoneNumber"],
} as const

export class QuestionnaireService extends BaseService {
  async findBy(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.questionnaireModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
  }

  async findByOrFail(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    const questionnaire = await this.findBy(input, tx)
    if (!questionnaire) {
      throw notFoundException("Questionnaire not found")
    }
    return questionnaire
  }

  async list(input: {
    workspaceId: string
    page?: number
    perPage?: number
    name?: string
    sort?: { id: string; desc: boolean }[]
  }) {
    const pagination = getPaginationWithDefaults({
      page: input.page,
      perPage: input.perPage ?? 10,
    })
    const whereSQL = and(
      eq(questionnaireModel.workspaceId, input.workspaceId),
      input.name
        ? ilike(questionnaireModel.name, likeContains(input.name))
        : undefined,
    )
    const order =
      input.sort?.find((item) => item.id === "name")?.desc === true
        ? sql`${questionnaireModel.name} desc`
        : asc(questionnaireModel.name)

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: questionnaireModel.id,
          workspaceId: questionnaireModel.workspaceId,
          name: questionnaireModel.name,
          active: questionnaireModel.active,
          createdAt: questionnaireModel.createdAt,
          updatedAt: questionnaireModel.updatedAt,
          applicantsCount: count(questionnaireSubmissionModel.id),
        })
        .from(questionnaireModel)
        .leftJoin(
          questionnaireSubmissionModel,
          eq(
            questionnaireSubmissionModel.questionnaireId,
            questionnaireModel.id,
          ),
        )
        .where(whereSQL)
        .groupBy(questionnaireModel.id)
        .orderBy(order)
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.$count(questionnaireModel, whereSQL),
    ])

    return {
      data: rows.map((row) => ({
        ...row,
        applicantsCount: Number(row.applicantsCount),
      })),
      pageCount: Math.ceil(totalRows / (input.perPage ?? 10)),
    }
  }

  async listForFlow(input: {
    workspaceId: string
    activeOnly?: boolean
    keyword?: string
  }) {
    return await db.query.questionnaireModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        active: input.activeOnly ? true : undefined,
        name: input.keyword
          ? { ilike: likeContains(input.keyword) }
          : undefined,
      },
      columns: {
        id: true,
        name: true,
        active: true,
      },
      orderBy: { name: "asc" },
    })
  }

  async getForEdit(input: { workspaceId: string; id: string }) {
    const questionnaire = await db.query.questionnaireModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
      with: {
        questions: {
          where: { deletedAt: { isNull: true } },
          orderBy: { orderNo: "asc" },
        },
      },
    })
    if (!questionnaire) {
      throw notFoundException("Questionnaire not found")
    }
    return questionnaire
  }

  async create(input: { workspaceId: string; name: string }) {
    try {
      const [row] = await db
        .insert(questionnaireModel)
        .values({
          id: createId(),
          workspaceId: input.workspaceId,
          name: input.name.trim(),
          active: true,
          triggerFlowId: null,
          enableScore: false,
          enableRetryMessages: false,
          enableCustomFieldMapping: true,
        })
        .returning({ id: questionnaireModel.id })

      await this.invalidate(input.workspaceId, row.id)
      return row.id
    } catch (error) {
      this.throwMappedUniqueError(error)
      throw error
    }
  }

  async rename(input: { workspaceId: string; id: string; name: string }) {
    try {
      const [row] = await db
        .update(questionnaireModel)
        .set({ name: input.name.trim() })
        .where(
          and(
            eq(questionnaireModel.id, input.id),
            eq(questionnaireModel.workspaceId, input.workspaceId),
          ),
        )
        .returning({ id: questionnaireModel.id })

      if (!row) {
        throw notFoundException("Questionnaire not found")
      }
      await this.invalidate(input.workspaceId, input.id)
    } catch (error) {
      this.throwMappedUniqueError(error)
      throw error
    }
  }

  async toggleActive(input: {
    workspaceId: string
    id: string
    active: boolean
  }) {
    const [row] = await db
      .update(questionnaireModel)
      .set({ active: input.active })
      .where(
        and(
          eq(questionnaireModel.id, input.id),
          eq(questionnaireModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: questionnaireModel.id })

    if (!row) {
      throw notFoundException("Questionnaire not found")
    }
    await this.invalidate(input.workspaceId, input.id)
  }

  async duplicate(input: { workspaceId: string; id: string }) {
    try {
      const newId = await db.transaction(async (tx) => {
        const questionnaire = await this.findByOrFail(input, tx)
        const questions = await tx.query.questionnaireQuestionModel.findMany({
          where: { questionnaireId: input.id, deletedAt: { isNull: true } },
          orderBy: { orderNo: "asc" },
        })
        const copiedId = createId()
        await tx.insert(questionnaireModel).values({
          id: copiedId,
          workspaceId: input.workspaceId,
          name: `${questionnaire.name} - Copy`,
          active: questionnaire.active,
          triggerFlowId: questionnaire.triggerFlowId,
          enableScore: questionnaire.enableScore,
          enableRetryMessages: questionnaire.enableRetryMessages,
          enableCustomFieldMapping: questionnaire.enableCustomFieldMapping,
        })
        if (questions.length > 0) {
          await tx.insert(questionnaireQuestionModel).values(
            questions.map((question) => ({
              id: createId(),
              questionnaireId: copiedId,
              title: question.title,
              type: question.type,
              orderNo: question.orderNo,
              point: question.point,
              retryMessage: question.retryMessage,
              customFieldId: question.customFieldId,
              config: question.config,
            })),
          )
        }
        return copiedId
      })

      await this.invalidate(input.workspaceId, newId)
      return newId
    } catch (error) {
      this.throwMappedUniqueError(error)
      throw error
    }
  }

  async deleteMany(input: { workspaceId: string; ids: string[] }) {
    if (input.ids.length === 0) {
      return
    }
    await db.transaction(async (tx) => {
      await tx
        .update(questionnaireSubmissionModel)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          currentQuestionId: null,
          currentQuestionSentAt: null,
        })
        .where(
          and(
            eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
            inArray(questionnaireSubmissionModel.questionnaireId, input.ids),
            eq(questionnaireSubmissionModel.status, "inProgress"),
          ),
        )
      await tx
        .delete(questionnaireModel)
        .where(
          and(
            eq(questionnaireModel.workspaceId, input.workspaceId),
            inArray(questionnaireModel.id, input.ids),
          ),
        )
    })
    await this.invalidate(input.workspaceId)
  }

  async update(input: UpdateQuestionnaireInput) {
    await this.validateEditInput(input)
    try {
      await db.transaction(async (tx) => {
        const questionnaire = await this.findByOrFail(input, tx)
        if (input.triggerFlowId) {
          const flow = await tx.query.flowModel.findFirst({
            where: {
              id: input.triggerFlowId,
              workspaceId: input.workspaceId,
              active: true,
            },
            columns: { id: true },
          })
          if (!flow) {
            throw notFoundException("Flow not found")
          }
        }

        await tx
          .update(questionnaireModel)
          .set({
            triggerFlowId: input.triggerFlowId ?? null,
            enableScore: input.enableScore,
            enableRetryMessages: input.enableRetryMessages,
            enableCustomFieldMapping: input.enableCustomFieldMapping,
          })
          .where(eq(questionnaireModel.id, questionnaire.id))

        const existingQuestions =
          await tx.query.questionnaireQuestionModel.findMany({
            where: {
              questionnaireId: questionnaire.id,
              deletedAt: { isNull: true },
            },
            columns: { id: true },
          })
        const submittedIds = new Set(
          input.questions.flatMap((question) =>
            question.id ? [question.id] : [],
          ),
        )
        const removedIds = existingQuestions
          .map((question) => question.id)
          .filter((id) => !submittedIds.has(id))

        for (const removedId of removedIds) {
          const answerCount = await tx.$count(
            questionnaireAnswerModel,
            eq(questionnaireAnswerModel.questionId, removedId),
          )
          if (answerCount > 0) {
            await tx
              .update(questionnaireQuestionModel)
              .set({ deletedAt: new Date() })
              .where(eq(questionnaireQuestionModel.id, removedId))
          } else {
            await tx
              .delete(questionnaireQuestionModel)
              .where(eq(questionnaireQuestionModel.id, removedId))
          }
        }

        for (const [index, question] of input.questions.entries()) {
          const values = {
            title: question.title.trim(),
            type: question.type,
            orderNo: index,
            point: question.point ?? 1,
            retryMessage: input.enableRetryMessages
              ? (question.retryMessage?.trim() ?? null)
              : null,
            customFieldId: input.enableCustomFieldMapping
              ? (question.customFieldId ?? null)
              : null,
            config:
              question.type === "multipleChoice"
                ? (question.config ?? { options: [] })
                : null,
          }

          if (question.id) {
            await tx
              .update(questionnaireQuestionModel)
              .set(values)
              .where(
                and(
                  eq(questionnaireQuestionModel.id, question.id),
                  eq(
                    questionnaireQuestionModel.questionnaireId,
                    questionnaire.id,
                  ),
                  isNull(questionnaireQuestionModel.deletedAt),
                ),
              )
          } else {
            await tx.insert(questionnaireQuestionModel).values({
              id: createId(),
              questionnaireId: questionnaire.id,
              ...values,
            })
          }
        }
      })

      await this.invalidate(input.workspaceId, input.id)
    } catch (error) {
      this.throwMappedUniqueError(error)
      throw error
    }
  }

  private async validateEditInput(input: UpdateQuestionnaireInput) {
    if (input.questions.length > 100) {
      throw new ChatbotXException(
        "Questionnaire can have at most 100 questions",
        "tooManyQuestions",
      )
    }

    const customFieldIds = input.questions.flatMap((question) =>
      input.enableCustomFieldMapping && question.customFieldId
        ? [question.customFieldId]
        : [],
    )
    const customFields =
      customFieldIds.length > 0
        ? await db.query.customFieldModel.findMany({
            where: {
              workspaceId: input.workspaceId,
              id: { in: customFieldIds },
            },
            columns: { id: true, type: true },
          })
        : []

    for (const question of input.questions) {
      if (!ACTIVE_QUESTION_TYPES.has(question.type)) {
        throw new ChatbotXException(
          "Unsupported question type",
          "unsupportedQuestionType",
        )
      }
      if (question.type === "multipleChoice") {
        const labels = (question.config?.options ?? []).map((option) =>
          option.label.trim(),
        )
        if (labels.length < 2) {
          throw new ChatbotXException(
            "Multiple choice questions require at least two options",
            "invalidOptions",
          )
        }
        if (new Set(labels).size !== labels.length) {
          throw new ChatbotXException(
            "Multiple choice option labels must be unique",
            "invalidOptions",
          )
        }
      }

      if (input.enableCustomFieldMapping && question.customFieldId) {
        const customField = customFields.find(
          (field) => field.id === question.customFieldId,
        )
        const allowedTypes =
          CUSTOM_FIELD_TYPES_BY_QUESTION_TYPE[
            question.type as keyof typeof CUSTOM_FIELD_TYPES_BY_QUESTION_TYPE
          ]
        if (
          !(customField && allowedTypes?.includes(customField.type as never))
        ) {
          throw new ChatbotXException(
            "Custom field does not match question type",
            "invalidCustomField",
          )
        }
      }
    }
  }

  async getQuestionnaireNameMap(input: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<Record<string, { name: string; active: boolean }>> {
    const { tx = db } = input
    if (input.ids.length === 0) {
      return {}
    }
    const rows = await tx
      .select({
        id: questionnaireModel.id,
        name: questionnaireModel.name,
        active: questionnaireModel.active,
      })
      .from(questionnaireModel)
      .where(
        and(
          eq(questionnaireModel.workspaceId, input.workspaceId),
          inArray(questionnaireModel.id, input.ids),
        ),
      )
    return Object.fromEntries(rows.map((row) => [row.id, row]))
  }

  private throwMappedUniqueError(error: unknown): never | undefined {
    if (isUniqueViolationError(error)) {
      throw new ChatbotXException(
        "Questionnaire name already exists",
        "nameAlreadyExists",
        409,
      )
    }
  }

  async invalidate(workspaceId: string, questionnaireId?: string) {
    await this.invalidateCacheTags([
      getQuestionnairesCacheTag(workspaceId),
      ...(questionnaireId
        ? [getQuestionnaireCacheTag(workspaceId, questionnaireId)]
        : []),
    ])
  }
}

export const questionnaireService = new QuestionnaireService()
