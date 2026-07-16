// @vitest-environment node

import { OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { describe, expect, test, vi } from "vitest"

// Env schemas validate at import time — skip them before the router chain loads.
vi.hoisted(() => {
  process.env.SKIP_ENV_CHECK = "true"
})

// Spec generation only walks route metadata — stub the db client so
// importing the router chain never touches DATABASE_URL / a live pool.
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: new Proxy(
      {},
      {
        get: () => ({
          findFirst: async () => undefined,
          findMany: async () => [],
        }),
      },
    ),
  },
}))
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}))

import "@/polyfill"
import { publicRouter } from "@/routers/public"

// P2.1 spike gate: every fork-added public endpoint must surface in the
// OpenAPI spec that /api/public-spec.json serves and the CLI consumes
// (chatbotx --refresh-spec). If a path disappears from this list the CLI
// silently loses the command — fail the build instead.
const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
})

const expectedForkEndpoints: [string, string][] = [
  ["post", "/v1/flows"],
  ["get", "/v1/flows/{id}"],
  ["put", "/v1/flows/{id}"],
  ["post", "/v1/flows/{id}/clone"],
  ["post", "/v1/flows/{id}/publish"],
  ["post", "/v1/ai-agents"],
  ["put", "/v1/ai-agents/{id}"],
  ["delete", "/v1/ai-agents/{id}"],
  ["post", "/v1/keywords"],
  ["put", "/v1/keywords/{id}"],
  ["delete", "/v1/keywords/{id}"],
  ["post", "/v1/sequences"],
  ["put", "/v1/sequences/{id}"],
  ["delete", "/v1/sequences/{id}"],
]

describe("public OpenAPI spec surface", () => {
  test("fork-added endpoints are present in the generated spec", async () => {
    const spec = await openAPIGenerator.generate(publicRouter, {
      info: { title: "spec-surface-test", version: "0.0.1" },
    })

    const paths = spec.paths ?? {}
    const missing = expectedForkEndpoints.filter(
      ([method, path]) =>
        !(paths as Record<string, Record<string, unknown>>)[path]?.[method],
    )

    expect(missing).toEqual([])
  })
})
