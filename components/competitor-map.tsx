import { isHttpUrl } from "@/lib/format"
import type { Competitor } from "@/lib/types"

export function CompetitorMap({
  competitors,
  brand,
  emptyMessage,
}: {
  competitors: Competitor[]
  brand?: string
  emptyMessage?: string
}) {
  if (competitors.length === 0 && !emptyMessage) return null
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl">Concorrentes no mercado</h2>
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {brand ? `${brand} · Parallel` : "Parallel"}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Marcas e distribuidores rivais que já vendem no país desta busca. Não são os compradores da lista abaixo.
      </p>
      {competitors.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {competitors.map((competitor) => (
            <li key={`${competitor.country}:${competitor.name}:${competitor.url}`} className="rounded-lg border border-border px-3 py-3">
              <p className="font-medium leading-snug">{competitor.name}</p>
              {competitor.country ? (
                <p className="mt-1 text-sm text-muted-foreground">{competitor.country}</p>
              ) : null}
              {competitor.whyRelevant ? (
                <p className="mt-2 text-sm leading-relaxed">{competitor.whyRelevant}</p>
              ) : null}
              {isHttpUrl(competitor.url) ? (
                <a
                  href={competitor.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm underline-offset-2 hover:underline"
                >
                  Fonte
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
