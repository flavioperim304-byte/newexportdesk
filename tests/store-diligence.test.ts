import assert from "node:assert/strict"
import test from "node:test"
import { KANECHOM_BRIEF } from "../lib/example"
import { createRun } from "../lib/pipeline"
import { deleteRun, getRun, insertRun, updateRun } from "../lib/store"

test("updateRun serializes concurrent writes so both field changes survive", async () => {
  const run = createRun(KANECHOM_BRIEF)
  run.id = `test-dd-${crypto.randomUUID()}`
  run.status = "complete"
  run.leads = [
    {
      id: "lead-a",
      name: "Alpha",
      domain: "alpha.example",
      url: "https://alpha.example",
      country: "Chile",
      exa: {
        title: "Alpha",
        url: "https://alpha.example",
        domain: "alpha.example",
        text: "",
        highlights: [],
        summary: "",
      },
    },
  ]
  await insertRun(run)
  try {
    await Promise.all([
      updateRun(run.id, (current) => {
        current.leads[0].country = "Colombia"
      }),
      updateRun(run.id, (current) => {
        current.leads[0].name = "Alpha Dist"
      }),
    ])
    const stored = await getRun(run.id)
    assert.ok(stored)
    assert.equal(stored.leads[0].country, "Colombia")
    assert.equal(stored.leads[0].name, "Alpha Dist")
    const src = await import("node:fs")
    const text = src.readFileSync(new URL("../lib/store.ts", import.meta.url), "utf8")
    assert.match(text, /\$\{file\}\.tmp/)
    assert.match(text, /renameSync/)
  } finally {
    await deleteRun(run.id)
    const gone = await getRun(run.id)
    assert.equal(gone, null)
  }
})
