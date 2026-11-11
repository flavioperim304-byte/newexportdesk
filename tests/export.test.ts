import assert from "node:assert/strict"
import test from "node:test"
import { KANECHOM_BRIEF } from "../lib/example"
import { csvFilename, resultsCsv } from "../lib/csv"
import { addSavedPrompt } from "../lib/prompt-library"
import type { Lead, Run } from "../lib/types"

test("results download as a CSV with the table columns", () => {
  const lead = {
    id: "lead-1",
    name: "Grupo ImpoHogar",
    domain: "impohogarcr.com",
    url: "https://impohogarcr.com",
    country: "Costa Rica",
    market: "Costa Rica",
    buyerType: "distributors",
    exa: {
      title: "Grupo ImpoHogar",
      url: "https://impohogarcr.com",
      domain: "impohogarcr.com",
      text: "",
      highlights: [],
      summary: "",
    },
    extraction: {
      ok: true,
      companyName: "Grupo ImpoHogar",
      headquarters: "",
      country: "Costa Rica",
      role: "",
      buys: [],
      sells: [],
      markets: [],
      certifications: [],
      buyerSignals: [],
      summary: "",
      excerpt: "",
      email: "ventas@impohogarcr.com",
      phone: "+506 2222",
      whatsapp: "",
      website: "https://impohogarcr.com",
    },
    openai: {
      icp: "medium",
      supplierFits: [{ supplier: "Kanechom", level: "medium" }],
      bestFit: "Kanechom",
      qualificationNeeded: "Confirm the Skala slot.",
      rationale: "Retail hair care.",
    },
  } satisfies Lead
  const run = {
    leads: [lead],
    brief: { ...KANECHOM_BRIEF, markets: "Costa Rica" },
  } as Pick<Run, "leads" | "brief" | "also">
  const csv = resultsCsv(run)
  assert.match(csv, /Company,Country,Role,ICP,Best fit,Activity,Commerce,Trade filing,HS shipments,Last trade,Occupied brands,Fit probability/)
  assert.match(csv, /Grupo ImpoHogar,Costa Rica,distributors,medium,neither,Public activity has not been searched.,/)
  assert.equal(csvFilename(run.brief), "kanechom-costa-rica.csv")
})

test("a saved prompt is kept once and reuse is optional", () => {
  const brief = {
    ...KANECHOM_BRIEF,
    products: "",
    differentiators: "",
    certifications: "",
    buyerTypes: "",
    mustHaves: "",
    exclusions: "",
    instructions: "Find retail hair-care importers in Costa Rica.",
    markets: "Costa Rica",
  }
  const once = addSavedPrompt([], brief, "2026-10-28T18:00:00.000Z", "prompt-1")
  const twice = addSavedPrompt(once, brief, "2026-10-28T19:00:00.000Z", "prompt-2")
  assert.equal(once.length, 1)
  assert.equal(twice.length, 1)
  assert.equal(once[0].name, "Kanechom · Costa Rica")
})
