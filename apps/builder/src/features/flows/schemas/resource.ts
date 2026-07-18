import { createSelectSchema, flowModel } from "@chatbotx.io/database/schema"
import z from "zod"
import { flowVersionResource } from "@/features/flow-versions/schema/resource"

export const flowResource = createSelectSchema(flowModel, {
  createdAt: z.coerce.date(),
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
  currentVersionId: z.string().nullable(),
  draftVersionId: z.string().nullable(),
  updatedAt: z.coerce.date(),
})
export type FlowResource = z.infer<typeof flowResource>

export const flowWithVersionsResource = flowResource.and(
  z.object({
    flowVersions: z.array(flowVersionResource),
  }),
)
export type FlowWithVersionsResource = z.infer<typeof flowWithVersionsResource>

// Additive: exposes the flow graph (nodes/edges) so `GET /v1/flows/{id}`
// round-trips with `POST /v1/flows/{id}/publish`, which already accepts
// nodes+edges. Draft graph (if present) is included separately.
export const flowGraphResource = z.object({
  nodes: z.array(z.record(z.string(), z.unknown())),
  edges: z.array(z.record(z.string(), z.unknown())),
})
export type FlowGraphResource = z.infer<typeof flowGraphResource>

export const flowResourceWithGraph = flowResource.extend({
  nodes: z.array(z.record(z.string(), z.unknown())).nullable(),
  edges: z.array(z.record(z.string(), z.unknown())).nullable(),
  draft: flowGraphResource.nullable(),
})
export type FlowResourceWithGraph = z.infer<typeof flowResourceWithGraph>
