"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CompetitorMap } from "@/components/competitor-map"
import { DownloadResults } from "@/components/download-results"
import { MarketEntry } from "@/components/market-entry"
import { TradeVolume } from "@/components/trade-volume"
import { Button } from "@/components/ui/button"
import { PromptPreview } from "@/components/prompt-preview"
import { qualificationRows } from "@/lib/qualify"
import { BAND_LABEL, STATUS_LABEL, formatWhen, isHttpUrl, leadPlace, mailtoHref, telHref } from "@/lib/format"
import { activityKindLabel, hasRecentActivity } from "@/lib/activity"
import { commerceKindLabel, hasCommercialBuyFacts, hasCommerceSignals } from "@/lib/commerce"
import { buyingKindLabel } from "@/lib/fit-probability"
import type { Band, Evidence, Lead, Run, StageState } from "@/lib/types"
import type { IcpLevel } from "@/lib/qualify"

const STAGE_META = {
  search: { n: "01", source: "Exa", title: "Search" },
  extract: { n: "02", source: "Firecrawl scrape + crawl", title: "Contacts and key person" },
  classify: { n: "03", source: "Exa + OpenAI", title: "Activity, commerce, and best fit" },
  context: { n: "04", source: "Parallel", title: "Refine and context" },
  diligence: { n: "05", source: "Desk", title: "Not used" },
} as const

