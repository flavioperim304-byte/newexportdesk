import countries from "./data/comexstat-countries.json"
import { splitList } from "./text"
import type { CountryTrade, TradeSnapshot, TradeYear } from "./types"

const ALIASES: Record<string, string> = {
  "republica dominicana": "dominican republic",
  "republica domincana": "dominican republic",
  "dominican republic": "dominican republic",
  "south africa": "south africa",
  "africa do sul": "south africa",
  "costa rica": "costa rica",
  chile: "chile",
  portugal: "portugal",
  bolivia: "bolivia",
  morocco: "morocco",
  marrocos: "morocco",
  germany: "germany",
  alemanha: "germany",
  netherlands: "netherlands",
  holanda: "netherlands",
  "paises baixos": "netherlands",
  japan: "japan",
  japao: "japan",
}

export type HsFilter = "chapter" | "heading" | "subHeading" | "ncm"

export type ParsedHs = {
  digits: string
  filter: HsFilter
}

export function foldCountry(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function parseHsCode(raw: string): ParsedHs | { error: string } {
  const digits = raw.replace(/\D/g, "")
  if (!digits) return { error: "Add an HS code with 2, 4, 6, or 8 digits." }
  if (digits.length === 2) return { digits, filter: "chapter" }
  if (digits.length === 4) return { digits, filter: "heading" }
  if (digits.length === 6) return { digits, filter: "subHeading" }
  if (digits.length === 8) return { digits, filter: "ncm" }
  return { error: "HS codes are 2, 4, 6, or 8 digits. Example: 3305." }
}

const countryIndex = (() => {
  const byName = new Map<string, { id: string; name: string }>()
  for (const row of countries as { id: string; name: string }[]) {
    const key = foldCountry(row.name)
    if (key) byName.set(key, { id: String(row.id), name: row.name })
  }
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    const hit = byName.get(canonical)
    if (hit) byName.set(foldCountry(alias), hit)
  }
  return byName
})()

export function canonicalCountry(name: string): string {
  const key = foldCountry(name)
  return ALIASES[key] || key
}

export function resolveCountry(name: string): { id: string; name: string } | null {
  const key = canonicalCountry(name)
  if (!key) return null
  const direct = countryIndex.get(key) || countryIndex.get(foldCountry(name))
  if (direct) return direct
  for (const [stored, row] of countryIndex) {
    if (stored.includes(key) || key.includes(stored)) return row
  }
  return null
}

export function tradePeriod(now = new Date()): { from: string; to: string; years: number[] } {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const years = [year - 2, year - 1, year]
  return {
    from: `${year - 2}-01`,
    to: `${year}-${String(month).padStart(2, "0")}`,
    years,
  }
}

export function aggregateMonths(
  rows: { year: string; monthNumber?: string; metricFOB?: string; metricKG?: string }[]
): TradeYear[] {
  const byYear = new Map<number, TradeYear>()
  for (const row of rows) {
    const year = Number(row.year)
    if (!Number.isFinite(year)) continue
    const current = byYear.get(year) ?? { year, usdFob: 0, kg: 0, months: 0 }
    current.usdFob += Number(row.metricFOB) || 0
    current.kg += Number(row.metricKG) || 0
    current.months += 1
    byYear.set(year, current)
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year)
}

export function countriesForTrade(markets: string, extra: string[] = []): string[] {
  return [...new Set([...splitList(markets), ...extra.map((item) => item.trim()).filter(Boolean)])]
}

export function tradeForCountry(snapshot: TradeSnapshot | undefined, country: string): CountryTrade | null {
  if (!snapshot) return null
  const key = canonicalCountry(country)
  return (
    snapshot.countries.find((item) => canonicalCountry(item.country) === key) ||
    snapshot.countries.find((item) => {
      const stored = canonicalCountry(item.country)
      return stored.includes(key) || key.includes(stored)
    }) ||
    null
  )
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

export function formatKg(value: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(value))} kg`
}

export function yearLabel(row: TradeYear, periodTo: string): string {
  const toMonth = Number(periodTo.slice(5, 7))
  const toYear = Number(periodTo.slice(0, 4))
  if (row.year === toYear && toMonth < 12 && row.months > 0 && row.months < 12) {
    return `${row.year} (jan–${String(toMonth).padStart(2, "0")})`
  }
  return String(row.year)
}
