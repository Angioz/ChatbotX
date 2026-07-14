import type { QuestionnairesStepSchema } from "@chatbotx.io/flow-config"
import { logger } from "../../lib/logger"
import { runQuestionnaireEngine } from "../../questionnaires/services/engine"
import type { ExecuteStepProps } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

export async function questionnaires(
  props: ExecuteStepProps<QuestionnairesStepSchema>,
): Promise<ExecuteStepResult> {
  try {
    return await runQuestionnaireEngine(props)
  } catch (err) {
    logger.error(
      {
        err,
        workspaceId: props.conversation.workspaceId,
        conversationId: props.conversation.id,
        contactId: props.conversation.contactId,
        questionnaireId: props.step.questionnaireId,
        mode: props.step.mode,
      },
      "Questionnaires step failed",
    )
    return { status: "skip", result: null }
  }
}
