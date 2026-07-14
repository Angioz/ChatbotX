import { questionnaireSubmissionService } from "@chatbotx.io/business"
import type { QuestionnaireTimeoutQuestionJob } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

export async function handleTimeoutQuestion(
  data: QuestionnaireTimeoutQuestionJob["data"],
) {
  const marked = await questionnaireSubmissionService.timeoutQuestion({
    workspaceId: data.workspaceId,
    submissionId: data.submissionId,
    questionId: data.questionId,
    sentAt: new Date(data.sentAt),
  })
  logger.info(
    {
      workspaceId: data.workspaceId,
      contactId: data.contactId,
      questionnaireId: data.questionnaireId,
      submissionId: data.submissionId,
      questionId: data.questionId,
      marked,
    },
    "Questionnaire timeout processed",
  )
}
