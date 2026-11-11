import type { Brief, Evidence, Lead } from "./types"
import { sameSite } from "./text"

export type AnchorDistributor = {
  name: string
  domain: string
  url: string
  country: string
  note: string
}

/** Hair-care distributors used as a channel shape, not as a Kanechom/LQ purchase. */
export const ANCHOR_DISTRIBUTORS: AnchorDistributor[] = [
  {
    name: "Nazih Trading LLC",
    domain: "nazih.com",
    url: "https://www.nazih.com",
    country: "United Arab Emirates (Dubai)",
    note: "Large Dubai beauty distributor with a diversified professional and retail brand book and a wide salon and retail client base.",
  },
  {
    name: "Gem Import & Export",
    domain: "gemegypt.com",
    url: "https://www.gemegypt.com",
    country: "Egypt",
    note: "Egyptian importer-exporter of a diversified beauty and hair brand book with a large customer base.",
  },
  {
    name: "SSIZ",
    domain: "ssiz.in",
    url: "https://www.ssiz.in",
    country: "India",
    note: "Indian professional beauty distributor with a diversified brand portfolio and a large salon client base.",
  },
]

export function briefUsesAnchorDistributors(brief: Brief): boolean {
  return brief.anchorUse === true
}

export function isAnchorCompany(lead: Lead): AnchorDistributor | undefined {
  return ANCHOR_DISTRIBUTORS.find(
    (anchor) =>
      sameSite(anchor.url, lead.url) ||
      sameSite(anchor.domain, lead.domain) ||
      sameSite(anchor.domain, lead.exa?.domain || "")
  )
}

export function anchorPromptBlock(): string {
  const listed = ANCHOR_DISTRIBUTORS.map(
    (anchor) => `${anchor.name} (${anchor.url}, ${anchor.country}): ${anchor.note}`
  ).join(" ")
  return [
    "Anchor distributors are a reference shape, not the buyer list and not a Kanechom or LQ purchase:",
    listed,
    "Raise the channel score when the candidate is published as the same kind of company: a diversified hair or beauty brand book and a large salon or retail client base, in the same range as these anchors.",
    "Name the similar brands and any published client, salon, retailer, or point-of-sale count. Do not invent a count.",
    "Similarity to an anchor raises icp (channel fit). It does not set best_fit and it does not confirm a Kanechom or LQ purchase. Last purchase, stock, or sales on the page are still required for best_fit.",
    "Do not return the anchor companies themselves unless they operate in the search country and buy this category there.",
  ].join(" ")
}

export function anchorPromptMarkdown(markets = "the search country"): string {
  const rows = ANCHOR_DISTRIBUTORS.map(
    (anchor) => `| **${anchor.name}** | ${anchor.country} | ${anchor.url} | ${anchor.note} |`
  ).join("\n")
  return [
    "### REFERENCE ANCHOR DISTRIBUTORS (CHANNEL FIT BENCHMARK ONLY)",
    "Use these benchmark distributors as a reference for company scale/type to evaluate `icp` (channel fit):",
    "",
    "| Anchor | Country | URL | Shape |",
    "| --- | --- | --- | --- |",
    rows,
    "",
    "*Note on Anchors:* High similarity to these anchors raises icp (channel fit). It does NOT grant a high `best_fit` and it does not confirm a Kanechom or LQ purchase. Last purchase, stock, or sales on the page are still required for `best_fit`. Do NOT return the anchor companies themselves unless they operate in the search country and buy this category there.",
    `Search country for that exception: ${markets}.`,
  ].join("\n")
}

export function firecrawlAnchorLine(brief: Brief): string {
  if (!briefUsesAnchorDistributors(brief)) return ""
  return "Record the published brand portfolio and any salon, retailer, or client-count language so the desk can compare the company with Nazih Trading, Gem Import & Export, and SSIZ. Leave those fields empty when unpublished."
}

const BRAND_BOOK =
  /brand (book|portfolio)|our brands|we distribute|distributes .+ and |exclusive (distributor|importer) of|multi-?brand|diversified brands|portfolio of (brands|lines)|lines we (carry|represent)|professional and retail/i

const CLIENT_SCALE =
  /\d{2,}\s+(salons?|clients?|customers?|retailers?|stores?|outlets?|points of sale)|nationwide (salon|retail)|large (salon|client|customer) (base|network)|thousands of (salons?|clients?)|wide (salon|retail) network|points of sale|rede de (sal[oõ]es|clientes)/i

export function anchorSimilarity(_brief: Brief, _lead: Lead, _corpus: string): {
  points: number
  max: number
  rationale: string
  evidence: Evidence[]
} {
  return {
    points: 0,
    max: 0,
    rationale: "Anchor companies are optional discovery references only; similarity does not add points or determine buyer fit.",
    evidence: [],
  }
}
