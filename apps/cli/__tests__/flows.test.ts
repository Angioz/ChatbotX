import { describe, expect, test, vi } from "vitest"
import {
  applyFlow,
  exportFlow,
  type Flow,
  type FlowsApiClient,
} from "../src/commands/flows"

const config = { apiKey: "test-key", apiUrl: "https://api.test" }

const makeClient = (overrides: Partial<FlowsApiClient> = {}): FlowsApiClient => ({
  list: vi.fn().mockResolvedValue([]),
  get: vi.fn(),
  create: vi.fn().mockResolvedValue({ id: "new-1", name: "New Flow" } as Flow),
  update: vi.fn().mockResolvedValue({ id: "existing-1", name: "Welcome" } as Flow),
  ...overrides,
})

describe("applyFlow", () => {
  test("calls create (POST) when no flow with that name exists", async () => {
    const client = makeClient({
      list: vi.fn().mockResolvedValue([{ id: "1", name: "Other Flow" }]),
    })

    const result = await applyFlow(
      config,
      JSON.stringify({ name: "New Flow", folderId: null }),
      client,
    )

    expect(client.create).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ name: "New Flow" }),
    )
    expect(client.update).not.toHaveBeenCalled()
    expect(result.action).toBe("created")
    expect(result.flow.id).toBe("new-1")
  })

  test("calls update (PUT) with the matched id when a same-name flow exists", async () => {
    const client = makeClient({
      list: vi
        .fn()
        .mockResolvedValue([{ id: "existing-1", name: "Welcome" }] as Flow[]),
    })

    const result = await applyFlow(
      config,
      JSON.stringify({ name: "Welcome", active: true }),
      client,
    )

    expect(client.update).toHaveBeenCalledWith(
      config,
      "existing-1",
      expect.objectContaining({ name: "Welcome", active: true }),
    )
    expect(client.create).not.toHaveBeenCalled()
    expect(result.action).toBe("updated")
  })

  test("re-applying the same file twice is idempotent (second run updates, no duplicate create)", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "new-1", name: "New Flow" }] as Flow[])
    const client = makeClient({ list })
    const fileContents = JSON.stringify({ name: "New Flow", folderId: null })

    const first = await applyFlow(config, fileContents, client)
    const second = await applyFlow(config, fileContents, client)

    expect(first.action).toBe("created")
    expect(second.action).toBe("updated")
    expect(client.create).toHaveBeenCalledTimes(1)
    expect(client.update).toHaveBeenCalledTimes(1)
  })

  test("throws when the file has no name field", async () => {
    const client = makeClient()

    await expect(
      applyFlow(config, JSON.stringify({ folderId: null }), client),
    ).rejects.toThrow(/name/)
  })
})

describe("exportFlow", () => {
  test("returns apply-compatible JSON (a plain object with a name field)", async () => {
    const flow: Flow = {
      id: "1",
      name: "Welcome",
      folderId: null,
      active: true,
      enableInInbox: true,
    }
    const client = makeClient({ get: vi.fn().mockResolvedValue(flow) })

    const result = await exportFlow(config, "1", client)

    expect(client.get).toHaveBeenCalledWith(config, "1")
    expect(result).toEqual(flow)

    // Round-trip: exportFlow's output, fed straight into applyFlow, must
    // resolve to the same upsert decision (update, since name matches).
    const applyClient = makeClient({
      list: vi.fn().mockResolvedValue([{ id: "1", name: "Welcome" }]),
    })
    const applied = await applyFlow(config, JSON.stringify(result), applyClient)
    expect(applied.action).toBe("updated")
  })
})
