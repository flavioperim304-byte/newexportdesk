import { hasRecentActivity } from "./activity"
import { hasCommercialBuyFacts, hasCommerceSignals, recentCommerce } from "./commerce"
import type { Brief, BuyingFact, BuyingKind, Competitor, FitProbability, Lead } from "./types"
import { clip } from "./text"

const KIND_LABEL: Record<BuyingKind, string> = {
  last_purchase: "última compra",
  stock: "estoque",
  brand_performance: "desempenho das marcas",
  sales: "vendas",
  competitor_move: "ação de concorrente",
}

const PATTERNS: Record<BuyingKind, RegExp> = {
  last_purchase:
    /ultima compra|última compra|última importaci[oó]n|last purchase|recent(?:ly)? (?:imported|received|shipped|bought)|acabamos de receber|just (?:received|imported|restocked)|shipment in 202[5-6]|imported in 202[5-6]|compra recente|import[oó] (?:un |una |el |la )?(?:contenedor|embarque|lote)|importamos en 202[5-6]|recibimos (?:un |el )?(?:embarque|contenedor)|embarque en 202[5-6]|despacho aduanero|bill of lading|manifiesto de carga/i,
  stock:
    /\bestoque\b|in stock|out of stock|sold out|low stock|reposi[cç][aã]o|reposici[oó]n|inventory|inventario|sem estoque|esgotado|agotado|restock|acaba de (?:llegar|chegar)|ya (?:tenemos|hay) stock|sin stock/i,
  brand_performance:
    /best[- ]seller|mais vendid|top selling|desempenho|leading brand|growing brand|ranking|marca l[ií]der/i,
  sales:
    /faturamento|sales (?:grew|growth|volume|up)|volume de venda|units sold|import volume|receita|turnover|vendas cresceram|ventas crecieron|facturaci[oó]n|volumen de (?:venta|importaci[oó]n)|unidades vendidas/i,
  competitor_move:
    /concorrente|competitor (?:launch|signed|dropped|moved)|exclusive (?:with|for)|perdeu a marca|nova exclusiva|rival brand/i,
}

const STALE = /\b(202[0-4]|201\d)\b/

const WEIGHT: Record<BuyingKind, { recent: number; stale: number; unknown: number }> = {
  last_purchase: { recent: 16, stale: 7, unknown: 11 },
  stock: { recent: 14, stale: 6, unknown: 10 },
  sales: { recent: 12, stale: 6, unknown: 8 },
  brand_performance: { recent: 10, stale: 5, unknown: 7 },
  competitor_move: { recent: 10, stale: 5, unknown: 7 },
}

export function buyingKindLabel(kind: BuyingKind): string {
  return KIND_LABEL[kind]
}

function corpus(lead: Lead): string {
  const extraction = lead.extraction
  return [
    extraction?.lastPurchase,
    extraction?.stock,
    extraction?.brandPerformance,
    extraction?.salesNote,
    (extraction?.competitorMoves ?? []).join(" "),
    extraction?.summary,
    extraction?.excerpt,
    (extraction?.buyerSignals ?? []).join(" "),
    (extraction?.buys ?? []).join(" "),
    lead.exa?.summary,
    lead.exa?.text,
    (lead.exa?.highlights ?? []).join(" "),
    (lead.context?.knownSuppliers ?? []).join(" "),
    (lead.activity?.signals ?? []).map((signal) => `${signal.title} ${signal.quote}`).join(" "),
  ]
    .filter(Boolean)
    .join("\n")
}

function recencyOf(quote: string): BuyingFact["recency"] {
  if (/2026|este ano|this year|last (?:month|week)|m[eê]s passado|recente|recent/i.test(quote)) {
    return "recent"
  }
  if (STALE.test(quote)) return "stale"
  return "unknown"
}

function looksUnpublished(quote: string): boolean {
  const value = quote.trim()
  if (!value) return true
  if (
    /^(n\/?a|none|unknown|unpublished|not (?:found|published|available)|no (?:data|information|evidence|records?)|sem (?:dado|evid)|n[aã]o (?:h[aá]|encontr))/i.test(
      value
    )
  ) {
    return true
  }
  if (/last purchase\/shipment:\s*;/i.test(value)) return true
  if (/(?:stock\/restock|sales\/volume|brand performance):\s*;/i.test(value) && value.length < 120) {
    return true
  }
  return false
}

