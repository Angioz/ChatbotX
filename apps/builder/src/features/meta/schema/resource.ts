import z from "zod"

export const versionResource = z.object({
  sha: z.string(),
  builtAt: z.string().nullable(),
  fork: z.literal("ultra"),
})
export type VersionResource = z.infer<typeof versionResource>
