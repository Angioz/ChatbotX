"use server"

import { questionnaireService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { toggleQuestionnaireActiveRequest } from "../schemas/action"

export const toggleQuestionnaireActiveAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(toggleQuestionnaireActiveRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    await questionnaireService.toggleActive({
      workspaceId,
      id,
      active: parsedInput.active,
    })
  })
