import assert from "node:assert/strict"
import test from "node:test"
import {
  classifyCommerce,
  commerceBuyQuery,
  commerceIntentQuery,
  commerceLine,
  hasCommercialBuyFacts,
  signalsFromSearch,
} from "../lib/commerce"
import { computeFitProbability, hasPublishedBuyFacts } from "../lib/fit-probability"
import { KANECHOM_BRIEF } from "../lib/example"
import { qualificationRows } from "../lib/qualify"
import { classifyBlocks } from "../lib/diligence"
import { resultsCsv } from "../lib/csv"
import type { Lead } from "../lib/types"

function quietLead(): Lead {
  return {
    id: "quiet",
    name: "Premium Cosmetics S.A.",
    domain: "premium.example",
    url: "https://premium.example",
    country: "Panama",
    market: "Panama",
    exa: {
      title: "Premium Cosmetics",
      url: "https://premium.example",
      domain: "premium.example",
      text: "Distribuidor panameño de cosméticos. Somos importadores de cuidado capilar para salones.",
      highlights: [],
      summary: "Distributor brochure. We import professional hair care.",
    },
    extraction: {
      ok: true,
      companyName: "Premium Cosmetics S.A.",
      headquarters: "Panama City",
      country: "Panama",
      role: "distributor",
      buys: ["hair care"],
      sells: [],
      markets: ["Panama"],
      certifications: [],
      buyerSignals: [],
      summary: "Brochure for a salon distributor.",
      excerpt: "We import hair care.",
    },
    activity: { fetchedAt: "2026-11-02T00:00:00.000Z", signals: [] },
  }
}

test("a brochure importer is not a customs signal", () => {
  assert.equal(
    classifyCommerce(
      "https://premium.example/about",
      "Somos importadores",
      "We import professional hair care for salons."
    ),
    null
  )
})

test("a bill of lading or a container arrival is customs", () => {
  assert.equal(
    classifyCommerce(
      "https://trade.example/bl",
      "Premium Cosmetics bill of lading",
      "Bill of lading lists Premium as importer of record for a keratin container."
    ),
    "customs"
  )
  assert.equal(
    classifyCommerce(
      "https://news.example/panama",
      "Premium importó un contenedor",
      "La empresa importó un contenedor de shampoos brasileños en septiembre 2026."
    ),
    "customs"
  )
})

test("restock, fair, and a purchasing hire classify separately", () => {
  assert.equal(
    classifyCommerce("https://instagram.com/p/1", "Ya tenemos stock", "Acaba de llegar el inventario de keratina."),
    "restock"
  )
  assert.equal(
    classifyCommerce(
      "https://cosmoprof.example/exhibitors",
      "Premium Cosmetics at Cosmoprof Bologna",
      "Exhibitor list for the trade fair."
    ),
    "trade_fair"
  )
  assert.equal(
    classifyCommerce(
      "https://jobs.example/compras",
      "Gerente de compras — Premium Cosmetics",
      "Vacante de compras for an import manager in Panama."
    ),
    "hiring_buy"
  )
  assert.equal(
    classifyCommerce("https://jobs.example/sales", "Sales executive", "We are hiring a salesperson."),
    null
  )
})

test("commerce queries name the company and look for aduana and feira", () => {
  const lead = quietLead()
  assert.match(commerceBuyQuery(lead, KANECHOM_BRIEF), /Premium Cosmetics/)
  assert.match(commerceBuyQuery(lead, KANECHOM_BRIEF), /aduana|bill of lading/i)
  assert.match(commerceIntentQuery(lead, KANECHOM_BRIEF), /Cosmoprof|gerente de compras/i)
})

test("unrelated hits and generic importer pages are dropped", () => {
  const rows = signalsFromSearch(
    [
      {
        title: "A factory in São Paulo",
        url: "https://other.example/factory",
        text: "A factory in São Paulo imported a container.",
      },
      {
        title: "Premium Cosmetics about",
        url: "https://premium.example/about",
        text: "We import professional hair care.",
      },
      {
        title: "Premium Cosmetics bill of lading",
        url: "https://trade.example/premium-bl",
        text: "Bill of lading lists Premium Cosmetics as importer of record for a Brazilian keratin container.",
        publishedDate: "2026-09-01T00:00:00.000Z",
      },
    ],
    quietLead()
  )
  assert.deepEqual(
    rows.map((row) => row.kind),
    ["customs"]
  )
})

test("a brochure-only Panama lead stays a low fit", () => {
  const fit = computeFitProbability(KANECHOM_BRIEF, quietLead())
  assert.equal(fit.level, "low")
  assert.ok(fit.index <= 38)
  assert.equal(hasPublishedBuyFacts(quietLead()), false)
})

