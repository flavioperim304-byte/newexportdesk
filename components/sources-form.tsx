"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { DbStatus, KeyFlags, RagStatus } from "@/lib/types"


const EMPTY_FLAGS: KeyFlags = {
  exa: false,
  firecrawl: false,
  openai: false,
  parallel: false,
  exaEnv: false,
  firecrawlEnv: false,
  openaiEnv: false,
  parallelEnv: false,
  ragEnv: false,
}

export function SourcesForm() {
  const [flags, setFlags] = useState<KeyFlags>(EMPTY_FLAGS)
  const [exa, setExa] = useState("")
  const [firecrawl, setFirecrawl] = useState("")
  const [openai, setOpenai] = useState("")
  const [parallel, setParallel] = useState("")
  const [notes, setNotes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [db, setDb] = useState<DbStatus | null>(null)
  const [databaseUrl, setDatabaseUrl] = useState("")
  const [dbBusy, setDbBusy] = useState(false)
  const [dbNote, setDbNote] = useState("")
  const [rag, setRag] = useState<RagStatus | null>(null)
  const [ragError, setRagError] = useState("")

  async function refresh() {
    const response = await fetch("/api/keys")
    if (!response.ok) return
    const data = (await response.json()) as { flags: KeyFlags }
    setFlags(data.flags)
  }

  useEffect(() => {
    let cancelled = false
    fetch("/api/keys")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { flags: KeyFlags } | null) => {
        if (!cancelled && data?.flags) setFlags(data.flags)
      })
      .catch(() => undefined)
    fetch("/api/db")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: DbStatus | null) => {
        if (!cancelled && data) setDb(data)
      })
      .catch(() => undefined)
    fetch("/api/rag")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: RagStatus | null) => {
        if (cancelled) return
        if (data) setRag(data)
        else setRagError("O desk não conseguiu pingar o índice RAG.")
      })
      .catch(() => {
        if (!cancelled) setRagError("O desk não conseguiu pingar o índice RAG.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setNotes([])
    setSaved(false)
    const payload: Record<string, string> = {}
    if (exa.trim()) payload.exa = exa.trim()
    if (firecrawl.trim()) payload.firecrawl = firecrawl.trim()
    if (openai.trim()) payload.openai = openai.trim()
    if (parallel.trim()) payload.parallel = parallel.trim()
    if (Object.keys(payload).length === 0) {
      setError("Paste at least one key before saving.")
      setSaving(false)
      return
    }
    try {
      const response = await fetch("/api/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await response.json()) as { flags?: KeyFlags; notes?: string[]; error?: string }
      if (!response.ok) {
        setError(data.error || "The keys could not be saved.")
        return
      }
      if (data.flags) setFlags(data.flags)
      setNotes(data.notes ?? [])
      setExa("")
      setFirecrawl("")
      setOpenai("")
      setParallel("")
      setSaved(true)
    } catch {
      setError("The desk could not reach its own key store.")
    } finally {
      setSaving(false)
    }
  }

  async function clearKey(field: "exa" | "firecrawl" | "openai" | "parallel") {
    setError("")
    setSaved(false)
    const response = await fetch("/api/keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: "" }),
    })
    const data = (await response.json()) as { flags?: KeyFlags; notes?: string[] }
    if (data.flags) setFlags(data.flags)
    setNotes(data.notes ?? [])
    await refresh()
  }

  const ready = [flags.exa, flags.firecrawl, flags.openai, flags.parallel].filter(Boolean).length

  return (
    <form onSubmit={save} className="flex max-w-xl flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {ready} of 4 sources connected. Keys stay in <span className="font-medium text-foreground">data/secrets.json</span> on this machine and are sent only to Exa, Firecrawl, OpenAI, and Parallel.
      </p>
      <KeyField
        id="exa-key"
        label="Exa"
        hint="Agent in search mode. Finds 10 companies per country. Required for a live run."
        env={flags.exaEnv}
        saved={flags.exa}
        value={exa}
        onChange={setExa}
        onClear={() => clearKey("exa")}
      />
      <KeyField
        id="firecrawl-key"
        label="Firecrawl"
        hint="Scrape and crawl of the company site and the web. Key person, email, WhatsApp, phone, website, latest hires."
        env={flags.firecrawlEnv}
        saved={flags.firecrawl}
        value={firecrawl}
        onChange={setFirecrawl}
        onClear={() => clearKey("firecrawl")}
      />
      <KeyField
        id="openai-key"
        label="OpenAI"
        hint="Scores each company and names a preliminary best fit."
        env={flags.openaiEnv}
        saved={flags.openai}
        value={openai}
        onChange={setOpenai}
        onClear={() => clearKey("openai")}
      />
      <KeyField
        id="parallel-key"
        label="Parallel"
        hint="Deep research. Refines the OpenAI score, adds market context, and sets the final best fit."
        env={flags.parallelEnv}
        saved={flags.parallel}
        value={parallel}
        onChange={setParallel}
        onClear={() => clearKey("parallel")}
      />
      <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="database-url">Postgres (Supabase)</Label>
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {db?.postgres && !db.error ? "Connected" : db?.error ? "Error" : "File"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Opcional — a inteligência já roda sem isso. Grava só em{" "}
          <span className="font-medium text-foreground">desk_runs</span> e{" "}
          <span className="font-medium text-foreground">desk_leads</span>. Tabelas antigas deste
          projeto (<span className="font-medium text-foreground">Leads</span>, leads_master,
          leads_enriquecidas, tradeindata_*, trade_test_*) não são lidas nem copiadas. No
          Supabase o botão é <span className="font-medium text-foreground">Connect</span> no topo
          do projeto (não em Settings). Escolha{" "}
          <span className="font-medium text-foreground">Session pooler</span>, porta 5432. Troque{" "}
          <code>[YOUR-PASSWORD]</code>. Não cole a URL https://….supabase.co nem a anon key.
        </p>
        {db?.postgres && !db.error ? (
          <p className="text-sm">
            Conectado em {db.host || "Supabase"}
            {db.port ? `:${db.port}` : ""} · {db.leadCount} lead{db.leadCount === 1 ? "" : "s"} em{" "}
            {db.runCount} busca{db.runCount === 1 ? "" : "s"}
            {db.envLocked ? " · variável do Render" : " · gravado neste disco"}
            {db.tables?.length ? ` · ${db.tables.join(", ")}` : ""}.
          </p>
        ) : db?.error ? (
          <p className="text-sm text-destructive">{db.error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ainda no arquivo local. Cole a URI Session pooler abaixo e clique Conectar.
          </p>
        )}
        {db?.envLocked ? (
          <p className="text-sm">DATABASE_URL já está no ambiente deste serviço. Não precisa colar de novo.</p>
        ) : (
          <>
            <Input
              id="database-url"
              type="password"
              autoComplete="off"
              value={databaseUrl}
              placeholder="postgresql://postgres.REFERENCIA:SENHA@aws-…pooler.supabase.com:5432/postgres"
              onChange={(event) => setDatabaseUrl(event.target.value)}
              className="h-11 font-mono text-xs sm:h-10"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-11 sm:h-10"
                disabled={dbBusy || !databaseUrl.trim()}
                onClick={async () => {
                  setDbBusy(true)
                  setDbNote("")
                  try {
                    const response = await fetch("/api/db", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ url: databaseUrl.trim() }),
                    })
                    const data = (await response.json()) as DbStatus & { error?: string; note?: string }
                    setDb(data)
                    if (!response.ok || data.error) {
                      setDbNote(data.error || "O Supabase não aceitou essa URI.")
                      return
                    }
                    setDatabaseUrl("")
                    setDbNote(
                      data.note ||
                        "Supabase conectado. As próximas buscas gravam em desk_runs e desk_leads. Tabelas antigas não entram."
                    )
                  } catch {
                    setDbNote("O desk não conseguiu testar o banco.")
                  } finally {
                    setDbBusy(false)
                  }
                }}
              >
                {dbBusy ? "Testando…" : "Conectar"}
              </Button>
              {db?.source === "file" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 sm:h-10"
                  disabled={dbBusy}
                  onClick={async () => {
                    setDbBusy(true)
                    try {
                      const response = await fetch("/api/db", { method: "DELETE" })
                      const data = (await response.json()) as DbStatus
                      setDb(data)
                      setDbNote("Supabase desconectado. Leads voltam para data/runs.json.")
                    } finally {
                      setDbBusy(false)
                    }
                  }}
                >
                  Desconectar
                </Button>
              ) : null}
            </div>
          </>
        )}
        {dbNote ? <p className="text-sm text-muted-foreground">{dbNote}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <Label>RAG (Chroma)</Label>
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {rag?.reachable
              ? "Connected"
              : rag && !rag.configured
                ? "Missing"
                : ragError || (rag && !rag.reachable)
                  ? "Unreachable"
                  : rag
                    ? "Missing"
                    : "Checking"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Índice Python em{" "}
          <a
            href="https://exportsales2.onrender.com"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-2 hover:underline"
          >
            exportsales2.onrender.com
          </a>
          . O Node só chama se <span className="font-medium text-foreground">RAG_API_URL</span> estiver
          no Environment do serviço <span className="font-medium text-foreground">exportsales</span>{" "}
          (não no Python). Match é nome exato já no CSV do dashboard. Vizinho é outra empresa — nunca
          compra Kanechom/LQ. Sem match o modelo deixa o campo vazio.
        </p>
        {!rag && !ragError ? (
          <p className="text-sm text-muted-foreground">Conferindo o índice…</p>
        ) : ragError ? (
          <p className="text-sm text-destructive">{ragError}</p>
        ) : rag?.reachable ? (
          <p className="text-sm">
            Python no ar · {rag.chromaCount ?? 0} perfil{rag.chromaCount === 1 ? "" : "s"} no Chroma
            {rag.chromaPath ? ` · ${rag.chromaPath}` : ""}. {rag.note}
          </p>
        ) : (
          <p className="text-sm">{rag?.note}</p>
        )}
        {flags.ragEnv && !rag?.reachable ? (
          <p className="text-sm text-muted-foreground">
            RAG_API_URL está neste processo, mas o ping ao Python falhou.
          </p>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="text-sm">Keys saved. A new qualification will use them.</p> : null}
      {notes.map((note) => (
        <p key={note} className="text-sm text-muted-foreground">
          {note}
        </p>
      ))}
      <Button type="submit" disabled={saving} className="h-11 w-full px-4 sm:h-10 sm:w-fit">
        {saving ? "Saving…" : "Save keys"}
      </Button>
    </form>
  )
}

function KeyField({
  id,
  label,
  hint,
  env,
  saved,
  value,
  onChange,
  onClear,
}: {
  id: string
  label: string
  hint: string
  env: boolean
  saved: boolean
  value: string
  onChange: (value: string) => void
  onClear: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {env || saved ? "Connected" : "Not connected"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {env ? (
        <p className="text-sm">Using the environment variable for this source.</p>
      ) : (
        <>
          <Input
            id={id}
            type="password"
            autoComplete="off"
            value={value}
            placeholder={saved ? "Key saved — paste a replacement" : "Paste API key"}
            onChange={(event) => onChange(event.target.value)}
            className="h-11 sm:h-10"
          />
          {saved ? (
            <button
              type="button"
              onClick={onClear}
              className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Remove saved key
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}
