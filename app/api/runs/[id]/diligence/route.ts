import { connection } from "next/server"
import { startDiligence } from "@/lib/pipeline"
import { getRun } from "@/lib/store"
import { viewRun } from "@/lib/summary"

export const maxDuration = 60

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection()
  const { id } = await params
  const run = await getRun(id)
  if (!run) return Response.json({ error: "This qualification is not on the desk." }, { status: 404 })
  const reports = run.leads.map((lead) => ({
    leadId: lead.id,
    company: lead.name,
    reports: lead.diligence ?? [],
  }))
  return Response.json({ run: viewRun(run), reports })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection()
  const { id } = await params
  const body = (await request.json().catch(() => null)) as
    | { leadIds?: unknown; brands?: unknown; deepen?: unknown }
    | null
  const leadIds = Array.isArray(body?.leadIds) ? body.leadIds.map((item) => String(item)) : []
  const brands = Array.isArray(body?.brands) ? body.brands.map((item) => String(item)) : []
  const started = await startDiligence(id, leadIds, brands, { deepen: Boolean(body?.deepen) })
  if (started.error) return Response.json({ error: started.error }, { status: 400 })
  const run = await getRun(id)
  if (!run) return Response.json({ error: "This qualification is not on the desk." }, { status: 404 })
  return Response.json({ queued: started.queued, run: viewRun(run) })
}
