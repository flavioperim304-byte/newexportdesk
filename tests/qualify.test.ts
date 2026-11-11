import assert from "node:assert/strict"
import test from "node:test"
import { KANECHOM_BRIEF, LQ_BRIEF } from "../lib/example"
import { icpLevel, qualificationRows } from "../lib/qualify"
import { countryIsExcluded, fitsRequestedMarket } from "../lib/score"
import { parallelInstructions } from "../lib/prompts"
import type { Lead, LeadScore } from "../lib/types"

function score(total: number, band: LeadScore["band"], disqualified = false): LeadScore {
  return {
    total,
    band,
    headline: `${band} fit`,
    nextAction: "Call",
    disqualified,
    dimensions: [
      {
        key: "commercial",
        label: "Commercial readiness",
        points: 2,
        max: 10,
        rationale: "No order volume is published.",
        evidence: [],
      },
    ],
  }
}

function lead(name: string, primary: LeadScore, secondary?: LeadScore): Lead {
  return {
    id: name,
    name,
    domain: `${name}.example`,
    url: `https://${name}.example`,
    country: "Ecuador",
    market: "Ecuador",
    exa: {
      title: name,
      url: `https://${name}.example`,
      domain: `${name}.example`,
      text: "Hair care distributor.",
      highlights: [],
      summary: "Imports hair care.",
    },
    score: primary,
    alsoScore: secondary,
  }
}

test("a dual qualification names the stronger supplier and keeps low fits out", () => {
  const rows = qualificationRows(
    [
      lead("Dissol", score(82, "best_fit"), score(40, "weak")),
      lead("E-COS", score(20, "weak", true), score(22, "weak", true)),
    ],
    KANECHOM_BRIEF,
    LQ_BRIEF
  )
  assert.equal(rows[0].bestFit, "Kanechom")
  assert.equal(rows[0].level, "medium")
  assert.equal(rows[0].fits[1].level, "low")
  assert.equal(rows[1].bestFit, "neither")
  assert.match(rows[0].qualificationNeeded, /commercial readiness/i)
})

test("Parallel's levels replace the local checklist once they are attached", () => {
  const item = lead("Dissol", score(82, "best_fit"), score(40, "weak"))
  item.context = {
    fitNarrative: "Mass retail importer.",
    knownSuppliers: ["Skala"],
    risks: [],
    citations: [],
    icp: "medium",
    supplierFits: [
      { supplier: "Kanechom", level: "medium" },
      { supplier: "LQ Professional", level: "low" },
    ],
    bestFit: "Kanechom",
    qualificationNeeded: "Confirm an open slot next to Skala.",
  }
  const [row] = qualificationRows([item], KANECHOM_BRIEF, LQ_BRIEF)
  assert.equal(row.fromParallel, true)
  assert.equal(row.level, "medium")
  assert.equal(row.bestFit, "Kanechom")
  assert.equal(row.fits[1].level, "low")
  assert.match(row.qualificationNeeded, /Skala/)
  assert.match(row.qualificationNeeded, /intenção de compra/)
})

test("OpenAI's preliminary score is used until Parallel replaces it", () => {
  const item = lead("Dissol", score(82, "best_fit"), score(40, "weak"))
  item.openai = {
    icp: "high",
    supplierFits: [
      { supplier: "Kanechom", level: "high" },
      { supplier: "LQ Professional", level: "low" },
    ],
    bestFit: "Kanechom",
    qualificationNeeded: "Confirm an open slot.",
    rationale: "Retail importer.",
  }
  const [row] = qualificationRows([item], KANECHOM_BRIEF, LQ_BRIEF)
  assert.equal(row.source, "openai")
  assert.equal(row.bestFit, "Kanechom")
  item.context = {
    fitNarrative: "Parallel kept Kanechom and lowered the call.",
    knownSuppliers: [],
    risks: [],
    citations: [],
    icp: "medium",
    supplierFits: [
      { supplier: "Kanechom", level: "medium" },
      { supplier: "LQ Professional", level: "low" },
    ],
    bestFit: "Kanechom",
    qualificationNeeded: "Ask about Skala.",
  }
  const [refined] = qualificationRows([item], KANECHOM_BRIEF, LQ_BRIEF)
  assert.equal(refined.source, "parallel")
  assert.equal(refined.level, "medium")
})

