import type { Context } from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramBusinessClient } from "../lib/http-client"
import type { InstagramAuthValue } from "../schemas"

export type InstagramMediaDetails = {
  caption?: string
  media_url?: string
  thumbnail_url?: string
  timestamp: string
  permalink?: string
}

export type InstagramMediaListItem = {
  id: string
  caption?: string
  media_type?: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  timestamp: string
}

type InstagramPaginatedResponse<T> = {
  data: T[]
}

/**
 * List the authenticated Instagram user's media (posts/reels) via the IG user
 * node — `/{ig-user-id}/media`. Used for Instagram-direct workspaces, which
 * have no Facebook Page and therefore no messenger/page feed to read.
 */
export const listInstagramMedia = (props: {
  auth: InstagramAuthValue
  igUserId: string
}): Promise<InstagramMediaListItem[]> => {
  const { auth, igUserId } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${igUserId}/media`

  return rescue(endpoint, async () => {
    const res = await instagramBusinessClient.get<
      InstagramPaginatedResponse<InstagramMediaListItem>
    >(endpoint, {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      searchParams: {
        fields:
          "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
        limit: "100",
      },
    })
    return res.data
  })
}

export const getPostDetails = (props: {
  ctx: Pick<Context<InstagramAuthValue>, "auth">
  input: { postId: string }
}): Promise<InstagramMediaDetails> => {
  const { ctx, input } = props
  const version = ctx.auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${input.postId}`

  return rescue(endpoint, () =>
    instagramBusinessClient.get<InstagramMediaDetails>(endpoint, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      searchParams: {
        fields: "caption,media_url,thumbnail_url,timestamp,permalink",
      },
    }),
  )
}
