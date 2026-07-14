export const getQuestionnairesCacheTag = (workspaceId: string) =>
  `workspaces:${workspaceId}#questionnaires`

export const getQuestionnaireCacheTag = (workspaceId: string, id: string) =>
  `workspaces:${workspaceId}#questionnaires:${id}`
