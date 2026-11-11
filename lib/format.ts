import type { Band, Lead, RunStatus } from "./types"

export const BAND_LABEL: Record<Band, string> = {
  best_fit: "Best fit",
  strong: "Strong",
  possible: "Possible",
  weak: "Weak",
  disqualified: "Disqualified",
}

export const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  searching: "Searching",
  extracting: "Reading pages",
  researching: "Researching the market",
  scoring: "Scoring",
  complete: "Complete",
  failed: "Stopped",
}

export function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date)
  return `${formatted} São Paulo`
}

export function leadPlace(lead: Lead): string {
  return (
    lead.extraction?.country ||
    lead.extraction?.headquarters ||
    lead.country ||
    lead.domain
  )
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

export function mailtoHref(value: string): string {
  const email = value.trim()
  return email.includes("@") ? `mailto:${email}` : ""
}

export function telHref(value: string): string {
  const digits = value.replace(/[^\d+]/g, "")
  return digits ? `tel:${digits}` : ""
}