export function RunDesk({ initial }: { initial: Run }) {
  const router = useRouter()
  const [run, setRun] = useState(initial)
  const [selectedId, setSelectedId] = useState(initial.leads[0]?.id ?? "")
  const [refreshError, setRefreshError] = useState("")
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    if (initial.mode !== "live") return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function tick() {
      try {
        const response = await fetch(`/api/runs/${initial.id}`, { cache: "no-store" })
        if (!response.ok) {
          if (!stop) setRefreshError("The desk could not refresh this run.")
          return
        }
        const data = (await response.json()) as { run: Run }
        if (stop) return
        setRun(data.run)
        setRefreshError("")
        const terminal = data.run.status === "complete" || data.run.status === "failed"
        const waitingOnResearch =
          data.run.contextState === "deferred" && !data.run.market && Boolean(data.run.parallelRunId)
        if (!terminal || waitingOnResearch) timer = setTimeout(tick, 2000)
      } catch {
        if (!stop) setRefreshError("The desk could not refresh this run.")
      }
    }

    timer = setTimeout(tick, 800)
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
    }
  }, [initial.id, initial.mode])

  const lead = run.leads.find((item) => item.id === selectedId) ?? run.leads[0]

  async function restart() {
    setRestarting(true)
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(run.brief),
      })
      const data = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !data.id) {
        setRefreshError(data.error || "A fresh run could not be started.")
        setRestarting(false)
        return
      }
      router.push(`/runs/${data.id}`)
    } catch {
      setRefreshError("A fresh run could not be started.")
      setRestarting(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {run.mode === "sample" ? "Sample dossier" : "Live qualification"} · {STATUS_LABEL[run.status]}
            {run.brief.parallelMode === "decisions" || run.parallelDecisionId
              ? " · Parallel Decisions"
              : " · Parallel Task"}
          </p>
          <h1 className="mt-1 break-words font-serif text-3xl sm:text-4xl">
            {run.also ? `${run.brief.supplierName} and ${run.also.supplierName}` : run.brief.supplierName}
          </h1>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <DownloadResults run={run} className="h-11 w-full sm:h-8 sm:w-auto" />
          {run.mode === "sample" ? (
            <Button className="h-11 w-full sm:h-8 sm:w-auto" variant="outline" nativeButton={false} render={<Link href="/qualify" />}>
              Start a live qualification
            </Button>
          ) : run.status === "complete" || run.status === "failed" ? (
            <Button className="h-11 w-full sm:h-8 sm:w-auto" variant="outline" onClick={restart} disabled={restarting}>
              {restarting ? "Starting…" : "Run this brief again"}
            </Button>
          ) : null}
        </div>
      </div>

      {run.mode === "sample" ? (
        <p className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm leading-relaxed">
          Illustrative dossier. The companies, quotes, and citations were written to show how a
          finished qualification reads. They are sample material. A live run replaces them with
          Exa, Firecrawl, and Parallel output.
        </p>
      ) : null}
      {run.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {run.error}
        </p>
      ) : null}
      {refreshError ? <p className="text-sm text-destructive">{refreshError}</p> : null}

      {run.trade ? <TradeVolume trade={run.trade} /> : null}
      <CompetitorMap
        competitors={run.competitors ?? []}
        brand={run.brief.supplierName}
        emptyMessage={
          run.status === "complete" ? "Nenhum concorrente foi apontado nesta busca." : undefined
        }
      />

      <section className="rounded-xl border border-border bg-card p-4">
        {run.brief.products || run.brief.buyerTypes || run.brief.exclusions ? (
        <>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Selling</p>
            <p className="mt-1 text-sm leading-relaxed">{run.brief.products}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {run.brief.originCountry}
              {run.brief.certifications ? ` · ${run.brief.certifications}` : ""}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Looking for</p>
            <p className="mt-1 text-sm leading-relaxed">{run.brief.buyerTypes}</p>
            <p className="mt-2 text-sm text-muted-foreground">{run.brief.markets}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Hold back</p>
            <p className="mt-1 text-sm leading-relaxed">
              {run.brief.exclusions || "No exclusions set."}
            </p>
            {run.brief.mustHaves ? (
              <p className="mt-2 text-sm text-muted-foreground">Must-have: {run.brief.mustHaves}</p>
            ) : null}
          </div>
        </div>
        {run.brief.differentiators ? (
          <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
            {run.brief.differentiators}
          </p>
        ) : null}
        {run.brief.instructions ? (
          <p className="mt-3 text-sm text-muted-foreground">Prompt note: {run.brief.instructions}</p>
        ) : null}
        </>
        ) : (
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Prompt · {run.brief.markets}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{run.brief.instructions}</p>
          </div>
        )}
      </section>

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">Prompts built from this brief</summary>
        <div className="mt-4">
          <PromptPreview brief={run.brief} bare />
        </div>
      </details>

      {run.leads.some((lead) => lead.score) ? <QualificationTable run={run} /> : null}

      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {visibleStages(run).map((item) => (
          <StageCard key={item.id} stage={item} />
        ))}
      </ol>

      {run.market ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-2xl">Mercado</h2>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Parallel</p>
          </div>
          <MarketEntry run={run} />
          <p className="mt-3 text-sm leading-relaxed">{run.market.outlook}</p>
          {run.market.buyerDynamics ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{run.market.buyerDynamics}</p>
          ) : null}
          {run.market.importSignals.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {run.market.importSignals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          ) : null}
          <CitationList items={run.market.citations} />
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h2 className="font-serif text-2xl">Leads</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {run.leads.length
              ? "Candidatas descobertas pelo Exa. Cada empresa mantém as evidências de categoria e operação no país que justificaram sua entrada."
              : "As empresas aparecem aqui à medida que o Exa conclui cada perfil de comprador."}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {run.leads.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id)
                    if (window.innerWidth < 1024) {
                      document.getElementById("dossier")?.scrollIntoView({ behavior: "smooth" })
                    }
                  }}
                  aria-pressed={lead?.id === item.id}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    lead?.id === item.id
                      ? "border-primary bg-card"
                      : "border-border bg-card/60 hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {String(index + 1).padStart(2, "0")} · {leadPlace(item)}
                        {item.market ? ` · for ${item.market}` : ""}
                      </p>
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {item.score?.headline ||
                          item.extraction?.summary ||
                          item.exa.summary ||
                          "Waiting for the rest of the pipeline."}
                      </p>
                    </div>
                    <ScoreMark
                      score={item.score?.total}
                      band={item.score?.band}
                      parallel={item.context?.icp}
                      openai={item.openai?.icp}
                    />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div id="dossier">
          {lead ? <Dossier lead={lead} /> : (
            <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              The shortlist is still empty.
            </div>
          )}
        </div>
      </section>

      <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">Activity</summary>
        <ul className="mt-3 space-y-2">
          {run.logs.map((line, index) => (
            <li key={`${line.at}-${index}`} className="grid gap-1 sm:grid-cols-[11rem_1fr]">
              <span className="text-xs text-muted-foreground">{formatWhen(line.at)}</span>
              <span>{line.message}</span>
            </li>
          ))}
        </ul>
      </details>

      <p className="text-xs text-muted-foreground">
        Started {formatWhen(run.createdAt)}.{" "}
        <Link href="/qualify" className="underline-offset-2 hover:underline">
          Start another qualification
        </Link>
      </p>
    </main>
  )
}

