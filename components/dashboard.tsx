"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { CompetitorMap } from "@/components/competitor-map"
import { TradeLines } from "@/components/trade-volume"
import { isHttpUrl, mailtoHref, telHref } from "@/lib/format"
import { qualificationRows } from "@/lib/qualify"
import { localizeCompetitors } from "@/lib/competitors"
import { summarize } from "@/lib/summary"
import type { Competitor, Run, RunSummary, TradeSnapshot } from "@/lib/types"

export function Dashboard({
  initialRun,
  runs,
  summaries,
  sourcesReady,
}: {
  initialRun: Run
  runs: Run[]
  summaries: RunSummary[]
  sourcesReady: number
}) {
  const [run, setRun] = useState(initialRun)
  const [list, setList] = useState(summaries)
  const [focusId, setFocusId] = useState<string>("all")
  const [refreshError, setRefreshError] = useState("")

  useEffect(() => {
    if (run.mode !== "live") return
    if (run.status === "complete" || run.status === "failed") return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function tick() {
      try {
        const response = await fetch(`/api/runs/${run.id}`, { cache: "no-store" })
        if (!response.ok) {
          if (!stop) setRefreshError("The output could not be refreshed.")
          return
        }
        const data = (await response.json()) as { run: Run }
        if (stop) return
        setRun(data.run)
        setList((current) =>
          current.map((item) => (item.id === data.run.id ? summarize(data.run) : item))
        )
        setRefreshError("")
        timer = setTimeout(tick, 4000)
      } catch {
        if (!stop) setRefreshError("The output could not be refreshed.")
      }
    }

    timer = setTimeout(tick, 1500)
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
    }
  }, [run.id, run.mode, run.status])

  const sourceRuns = runs.length > 0 ? runs : [initialRun].filter((item) => item.mode !== "sample")
  const buyers = buyerRows(sourceRuns)
  const visible = focusId === "all" ? buyers : buyers.filter((buyer) => buyer.runId === focusId)
  const focused = focusId === "all" ? undefined : list.find((item) => item.id === focusId)
  const competitors = competitorRows(sourceRuns, focusId)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Export desk</p>
          <h1 className="mt-1 font-serif text-3xl leading-tight sm:text-4xl">Compradores</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {visible.length} empresas nas buscas de Kanechom e LQ Professional.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href="/sources"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-border px-4 text-sm sm:h-10"
          >
            Fontes
          </Link>
          <Link
            href="/qualify"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm text-primary-foreground sm:h-10"
          >
            Nova busca
          </Link>
        </div>
      </div>
         <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setFocusId("all")}
          className={`shrink-0 rounded-full border px-4 py-2 text-sm md:px-3 md:py-1.5 ${focusId === "all" ? "border-primary bg-card" : "border-border bg-card/60"}`}
        >
          Todas
        </button>
        {list
          .filter((item) => item.mode !== "sample")
          .map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFocusId(item.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-left text-sm md:px-3 md:py-1.5 ${
                focusId === item.id ? "border-primary bg-card" : "border-border bg-card/60"
              }`}
            >
              <span className="font-medium">{item.supplierName}</span>
              <span className="ml-2 text-muted-foreground">{item.markets}</span>
            </button>
          ))}
      </div>

      {focusId !== "all" ? (
        <p className="text-sm">
          <Link href={`/runs/${focusId}`} className="underline-offset-2 hover:underline">
            Abrir a análise completa desta busca
          </Link>
        </p>
      ) : null}

      <CompetitorMap
        competitors={competitors}
        brand={focused?.supplierName}
        emptyMessage={
          focused && focused.status === "complete"
            ? "Nenhum concorrente foi apontado nesta busca."
            : undefined
        }
      />

      <BuyerBoard buyers={visible} />
    </main>
  )
}

type Buyer = {
  runId: string
  company: string
  country: string
  brand: string
  fit: string
  email: string
  phone: string
  website: string
  note: string
  needed: string
  activity: string
  activityLive: boolean
  fitLevel: string
  fitIndex: number
  fitNote: string
  suppliers: string[]
  risks: string[]
  trade?: TradeSnapshot
}

function competitorRows(runs: Run[], focusId: string): Competitor[] {
  const seen = new Set<string>()
  const rows: Competitor[] = []
  for (const run of runs) {
    if (focusId !== "all" && run.id !== focusId) continue
    for (const competitor of localizeCompetitors(run.competitors ?? [], run.brief)) {
      const key = `${competitor.country}|${competitor.name}|${competitor.url}`.toLowerCase()
      if (seen.has(key) || !competitor.name.trim()) continue
      seen.add(key)
      rows.push(competitor)
    }
  }
  return rows
}

function buyerRows(runs: Run[]): Buyer[] {
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const rows: Buyer[] = []
  for (const run of runs) {
    if (!run.brief) continue
    const runLeads = run.leads ?? []
    const leads = new Map(runLeads.map((lead) => [lead.name, lead]))
    for (const row of qualificationRows(runLeads, run.brief, run.also)) {
      const lead = leads.get(row.company)
      rows.push({
        runId: run.id,
        company: row.company,
        country: row.country || run.brief.markets,
        brand: run.brief.supplierName,
        fit: row.activityLive ? row.bestFit : row.bestFit === "neither" ? row.bestFit : `${row.bestFit} · sem atividade`,
        activity: row.activity,
        activityLive: row.activityLive,
        fitLevel: row.fitLevel,
        fitIndex: row.fitIndex,
        fitNote: row.fitNote,
        email: lead?.extraction?.email || "",
        phone: lead?.extraction?.phone || lead?.extraction?.whatsapp || "",
        website: lead?.extraction?.website || lead?.url || "",
        note: lead?.context?.fitNarrative || row.rationale || lead?.score?.headline || "",
        needed: lead?.context?.qualificationNeeded || row.qualificationNeeded || "",
        suppliers: lead?.context?.knownSuppliers ?? [],
        risks: lead?.context?.risks ?? [],
        trade: run.trade,
      })
    }
  }
  return rows.sort(
    (a, b) =>
      (rank[a.fit] ?? 3) - (rank[b.fit] ?? 3) ||
      a.country.localeCompare(b.country) ||
      a.company.localeCompare(b.company)
  )
}

function BuyerBoard({ buyers }: { buyers: Buyer[] }) {
  if (buyers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
        Nenhuma empresa nesta busca.
      </p>
    )
  }
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {buyers.map((buyer) => (
        <li key={`${buyer.runId}:${buyer.company}`} className="flex flex-col rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium leading-snug">{buyer.company}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {buyer.country} · {buyer.brand}
              </p>
            </div>
            <p className="shrink-0 text-sm font-medium">{buyer.fit}</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed">
            {buyer.note || "Esta empresa não tem nota de análise gravada."}
          </p>
          {buyer.fitNote ? (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Probabilidade de fit · {buyer.fitLevel} · {buyer.fitIndex}/100
              </p>
              <p className="mt-1 text-sm leading-relaxed">{buyer.fitNote}</p>
            </div>
          ) : null}
          {buyer.activity ? (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Atividade pública</p>
              <p className={`mt-1 text-sm leading-relaxed ${buyer.activityLive ? "" : "text-muted-foreground"}`}>
                {buyer.activity}
              </p>
            </div>
          ) : null}
          {buyer.needed ? (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Ainda a confirmar</p>
              <p className="mt-1 text-sm leading-relaxed">{buyer.needed}</p>
            </div>
          ) : null}
          {buyer.suppliers.length ? (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Marcas no portfólio</p>
              <p className="mt-1 text-sm leading-relaxed">{buyer.suppliers.join(", ")}</p>
            </div>
          ) : null}
          {buyer.risks.length ? (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Riscos</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {buyer.risks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <TradeLines trade={buyer.trade} country={buyer.country} />
          <div className="mt-3 flex flex-col gap-1 text-sm">
            <ContactLine label="Email" value={buyer.email} href={mailtoHref(buyer.email)} />
            <ContactLine label="Telefone" value={buyer.phone} href={telHref(buyer.phone)} />
            <ContactLine
              label="Site"
              value={buyer.website && isHttpUrl(buyer.website) ? buyer.website.replace(/^https?:\/\//, "") : ""}
              href={buyer.website && isHttpUrl(buyer.website) ? buyer.website : ""}
              external
            />
          </div>
          <Link
            href={`/runs/${buyer.runId}`}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg border border-border text-sm"
          >
            Abrir ficha
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ContactLine({
  label,
  value,
  href,
  external = false,
}: {
  label: string
  value: string
  href: string
  external?: boolean
}) {
  return (
    <p className="flex min-w-0 gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      {value && href ? (
        <a
          href={href}
          className="min-w-0 break-all underline-offset-2 hover:underline"
          {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        >
          {value}
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </p>
  )
}

