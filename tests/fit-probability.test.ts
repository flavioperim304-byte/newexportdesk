import assert from "node:assert/strict"
import test from "node:test"
import { EXAMPLE_BRIEF, KANECHOM_BRIEF } from "../lib/example"
import { computeFitProbability } from "../lib/fit-probability"
import { openaiInstructions } from "../lib/prompts"
import { qualificationRows } from "../lib/qualify"
import { sampleRun } from "../lib/sample"
import type { Lead } from "../lib/types"

function quietLead(): Lead {
  return {
    id: "quiet",
    name: "Folheto Cosméticos",
    domain: "folheto.example",
    url: "https://folheto.example",
    country: "Colombia",
    market: "Colombia",
    exa: {
      title: "Folheto",
      url: "https://folheto.example",
      domain: "folheto.example",
      text: "We distribute professional hair care.",
      highlights: [],
      summary: "Distributor brochure.",
    },
    extraction: {
      ok: true,
      companyName: "Folheto Cosméticos",
      headquarters: "Bogotá",
      country: "Colombia",
      role: "distributor",
      buys: ["hair care"],
      sells: [],
      markets: ["Colombia"],
      certifications: [],
      buyerSignals: [],
      summary: "Brochure for a hair-care distributor.",
      excerpt: "Brochure.",
    },
    activity: { fetchedAt: "2026-10-30T00:00:00.000Z", signals: [] },
  }
}

test("a brochure-only company cannot get a high fit probability", () => {
  const fit = computeFitProbability(KANECHOM_BRIEF, quietLead())
  assert.equal(fit.level, "low")
  assert.ok(fit.index <= 38)
  assert.ok(fit.missing.includes("last_purchase"))
  assert.ok(fit.missing.includes("stock"))
  assert.ok(fit.missing.includes("sales"))
})

test("published last purchase, stock, sales, and a competitor move raise the index", () => {
  const lead = quietLead()
  lead.extraction = {
    ...lead.extraction!,
    lastPurchase: "Imported a keratin shipment in September 2026.",
    stock: "Keratin kits are in stock in Bogotá.",
    brandPerformance: "The professional line is a best seller in salon accounts.",
    salesNote: "Sales volume grew in 2026.",
    competitorMoves: ["A rival signed an exclusive Italian brand."],
  }
  lead.activity = {
    fetchedAt: "2026-10-30T00:00:00.000Z",
    signals: [
      {
        kind: "launch",
        title: "Folheto launches a keratin kit",
        url: "https://news.example/folheto",
        publishedAt: "2026-09-01T00:00:00.000Z",
        quote: "New keratin kit.",
      },
    ],
  }
  const fit = computeFitProbability(KANECHOM_BRIEF, lead, [
    { name: "Unika", country: "Colombia", whyRelevant: "Local salon line.", url: "https://unika.example" },
  ])
  assert.equal(fit.level, "high")
  assert.ok(fit.index >= 70)
  assert.equal(fit.missing.length, 0)
})

test("OpenAI high is pulled down when buying facts are missing", () => {
  const item = quietLead()
  item.openai = {
    icp: "high",
    supplierFits: [{ supplier: "Kanechom", level: "high" }],
    bestFit: "Kanechom",
    qualificationNeeded: "Send a price list.",
    rationale: "Looks like a distributor.",
  }
  const [row] = qualificationRows([item], KANECHOM_BRIEF)
  assert.equal(row.fitLevel, "low")
  assert.equal(row.level, "medium")
  assert.match(row.qualificationNeeded, /Last purchase, stock, and sales/)
})

test("the model is told not to invent last purchase, stock, or sales", () => {
  assert.match(openaiInstructions(KANECHOM_BRIEF), /last purchase, stock, brand performance, sales/)
  assert.match(openaiInstructions(KANECHOM_BRIEF), /Do not invent a last purchase/)
})

test("the coffee sample still has a high fit when buying facts are published", () => {
  const nord = sampleRun().leads.find((item) => item.id === "lead-nordlicht")
  assert.ok(nord)
  assert.ok(nord.fit)
  const fit = computeFitProbability(EXAMPLE_BRIEF, nord, sampleRun().competitors)
  assert.equal(fit.level, "high")
  assert.equal(nord.fit.level, "high")
  assert.ok(fit.facts.some((fact) => fact.kind === "last_purchase" && fact.found))
  assert.ok(fit.facts.some((fact) => fact.kind === "stock" && fact.found))
})

test("last purchase and stock outweigh a brand mention without sales", () => {
  const brandOnly = quietLead()
  brandOnly.extraction = {
    ...brandOnly.extraction!,
    brandPerformance: "The house brand is a best seller on the brochure.",
    competitorMoves: ["A rival launched a keratin kit."],
  }
  const brandFit = computeFitProbability(KANECHOM_BRIEF, brandOnly)
  assert.ok(brandFit.index <= 55)
  assert.notEqual(brandFit.level, "high")

  const buying = quietLead()
  buying.extraction = {
    ...buying.extraction!,
    lastPurchase: "Imported a keratin shipment in September 2026.",
    stock: "Keratin kits are in stock in Bogotá.",
    salesNote: "Sales volume grew in 2026.",
  }
  buying.activity = {
    fetchedAt: "2026-10-30T00:00:00.000Z",
    signals: [
      {
        kind: "news",
        title: "Folheto restocks keratin",
        url: "https://news.example/folheto-stock",
        publishedAt: "2026-09-15T00:00:00.000Z",
        quote: "New keratin inventory.",
      },
    ],
  }
  const buyingFit = computeFitProbability(KANECHOM_BRIEF, buying)
  assert.ok(buyingFit.index > brandFit.index)
  assert.ok(buyingFit.level === "high" || buyingFit.level === "medium")
})

test("empty Parallel last-purchase labels are not buying facts", () => {
  const lead = quietLead()
  lead.context = {
    fitNarrative:
      "Upgrade ICP for channel fit. Commercial evidence—last purchase/shipment: ; stock/restock: ; brand performance: ; sales/volume: ; competitor moves: .",
    knownSuppliers: ["Kérastase"],
    risks: ["No purchase, inventory, brand-performance or sales evidence was found."],
    citations: [],
  }
  const fit = computeFitProbability(KANECHOM_BRIEF, lead)
  assert.ok(fit.facts.every((fact) => !fact.found || (fact.kind !== "last_purchase" && fact.kind !== "stock" && fact.kind !== "sales")))
  assert.ok(fit.missing.includes("last_purchase"))
  assert.ok(fit.missing.includes("stock"))
  assert.ok(fit.missing.includes("sales"))
})

test("RAG mismatch caps a brochure-only fit", () => {
  const lead = quietLead()
  lead.rag = { checked: true, match: false, note: "No neighbor." }
  const fit = computeFitProbability(KANECHOM_BRIEF, lead)
  assert.ok(fit.index <= 48)
  assert.match(fit.note, /RAG/)
})