test("an Exa customs mention does not prove purchase intent or change ICP fit", () => {
  const lead = quietLead()
  lead.commerce = {
    fetchedAt: "2026-11-02T00:00:00.000Z",
    signals: [
      {
        kind: "customs",
        source: "exa",
        title: "Premium Cosmetics bill of lading",
        url: "https://trade.example/premium-bl",
        publishedAt: "2026-09-01T00:00:00.000Z",
        quote: "Bill of lading lists Premium Cosmetics as importer of record for a Brazilian keratin container.",
      },
    ],
  }
  lead.openai = {
    icp: "high",
    supplierFits: [{ supplier: "Kanechom", level: "high" }],
    bestFit: "Kanechom",
    qualificationNeeded: "Send a price list.",
    rationale: "Looks like a distributor.",
  }
  assert.equal(hasCommercialBuyFacts(lead), false)
  assert.equal(hasPublishedBuyFacts(lead), false)
  const [row] = qualificationRows([lead], KANECHOM_BRIEF)
  assert.equal(row.bestFit, "Kanechom")
  assert.match(row.qualificationNeeded, /não comprova intenção de compra/i)
})

test("a trade fair alone does not prove purchase intent or change ICP fit", () => {
  const lead = quietLead()
  lead.commerce = {
    fetchedAt: "2026-11-02T00:00:00.000Z",
    signals: [
      {
        kind: "trade_fair",
        title: "Premium at Cosmoprof",
        url: "https://cosmoprof.example/premium",
        publishedAt: "2026-03-01T00:00:00.000Z",
        quote: "Exhibitor at Cosmoprof Bologna.",
      },
    ],
  }
  lead.openai = {
    icp: "high",
    supplierFits: [{ supplier: "Kanechom", level: "high" }],
    bestFit: "Kanechom",
    qualificationNeeded: "Send a price list.",
    rationale: "Looks like a distributor.",
  }
  assert.equal(hasCommercialBuyFacts(lead), false)
  assert.equal(hasPublishedBuyFacts(lead), false)
  const [row] = qualificationRows([lead], KANECHOM_BRIEF)
  assert.equal(row.bestFit, "Kanechom")
  assert.match(row.qualificationNeeded, /não comprova intenção de compra/i)
  const fit = computeFitProbability(KANECHOM_BRIEF, lead)
  assert.ok(fit.index <= 55)
  assert.notEqual(fit.level, "high")
})

test("Spanish restock language on the page counts as stock", () => {
  const lead = quietLead()
  lead.extraction = {
    ...lead.extraction!,
    excerpt: "Ya tenemos stock. Acaba de llegar la reposición de keratina.",
  }
  const fit = computeFitProbability(KANECHOM_BRIEF, lead)
  assert.ok(fit.facts.some((fact) => fact.kind === "stock" && fact.found))
  assert.equal(hasPublishedBuyFacts(lead), true)
})

test("Spanish importó un contenedor on the page counts as last purchase", () => {
  const lead = quietLead()
  lead.extraction = {
    ...lead.extraction!,
    excerpt: "Importó un contenedor de shampoos brasileños en septiembre 2026.",
  }
  const fit = computeFitProbability(KANECHOM_BRIEF, lead)
  assert.ok(fit.facts.some((fact) => fact.kind === "last_purchase" && fact.found))
})

test("an Exa customs mention does not confirm diligence import", () => {
  const lead = quietLead()
  lead.exa = {
    ...lead.exa,
    summary: "Salon distributor in Panama.",
    text: "Salon distributor in Panama. Portfolio of professional hair care.",
  }
  lead.extraction = {
    ...lead.extraction!,
    role: "distributor",
    summary: "Salon distributor.",
    excerpt: "Salon distributor.",
  }
  lead.commerce = {
    fetchedAt: "2026-11-02T00:00:00.000Z",
    signals: [
      {
        kind: "customs",
        source: "exa",
        title: "SIGA filing",
        url: "https://trade.example/siga",
        publishedAt: "2026-08-01T00:00:00.000Z",
        quote: "Despacho aduanero de un contenedor HS 3305 a nombre de Premium Cosmetics.",
      },
    ],
  }
  const states = classifyBlocks("lq", lead)
  assert.notEqual(states.import, "strong")
})

test("commerce line and CSV name the new column", () => {
  const lead = quietLead()
  assert.match(commerceLine(lead), /have not been searched|not been searched/i)
  lead.commerce = { fetchedAt: "2026-11-02T00:00:00.000Z", signals: [] }
  assert.match(commerceLine(lead), /No customs/)
  const csv = resultsCsv({ leads: [lead], brief: KANECHOM_BRIEF })
  assert.match(csv, /Company,Country,Discovery profile,Reported buyer role,Buyer role status,Confirmed buyer role,ICP,Best fit,Activity,Commerce/)
})
