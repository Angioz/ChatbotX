import { findInstagramIntegrationsByWorkspaceId } from "@chatbotx.io/business"
import {
  type InstagramAuthValue,
  type InstagramMediaListItem,
  listInstagramMedia,
} from "@chatbotx.io/integration-instagram"

/**
 * List Instagram media (posts/reels) for every Instagram-direct integration in
 * a workspace. Instagram-direct workspaces have no Facebook Page, so their
 * media cannot be read through the messenger/page feed — it comes from the IG
 * user node instead. Shared by the authenticated Select-Posts picker (F5) and
 * the public `GET /v1/instagram/media` endpoint (F6).
 *
 * The access token is read through the ORM (decrypted at the app layer), so no
 * manual decrypt is required here.
 */
export async function listInstagramMediaForWorkspace(
  workspaceId: string,
): Promise<InstagramMediaListItem[]> {
  const integrations =
    await findInstagramIntegrationsByWorkspaceId(workspaceId)
  if (integrations.length === 0) {
    return []
  }

  const results = await Promise.allSettled(
    integrations.map((integration) => {
      const auth = integration.auth as InstagramAuthValue
      return listInstagramMedia({ auth, igUserId: auth.metadata.igId })
    }),
  )

  return results
    .filter(
      (r): r is PromiseFulfilledResult<InstagramMediaListItem[]> =>
        r.status === "fulfilled",
    )
    .flatMap((r) => r.value)
}

/**
 * Resolve a permalink (or shortcode) to a single media id by scanning the
 * workspace's Instagram media. Returns null when nothing matches.
 */
export async function resolveInstagramMediaId(
  workspaceId: string,
  permalinkOrShortcode: string,
): Promise<InstagramMediaListItem | null> {
  const needle = permalinkOrShortcode.trim().toLowerCase()
  if (!needle) {
    return null
  }

  const media = await listInstagramMediaForWorkspace(workspaceId)
  return (
    media.find((item) => {
      const permalink = item.permalink?.toLowerCase() ?? ""
      return (
        permalink === needle ||
        permalink.includes(needle) ||
        item.id === permalinkOrShortcode.trim()
      )
    }) ?? null
  )
}
