"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import type { LeadMemoryEvent, LeadRecord } from "@/lib/types"

export function LeadsBoard({
  records,
  postgres,
  error,
}: {
  records: LeadRecord[]
  postgres: boolean
  error?: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [openId, setOpenId] = useState("")
  const [history, setHistory] = useState<Record<string, LeadMemoryEvent[]>>({})
  const [historyError, setHistoryError] = useState("")
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return records
    return records.filter((row) =>
      [row.name, row.country, row.domain, row.supplier, row.email, row.market]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle))
    )
  }, [query, records])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {records.length} empresa{records.length === 1 ? "" : "s"} ·{" "}
          {postgres ? "Postgres · desk_leads" : "arquivo local (data/runs.json)"}
        </p>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar nome, país, marca…"
            className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm sm:h-10 sm:max-w-xs"
          />
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-10"
            disabled={busy || records.length === 0}
            onClick={async () => {
              setBusy(true)
              setNote("")
              try {
                const response = await fetch("/api/leads/refresh", { method: "POST" })
                const data = (await response.json()) as {
                  refreshed?: number
                  skipped?: number
                  errors?: string[]
                  error?: string
                }
                if (!response.ok) {
                  setNote(data.error || "Não deu para atualizar as leads.")
                  return
                }
                setNote(
                  `Atualizadas ${data.refreshed ?? 0}. Puladas ${data.skipped ?? 0} (frescas ou sem Exa).`
                )
                router.refresh()
              } catch {
                setNote("Não deu para atualizar as leads.")
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? "Atualizando…" : "Atualizar sinais"}
          </Button>
        </div>
      </div>
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      {error ? (
        <p className="text-sm text-destructive">
          DATABASE_URL está definida, mas o Postgres não respondeu. O desk leu o arquivo local.{" "}
          {error}
        </p>
      ) : null}
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
          {records.length === 0
            ? "Nenhuma lead em desk_leads ainda. Rode Nova busca. Tabelas antigas (Leads, leads_master, tradeindata_*) não aparecem aqui."
            : "Nenhuma lead neste filtro."}
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {visible.map((row) => (
            <li
              key={`${row.runId}:${row.id}`}
              className="flex flex-col rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{row.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.country || "País não informado"} · {row.supplier}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Perfil pesquisado: {row.discoveryProfile || "não informado"} · Papel comercial: {row.buyerRoleReported || "a investigar"} ({row.buyerRoleStatus || "unknown"})
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium">{row.fit || row.band || "sem score"}</p>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {row.email || row.phone || row.website || "Sem contato publicado nesta linha."}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {[
                  row.lastScanAt
                    ? `varredura ${row.lastScanAt.slice(0, 10)}${row.lastScanSource ? ` · ${row.lastScanSource}` : ""}`
                    : row.signalsAt
                      ? `sinais ${row.signalsAt.slice(0, 10)}`
                      : "",
                  row.version ? `v${row.version}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "Sinais semanais ainda não rodaram nesta ficha."}
              </p>
              {row.lastPurchase ? (
                <p className="mt-2 text-sm">Última compra na página: {row.lastPurchase}</p>
              ) : null}
              <p className="mt-3 text-sm">
                <Link href={`/runs/${row.runId}`} className="underline-offset-2 hover:underline">
                  Abrir a busca
                </Link>
                {row.domain ? (
                  <>
                    {" · "}
                    <span className="text-muted-foreground">{row.domain}</span>
                  </>
                ) : null}
                {row.companyId ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      className="underline-offset-2 hover:underline"
                      onClick={async () => {
                        const companyId = row.companyId
                        if (!companyId) return
                        const key = `${row.runId}:${row.id}`
                        if (openId === key) {
                          setOpenId("")
                          return
                        }
                        setOpenId(key)
                        setHistoryError("")
                        if (history[companyId]) return
                        try {
                          const response = await fetch(
                            `/api/leads/history?companyId=${encodeURIComponent(companyId)}`
                          )
                          const data = (await response.json()) as { events?: LeadMemoryEvent[]; error?: string }
                          if (!response.ok) {
                            setHistoryError(data.error || "Histórico indisponível.")
                            return
                          }
                          setHistory((current) => ({ ...current, [companyId]: data.events ?? [] }))
                        } catch {
                          setHistoryError("Histórico indisponível.")
                        }
                      }}
                    >
                      {openId === `${row.runId}:${row.id}` ? "Fechar histórico" : "Histórico"}
                    </button>
                  </>
                ) : null}
              </p>
              {openId === `${row.runId}:${row.id}` ? (
                <ol className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-sm">
                  {historyError ? <li className="text-destructive">{historyError}</li> : null}
                  {(history[row.companyId || ""] ?? []).length === 0 && !historyError ? (
                    <li className="text-muted-foreground">
                      Sem eventos ainda, ou o Postgres não está ligado. O perfil atual continua em desk_leads.
                    </li>
                  ) : null}
                  {(history[row.companyId || ""] ?? []).map((event) => (
                    <li key={event.id}>
                      <p className="text-muted-foreground">
                        {event.at.slice(0, 16).replace("T", " ")} · {event.source} · {event.kind}
                      </p>
                      <p>{event.summary}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
