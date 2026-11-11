import assert from "node:assert/strict"
import test from "node:test"
import { EXAMPLE_BRIEF, KANECHOM_BRIEF } from "../lib/example"
import { sampleRun } from "../lib/sample"
import { scoreLead } from "../lib/score"
import type { Lead, LeadScore } from "../lib/types"

function explain(lead: Lead): string {
  const score = lead.score
  if (!score) return lead.name
  const parts = score.dimensions
    .map((item) => `${item.key}:${item.points}/${item.max}`)
    .join(" ")
  return `${lead.name} ${score.band} ${score.total} ${parts} ${score.disqualifyReason ?? ""}`
}

test("sample dossier ranks the coffee brief into the expected bands", () => {
  const run = sampleRun()
  const byId = new Map<string, Lead>(run.leads.map((lead) => [lead.id, lead]))
  const nord = byId.get("lead-nordlicht")
  const haven = byId.get("lead-haven")
  const kumo = byId.get("lead-kumo")
  const atlas = byId.get("lead-atlas")
  const estate = byId.get("lead-estate")
  if (!nord || !haven || !kumo || !atlas || !estate) {
    throw new Error("sample dossier is missing a lead")
  }

  assert.equal(nord.score?.band, "best_fit", explain(nord))
  assert.ok((nord.score?.total ?? 0) >= 80, explain(nord))

  assert.equal(haven.score?.band, "possible", explain(haven))
  assert.ok((haven.score?.total ?? 0) >= 64, explain(haven))
  assert.equal(haven.fit?.level, "low")

  assert.equal(kumo.score?.band, "possible", explain(kumo))
  assert.ok((kumo.score?.total ?? 0) < 64, explain(kumo))

  assert.equal(atlas.score?.band, "disqualified", explain(atlas))
  assert.match(atlas.score?.disqualifyReason ?? "", /instant coffee/i)

  assert.equal(estate.score?.band, "disqualified", explain(estate))
  assert.match(estate.score?.disqualifyReason ?? "", /Peer exporter/i)

  const ordered = run.leads.map((lead) => lead.id)
  assert.deepEqual(ordered.slice(0, 3), [
    "lead-nordlicht",
    "lead-haven",
    "lead-kumo",
  ])
  assert.equal(run.leads.at(-1)?.score?.disqualified, true)
})

test("the supplier’s own domain is disqualified", () => {
  const lead: Lead = {
    id: "self",
    name: "Serra Alta Exportadora",
    domain: "serraalta.example",
    url: "https://serraalta.example/about",
    country: "Brazil",
    exa: {
      title: "Serra Alta",
      url: "https://serraalta.example/about",
      domain: "serraalta.example",
      text: "We export green arabica microlots from Brazil. ".repeat(8),
      highlights: ["export green arabica"],
      summary: "Exporter of green arabica microlots from Minas Gerais, Brazil.",
    },
  }
  const score = scoreLead(EXAMPLE_BRIEF, lead)
  assert.equal(score.disqualified, true)
  assert.match(score.disqualifyReason ?? "", /own site/i)
})

test("“not exclusive” is an open book, not a locked account", () => {
  const lead: Lead = {
    id: "open",
    name: "Open Book Imports",
    domain: "open-book.example",
    url: "https://open-book.example/",
    country: "Germany",
    exa: {
      title: "Open Book Imports",
      url: "https://open-book.example/",
      domain: "open-book.example",
      text: "Importer of green arabica in Hamburg. ".repeat(8),
      highlights: ["imports green arabica"],
      summary: "German importer of green arabica for roasters.",
    },
    context: {
      fitNarrative: "The supply relationship is not exclusive.",
      knownSuppliers: ["A Brazilian exporter"],
      risks: [],
      citations: ["https://open-book.example/sources"],
    },
  }
  const score: LeadScore = scoreLead(EXAMPLE_BRIEF, lead)
  const competitive = score.dimensions.find((item) => item.key === "competitive")
  assert.equal(competitive?.points, 10)
  assert.match(competitive?.rationale ?? "", /open buying book/i)
})

