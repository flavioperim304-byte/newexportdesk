import {
  activityKindLabel,
  activityLine,
  hasRecentActivity,
  recentSignals,
} from "./activity"
import { anchorSimilarity } from "./anchors"
import { commerceLine, hasCommercialBuyFacts, recentCommerce } from "./commerce"
import { computeFitProbability } from "./fit-probability"
import type {
  Band,
  Brief,
  Competitor,
  DimensionScore,
  Evidence,
  Extraction,
  Lead,
  LeadScore,
} from "./types"
import { clip, sameSite, splitList } from "./text"

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "your",
  "our",
  "into",
  "over",
  "than",
  "then",
  "lots",
  "scoring",
  "higher",
  "grade",
  "product",
  "products",
  "export",
  "exports",
  "exported",
  "including",
  "available",
  "same",
  "level",
  "ready",
  "specialty",
  "process",
  "processed",
  "program",
  "programs",
  "they",
  "them",
  "their",
  "have",
  "been",
  "will",
  "what",
  "when",
  "where",
  "which",
  "while",
  "also",
  "only",
  "more",
  "most",
  "some",
  "such",
  "each",
  "both",
  "very",
  "just",
  "about",
  "after",
  "before",
  "under",
  "other",
  "these",
  "those",
  "would",
  "could",
  "should",
  "does",
  "into",
  "onto",
  "upon",
  "are",
  "was",
  "not",
  "who",
])

const ALIASES: Record<string, string[]> = {
  germany: ["germany", "deutschland", "german"],
  netherlands: ["netherlands", "holland", "dutch"],
  japan: ["japan", "japanese"],
  brazil: ["brazil", "brasil", "brazilian"],
  "united states": ["united states", "usa", "u.s.", "american"],
  "united kingdom": ["united kingdom", "britain", "british"],
  "united arab emirates": ["united arab emirates", "uae", "dubai"],
  france: ["france", "french"],
  italy: ["italy", "italian"],
  spain: ["spain", "spanish"],
  "south korea": ["south korea", "korea", "korean"],
  china: ["china", "chinese"],
  mexico: ["mexico", "mexican"],
  canada: ["canada", "canadian"],
  australia: ["australia", "australian"],
  belgium: ["belgium", "belgian"],
  sweden: ["sweden", "swedish"],
  switzerland: ["switzerland", "swiss"],
  poland: ["poland", "polish"],
  portugal: ["portugal", "portuguese"],
  india: ["india", "indian"],
  singapore: ["singapore"],
  "dominican republic": [
    "dominican republic",
    "republica dominicana",
    "republica domincana",
    "dominicana",
    "domincana",
  ],
  "south africa": ["south africa", "sudafrica"],
  chile: ["chile", "chilean"],
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function wordIn(haystack: string, token: string): boolean {
  const re = new RegExp(
    `(?:^|[^a-z0-9])${escapeReg(token)}(?:[a-z]+)?(?:[^a-z0-9]|$)`,
    "i"
  )
  return re.test(haystack)
}

export function significant(value: string): string[] {
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const raw of value.toLowerCase().split(/[^a-z0-9+]+/)) {
    const token = raw.trim()
    if (token.length < 4 || STOP.has(token) || seen.has(token)) continue
    seen.add(token)
    tokens.push(token)
  }
  return tokens
}

function placeMatch(target: string, corpus: string): boolean {
  const needle = fold(target).trim()
  const hay = fold(corpus)
  if (!needle || !hay) return false
  if (hay.includes(needle)) return true
  const aliases = (ALIASES[needle] ?? [needle]).map(fold)
  return aliases.some((alias) =>
    new RegExp(`(?:^|[^a-z])${escapeReg(alias)}(?:[^a-z]|$)`, "i").test(hay)
  )
}

function anyMarket(markets: string, corpus: string): boolean {
  return splitList(markets).some((market) => placeMatch(market, corpus))
}

