import type {
  QuestionnaireAnswerValue,
  QuestionnaireChoiceOption,
} from "@chatbotx.io/database/schema"

export type QuestionnaireQuestionInput = {
  id?: string
  title: string
  type: "text" | "number" | "email" | "phone" | "multipleChoice"
  point?: number | null
  retryMessage?: string | null
  customFieldId?: string | null
  config?: {
    options?: QuestionnaireChoiceOption[]
  } | null
}

export type UpdateQuestionnaireInput = {
  workspaceId: string
  id: string
  triggerFlowId?: string | null
  enableScore: boolean
  enableRetryMessages: boolean
  enableCustomFieldMapping: boolean
  questions: QuestionnaireQuestionInput[]
}

export type QuestionnaireAnswerInput = {
  workspaceId: string
  contactId: string
  conversationId?: string | null
  questionnaireId: string
  submissionId?: string
  value: QuestionnaireAnswerValue
}
