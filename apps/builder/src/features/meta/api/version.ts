import { base } from "@/middlewares/context"
import { versionResource } from "../schema/resource"

// Deploy-proof probe — intentionally tokenless. No auth middleware, no db access.
export const metaAPIs = {
  getVersionAPI: base
    .route({
      method: "GET",
      path: "/v1/meta/version",
      summary: "Get fork deploy version",
      tags: ["Meta"],
    })
    .output(versionResource)
    .handler(() => ({
      sha: process.env.ULTRA_FORK_SHA ?? "dev",
      builtAt: process.env.ULTRA_BUILT_AT ?? null,
      fork: "ultra" as const,
    })),
}

export default metaAPIs
