import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { errorLogModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import type {
  ErrorLogHealthRequest,
  ErrorLogHealthResponse,
  ListErrorLogsRequest,
  ListErrorLogsResponse,
} from "../schemas/query"

export async function listErrorLogs(
  input: ListErrorLogsRequest,
): Promise<ListErrorLogsResponse> {
  const where = {
    workspaceId: input.workspaceId,
    ...(input.keyword
      ? {
          OR: [
            { action: { ilike: likeContains(input.keyword) } },
            { detail: { ilike: likeContains(input.keyword) } },
          ],
        }
      : {}),
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(errorLogModel, input)

  const [data, totalRows] = await Promise.all([
    db.query.errorLogModel.findMany({
      where,
      ...pagination,
      orderBy,
      with: {
        contact: true,
      },
    }),
    db.$count(errorLogModel, relationsFilterToSQL(errorLogModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}

export async function getErrorLogHealth(
  input: ErrorLogHealthRequest,
): Promise<ErrorLogHealthResponse> {
  const since = new Date(Date.now() - input.windowMinutes * 60_000)
  const where = {
    workspaceId: input.workspaceId,
    createdAt: { gte: since },
  }

  const [errorCount, lastErrorLog] = await Promise.all([
    db.$count(errorLogModel, relationsFilterToSQL(errorLogModel, where)),
    db.query.errorLogModel.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      columns: { createdAt: true },
    }),
  ])

  return {
    windowMinutes: input.windowMinutes,
    errorCount,
    lastErrorAt: lastErrorLog?.createdAt ?? null,
    healthy: errorCount === 0,
  }
}