function factFromField(kind: BuyingKind, value: string | undefined, url?: string): BuyingFact | null {
  const quote = value?.trim() ?? ""
  if (!quote || looksUnpublished(quote)) return null
  return { kind, found: true, recency: recencyOf(quote), quote: clip(quote, 220), url }
}

export function hasPublishedBuyFacts(lead: Lead): boolean {
  if (hasCommercialBuyFacts(lead)) return true
  return buyingFacts(lead).some(
    (fact) => fact.found && (fact.kind === "last_purchase" || fact.kind === "stock" || fact.kind === "sales")
  )
}

function factFromCommerce(kind: BuyingKind, lead: Lead): BuyingFact | null {
  const hit =
    kind === "stock"
      ? recentCommerce(lead).find((signal) => signal.kind === "restock")
      : undefined
  if (!hit) return null
  const quote = clip(hit.quote || hit.title, 220)
  if (!quote || looksUnpublished(quote)) return null
  return {
    kind,
    found: true,
    recency: recencyOf(`${quote} ${hit.publishedAt ?? ""}`),
    quote,
    url: hit.url,
  }
}

export function buyingFacts(lead: Lead): BuyingFact[] {
  const extraction = lead.extraction
  const text = corpus(lead)
  const structured: Partial<Record<BuyingKind, string | undefined>> = {
    last_purchase: extraction?.lastPurchase,
    stock: extraction?.stock,
    brand_performance: extraction?.brandPerformance,
    sales: extraction?.salesNote,
    competitor_move: (extraction?.competitorMoves ?? []).filter(Boolean).join("; ") || undefined,
  }
  const facts: BuyingFact[] = []
  for (const kind of Object.keys(PATTERNS) as BuyingKind[]) {
    const fromField = factFromField(kind, structured[kind], lead.url)
    if (fromField) {
      facts.push(fromField)
      continue
    }
    const match = text.match(PATTERNS[kind])
    if (match) {
      const start = Math.max(0, (match.index ?? 0) - 40)
      const quote = clip(text.slice(start, start + 180), 220)
      if (!looksUnpublished(quote)) {
        facts.push({
          kind,
          found: true,
          recency: recencyOf(quote),
          quote,
          url: lead.url,
        })
        continue
      }
    }
    const fromCommerce = factFromCommerce(kind, lead)
    if (fromCommerce) {
      facts.push(fromCommerce)
      continue
    }
    facts.push({ kind, found: false, recency: "unknown", quote: "" })
  }
  return facts
}

function roleBoost(lead: Lead): number {
  const role = `${lead.extraction?.role ?? ""} ${lead.exa?.summary ?? ""}`.toLowerCase()
  if (/\b(importer|importador|distributor|distribuidor|wholesaler|atacadista)\b/i.test(role)) return 10
  if (/\b(trader|trading|trading company)\b/i.test(role)) return 6
  return 0
}

function productBoost(brief: Brief, lead: Lead): number {
  const buys = (lead.extraction?.buys ?? []).join(" ").toLowerCase()
  if (!buys) return 0
  const tokens = brief.products
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 5)
  const hits = tokens.filter((token) => buys.includes(token)).length
  if (hits >= 2) return 10
  if (hits === 1) return 5
  return 0
}

function competitorBoost(lead: Lead, competitors: Competitor[]): number {
  const market = (lead.market || lead.country || "").toLowerCase()
  if (!market) return competitors.length ? 4 : 0
  const local = (competitors ?? []).filter((item) => item.country.toLowerCase().includes(market) || market.includes(item.country.toLowerCase()))
  return local.length ? 8 : 0
}

/** Fair, open book, and a purchasing hire add context. They do not count as a purchase. */
function commerceBoost(lead: Lead): number {
  const kinds = new Set(recentCommerce(lead).map((signal) => signal.kind))
  let points = 0
  if (kinds.has("trade_fair")) points += 8
  if (kinds.has("open_book")) points += 6
  if (kinds.has("hiring_buy")) points += 4
  return points
}

