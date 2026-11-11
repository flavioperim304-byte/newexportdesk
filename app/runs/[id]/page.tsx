import { Suspense } from "react"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { RunDesk } from "@/components/run-desk"
import { ensurePump } from "@/lib/pipeline"
import { getRun } from "@/lib/store"
import { viewRun } from "@/lib/summary"

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl px-4 py-10">
          <p className="text-sm text-muted-foreground">Opening the qualification…</p>
        </main>
      }
    >
      <RunLoader params={params} />
    </Suspense>
  )
}

async function RunLoader({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  await ensurePump(id)
  const run = await getRun(id)
  if (!run) notFound()
  return <RunDesk initial={viewRun(run)} />
}
