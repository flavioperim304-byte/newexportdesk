import { emptyActivity, searchActivity } from "./activity"
import { emptyCommerce, searchCommerce } from "./commerce"
import { scrapeProfile } from "./firecrawl"
import { stampIntelligence } from "./intelligence"
import { markLeadScan, mergeActivitySignals, mergeCommerceSignals } from "./memory"
import { getKeys } from "./keys"
import { getRun, listRuns, updateRun } from "./store"
import type { Lead, Run } from "./types"

export const REFRESH_COOLDOWN_MS = 6 * 24 * 60 * 60 * 1000
export const MAX_REFRESH_PER_PASS = 8

export type RefreshResult = {
  refreshed: number
  skipped: number
  errors: string[]
}

function stale(lead: Lead, now = Date.now()): boolean {
  const stamp = lead.signalsAt ? Date.parse(lead.signalsAt) : 0
  if (!stamp || Number.isNaN(stamp)) return true
  return now - stamp >= REFRESH_COOLDOWN_MS
}

export function leadsDueForRefresh(runs: Run[], now = Date.now()): { runId: string; leadId: string }[] {
  const due: { runId: string; leadId: string }[] = []
  for (const run of runs) {
    if (run.mode === "sample") continue
    for (const lead of run.leads ?? []) {
      if (stale(lead, now)) due.push({ runId: run.id, leadId: lead.id })
    }
  }
  return due
}

export async function refreshSavedLeads(limit = MAX_REFRESH_PER_PASS): Promise<RefreshResult> {
  const keys = getKeys()
  const runs = await listRuns()
  const allDue = leadsDueForRefresh(runs)
  const due = allDue.slice(0, Math.max(1, limit))
  const result: RefreshResult = { refreshed: 0, skipped: Math.max(0, allDue.length - due.length), errors: [] }
  if (!keys.exa) {
    return { refreshed: 0, skipped: allDue.length, errors: ["Exa key missing. Saved leads were not refreshed."] }
  }
  for (const item of due) {
    const run = await getRun(item.runId)
    const lead = run?.leads.find((row) => row.id === item.leadId)
    if (!run || !lead) {
      result.skipped += 1
      continue
    }
    try {
      const activity = await searchActivity(lead, run.brief, keys.exa)
      const commerce = await searchCommerce(lead, run.brief, keys.exa)
      let extraction = lead.extraction
      if (keys.firecrawl && lead.url) {
        const scraped = await scrapeProfile(lead.url, run.brief, keys.firecrawl, lead.market || lead.country, (lead.discoveryProfile || lead.buyerType))
        if (scraped.ok) extraction = scraped
      }
      await updateRun(run.id, (current) => {
        const next = current.leads.find((row) => row.id === item.leadId)
        if (!next) return
        next.activity = mergeActivitySignals(next.activity, activity)
        next.commerce = mergeCommerceSignals(next.commerce, commerce)
        if (extraction) next.extraction = extraction
        markLeadScan(next, "refresh")
        stampIntelligence(current, next)
      })
      result.refreshed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh failed."
      result.errors.push(`${lead.name}: ${message}`)
      await updateRun(run.id, (current) => {
        const next = current.leads.find((row) => row.id === item.leadId)
        if (!next) return
        if (!next.activity) next.activity = emptyActivity(message)
        if (!next.commerce) next.commerce = emptyCommerce(message)
        markLeadScan(next, "refresh")
        stampIntelligence(current, next)
      })
    }
  }
  return result
}
