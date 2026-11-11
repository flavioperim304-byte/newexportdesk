import assert from "node:assert/strict"
import test from "node:test"
import {
  KANECHOM_BRIEF,
  LQ_BRIEF,
  findBriefConflicts,
  presentBrief,
  validateBrief,
} from "../lib/example"
import {
  LEADS_PER_COUNTRY,
  buyerTypes,
  exaBackupQuery,
  exaQuery,
  exaSystemPrompt,
  searchBrief,
  targetCountries,
} from "../lib/prompts"
import { anchorSimilarity } from "../lib/anchors"
import type { Brief, Lead } from "../lib/types"

const candidate: Lead = {
  id: "lead-1",
  name: "Distribuidora Exemplo",
  domain: "example.com.co",
  url: "https://example.com.co",
  country: "Colombia",
  market: "Colombia",
  buyerType: "distributor",
  exa: { title: "Distribuidora Exemplo", url: "https://example.com.co", domain: "example.com.co", text: "", highlights: [], summary: "" },
}

test("discovery limit is ten for each country and buyer profile", () => {
  const brief = { ...KANECHOM_BRIEF, markets: "Colombia, Peru", buyerTypes: "distributor, wholesaler, trading company" }
  assert.equal(LEADS_PER_COUNTRY, 10)
  assert.deepEqual(targetCountries(brief), ["Colombia", "Peru"])
  assert.deepEqual(buyerTypes(brief), ["distributor", "wholesaler", "trading company"])
  assert.match(exaSystemPrompt(brief), /10 companies for this country AND this single buyer profile/i)
  assert.match(exaSystemPrompt(brief), /countryEvidence/)
  assert.match(exaSystemPrompt(brief), /categoryEvidence/)
  assert.match(exaQuery(brief, "Colombia", "distributor"), /potential distributor companies/i)
  assert.match(exaQuery(brief, "Colombia", "distributor"), /role may be provisional/i)
  assert.match(exaQuery(brief, "Colombia", "distributor"), /Do not require public import records/i)
  assert.doesNotMatch(exaQuery(brief, "Colombia", "distributor"), /require public evidence of the requested commercial role/i)
  assert.match(exaBackupQuery(brief, "Colombia", "distributor"), /same category and ICP only/i)
  assert.match(exaBackupQuery(brief, "Colombia", "distributor"), /additional distributor companies/i)
  assert.doesNotMatch(exaBackupQuery(brief, "Colombia", "distributor"), /wholesaler companies/i)
})

test("LQ and Kanechom discovery briefs remain independent", () => {
  const lq = exaQuery({ ...LQ_BRIEF, markets: "Peru" }, "Peru", "distributor")
  const kanechom = exaQuery({ ...KANECHOM_BRIEF, markets: "Peru" }, "Peru", "distributor")
  assert.match(lq, /LQ Professional/)
  assert.match(lq, /professional hair care/)
  assert.match(kanechom, /Kanechom/)
  assert.match(kanechom, /mass-market retail hair care/)
  assert.doesNotMatch(kanechom, /train hairdressers/)
  assert.doesNotMatch(lq, /mass-market retail hair care/)
  assert.equal(searchBrief(LQ_BRIEF, KANECHOM_BRIEF).supplierName, "LQ Professional")
})

test("anchor references are opt-in and never add score", () => {
  assert.doesNotMatch(exaSystemPrompt(KANECHOM_BRIEF), /Nazih Trading/)
  assert.match(exaSystemPrompt({ ...KANECHOM_BRIEF, anchorUse: true }), /Nazih Trading/)
  const result = anchorSimilarity({ ...KANECHOM_BRIEF, anchorUse: true }, candidate, "multi-brand portfolio, 300 salons")
  assert.equal(result.points, 0)
  assert.equal(result.max, 0)
})

test("structured brief fields remain visible and separate from free prompt", () => {
  const brief: Brief = {
    ...LQ_BRIEF,
    instructions: "Prioritize companies with nationwide salon distribution.",
  }
  const shown = presentBrief(brief)
  assert.equal(shown.products, LQ_BRIEF.products)
  assert.equal(shown.buyerTypes, LQ_BRIEF.buyerTypes)
  assert.equal(shown.instructions, brief.instructions)
  assert.equal(shown.mustHaves, LQ_BRIEF.mustHaves)
})

test("explicit conflicts between buyer types and prompt are blocked", () => {
  const conflicts = findBriefConflicts({
    ...LQ_BRIEF,
    instructions: "Do not include distributors; only look for wholesalers.",
  })
  assert.ok(conflicts.some((item) => item.includes("distributor")))
  const parsed = validateBrief({
    ...LQ_BRIEF,
    instructions: "Do not include distributors; only look for wholesalers.",
  })
  assert.equal(parsed.brief, undefined)
  assert.match(parsed.error ?? "", /Resolve brief conflicts/)
})


