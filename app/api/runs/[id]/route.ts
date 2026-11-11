import { connection } from "next/server"
import { ensurePump } from "@/lib/pipeline"
import { getRun } from "@/lib/store"
import { viewRun } from "@/lib/summary"

export const maxDuration = 60

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection()
  const { id } = await params
  await ensurePump(id)
  const run = await getRun(id)
  if (!run) return Response.json({ error: "This qualification is not on the desk." }, { status: 404 })
  return Response.json({ run: viewRun(run) })
}