function visibleStages(run: Run): StageState[] {
  return run.stages.filter((item) => item.id !== "diligence")
}

function StageCard({ stage }: { stage: StageState }) {
  const meta = STAGE_META[stage.id]
  return (
    <li
      className={`rounded-xl border border-border bg-card p-3 ${
        stage.status === "running" ? "stage-running" : ""
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {meta.n} · {meta.source}
      </p>
      <p className="mt-1 font-medium">{meta.title}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{stage.status}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{stage.detail}</p>
    </li>
  )
}

function ScoreMark({
  score,
  band,
  parallel,
  openai,
}: {
  score?: number
  band?: Band
  parallel?: "high" | "medium" | "low"
  openai?: "high" | "medium" | "low"
}) {
  const judged = parallel || openai
  if (judged) {
    return (
      <span className="text-right">
        <span className="block font-serif text-2xl uppercase leading-none">{judged}</span>
        <span className="mt-1 inline-block text-[11px] uppercase tracking-wide text-muted-foreground">
          {parallel ? "Parallel" : "OpenAI"}
        </span>
      </span>
    )
  }
  if (score === undefined || !band) {
    return <span className="text-xs text-muted-foreground">···</span>
  }
  return (
    <span className="text-right">
      <span className="block font-serif text-2xl tabular-nums leading-none">{score}</span>
      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] band-${band}`}>
        {BAND_LABEL[band]}
      </span>
    </span>
  )
}

