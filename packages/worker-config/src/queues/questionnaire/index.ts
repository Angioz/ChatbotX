import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const QuestionnaireJobAction = {
  timeoutQuestion: "timeoutQuestion",
} as const

export type QuestionnaireTimeoutQuestionJob = {
  type: typeof QuestionnaireJobAction.timeoutQuestion
  data: {
    workspaceId: string
    contactId: string
    questionnaireId: string
    submissionId: string
    questionId: string
    sentAt: string
  }
}

export type QuestionnaireJobData = QuestionnaireTimeoutQuestionJob

const NEXT_PHASE = process.env.NEXT_PHASE

export const questionnaireQueue =
  NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<QuestionnaireJobData>(queueNames.enum.questionnaire, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })

export const buildQuestionnaireTimeoutJobId = (props: {
  submissionId: string
  questionId: string
}) => `questionnaire-timeout-${props.submissionId}-${props.questionId}`
