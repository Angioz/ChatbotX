import { ChatbotXException } from "../errors"
import { assertPublicUrl } from "../net"

const WEBHOOK_URL_BLOCKED_ERROR =
  "Webhook URL is not allowed. It cannot target a private, loopback, link-local, or cloud-metadata address."

/**
 * Guards the webhook `url` field against SSRF. This URL is fetched by the
 * worker's delivery pipeline, so a caller-controlled URL pointing at an
 * internal address would let any workspace-token holder pivot into
 * VPS-internal services (or the cloud metadata endpoint) via the delivery
 * logging path. Delegates the scheme + literal-IP + DNS-resolved-IP checks
 * to the shared net/ssrf-guard (already used by the OpenAI-compatible base
 * URL validator), then normalizes any rejection into the 422 the public API
 * contract expects.
 *
 * DNS-rebind residual risk: assertPublicUrl resolves the hostname via DoH
 * and re-checks every returned IP, so this already covers rebinding at
 * request time — the residual gap is a TOCTOU between this check and the
 * worker's later delivery fetch (the DNS answer could change between the
 * two lookups). Fully closing that requires pinning the resolved IP through
 * to the delivery fetch itself, which is out of scope for this guard.
 */
export const assertWebhookUrlIsSafe = async (url: string): Promise<void> => {
  try {
    await assertPublicUrl(url, "Webhook URL")
  } catch {
    throw new ChatbotXException(
      WEBHOOK_URL_BLOCKED_ERROR,
      "invalidRequestData",
      422,
    )
  }
}
