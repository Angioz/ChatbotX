import { channelTypes } from "@chatbotx.io/database/partials"
import type { IgFollowCheckStepSchema } from "@chatbotx.io/flow-config"
import {
  fetchInstagramContactProfile as fetchNativeInstagramContactProfile,
  type InstagramAuthValue,
} from "@chatbotx.io/integration-instagram"
import { fetchInstagramContactProfile as fetchFacebookInstagramContactProfile } from "@chatbotx.io/integration-instagram-facebook"
import { distributedStore, withCache } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"
import {
  isInstagramViaFacebook,
  resolveIntegrationContextFromContactInbox,
} from "../../services/integrations"
import type { ExecuteStepProps } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

const IG_FOLLOW_CHECK_CACHE_TTL = 300

type CachedFollowStatus = { followsBusiness: boolean }

const followCacheKey = (igsid: string) => `integration:instagram:${igsid}`

const errorResult = (errorMessage: string): ExecuteStepResult => ({
  status: "error",
  result: null,
  errorMessage,
})

export async function stepIgFollowCheck({
  conversation,
  contactInbox,
  step,
}: ExecuteStepProps<IgFollowCheckStepSchema>): Promise<ExecuteStepResult> {
  if (!contactInbox || contactInbox.channel !== channelTypes.enum.instagram) {
    return errorResult("Instagram follow check requires an Instagram DM")
  }

  const igsid = contactInbox.sourceId
  if (!igsid) {
    return errorResult("Instagram conversation participant IGSID is missing")
  }

  const cacheKey = followCacheKey(igsid)

  try {
    if (step.recheck) {
      await distributedStore.delete(cacheKey)
    }

    const { ctx, integrationRow } =
      await resolveIntegrationContextFromContactInbox({
        workspaceId: conversation.workspaceId,
        contactInbox,
      })
    const auth = ctx.auth as InstagramAuthValue
    const accessToken = auth.tokens?.accessToken
    if (!accessToken) {
      return errorResult("Instagram integration access token is missing")
    }

    const fetchContactProfile = isInstagramViaFacebook(integrationRow)
      ? fetchFacebookInstagramContactProfile
      : fetchNativeInstagramContactProfile

    const cached = await withCache<CachedFollowStatus | null>(
      cacheKey,
      async () => {
        const profile = await fetchContactProfile({
          igsid,
          accessToken,
          version: auth.metadata?.version,
        })
        if (typeof profile?.followsBusiness !== "boolean") {
          return null
        }
        return { followsBusiness: profile.followsBusiness }
      },
      {
        ttl: IG_FOLLOW_CHECK_CACHE_TTL,
        tags: [`integration:instagram:${integrationRow.id}`],
      },
    )

    if (!cached) {
      return errorResult(
        "Instagram did not return is_user_follow_business for this participant",
      )
    }

    return {
      status: cached.followsBusiness ? "success" : "error",
      result: cached,
    }
  } catch (error) {
    logger.error(
      {
        err: error,
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        igsid,
      },
      "Instagram follow check failed",
    )
    return errorResult("Instagram follow check failed")
  }
}
