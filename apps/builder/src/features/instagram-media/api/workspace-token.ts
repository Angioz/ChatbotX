import z from "zod"
import { workspaceTokenAuthAPI } from "@/orpc"
import {
  listInstagramMediaForWorkspace,
  resolveInstagramMediaId,
} from "../service"

const instagramMediaItem = z.object({
  id: z.string(),
  caption: z.string().optional(),
  media_type: z.string().optional(),
  media_url: z.string().optional(),
  thumbnail_url: z.string().optional(),
  permalink: z.string().optional(),
  timestamp: z.string(),
})

const instagramMediaWorkspaceTokenAPIs = {
  listInstagramMediaWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/instagram/media",
      summary:
        "List Instagram media, or resolve a permalink to its media id via `permalink`",
      tags: ["Instagram"],
    })
    .input(z.object({ permalink: z.string().optional() }))
    .output(z.object({ data: z.array(instagramMediaItem) }))
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id

      if (input.permalink) {
        const match = await resolveInstagramMediaId(
          workspaceId,
          input.permalink,
        )
        return { data: match ? [match] : [] }
      }

      const data = await listInstagramMediaForWorkspace(workspaceId)
      return { data }
    }),
}

export default instagramMediaWorkspaceTokenAPIs
