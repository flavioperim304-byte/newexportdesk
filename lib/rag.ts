import type { Lead, RagMatch, RagStatus } from "./types"

const timeoutMs = 25000
const PING_MS = 12000

const RETRY_NOTE = /abort|fail|502|503|504|timeout|network|not configured|returned [45]/i

export function ragNeedsRetry(lead: Lead): boolean {
  const rag = lead.rag
  if (!rag || !rag.checked) return true
  return RETRY_NOTE.test(rag.note || "")
}

function ragUrl(): string {
  return (process.env.RAG_API_URL || "").trim().replace(/\/$/, "")
}

export function ragConfigured(): boolean {
  return Boolean(ragUrl())
}

export function ragNotConfiguredMatch(): RagMatch {
  return {
    checked: false,
    match: false,
    note: "RAG_API_URL is not set. Node did not call Chroma. Do not invent a match or a Kanechom/LQ purchase.",
  }
}

/** Sentence on every OpenAI and Parallel card. A neighbor is never this company. */
export function ragLine(lead: Lead): string {
  const rag = lead.rag
  if (!rag) {
    return "RAG: not checked. Treat as unpublished. Do not invent a match, a neighbor's brands, or a Kanechom/LQ purchase."
  }
  if (!rag.checked) {
    return `RAG: not checked (${rag.note || "unavailable"}). Treat as unpublished. Do not invent a match, a neighbor's brands, or a Kanechom/LQ purchase.`
  }
  if (rag.match) {
    const who = rag.neighbor ? ` (${rag.neighbor})` : ""
    return `RAG: exact name already in the dashboard index${who}. This is a past profile, never a Kanechom or LQ purchase. ${rag.note}`
  }
  const neighbor = rag.neighbor
    ? ` Nearest stored profile is ${rag.neighbor}${
        typeof rag.distance === "number" ? ` (distance ${rag.distance.toFixed(2)})` : ""
      }. That neighbor is a different company — do not copy its contacts, brands, or purchases onto this lead.`
    : ""
  return `RAG: no exact name in the Chroma index.${neighbor} Do not invent a similar company or a purchase. ${rag.note}`
}

function blob(lead: Lead): { company: string; country: string; role: string; summary: string } {
  return {
    company: lead.name,
    country: lead.market || lead.extraction?.country || lead.country || "",
    role: lead.extraction?.role || lead.buyerType || lead.discoveryProfile || "",
    summary: [lead.extraction?.summary, lead.exa.summary, lead.exa.text].filter(Boolean).join(" ").slice(0, 800),
  }
}

export async function matchLead(lead: Lead): Promise<RagMatch> {
  const base = ragUrl()
  if (!base) return ragNotConfiguredMatch()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${base}/api/v1/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(blob(lead)),
      signal: controller.signal,
    })
    const data = (await response.json().catch(() => null)) as {
      match?: boolean
      exact?: boolean
      distance?: number
      neighbor?: string
      note?: string
      detail?: string
    } | null
    if (!response.ok || !data) {
      return {
        checked: false,
        match: false,
        note: data?.detail || data?.note || `RAG returned ${response.status}.`,
      }
    }
    return {
      checked: true,
      match: Boolean(data.match),
      exact: Boolean(data.exact),
      distance: typeof data.distance === "number" ? data.distance : undefined,
      neighbor: data.neighbor || "",
      note: data.note || (data.match ? "Matches the Chroma index." : "Does not match the Chroma index."),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "RAG request failed."
    return { checked: false, match: false, note: message }
  } finally {
    clearTimeout(timer)
  }
}

export async function matchLeads(leads: Lead[]): Promise<Map<string, RagMatch>> {
  const out = new Map<string, RagMatch>()
  if (!ragConfigured()) return out
  for (const lead of leads) {
    out.set(lead.id, await matchLead(lead))
  }
  return out
}

export async function ragStatus(): Promise<RagStatus> {
  const base = ragUrl()
  if (!base) {
    return {
      configured: false,
      reachable: false,
      url: "",
      note: "RAG_API_URL is not set on this Node process. Set it to https://exportsales2.onrender.com on the exportsales service. Without it OpenAI and Parallel never see the index.",
    }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PING_MS)
  try {
    const response = await fetch(`${base}/`, { signal: controller.signal })
    const data = (await response.json().catch(() => null)) as {
      status?: string
      chroma_path?: string
      chroma_count?: number
    } | null
    if (!response.ok || !data) {
      return {
        configured: true,
        reachable: false,
        url: base,
        note: `RAG_API_URL is set but ${base} returned ${response.status}. Node cannot confirm the index.`,
      }
    }
    const count = typeof data.chroma_count === "number" ? data.chroma_count : 0
    return {
      configured: true,
      reachable: true,
      url: base,
      chromaCount: count,
      chromaPath: data.chroma_path,
      note:
        count > 0
          ? `Python index is up (${count} profiles). A match is only an exact name already in Chroma, never a Kanechom/LQ purchase.`
          : "Python is up but Chroma is empty. Upload a dashboard CSV on /enviar.",
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "RAG ping failed."
    return {
      configured: true,
      reachable: false,
      url: base,
      note: `RAG_API_URL is set but Node could not reach ${base}. ${message}`,
    }
  } finally {
    clearTimeout(timer)
  }
}