const COUNTRY_TLD: Record<string, string> = {
  ar: "argentina",
  br: "brazil",
  cl: "chile",
  co: "colombia",
  de: "germany",
  do: "dominican republic",
  ec: "ecuador",
  in: "india",
  fr: "france",
  gb: "united kingdom",
  jp: "japan",
  mx: "mexico",
  nl: "netherlands",
  pe: "peru",
  pt: "portugal",
  uk: "united kingdom",
  us: "united states",
  za: "south africa",
}

function sharesMarket(left: string, right: string): boolean {
  if (placeMatch(left, right) || placeMatch(right, left)) return true
  const leftFold = fold(left)
  const rightFold = fold(right)
  for (const aliases of Object.values(ALIASES)) {
    const folded = aliases.map(fold)
    const leftHit = folded.some((alias) => leftFold.includes(alias))
    const rightHit = folded.some((alias) => rightFold.includes(alias))
    if (leftHit && rightHit) return true
  }
  return false
}

/** True when the company is in one of the countries the brief told us to skip. */
export function countryIsExcluded(country: string, domain: string, excluded: string): boolean {
  return splitList(excluded).some((item) => {
    const target = item.trim()
    if (!target) return false
    if (country.trim() && sharesMarket(target, country)) return true
    const tld = domain.split(".").pop()?.toLowerCase() ?? ""
    const fromDomain = tld.length === 2 ? COUNTRY_TLD[tld] : ""
    return Boolean(fromDomain && sharesMarket(target, fromDomain))
  })
}

/** True when a search hit belongs to the country that was requested. */
export function fitsRequestedMarket(target: string, reportedCountry: string, domain = ""): boolean {
  const wanted = fold(target).trim()
  if (!wanted) return true
  const reported = fold(reportedCountry).trim()
  if (reported && !sharesMarket(target, reported)) return false
  const tld = domain.split(".").pop()?.toLowerCase() ?? ""
  const fromDomain = tld.length === 2 ? COUNTRY_TLD[tld] : ""
  if (fromDomain && !sharesMarket(target, fromDomain)) return false
  return true
}

function bandFor(total: number): Band {
  if (total >= 80) return "best_fit"
  if (total >= 64) return "strong"
  if (total >= 46) return "possible"
  if (total >= 28) return "weak"
  return "disqualified"
}

function exclusionHit(exclusions: string, corpus: string): string | null {
  const hay = corpus.toLowerCase()
  for (const raw of splitList(exclusions)) {
    const phrase = raw.toLowerCase().trim()
    if (phrase.length < 4) continue
    if (phrase.includes(" ")) {
      if (hay.includes(phrase)) return raw.trim()
    } else if (
      new RegExp(`(?:^|[^a-z0-9])${escapeReg(phrase)}(?:[^a-z0-9]|$)`, "i").test(
        hay
      )
    ) {
      return raw.trim()
    }
  }
  return null
}

function peerSupplier(brief: Brief, lead: Lead): boolean {
  const country = [
    lead.extraction?.country,
    lead.extraction?.headquarters,
    lead.country,
  ]
    .filter(Boolean)
    .join(" ")
  if (!placeMatch(brief.originCountry, country)) return false
  const role = lead.extraction?.role ?? ""
  if (/\b(importer|distributor|wholesaler|trader|roaster|retailer)\b/i.test(role)) {
    return false
  }
  if (!/\b(exporter|producer|grower|estate|farm|cooperative)\b/i.test(role)) {
    return false
  }
  const buys = (lead.extraction?.buys ?? []).join(" ")
  const overlapped = significant(brief.products).filter((token) =>
    wordIn(buys.toLowerCase(), token)
  )
  return overlapped.length === 0
}

type QuoteSource = {
  source: Evidence["source"]
  label: string
  text: string
  url?: string
}

