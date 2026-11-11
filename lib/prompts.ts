import { activityLine } from "./activity"
import {
  anchorPromptMarkdown,
  briefUsesAnchorDistributors,
  firecrawlAnchorLine,
} from "./anchors"
import { ragLine } from "./rag"
import type { Brief, Lead } from "./types"
import { clip, splitList } from "./text"

export const LEADS_PER_COUNTRY = 10

type PromptKind = "buyers" | "prompt" | "competitors"

export function targetCountries(brief: Brief): string[] {
  return splitList(brief.markets)
}

/** Normalize the active search mode. */
function searchKind(brief: Brief): string {
  return String(brief.searchKind ?? "").trim().toLowerCase()
}

/** Free text is never silently stripped or merged into structured ICP fields. */
function extra(brief: Brief): string {
  const note = brief.instructions?.trim()
  return note ? `Additional user instructions (must not override structured ICP or exclusions): ${note}` : ""
}

function instructionsFor(brief: Brief): string {
  return isPromptOnly(brief) ? brief.instructions?.trim() || "" : extra(brief)
}

/** Compact rules for discovery/enrichment. The full legacy rule remains for due diligence. */
function discoveryEvidenceRule(): string {
  return [
    "Use attributable public evidence; never invent facts or fill unknowns by assumption.",
    "For each material finding retain the candidate company, publication date (or undated), exact URL, a short excerpt, and reliability: high for primary/official evidence, medium for credible corroboration, low for weak or unverified indications.",
    "Separate: (1) customs/shipment movement, (2) purchases and stock/restock, (3) sales, brand performance and channel growth, (4) competitor and portfolio moves, and (5) indirect activity such as fairs, hiring and social media.",
    "A shipment is not automatically a purchase from the named supplier; resale is not proof of direct import; a brand mention is not proof of official distribution or buying intent.",
    "A RAG neighbor or another company is never evidence about this candidate. Missing information is unknown, not a negative fact.",
  ].join(" ")
}

/** Full evidence rule retained for the existing due-diligence flow. */
export function evidenceRule(): string {
  return [
    "EVIDENCE RULE (mandatory): Never invent or turn an inference into a fact.",
    "Use published evidence from the candidate's own pages, cited URLs, page extracts, and explicitly supplied research material.",
    "Identify the source of each material claim. Prefer the company's official website for identity, products, brands, channels, and contact details.",
    "If a contact, import, purchase, sales volume, stock level, exclusivity, employee count, or intention to buy is not published, mark it unpublished or leave it empty.",
    "Do not fill gaps from training memory, typical distributors, similar companies, similar countries, or assumptions about what a company would normally do.",
    "Absence of public information is not proof that the activity does not exist.",
    "A company selling a product does not prove that it imports that product directly.",
    "A company mentioning a brand does not prove that it is the brand's official distributor.",
    "A trade shipment record does not prove that the company purchased a particular supplier's brand.",
    "Separate facts, indications, and interpretations.",
    "RAG similarity and system-generated scores are reference signals only. They are not company-specific proof of purchases, imports, contacts, brands, or commercial intent.",
    "A RAG neighbor is a different company. Never copy its contacts, brands, purchases, or commercial facts onto the candidate.",
  ].join(" ")
}

/** The user supplied one free-text brief and left all structured buyer fields empty. */
export function isPromptOnly(brief: Brief): boolean {
  const prompt = brief.instructions?.trim()
  if (!prompt) return false
  return ![
    brief.products,
    brief.buyerTypes,
    brief.mustHaves,
    brief.exclusions,
    brief.differentiators,
    brief.certifications,
  ].some((value) => Boolean(value?.trim()))
}

