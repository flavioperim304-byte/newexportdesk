import { isRateLimitError } from "@/lib/comexstat"
import { formatKg, formatUsd, tradeForCountry, yearLabel } from "@/lib/comexstat-map"
import type { CountryTrade, TradeSnapshot } from "@/lib/types"

export function TradeVolume({
  trade,
  country,
}: {
  trade?: TradeSnapshot
  country?: string
}) {
  if (!trade) return null
  const series = country ? tradeForCountry(trade, country) : null
  const rows = country ? (series ? [series] : []) : trade.countries
  if (rows.length === 0 && !trade.error) return null
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl">Exportação do Brasil</h2>
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {trade.source} · HS {trade.hsCode}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Volume exportado nos últimos 3 anos
        {trade.hsLabel ? ` · ${trade.hsLabel}` : ""}.
      </p>
      {trade.error ? (
        <p className={isRateLimitError(trade.error) ? "mt-3 text-sm text-muted-foreground" : "mt-3 text-sm text-destructive"}>
          {trade.error}
        </p>
      ) : null}
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((item) => (
          <CountryTradeCard key={item.country} item={item} periodTo={trade.periodTo} />
        ))}
      </ul>
    </section>
  )
}

export function TradeLines({
  trade,
  country,
}: {
  trade?: TradeSnapshot
  country: string
}) {
  const series = tradeForCountry(trade, country)
  if (!trade || !series) return null
  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Exportação Brasil → {series.country} · HS {trade.hsCode}
      </p>
      {series.error ? (
        <p className="mt-1 text-sm text-muted-foreground">{series.error}</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm leading-relaxed">
          {series.years.map((year) => (
            <li key={year.year}>
              {yearLabel(year, trade.periodTo)}: {formatUsd(year.usdFob)} · {formatKg(year.kg)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CountryTradeCard({ item, periodTo }: { item: CountryTrade; periodTo: string }) {
  return (
    <li className="rounded-lg border border-border px-3 py-3">
      <p className="font-medium">{item.country}</p>
      {item.error ? (
        <p className="mt-2 text-sm text-muted-foreground">{item.error}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm leading-relaxed">
          {item.years.map((year) => (
            <li key={year.year}>
              {yearLabel(year, periodTo)}: {formatUsd(year.usdFob)} · {formatKg(year.kg)}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