function quotesFor(tokens: string[], sources: QuoteSource[], limit = 2): Evidence[] {
  const found: Evidence[] = []
  for (const source of sources) {
    if (!source.text.trim()) continue
    const hit = tokens.find((token) => wordIn(source.text.toLowerCase(), token))
    if (!hit && tokens.length > 0) continue
    if (tokens.length === 0 && found.length > 0) continue
    found.push({
      source: source.source,
      label: source.label,
      quote: clip(source.text),
      url: source.url,
    })
    if (found.length >= limit) break
  }
  return found
}

function corpusOf(lead: Lead): string {
  const extraction: Extraction | undefined = lead.extraction
  return [
    lead.name,
    lead.country,
    lead.exa.summary,
    lead.exa.text,
    lead.exa.highlights.join(" "),
    extraction?.role,
    extraction?.summary,
    extraction?.headquarters,
    extraction?.country,
    extraction?.buys.join(" "),
    extraction?.sells.join(" "),
    extraction?.markets.join(" "),
    extraction?.certifications.join(" "),
    extraction?.buyerSignals.join(" "),
    lead.context?.fitNarrative,
    lead.context?.risks.join(" "),
    lead.context?.knownSuppliers.join(" "),
  ]
    .filter(Boolean)
    .join("\n")
}

function nextAction(
  band: Band,
  product: string,
  place: string,
  role: string
): string {
  const goods = product || "the core product"
  const where = place || "the target market"
  const who = role || "buyer"
  if (band === "best_fit") {
    return `Open with ${goods}. The evidence supports a ${who} in ${where}, so send a specific lot or program rather than a general catalogue.`
  }
  if (band === "strong") {
    return `Write a short note about ${goods} and ask who owns purchasing for ${where}. The public evidence supports the account and still needs a named buyer.`
  }
  if (band === "possible") {
    return `Ask one question before a full offer: do they buy ${goods} directly? The page is thin for an outreach sequence.`
  }
  if (band === "weak") {
    return `Keep them off the first wave. There is little public evidence they buy what this supplier exports.`
  }
  return "Leave this account off the outreach list."
}

function activityDimension(lead: Lead): DimensionScore {
  if (!lead.activity) {
    return {
      key: "activity",
      label: "Public activity",
      points: 0,
      max: 10,
      rationale: "Public activity has not been searched yet.",
      evidence: [],
    }
  }
  const recent = recentSignals(lead.activity)
  const kinds = new Set(recent.map((signal) => signal.kind))
  let points = 1
  if (kinds.has("news") || kinds.has("launch")) points += 5
  if (kinds.has("brand")) points += 3
  if (kinds.has("social")) points += 3
  if (kinds.size >= 2) points += 1
  if (recent.length === 0) points = 1
  return {
    key: "activity",
    label: "Public activity",
    points: Math.min(10, points),
    max: 10,
    rationale: activityLine(lead),
    evidence: recent.slice(0, 3).map((signal) => ({
      source: "exa" as const,
      label: activityKindLabel(signal.kind),
      quote: clip(signal.quote || signal.title),
      url: signal.url,
    })),
  }
}

