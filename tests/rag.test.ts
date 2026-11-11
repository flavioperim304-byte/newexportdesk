import assert from "node:assert/strict"
import test from "node:test"
import { ragLine, ragNotConfiguredMatch } from "../lib/rag"
import { researchPrompt } from "../lib/prompts"
import { LQ_BRIEF } from "../lib/example"
import type { Lead } from "../lib/types"

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-andes",
    name: "Andes Beauty",
    domain: "andes.example",
    url: "https://andes.example",
    country: "Chile",
    market: "Chile",
    exa: {
      title: "Andes Beauty",
      url: "https://andes.example",
      domain: "andes.example",
      text: "Imports professional hair care.",
      highlights: [],
      summary: "Distributor of professional hair care in Chile.",
    },
    ...overrides,
  }
}

test("RAG line tells the model a missing check is unpublished, not a fact to invent", () => {
  assert.match(ragLine(lead()), /RAG: not checked/)
  assert.match(ragLine(lead()), /Do not invent/)
  const skipped = lead({ rag: ragNotConfiguredMatch() })
  assert.match(ragLine(skipped), /not checked/)
  assert.match(ragLine(skipped), /RAG_API_URL is not set/)
})

test("RAG miss names the neighbor as a different company", () => {
  const miss = lead({
    rag: {
      checked: true,
      match: false,
      distance: 0.76,
      neighbor: "Adela's Beauty Shop",
      note: "Não parece uma empresa já confirmada no índice.",
    },
  })
  const line = ragLine(miss)
  assert.match(line, /no exact name/)
  assert.match(line, /Adela's Beauty Shop/)
  assert.match(line, /different company/)
  assert.doesNotMatch(line, /Kanechom purchase/)
  const prompt = researchPrompt({ ...LQ_BRIEF, markets: "Chile" }, [miss])
  assert.match(prompt, /Adela's Beauty Shop/)
  assert.match(prompt, /different company/)
  assert.match(prompt, /EVIDENCE RULE/)
})

test("RAG hit is a past dashboard profile, never a Kanechom or LQ purchase", () => {
  const hit = lead({
    rag: {
      checked: true,
      match: true,
      exact: true,
      neighbor: "Andes Beauty",
      note: "Combina com Andes Beauty no índice.",
    },
  })
  const line = ragLine(hit)
  assert.match(line, /exact name already in the dashboard index/)
  assert.match(line, /never a Kanechom or LQ purchase/)
})