test("Ecuador, Colombia, and India stay out of a competitor map", () => {
  const skip = "Ecuador, Colombia, India"
  assert.equal(countryIsExcluded("Ecuador", "distribuidor.com", skip), true)
  assert.equal(countryIsExcluded("Colombia", "marca.com", skip), true)
  assert.equal(countryIsExcluded("", "marca.co", skip), true)
  assert.equal(countryIsExcluded("Peru", "distribuidor.pe", skip), false)
  assert.equal(countryIsExcluded("Chile", "marca.cl", skip), false)
})

test("a company from another country is not a Dominican Republic lead", () => {
  assert.equal(fitsRequestedMarket("Republica Domincana", "Dominican Republic", "cofaca.com.do"), true)
  assert.equal(fitsRequestedMarket("Republica Domincana", "República Dominicana", "zalmanproducts.com"), true)
  assert.equal(fitsRequestedMarket("Republica Domincana", "", "distribuidora.com.do"), true)
  assert.equal(fitsRequestedMarket("Republica Domincana", "Chile", "comprador.cl"), false)
  assert.equal(fitsRequestedMarket("Republica Domincana", "", "comprador.cl"), false)
  assert.equal(fitsRequestedMarket("Republica Domincana", "Brazil", "kanechom.com"), false)
  assert.equal(fitsRequestedMarket("South Africa", "Germany", "nordlicht.example"), false)
})

test("Parallel best fit stays when last purchase is published", () => {
  const item = lead("Dissol", score(82, "best_fit"), score(40, "weak"))
  item.extraction = {
    ok: true,
    companyName: "Dissol",
    headquarters: "Quito",
    country: "Ecuador",
    role: "distributor",
    buys: ["hair care"],
    sells: [],
    markets: ["Ecuador"],
    certifications: [],
    buyerSignals: [],
    lastPurchase: "Imported a Brazilian shampoo line in 2026.",
    stock: "In-stock professional kits this month.",
    salesNote: "Sales grew in 2026.",
    summary: "Importer.",
    excerpt: "Importer.",
  }
  item.context = {
    fitNarrative: "Mass retail importer.",
    knownSuppliers: ["Skala"],
    risks: [],
    citations: [],
    icp: "medium",
    supplierFits: [
      { supplier: "Kanechom", level: "medium" },
      { supplier: "LQ Professional", level: "low" },
    ],
    bestFit: "Kanechom",
    qualificationNeeded: "Confirm an open slot next to Skala.",
  }
  const [row] = qualificationRows([item], KANECHOM_BRIEF, LQ_BRIEF)
  assert.equal(row.bestFit, "Kanechom")
})

test("LQ and Kanechom prompts remain separate", () => {
  const kanechom = parallelInstructions(KANECHOM_BRIEF)
  const lq = parallelInstructions(LQ_BRIEF)
  assert.match(kanechom, /Kanechom/)
  assert.match(kanechom, /Skala/)
  assert.doesNotMatch(kanechom, /LQ Professional|straightening systems/i)
  assert.match(lq, /LQ Professional/)
  assert.match(lq, /straightening/)
  assert.doesNotMatch(lq, /Kanechom|mass-market retail hair care/i)
})

test("qualificationRows does not throw when saved score, fit, and signals omit arrays", () => {
  const thin = lead("ThinCo", { total: 48, band: "possible", headline: "possible", nextAction: "", disqualified: false, dimensions: undefined as never })
  thin.fit = { level: "medium", index: 48, note: "saved", missing: undefined as never, facts: undefined as never }
  thin.activity = { fetchedAt: "2026-11-05T00:00:00.000Z", signals: undefined as never }
  thin.commerce = { fetchedAt: "2026-11-05T00:00:00.000Z", signals: undefined as never }
  const rows = qualificationRows([thin], KANECHOM_BRIEF)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].company, "ThinCo")
})
