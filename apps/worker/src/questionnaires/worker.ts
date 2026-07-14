import {
  defaultWorkerOptions,
  getRedisConnection,
  QuestionnaireJobAction,
  type QuestionnaireJobData,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { handleTimeoutQuestion } from "./handlers/timeout-question"

async function startQuestionnaireWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Questionnaire worker bootstrapped successfully")
  } catch (err) {
    logger.error(err, "Failed to bootstrap questionnaire worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueNames.enum.questionnaire,
    async (job: Job<QuestionnaireJobData>) => {
      switch (job.data.type) {
        case QuestionnaireJobAction.timeoutQuestion:
          await handleTimeoutQuestion(job.data.data)
          return
        default:
          logger.warn({ jobId: job.id }, "Unknown questionnaire job type")
      }
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
    },
  )

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "Questionnaire job failed")
  })
}

startQuestionnaireWorker().catch((err) => {
  logger.error(err, "Failed to start questionnaire worker")
  process.exit(1)
})
