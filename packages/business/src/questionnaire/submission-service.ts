import {
  and,
  count,
  type DatabaseClient,
  db,
  desc,
  eq,
  ilike,
  lte,
  sql,
  sum,
} from "@chatbotx.io/database/client"
import type {
  QuestionnaireAnswerValue,
  QuestionnaireChoiceOption,
} from "@chatbotx.io/database/schema"
import {
  contactModel,
  questionnaireAnswerModel,
  type questionnaireQuestionModel,
  questionnaireSubmissionModel,
} from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { contactCustomFieldService } from "../contact-custom-field/service"
import { notFoundException } from "../errors"
import { questionnaireService } from "./service"

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phoneRegex = /^\+?(\d[\d-. ]+)?(\([\d-. ]+\))?[\d-. ]+\d$/
export const QUESTIONNAIRE_TIMEOUT_MS = 24 * 60 * 60 * 1000

class QuestionnaireSubmissionService extends BaseService {
  async list(input: {
    workspaceId: string
    questionnaireId: string
    page?: number
    perPage?: number
    name?: string
  }) {
    const questionnaire = await questionnaireService.findByOrFail({
      workspaceId: input.workspaceId,
      id: input.questionnaireId,
    })
    const pagination = getPaginationWithDefaults({
      page: input.page,
      perPage: input.perPage ?? 10,
    })
    const whereSQL = and(
      eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
      eq(questionnaireSubmissionModel.questionnaireId, input.questionnaireId),
      input.name
        ? ilike(contactModel.fullName, likeContains(input.name))
        : undefined,
    )
    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: questionnaireSubmissionModel.id,
          status: questionnaireSubmissionModel.status,
          totalPoints: questionnaireSubmissionModel.totalPoints,
          completedAt: questionnaireSubmissionModel.completedAt,
          conversationId: questionnaireSubmissionModel.conversationId,
          contact: {
            id: contactModel.id,
            fullName: contactModel.fullName,
            firstName: contactModel.firstName,
            lastName: contactModel.lastName,
            email: contactModel.email,
            phoneNumber: contactModel.phoneNumber,
            avatar: contactModel.avatar,
          },
        })
        .from(questionnaireSubmissionModel)
        .innerJoin(
          contactModel,
          eq(questionnaireSubmissionModel.contactId, contactModel.id),
        )
        .where(whereSQL)
        .orderBy(desc(questionnaireSubmissionModel.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db
        .select({ value: count() })
        .from(questionnaireSubmissionModel)
        .innerJoin(
          contactModel,
          eq(questionnaireSubmissionModel.contactId, contactModel.id),
        )
        .where(whereSQL)
        .then((rows) => Number(rows[0]?.value ?? 0)),
    ])

    return {
      enableScore: questionnaire.enableScore,
      data: rows,
      pageCount: Math.ceil(totalRows / (input.perPage ?? 10)),
    }
  }

  async dashboard(input: { workspaceId: string; questionnaireId: string }) {
    await questionnaireService.findByOrFail({
      workspaceId: input.workspaceId,
      id: input.questionnaireId,
    })
    const [row] = await db
      .select({
        totalApplicants: count(),
        completed: count(
          sql`CASE WHEN ${questionnaireSubmissionModel.status} = 'completed' THEN 1 END`,
        ),
      })
      .from(questionnaireSubmissionModel)
      .where(
        and(
          eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
          eq(
            questionnaireSubmissionModel.questionnaireId,
            input.questionnaireId,
          ),
        ),
      )
    const totalApplicants = Number(row?.totalApplicants ?? 0)
    const completed = Number(row?.completed ?? 0)
    return {
      totalApplicants,
      completed,
      completionRate:
        totalApplicants === 0
          ? 0
          : Math.round((completed / totalApplicants) * 100),
    }
  }

  async detail(input: {
    workspaceId: string
    questionnaireId: string
    submissionId: string
  }) {
    const submission = await db.query.questionnaireSubmissionModel.findFirst({
      where: {
        id: input.submissionId,
        workspaceId: input.workspaceId,
        questionnaireId: input.questionnaireId,
      },
      with: {
        contact: true,
        answers: {
          orderBy: { createdAt: "asc" },
        },
      },
    })
    if (!submission) {
      throw notFoundException("Submission not found")
    }
    return {
      id: submission.id,
      contact: submission.contact,
      conversationId: submission.conversationId,
      status: submission.status,
      totalPoints: submission.totalPoints,
      answers: submission.answers.map((answer) => ({
        questionId: answer.questionIdSnapshot,
        label: answer.labelSnapshot,
        value: answer.value,
        pointsEarned: answer.pointsEarned,
      })),
    }
  }

  async startOrResume(input: {
    workspaceId: string
    questionnaireId: string
    contactId: string
    conversationId?: string | null
  }) {
    return await db.transaction(async (tx) => {
      const questionnaire = await tx.query.questionnaireModel.findFirst({
        where: {
          id: input.questionnaireId,
          workspaceId: input.workspaceId,
          active: true,
        },
        with: {
          questions: {
            where: { deletedAt: { isNull: true } },
            orderBy: { orderNo: "asc" },
          },
        },
      })
      if (!questionnaire) {
        return {
          status: "skip" as const,
          reason: "questionnaire_not_available",
        }
      }
      if (questionnaire.questions.length === 0) {
        return { status: "skip" as const, reason: "questionnaire_empty" }
      }

      const existing = await tx.query.questionnaireSubmissionModel.findFirst({
        where: {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          questionnaireId: input.questionnaireId,
          status: "inProgress",
        },
      })
      if (existing) {
        const currentQuestion =
          questionnaire.questions.find(
            (question) => question.id === existing.currentQuestionId,
          ) ?? questionnaire.questions[0]
        return {
          status: "wait" as const,
          questionnaire,
          submission: existing,
          question: currentQuestion,
        }
      }

      const submissionId = createId()
      const firstQuestion = questionnaire.questions[0]
      const [submission] = await tx
        .insert(questionnaireSubmissionModel)
        .values({
          id: submissionId,
          workspaceId: input.workspaceId,
          questionnaireId: input.questionnaireId,
          contactId: input.contactId,
          conversationId: input.conversationId ?? null,
          status: "inProgress",
          totalPoints: questionnaire.enableScore ? 0 : null,
          currentQuestionId: firstQuestion.id,
          currentQuestionSentAt: new Date(),
        })
        .returning()

      return {
        status: "wait" as const,
        questionnaire,
        submission,
        question: firstQuestion,
      }
    })
  }

  async markQuestionSent(input: {
    workspaceId: string
    submissionId: string
    questionId: string
    sentAt: Date
  }) {
    await db
      .update(questionnaireSubmissionModel)
      .set({
        currentQuestionId: input.questionId,
        currentQuestionSentAt: input.sentAt,
      })
      .where(
        and(
          eq(questionnaireSubmissionModel.id, input.submissionId),
          eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
          eq(questionnaireSubmissionModel.status, "inProgress"),
        ),
      )
  }

  async answerCurrent(input: {
    workspaceId: string
    contactId: string
    conversationId: string
    questionnaireId: string
    rawText: string
  }) {
    return await db.transaction(async (tx) => {
      const submission = await tx.query.questionnaireSubmissionModel.findFirst({
        where: {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          conversationId: input.conversationId,
          questionnaireId: input.questionnaireId,
          status: "inProgress",
        },
      })
      if (!submission?.currentQuestionId) {
        return { status: "skip" as const, reason: "submission_not_found" }
      }
      const questionnaire = await tx.query.questionnaireModel.findFirst({
        where: { id: input.questionnaireId, workspaceId: input.workspaceId },
      })
      const question = await tx.query.questionnaireQuestionModel.findFirst({
        where: {
          id: submission.currentQuestionId,
          questionnaireId: input.questionnaireId,
          deletedAt: { isNull: true },
        },
        with: { customField: true },
      })
      if (!(questionnaire && question)) {
        await this.cancel(
          {
            workspaceId: input.workspaceId,
            questionnaireId: input.questionnaireId,
            contactId: input.contactId,
          },
          tx,
        )
        return { status: "skip" as const, reason: "question_missing" }
      }

      const parsed = this.parseAnswer(question, input.rawText)
      if (!parsed.valid) {
        const existing = await tx.query.questionnaireAnswerModel.findFirst({
          where: {
            submissionId: submission.id,
            questionIdSnapshot: question.id,
          },
        })
        if (existing) {
          await tx
            .update(questionnaireAnswerModel)
            .set({ attemptCount: existing.attemptCount + 1 })
            .where(eq(questionnaireAnswerModel.id, existing.id))
        }
        return {
          status: "retry" as const,
          retryMessage: question.retryMessage,
          reason: parsed.reason,
        }
      }

      const pointsEarned = questionnaire.enableScore
        ? this.calculatePoints(question, parsed.value)
        : null
      const labelSnapshot = question.customField?.name ?? question.title
      await tx
        .insert(questionnaireAnswerModel)
        .values({
          id: createId(),
          submissionId: submission.id,
          questionId: question.id,
          questionIdSnapshot: question.id,
          questionTitleSnapshot: question.title,
          questionTypeSnapshot: question.type,
          labelSnapshot,
          value: parsed.value,
          pointsEarned,
          answeredAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            questionnaireAnswerModel.submissionId,
            questionnaireAnswerModel.questionIdSnapshot,
          ],
          set: {
            value: parsed.value,
            pointsEarned,
            labelSnapshot,
            questionTitleSnapshot: question.title,
            questionTypeSnapshot: question.type,
            answeredAt: new Date(),
            attemptCount: sql`${questionnaireAnswerModel.attemptCount} + 1`,
          },
        })

      if (questionnaire.enableCustomFieldMapping && question.customFieldId) {
        await contactCustomFieldService.setValues(
          {
            workspaceId: input.workspaceId,
            contactId: input.contactId,
            fields: [
              {
                customFieldId: question.customFieldId,
                value: this.answerValueToString(parsed.value),
              },
            ],
          },
          tx,
        )
      }

      const questions = await tx.query.questionnaireQuestionModel.findMany({
        where: {
          questionnaireId: input.questionnaireId,
          deletedAt: { isNull: true },
        },
        orderBy: { orderNo: "asc" },
      })
      const currentIndex = questions.findIndex(
        (item) => item.id === question.id,
      )
      const nextQuestion = questions[currentIndex + 1]
      const totalPoints = questionnaire.enableScore
        ? await tx
            .select({ value: sum(questionnaireAnswerModel.pointsEarned) })
            .from(questionnaireAnswerModel)
            .where(eq(questionnaireAnswerModel.submissionId, submission.id))
            .then((rows) => Number(rows[0]?.value ?? 0))
        : null

      if (!nextQuestion) {
        await tx
          .update(questionnaireSubmissionModel)
          .set({
            status: "completed",
            totalPoints,
            completedAt: new Date(),
            currentQuestionId: null,
            currentQuestionSentAt: null,
          })
          .where(eq(questionnaireSubmissionModel.id, submission.id))
        return { status: "completed" as const, submissionId: submission.id }
      }

      const sentAt = new Date()
      await tx
        .update(questionnaireSubmissionModel)
        .set({
          totalPoints,
          currentQuestionId: nextQuestion.id,
          currentQuestionSentAt: sentAt,
        })
        .where(eq(questionnaireSubmissionModel.id, submission.id))
      return {
        status: "wait" as const,
        submissionId: submission.id,
        question: nextQuestion,
        sentAt,
      }
    })
  }

  async cancel(
    input: {
      workspaceId: string
      questionnaireId: string
      contactId: string
    },
    tx: DatabaseClient = db,
  ) {
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
          eq(
            questionnaireSubmissionModel.questionnaireId,
            input.questionnaireId,
          ),
          eq(questionnaireSubmissionModel.contactId, input.contactId),
          eq(questionnaireSubmissionModel.status, "inProgress"),
        ),
      )
  }

  async deleteApplicant(input: {
    workspaceId: string
    questionnaireId: string
    contactId: string
  }) {
    await db
      .delete(questionnaireSubmissionModel)
      .where(
        and(
          eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
          eq(
            questionnaireSubmissionModel.questionnaireId,
            input.questionnaireId,
          ),
          eq(questionnaireSubmissionModel.contactId, input.contactId),
        ),
      )
    await questionnaireService.invalidate(
      input.workspaceId,
      input.questionnaireId,
    )
  }

  async deleteSubmission(input: {
    workspaceId: string
    questionnaireId: string
    submissionId: string
  }) {
    await db
      .delete(questionnaireSubmissionModel)
      .where(
        and(
          eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
          eq(
            questionnaireSubmissionModel.questionnaireId,
            input.questionnaireId,
          ),
          eq(questionnaireSubmissionModel.id, input.submissionId),
        ),
      )
    await questionnaireService.invalidate(
      input.workspaceId,
      input.questionnaireId,
    )
  }

  async timeoutQuestion(input: {
    workspaceId: string
    submissionId: string
    questionId: string
    sentAt: Date
  }) {
    const rows = await db
      .update(questionnaireSubmissionModel)
      .set({
        status: "timeout",
        currentQuestionId: null,
        currentQuestionSentAt: null,
      })
      .where(
        and(
          eq(questionnaireSubmissionModel.workspaceId, input.workspaceId),
          eq(questionnaireSubmissionModel.id, input.submissionId),
          eq(questionnaireSubmissionModel.status, "inProgress"),
          eq(questionnaireSubmissionModel.currentQuestionId, input.questionId),
          lte(questionnaireSubmissionModel.currentQuestionSentAt, input.sentAt),
        ),
      )
      .returning({ id: questionnaireSubmissionModel.id })
    return rows.length > 0
  }

  async scanTimedOut(now = new Date()) {
    const cutoff = new Date(now.getTime() - QUESTIONNAIRE_TIMEOUT_MS)
    const rows = await db
      .update(questionnaireSubmissionModel)
      .set({
        status: "timeout",
        currentQuestionId: null,
        currentQuestionSentAt: null,
      })
      .where(
        and(
          eq(questionnaireSubmissionModel.status, "inProgress"),
          lte(questionnaireSubmissionModel.currentQuestionSentAt, cutoff),
        ),
      )
      .returning({ id: questionnaireSubmissionModel.id })
    return { timedOut: rows.length }
  }

  private parseAnswer(
    question: typeof questionnaireQuestionModel.$inferSelect,
    rawText: string,
  ):
    | { valid: true; value: QuestionnaireAnswerValue }
    | { valid: false; reason: string } {
    const value = rawText.trim()
    if (!value) {
      return { valid: false, reason: "empty" }
    }
    switch (question.type) {
      case "number": {
        const numberValue = Number(value)
        return Number.isFinite(numberValue)
          ? { valid: true, value: numberValue }
          : { valid: false, reason: "invalid_number" }
      }
      case "email":
        return emailPattern.test(value)
          ? { valid: true, value }
          : { valid: false, reason: "invalid_email" }
      case "phone":
        return phoneRegex.test(value)
          ? { valid: true, value }
          : { valid: false, reason: "invalid_phone" }
      case "multipleChoice": {
        const option = (question.config?.options ?? []).find(
          (item) => item.id === value || item.label === value,
        )
        return option
          ? { valid: true, value: { optionId: option.id, label: option.label } }
          : { valid: false, reason: "invalid_option" }
      }
      default:
        return { valid: true, value }
    }
  }

  private calculatePoints(
    question: typeof questionnaireQuestionModel.$inferSelect,
    value: QuestionnaireAnswerValue,
  ) {
    if (question.type !== "multipleChoice") {
      return question.point
    }
    const optionId =
      typeof value === "object" && value !== null && "optionId" in value
        ? value.optionId
        : null
    const option = (question.config?.options ?? []).find(
      (item: QuestionnaireChoiceOption) => item.id === optionId,
    )
    return option?.points ?? 0
  }

  private answerValueToString(value: QuestionnaireAnswerValue) {
    if (value === null) {
      return ""
    }
    if (typeof value === "object") {
      return value.label
    }
    return String(value)
  }
}

export const questionnaireSubmissionService =
  new QuestionnaireSubmissionService()
