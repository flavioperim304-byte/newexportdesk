"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PromptPreview } from "@/components/prompt-preview"
import { CADIVEU_COMPETITOR_BRIEF, EXAMPLE_BRIEF, KANECHOM_BRIEF, LQ_BRIEF, emptyBrief, findBriefConflicts, presentBrief } from "@/lib/example"
import { formatWhen } from "@/lib/format"
import { LEADS_PER_COUNTRY, targetCountries } from "@/lib/prompts"
import type { SavedPrompt } from "@/lib/prompt-library"
import type { Brief, KeyFlags } from "@/lib/types"

export function QualifyForm({
  initial,
  compact = false,
  onStarted,
}: {
  initial?: Brief
  compact?: boolean
  onStarted?: (id: string) => void
}) {
  const router = useRouter()
  const [brief, setBrief] = useState<Brief>(() => presentBrief(initial ?? emptyBrief()))
  const [flags, setFlags] = useState<KeyFlags | null>(null)
  const [saved, setSaved] = useState<SavedPrompt[]>([])
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    fetch("/api/keys")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { flags: KeyFlags } | null) => {
        if (data?.flags) setFlags(data.flags)
      })
      .catch(() => undefined)
    void loadSaved()
  }, [])



  async function loadSaved() {
    const response = await fetch("/api/prompts", { cache: "no-store" }).catch(() => null)
    if (!response?.ok) return
    const data = (await response.json()) as { prompts?: SavedPrompt[] }
    setSaved(data.prompts ?? [])
  }

  function set<K extends keyof Brief>(key: K, value: Brief[K]) {
    setBrief((current) => ({ ...current, [key]: value }))
  }

  function loadTemplate(template: Brief) {
    setBrief(presentBrief({ ...template, parallelMode: brief.parallelMode }))
  }

  async function launch(payload: Brief) {
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !data.id) {
        setError(data.error || "The qualification could not be started.")
        setPending(false)
        return
      }
      void loadSaved()
      if (onStarted) {
        onStarted(data.id)
        setPending(false)
        return
      }
      router.push(`/runs/${data.id}`)
    } catch {
      setError("The desk could not start the pipeline.")
      setPending(false)
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const conflicts = findBriefConflicts(brief)
    if (conflicts.length) {
      setError("Resolva os conflitos entre os campos estruturados e o prompt livre antes de executar.")
      return
    }
    void launch(presentBrief(brief))
  }

  async function savePrompt() {
    setError("")
    setNotice("")
    const response = await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(presentBrief(brief)),
    }).catch(() => null)
    const data = (await response?.json().catch(() => null)) as { error?: string } | null
    if (!response?.ok) {
      setError(data?.error || "The prompt could not be saved.")
      return
    }
    setNotice("Prompt saved. Use it on a later search, or leave it unused.")
    await loadSaved()
  }

  const exaReady = flags?.exa ?? false

  const usingDecisions = brief.parallelMode === "decisions"

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {compact ? null : <h1 className="font-serif text-3xl sm:text-4xl">Nova busca</h1>}
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Configure o ICP nos campos estruturados e use o prompt livre apenas como orientação complementar. Cada perfil de comprador é pesquisado separadamente. Task é o padrão; Decisions é opcional.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
          <Button type="button" variant="outline" className="h-11 w-full sm:h-8" onClick={() => loadTemplate(KANECHOM_BRIEF)}>
            Load Kanechom
          </Button>
          <Button type="button" variant="outline" className="h-11 w-full sm:h-8" onClick={() => loadTemplate(LQ_BRIEF)}>
            Load LQ Professional
          </Button>
          <Button type="button" variant="outline" className="h-11 w-full sm:h-8" onClick={() => loadTemplate(EXAMPLE_BRIEF)}>
            Load the coffee example
          </Button>
          <Button type="button" variant="outline" className="h-11 w-full sm:h-8" onClick={() => loadTemplate(CADIVEU_COMPETITOR_BRIEF)}>
            Load Cadiveu competitors
          </Button>
        </div>
      </div>

      <section className="grid gap-4 rounded-xl border border-border bg-card p-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Tipo de busca</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ChoiceButton
              selected={brief.searchKind !== "competitors"}
              title="Descoberta de compradores"
              hint="Busca candidatos por perfil de comprador, país e categoria."
              onClick={() => set("searchKind", "buyers")}
            />
            <ChoiceButton
              selected={brief.searchKind === "competitors"}
              title="Mapa de concorrentes"
              hint="Pesquisa separada de distribuidores da marca e concorrentes diretos."
              onClick={() => set("searchKind", "competitors")}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">API do Parallel</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ChoiceButton
              selected={!usingDecisions}
              title="Task"
              hint="Padrão. Pesquisa profunda (pro-fast)."
              onClick={() => set("parallelMode", "task")}
            />
            <ChoiceButton
              selected={usingDecisions}
              title="Decisions API"
              hint="Opt-in. POST /v1/decisions em modo fast."
              onClick={() => set("parallelMode", "decisions")}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {usingDecisions
              ? "Esta busca usa a Decisions API. As buscas anteriores desta mesa ficaram no Task."
              : "Task continua selecionado. Para usar a Decisions API, clique no botão ao lado."}
          </p>
        </div>
      </section>

      <div className={compact ? "grid gap-6" : "grid gap-6 lg:grid-cols-2"}>
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <h2 className="font-serif text-2xl">{brief.searchKind === "competitors" ? "Brand" : "Supplier"}</h2>
          <Field label={brief.searchKind === "competitors" ? "Brand" : "Trade name"} htmlFor="supplierName">
            <Input
              id="supplierName"
              value={brief.supplierName}
              onChange={(event) => set("supplierName", event.target.value)}
              className="h-11 sm:h-10"
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Origin country" htmlFor="originCountry">
              <Input
                id="originCountry"
                value={brief.originCountry}
                onChange={(event) => set("originCountry", event.target.value)}
                className="h-11 sm:h-10"
                required
              />
            </Field>
            <Field
              label="Website"
              htmlFor="website"
              hint={
                brief.searchKind === "competitors"
                  ? "Used to drop the brand’s own site."
                  : "Used to drop the supplier from the buyer list."
              }
            >
              <Input
                id="website"
                value={brief.website}
                onChange={(event) => set("website", event.target.value)}
                className="h-11 sm:h-10"
                placeholder="https://"
              />
            </Field>
          </div>
          {brief.searchKind === "competitors" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Countries to cover" htmlFor="countryCount" hint="Exa picks this many, unless you name them.">
                  <Input
                    id="countryCount"
                    type="number"
                    min={1}
                    max={8}
                    value={brief.countryCount ?? 5}
                    onChange={(event) => set("countryCount", Number(event.target.value))}
                    className="h-11 sm:h-10"
                  />
                </Field>
                <Field label="Exa" htmlFor="exaEffort" hint="Ultra is the thorough list. Deep is faster.">
                  <select
                    id="exaEffort"
                    value={brief.exaEffort ?? "ultra"}
                    onChange={(event) => set("exaEffort", event.target.value === "deep" ? "deep" : "ultra")}
                    className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base sm:h-10 md:text-sm"
                  >
                    <option value="ultra">Ultra</option>
                    <option value="deep">Deep</option>
                  </select>
                </Field>
              </div>
              <Field label="Countries to leave out" htmlFor="excludedMarkets" hint="Comma separated. Example: Ecuador, Colombia, India.">
                <Input
                  id="excludedMarkets"
                  value={brief.excludedMarkets ?? ""}
                  onChange={(event) => set("excludedMarkets", event.target.value)}
                  className="h-11 sm:h-10"
                />
              </Field>
              <Field label="Only these countries" htmlFor="markets" hint="Leave blank to let Exa choose the countries.">
                <Input
                  id="markets"
                  value={brief.markets}
                  onChange={(event) => set("markets", event.target.value)}
                  className="h-11 sm:h-10"
                />
              </Field>
            </>
          ) : (
            <Field
              label="Target markets"
              htmlFor="markets"
              hint={`Países separados por vírgula. Até ${LEADS_PER_COUNTRY} empresas por país e por perfil de comprador.`}
            >
              <Input
                id="markets"
                value={brief.markets}
                onChange={(event) => set("markets", event.target.value)}
                className="h-11 sm:h-10"
                required
              />
            </Field>
          )}
          <Field
            label="HS code"
            htmlFor="hsCode"
            hint="Brazil’s Comex Stat export volume to each country, last 3 years. 2, 4, 6, or 8 digits. Hair care is 3305."
          >
            <Input
              id="hsCode"
              value={brief.hsCode ?? ""}
              onChange={(event) => set("hsCode", event.target.value)}
              className="h-11 sm:h-10"
              inputMode="numeric"
              placeholder="3305"
            />
          </Field>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <h2 className="font-serif text-2xl">ICP estruturado</h2>
          <Field label="Products / categories" htmlFor="products" hint="Categorias e tipos de produtos relevantes para o comprador.">
            <Textarea id="products" value={brief.products} onChange={(event) => set("products", event.target.value)} className="min-h-20" />
          </Field>
          <Field label="Buyer types" htmlFor="buyerTypes" hint="Separe cada perfil por vírgula. Cada perfil terá sua própria busca e limite de 10 empresas por país.">
            <Textarea id="buyerTypes" value={brief.buyerTypes} onChange={(event) => set("buyerTypes", event.target.value)} className="min-h-20" />
          </Field>
          <Field label="Channel / supplier differentiators" htmlFor="differentiators" hint="Contexto para entender a proposta do fornecedor; não é prova de intenção de compra.">
            <Textarea id="differentiators" value={brief.differentiators} onChange={(event) => set("differentiators", event.target.value)} className="min-h-20" />
          </Field>
          <Field label="Commercial signals to prioritize" htmlFor="mustHaves" hint="Sinais para priorização e investigação posterior; não são bloqueios de entrada na descoberta.">
            <Textarea id="mustHaves" value={brief.mustHaves} onChange={(event) => set("mustHaves", event.target.value)} className="min-h-20" />
          </Field>
          <Field label="Exclusions" htmlFor="exclusions" hint="Critérios de exclusão explícitos que a descoberta deve respeitar.">
            <Textarea id="exclusions" value={brief.exclusions} onChange={(event) => set("exclusions", event.target.value)} className="min-h-20" />
          </Field>
          <Field label="Supplier certifications / credentials" htmlFor="certifications">
            <Input id="certifications" value={brief.certifications} onChange={(event) => set("certifications", event.target.value)} className="h-11 sm:h-10" />
          </Field>
          <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
            <input type="checkbox" checked={brief.anchorUse === true} onChange={(event) => set("anchorUse", event.target.checked)} className="mt-1" />
            <span><strong>Usar empresas âncoras como referência opcional</strong><span className="mt-1 block text-muted-foreground">Apenas para sugerir empresas semelhantes por perfil e canal. Não são requisito, não provam intenção e não geram pontuação automática.</span></span>
          </label>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <h2 className="font-serif text-2xl">Prompt livre complementar</h2>
          <Field
            label="Prompt"
            htmlFor="instructions"
            hint="Até 8.000 caracteres. Complementa a configuração estruturada; não pode alterar silenciosamente o ICP nem as exclusões."
          >
            <Textarea
              id="instructions"
              value={brief.instructions ?? ""}
              onChange={(event) => set("instructions", event.target.value)}
              className="min-h-48"
              placeholder="Ex.: priorize empresas com distribuição nacional, marcas profissionais no portfólio e atuação em salões."
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => void savePrompt()}>
              Save prompt
            </Button>
            <p className="text-sm text-muted-foreground">
              {targetCountries(brief).length === 0
                ? "Adicione os países para calcular o volume da busca."
                : `${targetCountries(brief).length} países × ${Math.max(1, brief.buyerTypes.split(/[,;\n]/).filter((item) => item.trim()).length)} perfis × ${LEADS_PER_COUNTRY} empresas = até ${targetCountries(brief).length * Math.max(1, brief.buyerTypes.split(/[,;\n]/).filter((item) => item.trim()).length) * LEADS_PER_COUNTRY} candidatas.`}
            </p>
          </div>
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
          {saved.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Saved prompts</p>
              {saved.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{formatWhen(item.createdAt)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 px-3 sm:h-8"
                    onClick={() => setBrief(presentBrief(item.brief))}
                  >
                    Use
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Saved prompts stay here. Use one on another search, or leave it unused.
            </p>
          )}
        </section>
      </div>

      {findBriefConflicts(brief).length > 0 ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">Conflitos entre ICP estruturado e prompt livre</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {findBriefConflicts(brief).map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="mt-2 text-muted-foreground">Edite um dos campos. A execução fica bloqueada enquanto esses conflitos explícitos existirem.</p>
        </div>
      ) : null}

      {compact ? (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Prompts for this input</summary>
          <div className="mt-4">
            <PromptPreview brief={brief} bare />
          </div>
        </details>
      ) : (
        <PromptPreview brief={brief} />
      )}

      {flags && !exaReady ? (
        <p className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm">
          Exa is not connected. Open Sources and add a key, or read the worked example on the desk.
          Firecrawl and Parallel can be added later. Those stages are skipped when their keys are missing, and the score says so.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-11 w-full px-4 sm:h-10 sm:w-auto" disabled={pending || flags === null || !exaReady}>
          {pending ? "Starting the pipeline…" : "Run the pipeline"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {usingDecisions
            ? "Esta rodada chama a Decisions API em modo fast. As demais buscas continuam no Task."
            : brief.searchKind === "competitors" && brief.exaEffort !== "deep"
              ? "Exa Ultra pode levar cerca de 15 minutos. Depois o Parallel Task confere os distribuidores."
              : "A descoberta exige identidade, operação comercial no país e evidência de atuação na categoria. O papel de importador/distribuidor será investigado depois; não é obrigatório provar importação nesta fase."}
        </p>
      </div>
    </form>
  )
}

function ChoiceButton({
  selected,
  title,
  hint,
  onClick,
}: {
  selected: boolean
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-3 text-left ${
        selected ? "border-primary bg-secondary" : "border-border bg-transparent"
      }`}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </button>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
