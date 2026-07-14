import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { skipStateDefaultFn, skipStateSchema } from "../states"
import { stepTypes } from "./step-action"

export const questionnaireActionModes = z.enum([
  "start",
  "end",
  "deleteApplicant",
])
export type QuestionnaireActionMode = z.infer<typeof questionnaireActionModes>

export const questionnairesStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.questionnaires),
  mode: questionnaireActionModes.default("start"),
  questionnaireId: zodBigintAsString(),
  states: z.tuple([skipStateSchema]),
})
export type QuestionnairesStepSchema = z.infer<typeof questionnairesStepSchema>

export const questionnairesStepDefaultFn = (): QuestionnairesStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.questionnaires,
  mode: questionnaireActionModes.enum.start,
  questionnaireId: "",
  states: [skipStateDefaultFn()],
})
