import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

test("the committed seed has the Kanechom and LQ searches", () => {
  const runs = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "lib/data/seed-runs.json"), "utf8")
  ) as { runs: { status: string; brief: { supplierName: string; markets: string } }[] }
  assert.ok(runs.runs.length >= 7)
  assert.ok(runs.runs.every((run) => run.status === "complete"))
  const labels = runs.runs.map((run) => `${run.brief.supplierName} ${run.brief.markets}`)
  assert.ok(labels.some((label) => /Kanechom/i.test(label) && /Uganda/i.test(label)))
  assert.ok(labels.some((label) => /LQ/i.test(label) && /Portugal/i.test(label)))

  const prompts = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "lib/data/seed-prompts.json"), "utf8")
  ) as { prompts: { name: string }[] }
  assert.ok(prompts.prompts.some((item) => /Kanechom/i.test(item.name)))
  assert.ok(prompts.prompts.some((item) => /LQ/i.test(item.name)))
})
