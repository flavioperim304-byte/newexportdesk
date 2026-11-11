import {
  aggregateMonths,
  canonicalCountry,
  foldCountry,
  parseHsCode,
  resolveCountry,
  tradePeriod,
  type HsFilter,
} from "./comexstat-map"
import { ApiError, requestJson } from "./http"
import type { CountryTrade, TradeSnapshot, TradeYear } from "./types"

export {
  aggregateMonths,
  canonicalCountry,
  countriesForTrade,
  formatKg,
  formatUsd,
  parseHsCode,
  resolveCountry,
  tradeForCountry,
  tradePeriod,
  yearLabel,
} from "./comexstat-map"

const COMEXSTAT_GENERAL = "https://api-comexstat.mdic.gov.br/general?language=en"
const SOURCE = "Comex Stat"
const MAX_429_RETRIES = 4
const WAIT_BUFFER_MS = 2000
const DEFAULT_WAIT_MS = 10000

const memory = new Map<string, TradeSnapshot>()
let coolUntil = 0
let queue: Promise<void> = Promise.resolve()
let waitFn = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function isRateLimitError(error: unknown): boolean {
  const status = error instanceof ApiError ? error.status : 0
  const message = error instanceof Error ? error.message : String(error)
  return status === 429 || /\b429\b/.test(message) || /excedeu o limite/i.test(message)
}

export function retryWaitMs(error: unknown, attempt = 0): number | null {
  if (!isRateLimitError(error)) return null
  const fromHeader = error instanceof ApiError ? error.retryAfterMs : undefined
  const message = error instanceof Error ? error.message : String(error)
  const fromText = message.match(/em\s+(\d+)\s+segundos?/i) || message.match(/in\s+(\d+)\s+seconds?/i)
  const asked = fromHeader ?? (fromText ? Number(fromText[1]) * 1000 : DEFAULT_WAIT_MS)
  const base = Math.max(asked, DEFAULT_WAIT_MS) + WAIT_BUFFER_MS
  return base + attempt * 5000
}

export function publicTradeError(error: unknown): string {
  if (!isRateLimitError(error)) {
    return error instanceof Error ? error.message : String(error)
  }
  const wait = retryWaitMs(error) ?? DEFAULT_WAIT_MS + WAIT_BUFFER_MS
  const seconds = Math.max(10, Math.ceil(wait / 1000))
  return `Comex Stat pediu para esperar ${seconds}s. A busca continua; o volume entra sozinho na próxima tentativa.`
}

export function tradeCooldownActive(trade: TradeSnapshot | undefined, now = Date.now()): boolean {
  if (!trade?.error) return false
  if (trade.retryAfter && Date.parse(trade.retryAfter) > now) return true
  if (isRateLimitError(trade.error) && Date.parse(trade.fetchedAt) + DEFAULT_WAIT_MS > now) return true
  return false
}

export function resetComexstatForTests(wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  memory.clear()
  coolUntil = 0
  queue = Promise.resolve()
  waitFn = wait
}

function cacheKey(hs: string, countries: string[], period: { from: string; to: string }): string {
  const names = countries.map((name) => canonicalCountry(name)).sort().join(",")
  return `${hs}|${period.from}|${period.to}|${names}`
}

async function withQueue<T>(fn: () => Promise<T>): Promise<T> {
  const previous = queue
  let release = () => {}
  queue = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    const pause = coolUntil - Date.now()
    if (pause > 0) await waitFn(pause)
    return await fn()
  } finally {
    release()
  }
}

async function postGeneral(body: unknown, attempt = 0): Promise<unknown> {
  try {
    return await requestJson(COMEXSTAT_GENERAL, {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 60000,
    })
  } catch (error) {
    const wait = retryWaitMs(error, attempt)
    if (wait !== null && attempt < MAX_429_RETRIES) {
      coolUntil = Math.max(coolUntil, Date.now() + wait)
      await waitFn(wait)
      return postGeneral(body, attempt + 1)
    }
    throw error
  }
}

function emptyYears(period: { years: number[] }): TradeYear[] {
  return period.years.map((year) => ({ year, usdFob: 0, kg: 0, months: 0 }))
}

