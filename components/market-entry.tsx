import type { Run } from "@/lib/types"

export function MarketEntry({ run }: { run: Run }) {
  const fromParallel = Boolean(run.market?.purchaseProbability || run.market?.entryStrategy)
  const probability = fromParallel ? run.market?.purchaseProbability : run.entry?.purchaseProbability
  const note = fromParallel ? run.market?.purchaseNote : run.entry?.purchaseNote
  const strategy = fromParallel ? run.market?.entryStrategy : run.entry?.strategy
  if (!probability && !strategy) return null
  return (
    <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Probabilidade de compra do mercado · {fromParallel ? "Parallel" : "OpenAI"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          High só com última compra, estoque, marcas, vendas ou ação de concorrente publicados, mais atividade recente.
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          {probability ? <span className="font-medium uppercase">{probability}. </span> : null}
          {note || "No note yet."}
        </p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Entry strategy</p>
        <p className="mt-2 text-sm leading-relaxed">{strategy || "No strategy yet."}</p>
      </div>
    </div>
  )
}
