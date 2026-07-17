// Targeted, mocked tests for scripts/new-funnel.mjs. Run with:
//   node --test scripts/__tests__/new-funnel.test.mjs
import assert from "node:assert/strict"
import { test } from "node:test"
import { instantiate, loadFlowsModule, parseArgs, substituteVars } from "../new-funnel.mjs"

const config = { apiKey: "test-key", apiUrl: "https://api.test" }

function makeClient(overrides = {}) {
  const calls = { list: 0, get: 0, create: 0, update: 0 }
  return {
    calls,
    list: async (...args) => {
      calls.list++
      return overrides.list ? overrides.list(...args) : []
    },
    get: async (...args) => {
      calls.get++
      return overrides.get ? overrides.get(...args) : undefined
    },
    create: async (...args) => {
      calls.create++
      return overrides.create
        ? overrides.create(...args)
        : { id: "new-1", name: args[1]?.name }
    },
    update: async (...args) => {
      calls.update++
      return overrides.update
        ? overrides.update(...args)
        : { id: "existing-1", name: args[2]?.name }
    },
  }
}

const rawTemplate = JSON.stringify({
  name: "IG Comment to DM v2",
  active: true,
  triggerMediaId: "{{ig_media_id}}",
})

test("missing --name throws", () => {
  assert.throws(
    () => parseArgs(["--template", "flows/ig-comment-dm-v2.json"]),
    /--name is required/,
  )
})

test("missing --template throws", () => {
  assert.throws(
    () => parseArgs(["--name", "New Flow"]),
    /--template is required/,
  )
})

test("substituteVars replaces {{key}} tokens", () => {
  const result = substituteVars('{"a": "{{foo}}", "b": "{{bar}}-{{bar}}"}', {
    foo: "1",
    bar: "2",
  })
  assert.equal(result, '{"a": "1", "b": "2-2"}')
})

test("new name -> create (POST) path, reusing the real applyFlow", async () => {
  const { applyFlow } = await loadFlowsModule()
  const client = makeClient({ list: async () => [{ id: "x", name: "Other Flow" }] })

  const result = await instantiate({
    templatePath: "flows/ig-comment-dm-v2.json",
    name: "New Client Funnel",
    dryRun: false,
    applyFlow,
    client,
    config,
    readFile: () => rawTemplate,
    log: () => {},
  })

  assert.equal(client.calls.create, 1)
  assert.equal(client.calls.update, 0)
  assert.equal(result.action, "created")
  assert.equal(result.flow.id, "new-1")
})

test("{{var}} substitution flows through into the applied flow body", async () => {
  const { applyFlow } = await loadFlowsModule()
  let createdBody
  const client = makeClient({
    list: async () => [],
    create: async (_cfg, body) => {
      createdBody = body
      return { id: "new-2", name: body.name }
    },
  })

  await instantiate({
    templatePath: "flows/ig-comment-dm-v2.json",
    name: "New Client Funnel",
    vars: { ig_media_id: "178412" },
    dryRun: false,
    applyFlow,
    client,
    config,
    readFile: () => rawTemplate,
    log: () => {},
  })

  assert.equal(createdBody.triggerMediaId, "178412")
  assert.equal(createdBody.name, "New Client Funnel")
})

test("dry-run makes no client call", async () => {
  const { applyFlow } = await loadFlowsModule()
  const client = makeClient()
  const logs = []

  const result = await instantiate({
    templatePath: "flows/ig-comment-dm-v2.json",
    name: "New Client Funnel",
    vars: { ig_media_id: "178412" },
    dryRun: true,
    applyFlow,
    client,
    config,
    readFile: () => rawTemplate,
    log: (line) => logs.push(line),
  })

  assert.equal(client.calls.list, 0)
  assert.equal(client.calls.get, 0)
  assert.equal(client.calls.create, 0)
  assert.equal(client.calls.update, 0)
  assert.equal(result.dryRun, true)
  assert.ok(logs.some((line) => line.includes("dry-run")))
  assert.ok(logs.some((line) => line.includes("178412")))
})
