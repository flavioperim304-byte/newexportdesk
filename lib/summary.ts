import { localizeCompetitors } from "./competitors"
import type { Extraction, Lead, Run, RunSummary } from "./types"

/** Saved Parallel rows still show headquarters. Stamp the search market for the desk. */
export function viewRun(run: Run): Run {
  if (run.mode === "sample") return run
  return {
    ...run,
    competitors: localizeCompetitors(run.competitors ?? [], run.brief),
  }
}

export function summarize(run: Run): RunSummary {
  const ranked = [...(run.leads ?? [])].sort(
    (a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0)
  )
  const top = ranked.find((lead) => lead.score && !lead.score.disqualified) ?? ranked[0]
  return {
    id: run.id,
    mode: run.mode,
    status: run.status,
    supplierName: run.brief.supplierName,
    originCountry: run.brief.originCountry,
    markets: run.brief.markets,
    products: run.brief.products,
    createdAt: run.createdAt,
    leadCount: run.leads?.length ?? 0,
    topLead: top?.score
      ? { name: top.name, band: top.score.band, total: top.score.total }
      : undefined,
  }
}

/** Drop page dumps so the buyer list can render without shipping every run verbatim. */
export function boardRun(run: Run): Run {
  const presented = viewRun(run)
  return {
    ...presented,
    logs: [],
    searchTasks: undefined,
    leads: (presented.leads ?? []).map(boardLead),
  }
}

function boardLead(lead: Lead): Lead {
  return {
    ...lead,
    exa: {
      title: lead.exa?.title || lead.name,
      url: lead.exa?.url || lead.url,
      domain: lead.exa?.domain || lead.domain,
      text: "",
      highlights: [],
      summary: lead.exa?.summary || "",
    },
    extraction: lead.extraction ? boardExtraction(lead.extraction) : undefined,
    diligence: latestDiligence(lead),
  }
}

function latestDiligence(lead: Lead): Lead["diligence"] {
  const reports = lead.diligence ?? []
  if (reports.length === 0) return undefined
  const seen = new Set<string>()
  const latest: typeof reports = []
  for (const report of [...reports].reverse()) {
    const key = report.brand.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    latest.push(report)
  }
  return latest.reverse()
}

function boardExtraction(extraction: Extraction): Extraction {
  return {
    ...extraction,
    excerpt: "",
    summary: extraction.summary?.slice(0, 400) ?? "",
    buys: extraction.buys?.slice(0, 8) ?? [],
    sells: extraction.sells?.slice(0, 8) ?? [],
    buyerSignals: extraction.buyerSignals?.slice(0, 6) ?? [],
    lastPurchase: extraction.lastPurchase?.slice(0, 180) ?? "",
    stock: extraction.stock?.slice(0, 180) ?? "",
    brandPerformance: extraction.brandPerformance?.slice(0, 180) ?? "",
    salesNote: extraction.salesNote?.slice(0, 180) ?? "",
    competitorMoves: extraction.competitorMoves?.slice(0, 4) ?? [],
  }
}
