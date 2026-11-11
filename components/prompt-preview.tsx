import {
  buyerTypes,
  competitorQuery,
  competitorSystemPrompt,
  exaQuery,
  exaSystemPrompt,
  firecrawlPrompt,
  LEADS_PER_COUNTRY,
  openaiInstructions,
  parallelInstructions,
  targetCountries,
} from "@/lib/prompts"
import { decisionOutline } from "@/lib/parallel"
import type { Brief } from "@/lib/types"

export function PromptPreview({ brief, bare = false }: { brief: Brief; bare?: boolean }) {
  if (brief.searchKind === "competitors") {
    const effort = brief.exaEffort === "deep" ? "Exa Deep" : "Exa Ultra"
    return (
      <section className={bare ? "flex flex-col gap-4" : "flex flex-col gap-4 rounded-xl border border-border bg-card p-4"}>
        <div>
          <h2 className="font-serif text-2xl">Prompts</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {effort} looks for the brand’s distributor and the direct competitors in each country.
            Parallel then checks that map. Exa Ultra can take about 15 minutes.
          </p>
        </div>
        <PromptBlock
          label={effort}
          text={
            brief.exaEffort === "deep"
              ? competitorQuery(brief)
              : `${competitorSystemPrompt()}\n\n${competitorQuery(brief)}`
          }
        />
        <PromptBlock label="Firecrawl scrape + crawl" text={firecrawlPrompt(brief, "")} />
        <PromptBlock label="OpenAI" text={openaiInstructions(brief)} />
        <PromptBlock
          label={brief.parallelMode === "decisions" ? "Parallel · Decisions" : "Parallel · deep research"}
          text={brief.parallelMode === "decisions" ? decisionOutline(brief) : parallelInstructions(brief)}
        />
      </section>
    )
  }
  const countries = targetCountries(brief)
  const profileCount = Math.max(1, typesFor(brief).length)
  const reads = countries.length * profileCount * LEADS_PER_COUNTRY
  return (
    <section className={bare ? "flex flex-col gap-4" : "flex flex-col gap-4 rounded-xl border border-border bg-card p-4"}>
      <div>
        <h2 className="font-serif text-2xl">Prompts</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Os prompts são reconstruídos a partir dos campos estruturados. O Exa executa uma busca independente por país e perfil, com até {LEADS_PER_COUNTRY} empresas por perfil. Cada candidato precisa de evidência de categoria e operação local; Firecrawl só enriquece os aprovados.
          {countries.length > 0
            ? ` This run would read ${reads} ${reads === 1 ? "page" : "pages"}.`
            : ""}
        </p>
      </div>
      {countries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add at least one target market. A prompt appears here for each country.
        </p>
      ) : (
        countries.map((country) => (
          <article key={country} className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="font-serif text-xl">{country}</h3>
            {typesFor(brief).map((type) => (
              <PromptBlock
                key={`${country}:${type || "buyer"}`}
                label={type ? `Exa Agent · ${type}` : "Exa Agent · search"}
                text={`${exaSystemPrompt(brief)}\n\n${exaQuery(brief, country, type || undefined)}`}
              />
            ))}
            {typesFor(brief).map((type) => (
              <PromptBlock
                key={`${country}:firecrawl:${type || "buyer"}`}
                label={type ? `Firecrawl scrape + crawl · ${type}` : "Firecrawl scrape + crawl"}
                text={firecrawlPrompt(brief, country, type)}
              />
            ))}
          </article>
        ))
      )}
      <article className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="font-serif text-xl">All countries</h3>
        <PromptBlock label="OpenAI" text={openaiInstructions(brief)} />
        <PromptBlock
          label={brief.parallelMode === "decisions" ? "Parallel · Decisions" : "Parallel · deep research"}
          text={brief.parallelMode === "decisions" ? decisionOutline(brief) : parallelInstructions(brief)}
        />
      </article>
    </section>
  )
}

function typesFor(brief: Brief): string[] {
  const types = buyerTypes(brief)
  return types.length ? types : [""]
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-secondary px-3 py-2 font-sans text-sm leading-relaxed text-foreground">
        {text}
      </pre>
    </div>
  )
}
