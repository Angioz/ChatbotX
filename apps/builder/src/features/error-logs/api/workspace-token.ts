import { workspaceTokenAuthAPI } from "@/orpc"
import { getErrorLogHealth, listErrorLogs } from "../queries"
import {
  errorLogHealthRequest,
  errorLogHealthResponse,
  listErrorLogsRequest,
  publicListErrorLogsResponse,
} from "../schemas/query"

export const errorLogsWorkspaceTokenAPIs = {
  listErrorLogsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/error-logs",
      summary: "List error logs",
      tags: ["Error Logs"],
    })
    .input(listErrorLogsRequest.omit({ workspaceId: true }))
    .output(publicListErrorLogsResponse)
    .handler(
      async ({ context, input }) =>
        await listErrorLogs({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),
  getErrorLogHealthWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/error-logs/health",
      summary: "Workspace automation health (error-log derived)",
      tags: ["Error Logs"],
    })
    .input(errorLogHealthRequest.omit({ workspaceId: true }))
    .output(errorLogHealthResponse)
    .handler(
      async ({ context, input }) =>
        await getErrorLogHealth({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),
}

export default errorLogsWorkspaceTokenAPIs
