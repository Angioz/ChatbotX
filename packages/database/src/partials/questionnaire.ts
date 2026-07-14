import { z } from "zod"

export const questionnaireQuestionTypes = z.enum([
  "text",
  "number",
  "email",
  "phone",
  "multipleChoice",
  "date",
  "datetime",
  "image",
  "file",
  "location",
  "websiteLink",
])
export type QuestionnaireQuestionType = z.infer<
  typeof questionnaireQuestionTypes
>

export const questionnaireSubmissionStatuses = z.enum([
  "inProgress",
  "completed",
  "cancelled",
  "failed",
  "timeout",
])
export type QuestionnaireSubmissionStatus = z.infer<
  typeof questionnaireSubmissionStatuses
>