export function scoreLead(brief: Brief, lead: Lead, competitors: Competitor[] = []): LeadScore {
  const extraction = lead.extraction?.ok ? lead.extraction : undefined
  const full = corpusOf(lead)
  const productTokens = significant(brief.products)
  const buyText = (extraction?.buys ?? []).join(" ")
  const otherText = [
    extraction?.sells.join(" "),
    extraction?.summary,
    extraction?.buyerSignals.join(" "),
    lead.exa.summary,
    lead.exa.highlights.join(" "),
    lead.exa.text,
  ]
    .filter(Boolean)
    .join(" ")

  const buyHits: string[] = []
  const otherHits: string[] = []
  for (const token of productTokens) {
    if (wordIn(buyText.toLowerCase(), token)) buyHits.push(token)
    else if (wordIn(otherText.toLowerCase(), token)) otherHits.push(token)
  }
  const productPoints = Math.min(25, buyHits.length * 6 + otherHits.length * 3)
  const productSources: QuoteSource[] = [
    {
      source: "firecrawl",
      label: "What they buy",
      text: buyText,
    },
    {
      source: "firecrawl",
      label: "Page summary",
      text: extraction?.summary ?? "",
    },
    {
      source: "exa",
      label: "Exa highlight",
      text: lead.exa.highlights.join(" "),
      url: lead.url,
    },
    {
      source: "exa",
      label: "Exa excerpt",
      text: lead.exa.text,
      url: lead.url,
    },
  ]
  const matched = [...buyHits, ...otherHits]
  const missed = productTokens.filter((token) => !matched.includes(token))
  const product: DimensionScore = {
    key: "product",
    label: "Product fit",
    points: productPoints,
    max: 25,
    rationale: matched.length
      ? `Matched ${matched.join(", ")} ${buyHits.length ? "in what they buy" : "on the page"}.${missed.length ? ` ${missed.slice(0, 3).join(", ")} did not appear.` : ""}`
      : "None of the supplier’s product language showed up in the evidence.",
    evidence: quotesFor(matched, productSources),
  }

  const roleBlob = [
    extraction?.role,
    extraction?.summary,
    extraction?.buyerSignals.join(" "),
    lead.context?.fitNarrative,
    lead.context?.risks.join(" "),
    lead.exa.summary,
  ]
    .filter(Boolean)
    .join(" ")
  const roleTable: { re: RegExp; label: string; points: number }[] = [
    { re: /\b(importer|imports|importing)\b/i, label: "importer", points: 20 },
    {
      re: /\b(distributor|wholesaler|distribution)\b/i,
      label: "distributor",
      points: 18,
    },
    { re: /\b(trader|trading)\b/i, label: "trader", points: 16 },
    { re: /\b(roaster|roastery)\b/i, label: "roaster", points: 12 },
    { re: /\b(retailer|supermarket)\b/i, label: "retailer", points: 8 },
    { re: /\b(exporter|producer|grower)\b/i, label: "producer", points: 4 },
  ]
  const primary = extraction?.role || roleBlob
  const found =
    roleTable.find((row) => row.re.test(primary)) ??
    roleTable.find((row) => row.re.test(roleBlob))
  let rolePoints = found?.points ?? 3
  const roleLabel = found?.label ?? "unclear role"
  const buyerTypes = brief.buyerTypes.toLowerCase()
  if (roleLabel === "roaster" && /roaster/.test(buyerTypes)) rolePoints = 18
  if (roleLabel === "retailer" && /retail/.test(buyerTypes)) rolePoints = 16
  const indirect =
    /\b(via|through) (an |the )?importers?\b/i.test(roleBlob) ||
    /\bnot the importer of record\b/i.test(roleBlob)
  if (indirect) rolePoints = Math.min(rolePoints, 10)
  const role: DimensionScore = {
    key: "role",
    label: "Buyer role",
    points: rolePoints,
    max: 20,
    rationale: found
      ? indirect
        ? `The page describes a ${roleLabel}, and the buying path runs through another importer.`
        : `The page describes a ${roleLabel}.`
      : "No importer, distributor, roaster, or producer role was stated.",
    evidence: [
      {
        source: extraction ? "firecrawl" : "exa",
        label: extraction ? "Extracted role" : "Exa summary",
        quote: clip(extraction?.role || lead.exa.summary || lead.exa.text || lead.name),
        url: lead.url,
      },
    ],
  }

  const structuredCountry = [
    extraction?.country,
    extraction?.headquarters,
    lead.country,
  ]
    .filter(Boolean)
    .join(" ")
  const marketsField = (extraction?.markets ?? []).join(" ")
  let geoPoints = 3
  let geoRationale = "No location was attached to this lead."
  let geoQuote = ""
  if (anyMarket(brief.markets, structuredCountry)) {
    geoPoints = 15
    geoRationale = `Based in ${clip(structuredCountry, 80)}, which is inside the target markets.`
    geoQuote = structuredCountry
  } else if (anyMarket(brief.markets, marketsField)) {
    geoPoints = 12
    geoRationale = `Sells into ${clip(marketsField, 80)}, overlapping the target markets.`
    geoQuote = marketsField
  } else if (anyMarket(brief.markets, full)) {
    geoPoints = 8
    geoRationale = "A target market is mentioned on the page, without a clear headquarters."
    geoQuote = lead.exa.highlights[0] || lead.exa.summary || lead.exa.text
  } else if (structuredCountry.trim()) {
    geoPoints = 2
    geoRationale = `Location reads as ${clip(structuredCountry, 80)}, outside the target markets.`
    geoQuote = structuredCountry
  }
  const geography: DimensionScore = {
    key: "geography",
    label: "Geography",
    points: geoPoints,
    max: 15,
    rationale: geoRationale,
    evidence: geoQuote
      ? [
          {
            source: extraction ? "firecrawl" : "exa",
            label: "Location",
            quote: clip(geoQuote),
            url: lead.url,
          },
        ]
      : [],
  }

  const requirementPhrases = splitList(brief.mustHaves)
  let requirementHits = 0
  const requirementEvidence: Evidence[] = []
  for (const phrase of requirementPhrases) {
    const tokens = significant(phrase)
    if (tokens.length === 0) continue
    const hits = tokens.filter((token) => wordIn(full.toLowerCase(), token))
    if (hits.length / tokens.length >= 0.5) {
      requirementHits += 1
      const sourceText =
        extraction?.summary ||
        extraction?.buyerSignals[0] ||
        lead.exa.summary ||
        lead.exa.text
      requirementEvidence.push({
        source: extraction ? "firecrawl" : "exa",
        label: phrase,
        quote: clip(sourceText || phrase),
        url: lead.url,
      })
    }
  }
  const requirementPoints = requirementPhrases.length
    ? Math.round((10 * requirementHits) / requirementPhrases.length)
    : 6
  const requirements: DimensionScore = {
    key: "requirements",
    label: "Must-haves",
    points: requirementPoints,
    max: 10,
    rationale: requirementPhrases.length
      ? `Meets ${requirementHits} of ${requirementPhrases.length} must-haves.`
      : "No must-haves were set, so this check stays neutral.",
    evidence: requirementEvidence.slice(0, 2),
  }

  const supplierCerts = splitList(brief.certifications).map((item) =>
    item.toLowerCase()
  )
  const leadCerts = (extraction?.certifications ?? []).map((item) =>
    item.toLowerCase()
  )
  const overlap = supplierCerts.filter(
    (cert) =>
      cert.length > 2 &&
      leadCerts.some((leadCert) => leadCert.includes(cert) || cert.includes(leadCert))
  )
  let commercialPoints = Math.min(6, overlap.length * 3)
  commercialPoints += Math.min(2, extraction?.buyerSignals.length ?? 0)
  if (/\b(private label|annual contract|container|tender)\b/i.test(full)) {
    commercialPoints += 2
  }
  if (hasCommercialBuyFacts(lead)) commercialPoints += 3
  else if (recentCommerce(lead).length) commercialPoints += 1
  commercialPoints = Math.min(10, commercialPoints)
  const commercialHits = recentCommerce(lead)
  const commercial: DimensionScore = {
    key: "commercial",
    label: "Commercial readiness",
    points: commercialPoints,
    max: 10,
    rationale: [
      overlap.length
        ? `Shares ${overlap.join(", ")}.`
        : "No shared certification was published.",
      extraction?.buyerSignals.length
        ? `${extraction.buyerSignals.length} buying ${extraction.buyerSignals.length === 1 ? "quote" : "quotes"} on the page.`
        : "No buying quote was extracted.",
      lead.commerce ? commerceLine(lead) : "",
    ]
      .filter(Boolean)
      .join(" "),
    evidence: [
      ...overlap.slice(0, 2).map((cert) => ({
        source: "firecrawl" as const,
        label: "Certification",
        quote: cert,
      })),
      ...(extraction?.buyerSignals.slice(0, 1).map((signal) => ({
        source: "firecrawl" as const,
        label: "Buying quote",
        quote: clip(signal),
      })) ?? []),
      ...commercialHits.slice(0, 2).map((signal) => ({
        source: "exa" as const,
        label: signal.kind,
        quote: clip(signal.quote || signal.title),
        url: signal.url,
      })),
    ],
  }

  const research = lead.context
  const researchBlob = [
    research?.fitNarrative,
    research?.risks.join(" "),
    research?.knownSuppliers.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
  let competitivePoints = 4
  let competitiveRationale = "Parallel has not attached market context for this lead."
  if (research) {
    const openBook =
      /seeking suppliers|open to|new origin|multiple (suppliers|exporters)|not exclusive|whitespace|shortlist|adding origins/i.test(
        researchBlob
      )
    const locked =
      /\bexclusive\b|sole supplier|closed account|do not pursue|do not contact/i.test(researchBlob)
    if (openBook) {
      competitivePoints = 10
      competitiveRationale = "The research note describes an open buying book."
    } else if (locked) {
      competitivePoints = 2
      competitiveRationale = "The research note describes a closed or exclusive supply relationship."
    } else if ((research.knownSuppliers ?? []).length > 0) {
      competitivePoints = 6
      competitiveRationale = "Current suppliers are named, without an exclusive lock."
    } else {
      competitivePoints = 7
      competitiveRationale = "Research is attached and does not describe an exclusive lock."
    }
  }
  const competitive: DimensionScore = {
    key: "competitive",
    label: "Competitive opening",
    points: competitivePoints,
    max: 10,
    rationale: competitiveRationale,
    evidence: research?.fitNarrative
      ? [
          {
            source: "parallel",
            label: "Fit note",
            quote: clip(research.fitNarrative, 220),
            url: research.citations.find((item) => /^https?:\/\//i.test(item)),
          },
        ]
      : [],
  }

  let evidencePoints = 0
  const evidenceBits: string[] = []
  if (lead.exa.text.length > 180) {
    evidencePoints += 3
    evidenceBits.push("Exa excerpt")
  }
  if (lead.exa.highlights.length > 0) {
    evidencePoints += 1
    evidenceBits.push("highlights")
  }
  if (lead.exa.summary.length > 40) {
    evidencePoints += 1
    evidenceBits.push("summary")
  }
  if (extraction) {
    evidencePoints += 3
    evidenceBits.push("Firecrawl profile")
  }
  if ((research?.citations.length ?? 0) > 0) {
    evidencePoints += 2
    evidenceBits.push("Parallel citations")
  }
  evidencePoints = Math.min(10, evidencePoints)
  const evidence: DimensionScore = {
    key: "evidence",
    label: "Evidence quality",
    points: evidencePoints,
    max: 10,
    rationale: evidenceBits.length
      ? `Attached: ${evidenceBits.join(", ")}.`
      : "The lead has almost no source text.",
    evidence: lead.url
      ? [
          {
            source: "exa",
            label: "Source page",
            quote: clip(lead.exa.summary || lead.exa.text || lead.url),
            url: lead.url,
          },
        ]
      : [],
  }

  const activity = activityDimension(lead)
  const fit = computeFitProbability(brief, lead, competitors)
  const similar = anchorSimilarity(brief, lead, full)
  const anchor: DimensionScore = {
    key: "anchor",
    label: "Anchor similarity",
    points: similar.points,
    max: similar.max,
    rationale: similar.rationale,
    evidence: similar.evidence,
  }
  const buying: DimensionScore = {
    key: "buying",
    label: "Buying facts",
    points: fit.facts.some((fact) => fact.found) ? Math.round((fit.index / 100) * 15) : 0,
    max: 15,
    rationale: fit.note,
    evidence: fit.facts
      .filter((fact) => fact.found)
      .slice(0, 3)
      .map((fact) => ({
        source: "rule" as const,
        label: fact.kind,
        quote: clip(fact.quote),
        url: fact.url,
      })),
  }
  const dimensions = [
    product,
    role,
    geography,
    requirements,
    commercial,
    competitive,
    evidence,
    activity,
    buying,
    ...(anchor.max > 0 ? [anchor] : []),
  ]
  const total = dimensions.reduce((sum, item) => sum + item.points, 0)
  let band = bandFor(total)
  let disqualified = false
  let disqualifyReason: string | undefined

  if (brief.website && (sameSite(brief.website, lead.url) || sameSite(brief.website, lead.domain))) {
    disqualified = true
    disqualifyReason = "This is the supplier’s own site."
  } else {
    const excluded = exclusionHit(
      brief.exclusions,
      [lead.name, extraction?.summary, extraction?.role, extraction?.sells.join(" "), lead.exa.summary, lead.exa.text]
        .filter(Boolean)
        .join("\n")
    )
    if (excluded) {
      disqualified = true
      disqualifyReason = `Matches the exclusion “${excluded}”.`
    } else if (peerSupplier(brief, lead)) {
      disqualified = true
      disqualifyReason = `Peer exporter in ${brief.originCountry}. Treat this account as a competitor.`
    }
  }

  if (disqualified) band = "disqualified"
  else if (lead.activity && !hasRecentActivity(lead) && (band === "best_fit" || band === "strong")) {
    band = "possible"
  } else if (fit.level === "low" && (band === "best_fit" || band === "strong")) {
    band = "possible"
  }
  const place =
    splitList(brief.markets).find((market) => placeMatch(market, full)) ||
    splitList(brief.markets)[0] ||
    ""
  const headline = disqualified
    ? `Disqualified. ${disqualifyReason}`
    : lead.activity && !hasRecentActivity(lead) && band === "possible"
      ? `Possible · No recent public activity. ${product.rationale}`
      : `${band === "best_fit" ? "Best fit" : band === "strong" ? "Strong" : band === "possible" ? "Possible" : band === "weak" ? "Weak" : "Disqualified"} · ${product.rationale}`

  return {
    total,
    band,
    headline,
    nextAction: disqualified
      ? `Leave this account off the outreach list. ${disqualifyReason}`
      : lead.activity && !hasRecentActivity(lead)
        ? `Do not treat this as a confirmed best fit. No news, launch, new brand, or social activity was found in the last 24 months. Ask one question before a full offer.`
        : fit.level === "low"
          ? `Do not treat this as a confirmed best fit. Last purchase, stock, and sales were not published. Companies without those facts almost never answer outreach.`
          : nextAction(band, matched.slice(0, 3).join(", "), place, roleLabel),
    disqualified,
    disqualifyReason,
    dimensions,
  }
}

function bestTotal(lead: Lead): number {
  const scores = [lead.score, lead.alsoScore].filter(
    (score): score is NonNullable<Lead["score"]> => Boolean(score) && !score?.disqualified
  )
  if (scores.length === 0) return lead.score?.disqualified ? -1 : (lead.score?.total ?? 0)
  return Math.max(...scores.map((score) => score.total))
}

function fullyOut(lead: Lead): boolean {
  const scores = [lead.score, lead.alsoScore].filter(Boolean)
  return scores.length > 0 && scores.every((score) => score?.disqualified)
}

export function compareLeads(a: Lead, b: Lead): number {
  const aOut = fullyOut(a) ? 1 : 0
  const bOut = fullyOut(b) ? 1 : 0
  if (aOut !== bOut) return aOut - bOut
  const byScore = bestTotal(b) - bestTotal(a)
  if (byScore !== 0) return byScore
  return a.name.localeCompare(b.name)
}