test("República Dominicana and South África count as the target markets", () => {
  const dominicana: Lead = {
    id: "rd",
    name: "Caribe Belleza",
    domain: "caribe.example",
    url: "https://caribe.example/",
    country: "",
    exa: {
      title: "Caribe Belleza",
      url: "https://caribe.example/",
      domain: "caribe.example",
      text: "Distribuidor de cuidado capilar.",
      highlights: [],
      summary: "Distribuidor.",
    },
    extraction: {
      ok: true,
      companyName: "Caribe Belleza",
      headquarters: "Santo Domingo",
      country: "República Dominicana",
      role: "distributor",
      buys: ["hair care"],
      sells: [],
      markets: [],
      certifications: [],
      buyerSignals: [],
      summary: "Imports retail hair care.",
      excerpt: "Imports retail hair care.",
    },
  }
  const africa: Lead = {
    ...dominicana,
    id: "za",
    name: "Cape Retail",
    extraction: {
      ...dominicana.extraction!,
      companyName: "Cape Retail",
      headquarters: "Cape Town, South África",
      country: "",
    },
  }
  const geo = (lead: Lead) => {
    const score: LeadScore = scoreLead(KANECHOM_BRIEF, lead)
    return score.dimensions.find((item) => item.key === "geography")
  }
  assert.equal(geo(dominicana)?.points, 15)
  assert.equal(geo(africa)?.points, 15)
})

test("a thin excerpt still returns a score without invented evidence", () => {
  const lead: Lead = {
    id: "thin",
    name: "Unknown Trading",
    domain: "unknown-trading.example",
    url: "https://unknown-trading.example/",
    country: "",
    exa: {
      title: "Unknown Trading",
      url: "https://unknown-trading.example/",
      domain: "unknown-trading.example",
      text: "Company page.",
      highlights: [],
      summary: "",
    },
  }
  const score: LeadScore = scoreLead(EXAMPLE_BRIEF, lead)
  const evidence = score.dimensions.find((item) => item.key === "evidence")
  const competitive = score.dimensions.find((item) => item.key === "competitive")
  assert.ok(evidence)
  assert.ok(competitive)
  assert.ok(evidence.points <= 3)
  assert.equal(competitive.points, 4)
  assert.match(competitive.rationale, /Parallel has not attached/)
})

function hairLead(id: string, summary: string, domain = `${id}.example`): Lead {
  return {
    id,
    name: id,
    domain,
    url: `https://${domain}/`,
    country: "Chile",
    exa: {
      title: id,
      url: `https://${domain}/`,
      domain,
      text: summary,
      highlights: [],
      summary,
    },
    extraction: {
      ok: true,
      companyName: id,
      headquarters: "Santiago",
      country: "Chile",
      role: "distributor",
      buys: ["shampoo"],
      sells: ["hair care"],
      markets: ["Chile"],
      certifications: [],
      buyerSignals: [summary],
      summary,
      excerpt: "",
    },
  }
}

test("anchor similarity never adds score", () => {
  const candidate = hairLead(
    "wide-book",
    "We distribute a multi-brand professional and retail portfolio and serve 400 salons nationwide."
  )
  const withoutAnchors = scoreLead(KANECHOM_BRIEF, candidate)
  const withAnchors = scoreLead({ ...KANECHOM_BRIEF, anchorUse: true }, candidate)
  assert.equal(withAnchors.total, withoutAnchors.total)
  assert.equal(withAnchors.dimensions.some((item) => item.key === "anchor"), false)
})

test("an anchor company does not receive automatic score points", () => {
  const candidate = hairLead("nazih", "Nazih Trading LLC, Dubai.", "nazih.com")
  const ordinary = scoreLead(KANECHOM_BRIEF, candidate)
  const anchorEnabled = scoreLead({ ...KANECHOM_BRIEF, anchorUse: true }, candidate)
  assert.equal(anchorEnabled.total, ordinary.total)
  assert.equal(anchorEnabled.dimensions.some((item) => item.key === "anchor"), false)
})
