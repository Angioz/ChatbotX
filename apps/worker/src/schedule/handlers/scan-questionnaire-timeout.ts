import { questionnaireSubmissionService } from "@chatbotx.io/business"
import { logger } from "../../lib/logger"

export const scanQuestionnaireTimeout = async () => {
  const result = await questionnaireSubmissionService.scanTimedOut()
  logger.info(result, "Questionnaire timeout scanner finished")
  return result
}
