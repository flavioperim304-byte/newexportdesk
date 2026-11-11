import { foldCountry } from "./comexstat-map"
import { clip, domainOf } from "./text"
import type {
  ActivitySignal,
  ActivitySnapshot,
  CommerceSignal,
  CommerceSnapshot,
  Lead,
} from "./types"

export const DESK_COMPANIES_TABLE = "desk_companies"
export const DESK_RUN_VERSIONS_TABLE = "desk_run_versions"
export const DESK_LEAD_VERSIONS_TABLE = "desk_lead_versions"
export const DESK_LEAD_EVENTS_TABLE = "desk_lead_events"

export type ScanSource = "run" | "refresh"

export type LeadAudit = {
  icp: string
  bestFit: string
  fit: string
  fitIndex: number | ""
  band: string
  email: string
  lastPurchase: string
  signals: string[]
}

export type MemoryEventKind =
  | "first_seen"
  | "scan"
  | "signal_added"
  | "score_changed"
  | "profile_changed"

export type MemoryEventDraft = {
  kind: MemoryEventKind
  source: ScanSource
  summary: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

export function companyIdFor(lead: Pick<Lead, "name" | "domain" | "url" | "country" | "market">): string {
  const domain = (lead.domain || domainOf(lead.url) || "").toLowerCase()
  const country = foldCountry(lead.country || lead.market || "") || "unpublished"
  if (domain) return `d:${domain}|${country}`
  const name = foldCountry(lead.name) || "unnamed"
  return `n:${name}|${country}`
}

export function markLeadScan(lead: Lead, source: ScanSource, at = new Date().toISOString()): void {
  lead.lastScanAt = at
  lead.lastScanSource = source
  lead.signalsAt = at
}

export function leadBestFit(lead: Lead): string {
  return lead.context?.bestFit || lead.openai?.bestFit || ""
}

export function leadIcp(lead: Lead): string {
  return lead.context?.icp || lead.openai?.icp || ""
}

export function leadAudit(lead: Lead): LeadAudit {
  const activity = (lead.activity?.signals ?? []).map((row) => `a:${row.kind}|${row.url.toLowerCase()}`)
  const commerce = (lead.commerce?.signals ?? []).map((row) => `c:${row.kind}|${row.url.toLowerCase()}`)
  return {
    icp: leadIcp(lead),
    bestFit: leadBestFit(lead),
    fit: lead.fit?.level || "",
    fitIndex: lead.fit?.index ?? "",
    band: lead.score?.band || "",
    email: lead.extraction?.email || "",
    lastPurchase: lead.extraction?.lastPurchase || "",
    signals: [...activity, ...commerce].sort(),
  }
}

function changed(left: LeadAudit, right: LeadAudit, keys: (keyof LeadAudit)[]): boolean {
  return keys.some((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
}

export function auditChanged(previous: LeadAudit | undefined, next: LeadAudit): boolean {
  if (!previous) return true
  return JSON.stringify(previous) !== JSON.stringify(next)
}

export function memoryEvents(
  previous: LeadAudit | undefined,
  next: LeadAudit,
  source: ScanSource
): MemoryEventDraft[] {
  const events: MemoryEventDraft[] = []
  if (!previous) {
    events.push({
      kind: "first_seen",
      source,
      summary: "Empresa entrou no desk. Snapshot inicial gravado.",
      after: { ...next, signals: next.signals.length },
    })
  }
  if (source === "refresh") {
    events.push({
      kind: "scan",
      source,
      summary: "Atualizar sinais releu atividade e comércio.",
      before: previous ? { signals: previous.signals.length } : undefined,
      after: { signals: next.signals.length },
    })
  }
  if (previous && changed(previous, next, ["icp", "bestFit", "fit", "fitIndex", "band"])) {
    events.push({
      kind: "score_changed",
      source,
      summary: clip(
        [
          previous.bestFit !== next.bestFit ? `best_fit ${previous.bestFit || "—"} → ${next.bestFit || "—"}` : "",
          previous.icp !== next.icp ? `icp ${previous.icp || "—"} → ${next.icp || "—"}` : "",
          previous.fit !== next.fit ? `fit ${previous.fit || "—"} → ${next.fit || "—"}` : "",
        ]
          .filter(Boolean)
          .join(". ") || "Score recalculado.",
        220
      ),
      before: {
        icp: previous.icp,
        bestFit: previous.bestFit,
        fit: previous.fit,
        band: previous.band,
      },
      after: {
        icp: next.icp,
        bestFit: next.bestFit,
        fit: next.fit,
        band: next.band,
      },
    })
  }
  if (previous && changed(previous, next, ["email", "lastPurchase"])) {
    events.push({
      kind: "profile_changed",
      source,
      summary: "Contato ou last_purchase publicado na página mudou. Campo vazio continua unpublished.",
      before: { email: previous.email, lastPurchase: previous.lastPurchase },
      after: { email: next.email, lastPurchase: next.lastPurchase },
    })
  }
  if (previous) {
    const seen = new Set(previous.signals)
    const added = next.signals.filter((key) => !seen.has(key))
    if (added.length) {
      events.push({
        kind: "signal_added",
        source,
        summary: `${added.length} sinal(is) novo(s) de atividade ou comércio. Não confirma compra Kanechom/LQ.`,
        after: { added: added.slice(0, 12) },
      })
    }
  }
  return events
}

export function snapshotReason(previous: LeadAudit | undefined, next: LeadAudit, source: ScanSource): string {
  if (!previous) return `created · ${source}`
  const events = memoryEvents(previous, next, source).filter((item) => item.kind !== "scan")
  return events.map((item) => item.summary).join(" · ") || `updated · ${source}`
}

export function mergeActivitySignals(
  current: ActivitySnapshot | undefined,
  incoming: ActivitySnapshot,
  cap = 16
): ActivitySnapshot {
  const existing = current?.signals ?? []
  const seen = new Set(existing.map((signal) => `${signal.kind}|${signal.url.toLowerCase()}`))
  const merged: ActivitySignal[] = [...existing]
  for (const signal of incoming.signals ?? []) {
    const key = `${signal.kind}|${signal.url.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(signal)
  }
  return {
    fetchedAt: incoming.fetchedAt,
    signals: merged.slice(0, cap),
    error: incoming.error,
  }
}

export function mergeCommerceSignals(
  current: CommerceSnapshot | undefined,
  incoming: CommerceSnapshot,
  cap = 16
): CommerceSnapshot {
  const existing = current?.signals ?? []
  const seen = new Set(existing.map((signal) => `${signal.kind}|${signal.url.toLowerCase()}`))
  const merged: CommerceSignal[] = [...existing]
  for (const signal of incoming.signals ?? []) {
    const key = `${signal.kind}|${signal.url.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(signal)
  }
  return {
    fetchedAt: incoming.fetchedAt,
    signals: merged.slice(0, cap),
    error: incoming.error,
  }
}