function promptSearch(brief: Brief, country: string): string {
  return [
    brief.instructions?.trim() ?? "",
    `Search only for companies with commercial operations in ${country}; verify the country from reliable public evidence.`,
    `Identify each company's actual commercial role. Do not infer importer or distributor status from sector membership alone.`,
    `Find potential buyers for ${brief.supplierName} from ${brief.originCountry}; exclude the supplier itself and unrelated suppliers.`,
    "Return fewer results rather than broadening the buyer profile to fill the list.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function competitorMarketRule(brief: Brief, countries: string[]): string {
  const markets = countries.length ? countries.join(", ") : "the search countries"
  const origin = brief.originCountry.trim() || "the supplier origin country"
  return [
    `Competitors must already sell the relevant category in ${markets}.`,
    `Do not list factories, exporters, or brands that only sell in ${origin}.`,
    "Country means the search market where the company sells, not its headquarters.",
    `A brand from ${origin} belongs on the list only when a source shows it selling in a search country.`,
    "Do not infer local distribution from global presence alone.",
  ].join(" ")
}

export function competitorQuery(brief: Brief): string {
  const countries = targetCountries(brief)
  const count = brief.countryCount && brief.countryCount > 0 ? brief.countryCount : 5
  const named = brief.markets.trim()
  const skip = brief.excludedMarkets?.trim()

  return [
    instructionsFor(brief) || `Find distributors of ${brief.supplierName}.`,
    named ? `Only these countries: ${named}.` : `Cover ${count} countries.`,
    skip ? `Exclude these countries: ${skip}.` : "",
    `Identify the local distributor of ${brief.supplierName} and distributors of directly competing brands in each target country.`,
    competitorMarketRule(brief, countries),
    "Require country-specific evidence of distribution or import activity; a brand mention or isolated product listing is insufficient.",
    "Do not label an ordinary retailer, salon, manufacturer, or logistics provider as a distributor without evidence. Do not list a brand's headquarters as its local distributor.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function competitorSystemPrompt(): string {
  return [
    discoveryEvidenceRule(),
    "Discover and verify local distribution; do not score companies.",
    "Return real companies and official URLs. Require country-specific evidence for the named brand or direct rival brands.",
    "A brand mention or product listing alone does not establish official distribution. Exclude unrelated roles and excluded countries.",
    "Never invent contacts, brands, or distribution relationships.",
  ].join(" ")
}

export function buyerTypes(brief: Brief): string[] {
  return splitList(brief.buyerTypes)
}

function exaBuyerSignalAsk(brief?: Brief): string {
  return [
    "Return concise buyerSignals tied to published evidence of actual role, relevant products, brands, wholesale/distribution channels, and customer type.",
    "When found during discovery, note dated purchase/import/restock evidence, measured sales or brand performance, channel expansion, competitor/portfolio moves, or openness to new suppliers; do not stretch weak signals into facts.",
    brief?.anchorUse ? firecrawlAnchorLine(brief) : "",
  ]
    .filter(Boolean)
    .join(" ")
}

export function exaQuery(brief: Brief, country: string, buyerType?: string): string {
  if (isPromptOnly(brief)) return promptSearch(brief, country)

  const type = buyerType?.trim() || brief.buyerTypes.trim() || "importer, distributor, or wholesaler"
  return [
    `Find potential ${type} companies with verifiable commercial operations in ${country} and source-backed activity in this product category: ${brief.products}.`,
    "ENTRY RULE: verify the company's identity and at least one specific, attributable source showing it sells, distributes, wholesales, imports, or otherwise operates in the relevant product category. The commercial role may be provisional and investigated later; do not reject a category-relevant company only because its importer/distributor status is not yet proven.",
    "Keep this search restricted to the requested buyer profile. Do not mix other buyer profiles to fill the result count.",
    `Potential buyers for ${brief.supplierName} from ${brief.originCountry}; exclude the supplier itself and unrelated suppliers.`,
    brief.mustHaves ? `Use these as prioritization criteria, not automatic discovery gates unless they are explicit hard requirements: ${brief.mustHaves}.` : "",
    brief.exclusions ? `Exclude: ${brief.exclusions}.` : "",
    brief.differentiators
      ? `Use these supplier differentiators for category relevance only, not as buyer requirements or proof of buying intent: ${brief.differentiators}.`
      : "",
    "Return the source URL and a short exact excerpt supporting category activity for every candidate. State the commercial role as confirmed, indicated, or unknown; role uncertainty alone is not a rejection.",
    "Verify that the company actually operates commercially in the requested country; headquarters alone is insufficient.",
    "Do not require public import records for discovery; a relevant local wholesaler or distributor may still qualify.",
    "A fair, social post, hiring notice, or brand mention alone is not purchase intent.",
    exaBuyerSignalAsk(brief),
    extra(brief),
  ]
    .filter(Boolean)
    .join(" ")
}

export function exaBackupQuery(brief: Brief, country: string, buyerType?: string): string {
  if (isPromptOnly(brief)) {
    return [
      brief.instructions?.trim() ?? "",
      `Complementary search only: find additional companies with commercial operations in ${country}.`,
      "Keep the exact same ICP and category. Search alternative local-language terms, trade directories, brand/distributor pages, wholesale catalogues and industry associations. Exclude every company/domain already returned.",
      "Require identity and source-backed evidence of relevant category activity. Role may remain unconfirmed for later investigation. Return fewer rather than broadening the ICP.",
    ].filter(Boolean).join(" ")
  }
  const type = buyerType?.trim() || brief.buyerTypes.trim() || "importer, distributor, or wholesaler"
  return [
    `Complementary discovery: find additional ${type} companies operating commercially in ${country}.`,
    `Same category and ICP only: ${brief.products}. Do not substitute another buyer type or broaden to general cosmetics companies.`,
    "Search alternative local-language terms, trade directories, brand/distributor pages, wholesale catalogues and industry associations. Exclude all previously returned company identities and domains.",
    "Require company identity and a specific source URL plus excerpt showing activity in the relevant product category. The exact importer/distributor role may be investigated later and is not an entry gate.",
    brief.exclusions ? `Exclude: ${brief.exclusions}.` : "",
    "Do not require public import records. Do not use a fair, social post, hiring notice or brand mention alone as category evidence.",
    extra(brief),
  ].filter(Boolean).join(" ")
}


function firecrawlContactAsk(): string {
  return [
    "PHASE 2 — COMPANY ENRICHMENT. Research only the candidate supplied by Phase 1; do not discover a new list.",
    "Review the official site first: about, products, brands, distribution/wholesale, contact, team, and relevant country pages. Open only pages relevant to the candidate's identity, portfolio, channels, contacts, and recent commercial activity.",
    "Extract role, products bought versus sold, portfolio brands, customer channels, distribution/import evidence, training capability, and published business contacts.",
    "For each material finding record candidate company, evidence category, date (or undated), exact source URL, short excerpt, and reliability: high (official/primary), medium (credible corroboration), low (weak/unverified indication). Keep the five evidence groups separate: customs/shipments; purchases/stock; sales/brand performance/channel growth; competitor/portfolio moves; indirect activity.",
    "Never guess names, emails, WhatsApp numbers, phone numbers, job titles, sales, stock, imports, or purchase intent. Leave unpublished fields empty.",
  ].join(" ")
}

export function firecrawlPrompt(
  brief: Brief,
  country: string,
  buyerType?: string,
): string {
  const common = [discoveryEvidenceRule(), firecrawlContactAsk()]

  if (searchKind(brief) === "competitors") {
    return [
      ...common,
      `Brand: ${brief.supplierName} (${brief.originCountry}).`,
      country ? `Candidate was retrieved in ${country}.` : `Target markets: ${brief.markets}.`,
      buyerType ? `Initial role label: ${buyerType}. Verify it.` : "",
      "Confirm whether the company distributes the named brand or a rival in the searched country. Cite the page establishing the relationship and country; a mention or isolated listing is insufficient.",
      instructionsFor(brief),
    ]
      .filter(Boolean)
      .join("\n")
  }

  if (isPromptOnly(brief)) {
    return [
      ...common,
      `Supplier: ${brief.supplierName} (${brief.originCountry}).`,
      country ? `Candidate market: ${country}.` : `Target markets: ${brief.markets}.`,
      "Identify actual role, products, brands and channels; assess only against this user-written brief:",
      brief.instructions?.trim() ?? "",
      "Do not add buyer requirements not stated in the brief. Treat supplier certifications as supplier credentials unless explicitly identified as buyer requirements.",
    ].join("\n")
  }

  const type = buyerType?.trim()
  return [
    ...common,
    `Supplier: ${brief.supplierName} (${brief.originCountry}); relevant products: ${brief.products}.`,
    country ? `Candidate market: ${country}.` : `Target markets: ${brief.markets}.`,
    type ? `Initial buyer-type label: ${type}. Verify from actual activities.` : "",
    brief.buyerTypes ? `Allowed buyer types: ${brief.buyerTypes}.` : "",
    brief.mustHaves ? `Check these buyer requirements when published: ${brief.mustHaves}.` : "",
    brief.exclusions ? `Flag or exclude these conflicts: ${brief.exclusions}.` : "",
    brief.certifications
      ? `Supplier certifications/credentials (context only, not buyer requirements): ${brief.certifications}.`
      : "",
    brief.differentiators
      ? `Supplier differentiators (category relevance only): ${brief.differentiators}.`
      : "",
    "Report role, products bought versus sold, portfolio brands, customer channels, and distribution/import evidence separately.",
    "Do not infer direct importing from resale of imported goods or official distribution from a list of brands. Missing import or purchase data is unknown, not a rejection.",
    extra(brief),
  ]
    .filter(Boolean)
    .join(" ")
}

/** Discovery must run one supplier/ICP at a time to prevent cross-contamination. */
export function searchBrief(brief: Brief, _also?: Brief): Brief {
  return brief
}

export function exaSystemPrompt(brief?: Brief): string {
  return [
    discoveryEvidenceRule(),
    "PHASE 1 — COMPANY DISCOVERY. Find candidates; do not score purchase probability.",
    `Return up to ${LEADS_PER_COUNTRY} companies for this country AND this single buyer profile. The limit applies independently to each profile, not to the country total. Return fewer rather than filling the list with weak matches.`,
    "ENTRY GATE: identifiable real company + evidence of commercial operations in the requested country + at least one source-backed example of activity in the relevant product category. Do not require proof of importer/distributor status at discovery; label the role confirmed, indicated or unknown for later investigation.",
    "For each candidate return categoryEvidence and countryEvidence, each with exact source URL and a short excerpt. categoryEvidence must identify the relevant product/category; countryEvidence must support commercial operations in the requested market. Reject candidates whose only support is a generic social profile, fair attendance, hiring notice, isolated brand mention or unsupported assertion.",
    "Return the searched profile separately from the company's reported commercial role. Set roleStatus=confirmed only when roleEvidence contains a source URL and excerpt proving that role; otherwise use indicated or unknown. Never copy the searched buyer profile into the factual role field.",
    "Avoid duplicates across buyer profiles and countries. Do not invent contacts, imports, purchases or buying intent.",
    "Do not require public import records when role and category fit are otherwise supported. Do not include the supplier itself or substitute unrelated buyer types.",
    brief?.anchorUse ? firecrawlAnchorLine(brief) : "",
  ]
    .filter(Boolean)
    .join(" ")
}

function promptKind(brief: Brief, also?: Brief): PromptKind {
  const kind = searchKind(brief)
  if (kind === "competitors" && !also) return "competitors"
  if (isPromptOnly(brief) && !also) return "prompt"
  return "buyers"
}

function suppliersLabel(brief: Brief, also?: Brief): string {
  return also ? `${brief.supplierName} and ${also.supplierName}` : brief.supplierName
}

function openaiEvidenceSection(brief: Brief, also?: Brief): string {
  const sites = [brief.website, also?.website].filter(Boolean)
  return [
    "### EVIDENCE RULES",
    "Use only supplied candidate cards and cited excerpts; do not browse or invent facts. Missing evidence is unknown, not negative.",
    "For each material fact, identify the candidate, date (or undated), exact source URL and reliability. Keep separate: customs/shipments; purchases/stock; sales/brand performance/channel growth; competitor/portfolio moves; indirect activity.",
    "A shipment does not prove purchase from the supplier; resale does not prove direct import; a brand mention does not prove official distribution. RAG similarity and system scores are context only, never proof.",
    "Never transfer information from another company or a RAG neighbor.",
    sites.length ? `The supplier's own website is not a buyer: ${sites.join(" or ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function openaiScopeSection(
  brief: Brief,
  also: Brief | undefined,
  kind: PromptKind,
): string {
  const markets = targetCountries(brief).join(", ") || brief.markets || "unpublished"
  const lines = [
    "### SCOPE",
    `Supplier(s): ${suppliersLabel(brief, also)}; origin: ${brief.originCountry || "unpublished"}.`,
    `Markets: ${markets}.`,
  ]

  if (kind === "competitors") {
    lines.push(
      `Map local distribution of ${brief.supplierName} and direct rival brands; require evidence in the searched country.`,
      brief.excludedMarkets ? `Exclude: ${brief.excludedMarkets}.` : "",
    )
  } else if (kind === "prompt") {
    lines.push(
      "Evaluate only against this complete user-written brief:",
      brief.instructions?.trim() ?? "",
      "Treat supplier certifications as supplier credentials, not buyer requirements, unless the brief explicitly says the buyer must hold them.",
    )
  } else {
    lines.push(
      `Products/categories: ${brief.products || "unpublished"}.`,
      `Allowed buyer types: ${brief.buyerTypes || "unpublished"}.`,
      `Buyer requirements: ${brief.mustHaves || "none stated"}.`,
      `Exclusions: ${brief.exclusions || "none stated"}.`,
      brief.certifications
        ? `Supplier credentials (context only, not buyer requirements): ${brief.certifications}.`
        : "",
      "Assess channel and product fit without requiring published import history. Distinguish products bought from products sold.",
    )
    if (also) {
      lines.push(
        `Second supplier: ${also.supplierName}; products: ${also.products || "unpublished"}; buyer types: ${also.buyerTypes || "unpublished"}; requirements: ${also.mustHaves || "none stated"}; exclusions: ${also.exclusions || "none stated"}.`,
        "Assess each supplier independently.",
      )
    }
    lines.push(
      "Extract metadata only when explicitly published. Do not infer missing fields or fill them with placeholder facts; leave unavailable values empty and state material gaps in qualification_needed. Put decisive evidence and source URLs in rationale. Keep the five evidence groups separate and do not add JSON fields.",
    )
  }

  const customInstructions = [instructionsFor(brief), also ? instructionsFor(also) : ""]
    .filter(Boolean)
    .join("\n")
  if (customInstructions && kind !== "prompt") {
    lines.push("Additional user instructions:", customInstructions)
  }

  return lines.filter(Boolean).join("\n")
}

function openaiScoringSection(kind: PromptKind): string {
  if (kind === "competitors") {
    return [
      "### CLASSIFICATION",
      "Set icp from verified local distribution role and category fit. best_fit must be the named brand, 'direct competitor', 'neither' or 'unknown'. Do not use missing purchase/stock/sales data as a reason for neither. purchase_probability is qualitative, not statistical.",
    ].join("\n")
  }

  return [
    "### CLASSIFICATION",
    "ICP: high = strong buyer-role, product/category and channel alignment; medium = partial or not fully verified; low = evidence of material mismatch. Missing data alone is not low.",
    "supplier_fits: assess each supplier separately against its products, category, buyer types, channels, requirements and exclusions. Purchase history is not required to establish compatibility.",
    "best_fit: choose the supplier with the stronger supported product/channel fit; use 'both' when both fit, 'neither' only for demonstrated mismatch, and 'unknown' only when product/channel evidence is insufficient. Do not use unknown or neither merely because purchase data is unpublished.",
    "purchase_probability: qualitative active-opportunity tier, not a statistical forecast. High requires direct recent buyer action (price/catalog/sample request, meeting, negotiation or explicit brand-addition discussion). Medium means a compatible buyer with credible commercial signals but no direct buying action. Low requires evidence of material mismatch; missing purchase data alone is not low.",
    "Keep ICP, supplier compatibility and active buying intent separate. A high fit does not mean the company intends to buy.",
    "Use rationale for concise candidate-specific evidence and URLs. Use qualification_needed for facts still to confirm; do not turn unknowns into negatives.",
  ].join("\n")
}

export function openaiInstructions(brief: Brief, also?: Brief): string {
  const kind = promptKind(brief, also)
  const role =
    kind === "competitors"
      ? `You are a B2B distribution verification analyst mapping local distributors of ${brief.supplierName}. Evaluate only supplied candidates; do not invent companies or browse.`
      : `You are a B2B export lead qualification analyst evaluating candidates for ${suppliersLabel(brief, also)} from ${brief.originCountry}. Assess buyer identity, channel fit, supplier fit and active-opportunity evidence; do not browse.`

  const markets = targetCountries(brief).join(", ") || brief.markets || "the searched country"
  const schema =
    '{ "leads": [{ "company": "", "icp": "high|medium|low", "rationale": "", "supplier_fits": [{ "supplier": "supplier name", "level": "high|medium|low" }], "best_fit": "supplier name|both|neither|unknown", "qualification_needed": "" }], "purchase_probability": "high|medium|low", "purchase_probability_note": "", "entry_strategy": "" }'

  return [
    "# PHASE 4 — OPENAI LEAD QUALIFICATION",
    role,
    `Markets: ${markets}. Evaluate only the supplied candidate cards.`,
    openaiEvidenceSection(brief, also),
    openaiScopeSection(brief, also, kind),
    briefUsesAnchorDistributors(brief) ? anchorPromptMarkdown(markets) : "",
    openaiScoringSection(kind),
    "### OUTPUT",
    "Return valid JSON only. Preserve exact fields: leads, purchase_probability, purchase_probability_note, entry_strategy. Each lead must contain company, icp, rationale, supplier_fits, best_fit and qualification_needed. Do not add fields.",
    "```json",
    schema,
    "```",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function parallelEvidenceSection(brief: Brief, also?: Brief): string {
  const sites = [brief.website, also?.website].filter(Boolean)
  return [
    "### INDEPENDENT VALIDATION",
    "Use current public sources to verify supplied candidates; do not repeat broad discovery.",
    "Start with the preliminary card and focus on the delta: material gaps, contradictions and new evidence. Change an existing classification only when published evidence directly contradicts a material claim or supports a demonstrably different conclusion. Absence of evidence alone is not grounds to change or downgrade it.",
    "For each material finding record candidate, date (or undated), exact URL, excerpt and reliability. Separate customs/shipments; purchases/stock; sales/brand performance/channel growth; competitor/portfolio moves; indirect activity.",
    "A shipment does not prove purchase from the supplier; resale does not prove direct import; a brand mention does not prove official distribution. Social activity, hiring and fairs are indirect signals, not purchase intent. Do not transfer facts between companies or from RAG neighbors.",
    sites.length ? `Supplier website is not a buyer: ${sites.join(" or ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function parallelScoringSection(kind: PromptKind): string {
  if (kind === "competitors") {
    return [
      "### VALIDATION",
      "Set icp from verified local distribution role and category evidence. best_fit is the named brand, 'direct competitor', 'neither' or 'unknown'. Missing purchase/stock/sales data is not grounds for neither. purchase_probability is qualitative, not statistical.",
    ].join("\n")
  }

  return [
    "### VALIDATION",
    "ICP measures buyer-role, product/category and channel fit, not purchase intent. Missing information alone is not low.",
    "Assess each supplier separately. best_fit reflects comparative product and channel compatibility, not recent purchase evidence. Use a supplier name when supported, 'both' when both fit, 'neither' only for demonstrated mismatch, and 'unknown' only when product/channel evidence is insufficient.",
    "purchase_probability is a qualitative active-opportunity tier, not a statistical forecast. High requires direct recent buyer action; medium means supported product/channel fit with relevant published commercial activity but no direct action; low requires material mismatch. Missing public buying data alone is not low.",
    "Focus on the delta from OpenAI's preliminary card. Change ratings only with evidence; cite exact URLs and dates. Return concise confirmed facts, contradictions, unknowns and qualification gaps.",
  ].join("\n")
}

export function parallelInstructions(brief: Brief, also?: Brief): string {
  const kind = promptKind(brief, also)
  const markets = targetCountries(brief).join(", ") || brief.markets || "unpublished"
  const role =
    kind === "competitors"
      ? `You are an independent B2B distribution verification analyst checking local distribution of ${brief.supplierName} and direct rivals.`
      : `You are an independent B2B lead verification analyst reviewing candidates for ${suppliersLabel(brief, also)} from ${brief.originCountry}. Verify and stress-test preliminary classifications; do not repeat discovery.`

  return [
    "# PHASE 5 — PARALLEL INDEPENDENT VALIDATION",
    role,
    `Markets: ${markets}. Research only the supplied candidates in these markets.`,
    parallelEvidenceSection(brief, also),
    openaiScopeSection(brief, also, kind),
    briefUsesAnchorDistributors(brief) ? anchorPromptMarkdown(markets) : "",
    parallelScoringSection(kind),
    "### WORKFLOW",
    "1. Start with the preliminary card; identify supported claims, unknowns and possible contradictions.",
    "2. Research only material gaps. Prioritize the five evidence groups, especially recent purchases/imports, stock/restock, measured sales/brand performance, channel expansion and competitor/portfolio moves.",
    "3. Verify identity, role, product/category fit and channels. Separate direct evidence from indirect indications.",
    "4. Change preliminary classifications only when evidence supports the change. Do not downgrade because a source is silent.",
    "5. Return concise corrections, source URLs, dates, reliability and qualification steps. Do not create a new candidate list or broad market report.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function researchPrompt(brief: Brief, leads: Lead[], also?: Brief): string {
  const suppliers = suppliersLabel(brief, also)
  const instructions = parallelInstructions(brief, also)
  const header = `${instructions}\n\n### CANDIDATE EVIDENCE\n`
  const maxLength = 20000
  const room = Math.max(0, maxLength - header.length)

  const cards = leads.map((lead, index) => {
    const extraction = lead.extraction
    const activity = (lead.activity?.signals ?? []).slice(0, 3).map((signal) =>
      `activity=${signal.kind}; date=${signal.publishedAt || "undated"}; url=${signal.url}; excerpt=${clip(signal.quote || signal.title, 120)}`,
    )
    const commerce = (lead.commerce?.signals ?? []).slice(0, 4).map((signal) =>
      `commerce=${signal.kind}; source=${signal.source || "exa"}; date=${signal.publishedAt || "undated"}; url=${signal.url}; excerpt=${clip(signal.quote || signal.title, 130)}`,
    )

    return [
      `<candidate index="${index + 1}">`,
      `company=${lead.name}; searched_market=${lead.market || lead.country || "unpublished"}; official_url=${lead.url}`,
      `country=${extraction?.country || lead.country || "unpublished"}; role=${extraction?.role || lead.buyerRoleReported || "unpublished"}; discovery_profile=${lead.discoveryProfile || "unpublished"}; role_status=${lead.buyerRoleStatus || "unknown"}; confirmed_buyer_type=${lead.buyerType || "unpublished"}`,
      "Note: official_url identifies the candidate site; it is not automatically the source for every extracted claim. Verify claim-specific dates and URLs before relying on them.",
      extraction?.buys?.length ? `products_bought=${extraction.buys.slice(0, 4).join("; ")}` : "products_bought=unpublished",
      extraction?.sells?.length ? `products_sold=${extraction.sells.slice(0, 4).join("; ")}` : "products_sold=unpublished",
      extraction?.lastPurchase ? `last_purchase=${clip(extraction.lastPurchase, 180)}` : "last_purchase=unpublished",
      extraction?.stock ? `stock=${clip(extraction.stock, 180)}` : "stock=unpublished",
      extraction?.brandPerformance ? `brand_performance=${clip(extraction.brandPerformance, 180)}` : "brand_performance=unpublished",
      extraction?.salesNote ? `sales=${clip(extraction.salesNote, 180)}` : "sales=unpublished",
      extraction?.competitorMoves?.length ? `competitor_moves=${extraction.competitorMoves.slice(0, 3).map((item) => clip(item, 140)).join("; ")}` : "competitor_moves=unpublished",
      extraction?.keyPerson ? `key_contact=${clip(extraction.keyPerson, 100)}${extraction.keyPersonRole ? ` (${clip(extraction.keyPersonRole, 80)})` : ""}` : "key_contact=unpublished",
      extraction?.email ? `email=${clip(extraction.email, 120)}` : "",
      extraction?.phone ? `phone=${clip(extraction.phone, 80)}` : "",
      extraction?.whatsapp ? `whatsapp=${clip(extraction.whatsapp, 80)}` : "",
      extraction?.latestHires?.length ? `latest_hires=${extraction.latestHires.slice(0, 2).map((item) => clip(item, 100)).join("; ")}` : "",
      lead.openai ? `preliminary_openai=ICP ${lead.openai.icp}; best_fit ${lead.openai.bestFit}; ${clip(lead.openai.rationale, 160)}` : "preliminary_openai=unscored",
      activity.length ? `indirect_activity_signals:\n${activity.join("\n")}` : "indirect_activity_signals=none supplied",
      commerce.length ? `commercial_signals:\n${commerce.join("\n")}` : "commercial_signals=none supplied",
      `activity_search_status=${clip(activityLine(lead), 180)}`,
      `rag_context_only (not evidence; do not transfer neighbor facts): ${clip(ragLine(lead), 180)}`,
      "</candidate>",
    ]
      .filter(Boolean)
      .join("\n")
  })

  const selected: string[] = []
  let used = 0
  for (const card of cards) {
    const addition = `${selected.length ? "\n" : ""}${card}`
    if (used + addition.length > room) break
    selected.push(card)
    used += addition.length
  }

  const payload = [
    `Suppliers: ${suppliers}; origin: ${brief.originCountry}.`,
    `Candidates included: ${selected.length} of ${leads.length}. Do not assume omitted candidates were evaluated.`,
    "RAG may provide historical context for the exact company only. Similarity is not evidence and a neighbor is a different company.",
    ...selected,
  ].join("\n\n")

  return `${header}${payload}`
}

export function diligenceInstructions(brief: Brief, brand: string): string {
  const kind = brand.toLowerCase().includes("kanechom")
    ? "Kanechom is mass-market retail hair care. Grocery, drugstore, and low-end wholesale are the channel. Skala or a similar mass brand is a positive portfolio signal. A salon-only account is a conflict."
    : brand.toLowerCase().includes("lq")
      ? "LQ Professional is salon hair care, including straightening. The buyer must reach salons and be able to train hairdressers. A grocery-only Skala book is a conflict."
      : `${brand} is the supplier being placed. Judge channel and portfolio only against this brief: ${brief.products}.`

  return [
    evidenceRule(),
    "You write a commercial due diligence note for one company and one brand. Use only the dossier and complementary-search notes. Do not invent contacts, imports, volumes, exclusivities, or intent to buy.",
    kind,
    "Do not return an opportunity score or a confidence level. The desk calculates those from the facts.",
    "Separate facts, indications, interpretations, and items that still need a human. If a search found nothing, that is absence, not proof of the opposite.",
    "Not finding an import record does not mean the company does not import.",
    "Priority of pursue, if mentioned, means only that a salesperson should approach — never a confirmed purchase.",
    "Quote URLs already in the dossier. Leave a field empty when unpublished.",
  ].join(" ")
}
