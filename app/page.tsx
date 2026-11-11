import { Dashboard } from "@/components/dashboard"
import { keyFlags } from "@/lib/keys"
import { boardRun, summarize } from "@/lib/summary"
import { getRun, listRuns } from "@/lib/store"

export const dynamic = "force-dynamic"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>
}) {
  const { run: requested } = await searchParams
  const runs = await listRuns()
  const latestLive = runs.find((run) => run.mode !== "sample")
  const selected = (requested && (await getRun(requested))) || latestLive || runs[0]
  const flags = keyFlags()
  const sourcesReady = [flags.exa, flags.firecrawl, flags.openai, flags.parallel].filter(Boolean)
    .length
  if (!selected) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <p className="text-sm text-muted-foreground">No qualification is on the desk yet.</p>
      </main>
    )
  }
  const live = runs.filter((run) => run.mode !== "sample")
  return (
    <Dashboard
      initialRun={boardRun(selected)}
      runs={live.map(boardRun)}
      summaries={runs.map(summarize)}
      sourcesReady={sourcesReady}
    />
  )
}