function Dossier({ lead }: { lead: Lead }) {
  const score = lead.score
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {leadPlace(lead)} · {lead.domain}
          </p>
          <h2 className="mt-1 break-words font-serif text-2xl sm:text-3xl">{lead.name}</h2>
          {isHttpUrl(lead.url) && !lead.url.includes(".example") ? (
            <a
              href={lead.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block max-w-full break-all text-sm underline-offset-2 hover:underline"
            >
              {lead.url.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{lead.domain}</p>
          )}
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            {lead.discoveryProfile ? <p>Perfil pesquisado: {lead.discoveryProfile}</p> : null}
            <p>
              Papel comercial: {lead.buyerType || lead.buyerRoleReported || "a investigar"}
              {lead.buyerRoleStatus ? ` · ${lead.buyerRoleStatus}` : " · desconhecido"}
            </p>
          </div>
        </div>
        {score ? <ScoreMark score={score.total} band={score.band} /> : null}
      </div>

      <FitPanel lead={lead} />
      <CommercePanel lead={lead} />
      <ActivityPanel lead={lead} />
      <p className="mt-3 text-sm text-muted-foreground">
        {lead.rag?.checked
          ? lead.rag.match
            ? `RAG · nome exato no índice${lead.rag.neighbor ? ` · ${lead.rag.neighbor}` : ""}. Perfil antigo, não é compra Kanechom/LQ. ${lead.rag.note}`
            : `RAG · não está no índice${lead.rag.neighbor ? ` · vizinho ${lead.rag.neighbor} é outra empresa` : ""}. Não copiar marcas nem compras do vizinho. ${lead.rag.note}`
          : lead.rag
            ? `RAG · não conferido. ${lead.rag.note} Sem evidência publicada o campo fica vazio — é proibido inventar.`
            : "RAG · ainda não conferido. Sem match no índice não inventar compra, contato ou marcas."}
      </p>
      {score?.disqualified ? (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
          {score.disqualifyReason}
        </p>
      ) : null}

      <p className="mt-4 font-serif text-xl leading-snug">
        {score?.nextAction || "The score appears after classification."}
      </p>

      {score ? (
        <ul className="mt-5 flex flex-col gap-3">
          {score.dimensions.map((dimension) => (
            <li key={dimension.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{dimension.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {dimension.points}/{dimension.max}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((dimension.points / dimension.max) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{dimension.rationale}</p>
              <EvidenceList items={dimension.evidence} />
            </li>
          ))}
        </ul>
      ) : null}

      {lead.extraction?.ok ? (
        <dl className="mt-6 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <Fact term="Role" value={lead.extraction.role} />
          <Fact term="Headquarters" value={lead.extraction.headquarters || lead.extraction.country} />
          <Fact term="Buys" value={lead.extraction.buys.join(", ")} />
          <Fact term="Sells" value={lead.extraction.sells.join(", ")} />
          <Fact term="Markets" value={lead.extraction.markets.join(", ")} />
          <Fact term="Certifications" value={lead.extraction.certifications.join(", ")} />
          <Fact
            term="Key person"
            value={[lead.extraction.keyPerson, lead.extraction.keyPersonRole].filter(Boolean).join(" · ")}
          />
          <Fact term="Latest hires" value={(lead.extraction.latestHires ?? []).join("; ")} />
          <Fact term="Email" value={lead.extraction.email ?? ""} href={mailtoHref(lead.extraction.email ?? "")} />
          <Fact term="Phone" value={lead.extraction.phone ?? ""} href={telHref(lead.extraction.phone ?? "")} />
          <Fact term="WhatsApp" value={lead.extraction.whatsapp ?? ""} href={telHref(lead.extraction.whatsapp ?? "")} />
          <Fact
            term="Website"
            value={lead.extraction.website ?? ""}
            href={lead.extraction.website && isHttpUrl(lead.extraction.website) ? lead.extraction.website : ""}
            external
          />
        </dl>
      ) : lead.extraction?.error ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Firecrawl did not return a profile. {lead.extraction.error} The score uses the Exa excerpt.
        </p>
      ) : null}

      {lead.context ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Parallel fit note</p>
          <p className="mt-2 text-sm leading-relaxed">{lead.context.fitNarrative}</p>
          {lead.context.knownSuppliers.length ? (
            <p className="mt-2 text-sm">
              <span className="text-muted-foreground">Known suppliers · </span>
              {lead.context.knownSuppliers.join(", ")}
            </p>
          ) : null}
          {lead.context.risks.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {lead.context.risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          ) : null}
          <CitationList items={lead.context.citations} />
        </div>
      ) : null}

      {lead.discoveryEvidence?.length ? (
        <section className="mt-4 border-t border-border pt-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Evidências de entrada · Etapa 1</p>
          <ul className="mt-2 space-y-2 text-sm">
            {lead.discoveryEvidence.map((item, index) => (
              <li key={`${item.url ?? "source"}-${index}`}>
                <p className="font-medium">{item.label}</p>
                <p className="mt-1 text-muted-foreground">“{item.quote}”</p>
                {item.url ? <a className="mt-1 inline-block underline underline-offset-2" href={item.url} target="_blank" rel="noreferrer">Abrir fonte</a> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {lead.exa.summary || lead.exa.text ? (
        <details className="mt-4 border-t border-border pt-3 text-sm">
          <summary className="cursor-pointer font-medium">Exa excerpt</summary>
          {lead.exa.summary ? <p className="mt-2 leading-relaxed">{lead.exa.summary}</p> : null}
          {lead.exa.highlights.map((highlight) => (
            <p key={highlight} className="mt-2 leading-relaxed text-muted-foreground">
              {highlight}
            </p>
          ))}
          {lead.extraction?.excerpt ? (
            <p className="mt-3 leading-relaxed text-muted-foreground">{lead.extraction.excerpt}</p>
          ) : null}
        </details>
      ) : null}
    </article>
  )
}

function QualificationTable({ run }: { run: Run }) {
  const rows = qualificationRows(run.leads, run.brief, run.also)
  const fromParallel = rows.some((row) => row.source === "parallel")
  const fromOpenAI = rows.some((row) => row.source === "openai")
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-serif text-2xl">{fromParallel || fromOpenAI ? "Best fit" : "Evidence checklist"}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {fromParallel
          ? "O Parallel refinou estes níveis e definiu o best fit final. High é fit de produto e canal. Só sobe com última compra, estoque, vendas, aduana ou reposição — feira ou vaga de compras, sozinha, não basta."
          : fromOpenAI
            ? "A OpenAI pontuou esta lista. O Parallel ainda não refinou. High é fit de produto e canal, e só se mantém quando há fatos de compra, aduana ou reposição."
            : "Nem a OpenAI nem o Parallel pontuaram esta lista. Os níveis abaixo são o checklist local. Sem última compra, estoque, vendas, aduana ou reposição a probabilidade de fit fica baixa."}
      </p>
      <ul className="mt-4 flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.company} className="rounded-lg border border-border px-3 py-3">
            <p className="font-medium">{row.company}</p>
            <p className="mt-1 text-sm text-muted-foreground">{row.country}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">ICP</dt>
                <dd className="mt-0.5"><Level level={row.level} /></dd>
              </div>
              {row.fits.map((fit) => (
                <div key={fit.supplier}>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{fit.supplier}</dt>
                  <dd className="mt-0.5"><Level level={fit.level} /></dd>
                </div>
              ))}
              <div className="col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Best fit</dt>
                <dd className="mt-0.5">
                  {row.bestFit}
                  {row.activityLive ? "" : row.activity ? " · sem atividade recente" : ""}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-muted-foreground">
              Probabilidade de fit · {row.fitLevel} · {row.fitIndex}/100
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{row.fitNote}</p>
            <p className="mt-3 text-sm text-muted-foreground">{row.activity}</p>
            <p className="mt-3 text-sm text-muted-foreground">{row.commerce}</p>
            <p className="mt-3 text-sm text-muted-foreground">{row.rationale}</p>
            <p className="mt-1 text-sm text-muted-foreground">{row.qualificationNeeded}</p>
          </li>
        ))}
      </ul>
      <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Company</th>
              <th className="py-2 pr-3 font-medium">Country</th>
              <th className="py-2 pr-3 font-medium">ICP</th>
              {rows[0]?.fits.map((fit) => (
                <th key={fit.supplier} className="py-2 pr-3 font-medium">
                  {fit.supplier}
                </th>
              ))}
              <th className="py-2 pr-3 font-medium">Best fit</th>
              <th className="py-2 pr-3 font-medium">Fit</th>
              <th className="py-2 pr-3 font-medium">Atividade</th>
              <th className="py-2 pr-3 font-medium">Comércio</th>
              <th className="py-2 font-medium">Still to confirm</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.company} className="border-b border-border/70 align-top">
                <td className="py-3 pr-3 font-medium">{row.company}</td>
                <td className="py-3 pr-3 text-muted-foreground">{row.country}</td>
                <td className="py-3 pr-3">
                  <Level level={row.level} />
                </td>
                {row.fits.map((fit) => (
                  <td key={fit.supplier} className="py-3 pr-3">
                    <Level level={fit.level} />
                  </td>
                ))}
                <td className="py-3 pr-3">
                  {row.bestFit}
                  {row.activityLive ? "" : " · sem atividade recente"}
                </td>
                <td className="py-3 pr-3 text-muted-foreground">
                  {row.fitLevel} · {row.fitIndex}/100
                </td>
                <td className="py-3 pr-3 text-muted-foreground">{row.activity}</td>
                <td className="py-3 pr-3 text-muted-foreground">{row.commerce}</td>
                <td className="py-3 text-muted-foreground">
                  <p>{row.rationale}</p>
                  <p className="mt-1">{row.qualificationNeeded}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Level({ level }: { level: IcpLevel }) {
  return <span className="uppercase tracking-wide">{level}</span>
}

function Fact({
  term,
  value,
  href = "",
  external = false,
}: {
  term: string
  value: string
  href?: string
  external?: boolean
}) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{term}</dt>
      <dd className="mt-0.5 break-words leading-relaxed">
        {href ? (
          <a
            href={href}
            className="underline-offset-2 hover:underline"
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}


function FitPanel({ lead }: { lead: Lead }) {
  const fit = lead.fit
  if (!fit) return null
  return (
    <div className="mt-4 rounded-lg border border-border px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Probabilidade de fit · índice {fit.index}/100
      </p>
      <p className="mt-2 text-sm font-medium uppercase">{fit.level}</p>
      <p className="mt-1 text-sm leading-relaxed">{fit.note}</p>
      <ul className="mt-3 grid gap-2 text-sm">
        {fit.facts.map((fact) => (
          <li key={fact.kind}>
            <span className="font-medium">{buyingKindLabel(fact.kind)}</span>
            <span className="text-muted-foreground">
              {fact.found ? ` · ${fact.recency}` : " · não publicado"}
            </span>
            {fact.quote ? <p className="mt-1 text-muted-foreground">{fact.quote}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CommercePanel({ lead }: { lead: Lead }) {
  const signals = lead.commerce?.signals ?? []
  const live = hasCommerceSignals(lead)
  const buy = hasCommercialBuyFacts(lead)
  return (
    <div className="mt-4 rounded-lg border border-border px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Sinais comerciais · compra e venda
      </p>
      {!lead.commerce ? (
        <p className="mt-2 text-sm text-muted-foreground">
          A busca de aduana, reposição, feira e vaga de compras ainda não rodou nesta ficha.
        </p>
      ) : live ? (
        <>
          <p className="mt-2 text-sm">
            {buy
              ? "Há reposição publicada na página. Uma menção isolada não confirma compra."
              : "Há feira, livro aberto, vaga de compras ou menção de aduana. Isso não desbloqueia best fit sozinho."}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {signals.map((signal) => (
              <li key={`${signal.kind}:${signal.url}`} className="text-sm leading-relaxed">
                <span className="font-medium">{commerceKindLabel(signal.kind)}</span>
                {signal.publishedAt ? (
                  <span className="text-muted-foreground"> · {signal.publishedAt.slice(0, 10)}</span>
                ) : null}
                <span> · </span>
                {isHttpUrl(signal.url) ? (
                  <a href={signal.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                    {signal.title}
                  </a>
                ) : (
                  signal.title
                )}
                {signal.quote ? <p className="mt-1 text-muted-foreground">{signal.quote}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-sm">
          Nenhuma aduana, reposição, feira, livro aberto ou vaga de compras nos últimos 24 meses. Sem isso o
          Fit fica preso ao ICP e à similaridade de produto — empresas assim quase não respondem.
        </p>
      )}
    </div>
  )
}

function ActivityPanel({ lead }: { lead: Lead }) {
  const signals = lead.activity?.signals ?? []
  const live = hasRecentActivity(lead)
  return (
    <div className="mt-4 rounded-lg border border-border px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Atividade pública</p>
      {!lead.activity ? (
        <p className="mt-2 text-sm text-muted-foreground">
          A busca de notícias, lançamentos e redes sociais ainda não rodou nesta ficha.
        </p>
      ) : live ? (
        <ul className="mt-2 flex flex-col gap-2">
          {signals.map((signal) => (
            <li key={`${signal.kind}:${signal.url}`} className="text-sm leading-relaxed">
              <span className="font-medium">{activityKindLabel(signal.kind)}</span>
              {signal.publishedAt ? (
                <span className="text-muted-foreground"> · {signal.publishedAt.slice(0, 10)}</span>
              ) : null}
              <span> · </span>
              {isHttpUrl(signal.url) ? (
                <a href={signal.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                  {signal.title}
                </a>
              ) : (
                signal.title
              )}
              {signal.quote ? <p className="mt-1 text-muted-foreground">{signal.quote}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm">
          Nenhuma notícia, lançamento, marca nova ou rede social nos últimos 24 meses. Não trate como best fit
          confirmado — empresas quietas quase não respondem.
        </p>
      )}
    </div>
  )
}


function EvidenceList({ items }: { items: Evidence[] }) {
  if (!items.length) return null
  return (
    <ul className="mt-1 space-y-1">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="text-xs leading-relaxed text-foreground/80">
          <span className="uppercase tracking-wide text-muted-foreground">{item.source} · {item.label}. </span>
          {item.url && isHttpUrl(item.url) ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {item.quote}
            </a>
          ) : (
            <span>{item.quote}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

function CitationList({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item}>
          {isHttpUrl(item) ? (
            <a href={item} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {item}
            </a>
          ) : (
            item
          )}
        </li>
      ))}
    </ul>
  )
}
