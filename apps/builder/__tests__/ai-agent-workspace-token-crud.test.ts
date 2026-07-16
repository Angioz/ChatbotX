import { describe, expect, test } from "vitest"
import {
  createAIAgentRequest,
  updateAIAgentRequest,
} from "@/features/ai-agents/schemas/action"
import { aiAgentResourceSchema } from "@/features/ai-agents/schemas/resource"

describe("AI agents CRUD schema roundtrip", () => {
  test("createAIAgentRequest accepts a full create payload", () => {
    const result = createAIAgentRequest.safeParse({
      name: "Support",
      prompt: "Answer customer questions.",
      messages: [],
      models: [{ provider: "openai", model: "gpt-5.4-mini" }],
      temperature: 0.4,
      maxOutputTokens: 2048,
      tools: [],
      isDefault: false,
    })

    expect(result.success).toBe(true)
  })

  test("updateAIAgentRequest accepts a partial update payload", () => {
    const result = updateAIAgentRequest.safeParse({ name: "Renamed" })

    expect(result.success).toBe(true)
  })

  test("aiAgentResourceSchema accepts a JSON-roundtripped cached agent (AP-CBX-006 pattern)", () => {
    const agent = {
      id: "1",
      workspaceId: "1",
      name: "Support",
      prompt: "Answer customer questions.",
      messages: [],
      isDefault: false,
      isRichResponse: false,
      tools: [],
      webSearchAuthorizedDomains: [],
      models: [],
      temperature: 0.4,
      maxOutputTokens: 2048,
      createdAt: new Date("2026-07-16T10:00:00.000Z"),
      updatedAt: new Date("2026-07-16T11:00:00.000Z"),
    }
    const cachedAgent = JSON.parse(JSON.stringify(agent))

    const result = aiAgentResourceSchema.safeParse(cachedAgent)

    expect(result.success).toBe(true)
  })
})
