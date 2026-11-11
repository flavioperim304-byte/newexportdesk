import assert from "node:assert/strict"
import test from "node:test"
import { presentBrief, validateBrief } from "../lib/example"
import { KANECHOM_BRIEF } from "../lib/example"
import { buildDecisionRequests, decisionOutline, parseDecisions } from "../lib/parallel"
import type { Lead } from "../lib/types"

function lead(name: string, index: number): Lead {
  return {
    id: `lead-${index}`,
    name,
    domain: `${index}.example`,
    url: `https://${index}.example`,
    country: "Bolivia",
    market: "Bolivia",
    exa: {
      title: name,
      url: `https://${index}.example`,
      domain: `${index}.example`,
      text: "Imports professional hair care.",
      highlights: [],
      summary: "Distributor.",
    },
  }
}

test("Parallel stays on the Task API unless this run asks for Decisions", () => {
  const task = presentBrief(KANECHOM_BRIEF)
  assert.equal(task.parallelMode, "task")
  const parsed = validateBrief({ ...task, parallelMode: "decisions" })
  assert.equal(parsed.brief?.parallelMode, "decisions")
  assert.equal(validateBrief({ ...task, parallelMode: "something-else" }).brief?.parallelMode, "task")
})

test("a Decisions request stays inside Parallel's limits", () => {
  const brief = presentBrief({ ...KANECHOM_BRIEF, parallelMode: "decisions", markets: "Bolivia" })
  const leads = Array.from({ length: 60 }, (_, index) => lead(`Company ${index}`, index))
  const requests = buildDecisionRequests(brief, leads)
  assert.ok(requests.length > 1)
  for (const request of requests) {
    assert.equal(request.mode, "fast")
    assert.equal(request.include_excerpts, false)
    const names = Object.keys(request.questions)
    assert.ok(names.length >= 1 && names.length <= 100)
    assert.ok(JSON.stringify(request.state).length <= 24000)
    for (const name of names) {
      assert.match(name, /^[A-Za-z0-9_-]+$/)
      assert.ok(JSON.stringify({ [name]: request.questions[name] }).length <= 5000)
    }
  }
  assert.equal(requests[0].questions.purchase_probability.type, "choice")
})

test("Decisions state carries the evidence rule and a RAG line per company", () => {
  const brief = presentBrief({ ...KANECHOM_BRIEF, parallelMode: "decisions", markets: "Bolivia" })
  const miss = lead("Ormate", 0)
  miss.rag = {
    checked: true,
    match: false,
    neighbor: "Adela's Beauty Shop",
    note: "Não parece uma empresa já confirmada no índice.",
  }
  const requests = buildDecisionRequests(brief, [miss])
  assert.match(String(requests[0].state.evidence ?? ""), /Never invent/)
  const first = (requests[0].state.candidates as { rag?: string }[])[0]
  assert.match(first.rag ?? "", /Adela's Beauty Shop/)
  assert.match(first.rag ?? "", /different company/)
  assert.match(decisionOutline(brief), /EVIDENCE RULE/)
})

test("a refusal leaves the OpenAI score in place and a choice sets the fit", () => {
  const brief = presentBrief({ ...KANECHOM_BRIEF, parallelMode: "decisions", markets: "Bolivia" })
  const leads = [lead("Ormate", 0), lead("Elite", 1)]
  const parsed = parseDecisions(brief, leads, [
    {
      decision_id: "decisions_abc",
      answers: {
        purchase_probability: { type: "choice", choice: "high", probabilities: { high: 0.81 } },
        entry_strategy: { type: "choice", choice: "importer", probabilities: { importer: 0.7 } },
        c0_fit: { type: "refusal" },
        c0_best: { type: "refusal" },
        c1_fit: { type: "choice", choice: "high", probabilities: { high: 0.9 } },
        c1_best: { type: "choice", choice: "pursue", probabilities: { pursue: 0.88 } },
      },
      citations: [{ url: "https://example.com/source", title: "Source", excerpts: [] }],
    },
  ])
  assert.equal(parsed.leads[0].icp, undefined)
  assert.equal(parsed.leads[0].supplierFits.length, 0)
  assert.match(parsed.leads[0].qualificationNeeded, /refused/)
  assert.equal(parsed.leads[1].icp, "high")
  assert.equal(parsed.leads[1].bestFit, "Kanechom")
  assert.equal(parsed.market.purchaseProbability, "high")
  assert.match(parsed.market.purchaseNote ?? "", /0\.81/)
  assert.match(parsed.market.entryStrategy ?? "", /one importer/)
  assert.deepEqual(parsed.market.citations, ["https://example.com/source"])
})
