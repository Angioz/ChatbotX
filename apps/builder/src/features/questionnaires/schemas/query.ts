import type { QuestionnaireModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const listQuestionnairesSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  sort: getSortingStateParser<QuestionnaireModel>().withDefault([
    { id: "name", desc: false },
  ]),
}

export const listQuestionnairesSearchParamsCache = createSearchParamsCache(
  listQuestionnairesSearchParams,
)

export type ListQuestionnairesRequest = Awaited<
  ReturnType<typeof listQuestionnairesSearchParamsCache.parse>
> & { workspaceId: string }

export const listQuestionnaireSubmissionsSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
}

export const listQuestionnaireSubmissionsSearchParamsCache =
  createSearchParamsCache(listQuestionnaireSubmissionsSearchParams)

export type ListQuestionnaireSubmissionsRequest = Awaited<
  ReturnType<typeof listQuestionnaireSubmissionsSearchParamsCache.parse>
> & { workspaceId: string; questionnaireId: string }
