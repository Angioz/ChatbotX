import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const igFollowCheckStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.igFollowCheck),
  // When true, the cached follow status for this conversation participant is
  // invalidated before the Messaging User Profile API is called — used to
  // re-evaluate a previously-cached "not following" result.
  recheck: z.boolean().default(false),
  states: z.tuple([successStateSchema, errorStateSchema]),
})
export type IgFollowCheckStepSchema = z.infer<typeof igFollowCheckStepSchema>

export type IgFollowCheckStepInput = z.input<typeof igFollowCheckStepSchema>

export const igFollowCheckStepDefaultFn = (): IgFollowCheckStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.igFollowCheck,
  recheck: false,
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
