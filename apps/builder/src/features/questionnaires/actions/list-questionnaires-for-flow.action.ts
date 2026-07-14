"use server"

import { questionnaireService } from "@chatbotx.io/business"
import { z } from "zod"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const listQuestionnairesForFlowAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(
    z.object({
      activeOnly: z.boolean().default(false),
      keyword: z.string().optional(),
    }),
  )
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
    questionnaireService.listForFlow({ workspaceId, ...parsedInput }),
  )