export async function brazilExports(hsCode: string, countryNames: string[], now = new Date()): Promise<TradeSnapshot> {
  const parsed = parseHsCode(hsCode)
  const fetchedAt = now.toISOString()
  const period = tradePeriod(now)
  if ("error" in parsed) {
    return {
      hsCode: hsCode.trim(),
      hsFilter: "heading",
      hsLabel: "",
      periodFrom: period.from,
      periodTo: period.to,
      source: SOURCE,
      countries: [],
      error: parsed.error,
      fetchedAt,
    }
  }
  const unique = [...new Set(countryNames.map((name) => name.trim()).filter(Boolean))]
  const resolved: { asked: string; id: string; name: string }[] = []
  const missing: CountryTrade[] = []
  for (const asked of unique) {
    const hit = resolveCountry(asked)
    if (!hit) {
      missing.push({
        country: asked,
        years: emptyYears(period),
        error: `Comex Stat has no country id for ${asked}.`,
      })
      continue
    }
    resolved.push({ asked, id: hit.id, name: hit.name })
  }
  if (resolved.length === 0) {
    return {
      hsCode: parsed.digits,
      hsFilter: parsed.filter,
      hsLabel: "",
      periodFrom: period.from,
      periodTo: period.to,
      source: SOURCE,
      countries: missing,
      error: missing[0]?.error || "No destination country could be matched.",
      fetchedAt,
    }
  }
  const key = cacheKey(parsed.digits, resolved.map((item) => item.name), period)
  const cached = memory.get(key)
  if (cached && !cached.error) {
    return {
      ...cached,
      countries: [...cached.countries.filter((item) => !missing.some((row) => row.country === item.country)), ...missing],
    }
  }
  const filter: HsFilter = parsed.filter
  const body = {
    flow: "export",
    monthDetail: true,
    period: { from: period.from, to: period.to },
    filters: [
      { filter: "country", values: resolved.map((item) => Number(item.id)) },
      { filter, values: [parsed.digits] },
    ],
    details: ["country", filter],
    metrics: ["metricFOB", "metricKG"],
  }
  try {
    const payload = (await withQueue(async () => {
      const hit = memory.get(key)
      if (hit && !hit.error) return { data: { list: [] }, cached: hit }
      return postGeneral(body)
    })) as {
      data?: { list?: Record<string, string>[] }
      cached?: TradeSnapshot
    }
    if (payload.cached) {
      return {
        ...payload.cached,
        countries: [
          ...payload.cached.countries.filter((item) => !missing.some((row) => row.country === item.country)),
          ...missing,
        ],
      }
    }
    const list = Array.isArray(payload?.data?.list) ? payload.data.list : []
    const label =
      list[0]?.heading ||
      list[0]?.subHeading ||
      list[0]?.chapter ||
      list[0]?.ncm ||
      `HS ${parsed.digits}`
    const byOfficial = new Map<string, Record<string, string>[]>()
    for (const row of list) {
      const name = (row.country || "").trim()
      if (!name) continue
      const key = canonicalCountry(name)
      const bucket = byOfficial.get(key) ?? []
      bucket.push(row)
      byOfficial.set(key, bucket)
    }
    const countriesOut: CountryTrade[] = resolved.map((item) => {
      const rows =
        byOfficial.get(canonicalCountry(item.name)) ??
        byOfficial.get(canonicalCountry(item.asked)) ??
        byOfficial.get(foldCountry(item.name)) ??
        []
      const years = aggregateMonths(
        rows.map((row) => ({
          year: row.year ?? "",
          monthNumber: row.monthNumber,
          metricFOB: row.metricFOB,
          metricKG: row.metricKG,
        }))
      )
      const filled = period.years.map(
        (year) => years.find((row) => row.year === year) ?? { year, usdFob: 0, kg: 0, months: 0 }
      )
      return { country: item.asked, years: filled }
    })
    const snapshot: TradeSnapshot = {
      hsCode: parsed.digits,
      hsFilter: parsed.filter,
      hsLabel: String(label),
      periodFrom: period.from,
      periodTo: period.to,
      source: SOURCE,
      countries: [...countriesOut, ...missing],
      fetchedAt,
    }
    memory.set(key, snapshot)
    return snapshot
  } catch (error) {
    const message = publicTradeError(error)
    const wait = retryWaitMs(error) ?? (isRateLimitError(error) ? DEFAULT_WAIT_MS + WAIT_BUFFER_MS : 0)
    return {
      hsCode: parsed.digits,
      hsFilter: parsed.filter,
      hsLabel: "",
      periodFrom: period.from,
      periodTo: period.to,
      source: SOURCE,
      countries: [
        ...resolved.map((item) => ({
          country: item.asked,
          years: emptyYears(period),
          error: message,
        })),
        ...missing,
      ],
      error: message,
      fetchedAt,
      ...(wait ? { retryAfter: new Date(Date.now() + wait).toISOString() } : {}),
    }
  }
}
