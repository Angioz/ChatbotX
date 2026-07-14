import {
  conversationService,
  QUESTIONNAIRE_TIMEOUT_MS,
  questionnaireSubmissionService,
} from "@chatbotx.io/business"
import type { ConversationAttributes } from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import type { QuestionnaireQuestionModel } from "@chatbotx.io/database/types"
import type { QuestionnairesStepSchema } from "@chatbotx.io/flow-config"
import {
  buildQuestionnaireTimeoutJobId,
  ChatJobAction,
  chatQueue,
  QuestionnaireJobAction,
  questionnaireQueue,
} from "@chatbotx.io/worker-config"
import type { ExecuteStepProps } from "../../integration/handlers/flow-utils"
import type { ExecuteStepResult } from "../../integration/handlers/step"
import { waitForChatJobCompletion } from "../../integration/utils/message"
import { logger } from "../../lib/logger"

const questionText = (question: QuestionnaireQuestionModel): string => {
  if (question.type !== "multipleChoice") {
    return question.title
  }
  const options = question.config?.options ?? []
  if (options.length === 0) {
    return question.title
  }
  return `${question.title}\n${options
    .map((option, index) => `${index + 1}. ${option.label}`)
    .join("\n")}`
}

async function enqueueTimeout(props: {
  workspaceId: string
  contactId: string
  questionnaireId: string
  submissionId: string
  questionId: string
  sentAt: Date
}) {
  await questionnaireQueue.add(
    QuestionnaireJobAction.timeoutQuestion,
    {
      type: QuestionnaireJobAction.timeoutQuestion,
      data: {
        workspaceId: props.workspaceId,
        contactId: props.contactId,
        questionnaireId: props.questionnaireId,
        submissionId: props.submissionId,
        questionId: props.questionId,
        sentAt: props.sentAt.toISOString(),
      },
    },
    {
      delay: QUESTIONNAIRE_TIMEOUT_MS,
      jobId: buildQuestionnaireTimeoutJobId({
        submissionId: props.submissionId,
        questionId: props.questionId,
      }),
    },
  )
}

async function sendQuestion(
  props: ExecuteStepProps<QuestionnairesStepSchema>,
  data: {
    submissionId: string
    question: QuestionnaireQuestionModel
    sentAt?: Date
  },
) {
  const sentAt = data.sentAt ?? new Date()
  const job = await chatQueue.add(ChatJobAction.sendChatMessage, {
    type: ChatJobAction.sendChatMessage,
    data: {
      contactInbox: props.contactInbox,
      conversation: props.conversation,
      text: questionText(data.question),
    },
  })
  await waitForChatJobCompletion(job, { conversationId: props.conversation.id })

  await questionnaireSubmissionService.markQuestionSent({
    workspaceId: props.conversation.workspaceId,
    submissionId: data.submissionId,
    questionId: data.question.id,
    sentAt,
  })

  await enqueueTimeout({
    workspaceId: props.conversation.workspaceId,
    contactId: props.conversation.contactId,
    questionnaireId: props.step.questionnaireId,
    submissionId: data.submissionId,
    questionId: data.question.id,
    sentAt,
  })

  await conversationService.updateChallenge({
    workspaceId: props.conversation.workspaceId,
    conversationId: props.conversation.id,
    challenge: {
      type: "step",
      data: {
        flowId: props.flowVersion.flowId,
        flowVersionId: props.useLatestFlowVersion
          ? undefined
          : props.flowVersion.id,
        nodeId: props.targetId,
        stepId: props.step.id,
        attempts: 1,
        lastAttemptAt: sentAt,
      },
    },
  })
}

async function getLastIncomingText(
  props: ExecuteStepProps<QuestionnairesStepSchema>,
) {
  const messageRepository = await createMessageRepository()
  const [message] = await messageRepository.findLastByConversation(
    props.conversation.id,
    {
      workspaceId: props.conversation.workspaceId,
      messageTypes: ["incoming"],
      limit: 1,
      requireCompleteResults: true,
      withAttachments: false,
      sinceTime: getSafeSinceTime(
        props.conversation.lastActivityAt ?? props.conversation.createdAt,
        365 * 24 * 60 * 60 * 1000,
      ),
    },
  )
  return message?.text ?? ""
}

export async function runQuestionnaireEngine(
  props: ExecuteStepProps<QuestionnairesStepSchema>,
): Promise<ExecuteStepResult> {
  const { conversation, step } = props

  if (step.mode === "end") {
    await questionnaireSubmissionService.cancel({
      workspaceId: conversation.workspaceId,
      questionnaireId: step.questionnaireId,
      contactId: conversation.contactId,
    })
    await conversationService.updateChallenge({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      challenge: undefined,
    })
    return { status: "success", result: null }
  }

  if (step.mode === "deleteApplicant") {
    await questionnaireSubmissionService.deleteApplicant({
      workspaceId: conversation.workspaceId,
      questionnaireId: step.questionnaireId,
      contactId: conversation.contactId,
    })
    await conversationService.updateChallenge({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      challenge: undefined,
    })
    return { status: "success", result: null }
  }

  const attributes = conversation.additionalAttributes as
    | ConversationAttributes
    | undefined
  if (attributes?.challenge) {
    const rawText = await getLastIncomingText(props)
    const result = await questionnaireSubmissionService.answerCurrent({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      conversationId: conversation.id,
      questionnaireId: step.questionnaireId,
      rawText,
    })

    if (result.status === "retry") {
      logger.info(
        {
          conversationId: conversation.id,
          questionnaireId: step.questionnaireId,
          reason: result.reason,
        },
        "Questionnaire answer rejected, retrying",
      )
      const startResult = await questionnaireSubmissionService.startOrResume({
        workspaceId: conversation.workspaceId,
        questionnaireId: step.questionnaireId,
        contactId: conversation.contactId,
        conversationId: conversation.id,
      })
      if (startResult.status === "wait") {
        await sendQuestion(props, {
          submissionId: startResult.submission.id,
          question: startResult.question,
        })
      }
      return { status: "retry", result: null }
    }

    if (result.status === "completed") {
      await conversationService.updateChallenge({
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        challenge: undefined,
      })
      return { status: "success", result: result.submissionId }
    }

    if (result.status === "wait") {
      await sendQuestion(props, {
        submissionId: result.submissionId,
        question: result.question,
        sentAt: result.sentAt,
      })
      return { status: "wait", result: null }
    }

    await conversationService.updateChallenge({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      challenge: undefined,
    })
    return { status: "skip", result: result.reason }
  }

  const startResult = await questionnaireSubmissionService.startOrResume({
    workspaceId: conversation.workspaceId,
    questionnaireId: step.questionnaireId,
    contactId: conversation.contactId,
    conversationId: conversation.id,
  })
  if (startResult.status === "skip") {
    return { status: "skip", result: startResult.reason }
  }
  await sendQuestion(props, {
    submissionId: startResult.submission.id,
    question: startResult.question,
  })
  return { status: "wait", result: null }
}
