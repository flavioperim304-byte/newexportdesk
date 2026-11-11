import { connection } from "next/server"
import { MAX_REFRESH_PER_PASS, refreshSavedLeads } from "@/lib/lead-refresh"

export const maxDuration = 60

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function POST() {
  await connection()
  return Response.json(await refreshSavedLeads(MAX_REFRESH_PER_PASS))
}

export async function GET(request: Request) {
  await connection()
  if (!cronAuthorized(request)) {
    return Response.json(
      { error: "Set CRON_SECRET and send Authorization: Bearer …, or POST from the Leads page." },
      { status: 401 }
    )
  }
  return Response.json(await refreshSavedLeads(MAX_REFRESH_PER_PASS))
}