export function computeFitProbability(
  brief: Brief,
  lead: Lead,
  competitors: Competitor[] = []
): FitProbability {
  const facts = buyingFacts(lead)
  const found = facts.filter((fact) => fact.found)
  const missing = facts.filter((fact) => !fact.found).map((fact) => fact.kind)
  let index = 0
  for (const fact of found) {
    index += WEIGHT[fact.kind][fact.recency]
  }
  if (hasRecentActivity(lead)) index += 16
  index += roleBoost(lead)
  index += productBoost(brief, lead)
  index += competitorBoost(lead, competitors)
  index += commerceBoost(lead)
  const commerceBuy = hasCommercialBuyFacts(lead)
  if (found.length === 0 && !hasCommerceSignals(lead)) index = Math.min(index, 38)
  if (found.length < 2 && !hasRecentActivity(lead) && recentCommerce(lead).length < 2) {
    index = Math.min(index, 44)
  }
  if (
    missing.includes("last_purchase") &&
    missing.includes("stock") &&
    missing.includes("sales") &&
    !commerceBuy
  ) {
    index = Math.min(index, 55)
  }
  if (lead.rag?.checked && lead.rag.match) index += 8
  if (lead.rag?.checked && !lead.rag.match) index = Math.min(index, 48)
  index = Math.max(0, Math.min(100, index))
  const level: FitProbability["level"] = index >= 70 ? "high" : index >= 45 ? "medium" : "low"
  let note =
    found.length === 0 && !hasCommerceSignals(lead)
      ? "Não há última compra, estoque, desempenho de marca, vendas, aduana ou reposição publicados. A probabilidade de fit fica baixa até aparecer um desses fatos — empresas só com folheto quase não respondem."
      : level === "high"
        ? `Os fatos de compra publicados sustentam um fit alto. Índice de evidência ${index}/100. Isso não é um pedido confirmado.`
        : level === "medium"
          ? `Alguns fatos de compra ou sinais comerciais foram publicados, mas última compra, estoque ou vendas ainda estão fracos. Índice de evidência ${index}/100.`
          : `Poucos fatos de compra publicados para um fit alto. Falta ${missing.map(buyingKindLabel).join(", ")}. Índice de evidência ${index}/100.`
  if (lead.rag?.checked) {
    note += lead.rag.match
      ? ` RAG confirma um perfil parecido no índice${lead.rag.neighbor ? ` (${lead.rag.neighbor})` : ""}.`
      : " RAG não encontrou um perfil parecido no índice; o fit fica limitado até haver evidência melhor."
  }
  return { level, index, note, missing, facts }
}

export function fitProbabilityLine(fit: FitProbability | undefined): string {
  if (!fit) return "Fit probability has not been calculated."
  const have = (fit.facts ?? []).filter((fact) => fact.found).map((fact) => buyingKindLabel(fact.kind))
  const miss = (fit.missing ?? []).map(buyingKindLabel)
  return [
    `Fit probability ${fit.level}, evidence index ${fit.index}/100.`,
    have.length ? `Published: ${have.join(", ")}.` : "No commercial buying facts were published.",
    miss.length ? `Missing: ${miss.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
}

export function buyingEvidenceLine(lead: Lead): string {
  const extraction = lead.extraction
  const moves = (extraction?.competitorMoves ?? []).filter(Boolean)
  return [
    extraction?.lastPurchase ? `last purchase: ${clip(extraction.lastPurchase, 140)}` : "last purchase: unpublished",
    extraction?.stock ? `stock: ${clip(extraction.stock, 140)}` : "stock: unpublished",
    extraction?.brandPerformance
      ? `brand performance: ${clip(extraction.brandPerformance, 140)}`
      : "brand performance: unpublished",
    extraction?.salesNote ? `sales: ${clip(extraction.salesNote, 140)}` : "sales: unpublished",
    moves.length ? `competitor moves: ${clip(moves.join("; "), 180)}` : "competitor moves: unpublished",
  ].join(" | ")
}
