import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

const IG_FOLLOW_CHECK_IMPORT_PATTERN =
  /import \{ stepIgFollowCheck \} from "\.\/ig-follow-check"/

describe("Instagram follow-check worker step registration", () => {
  test("dispatches igFollowCheck steps to stepIgFollowCheck", () => {
    const source = readFileSync("src/integration/handlers/step.ts", "utf8")
    expect(source).toMatch(IG_FOLLOW_CHECK_IMPORT_PATTERN)
    expect(source).toContain(
      "[stepTypes.enum.igFollowCheck]: stepIgFollowCheck",
    )
  })
})
