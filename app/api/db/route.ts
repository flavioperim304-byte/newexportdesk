import { connection } from "next/server"
import { normalizeDatabaseUrl } from "@/lib/database-url"
import { envDatabaseUrl, saveDatabaseUrl } from "@/lib/keys"
import { postgresStatus, resetPostgresPool } from "@/lib/lead-db"

export const maxDuration = 30

export async function GET() {
  await connection()
  return Response.json(await postgresStatus())
}

export async function POST(request: Request) {
  await connection()
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null
  const raw = typeof body?.url === "string" ? body.url : ""
  if (envDatabaseUrl()) {
    resetPostgresPool()
    const status = await postgresStatus()
    return Response.json({
      ...status,
      error: status.error,
      note: "DATABASE_URL já está no ambiente deste processo (Render). Não precisa colar de novo aqui.",
    })
  }
  const parsed = normalizeDatabaseUrl(raw)
  if ("error" in parsed) {
    return Response.json({ postgres: false, leadCount: 0, runCount: 0, source: "none", error: parsed.error }, { status: 400 })
  }
  saveDatabaseUrl(parsed.url)
  resetPostgresPool()
  const status = await postgresStatus()
  if (status.error || !status.postgres) {
    saveDatabaseUrl("")
    resetPostgresPool()
    return Response.json(
      {
        postgres: false,
        leadCount: 0,
        runCount: 0,
        source: "none",
        error: status.error || "O Supabase não aceitou essa URI.",
        note: parsed.note,
      },
      { status: 400 }
    )
  }
  return Response.json({ ...status, note: parsed.note })
}

export async function DELETE() {
  await connection()
  if (envDatabaseUrl()) {
    return Response.json(
      { error: "DATABASE_URL está no ambiente. Apague a variável no Render para desconectar." },
      { status: 400 }
    )
  }
  saveDatabaseUrl("")
  resetPostgresPool()
  return Response.json(await postgresStatus())
}
