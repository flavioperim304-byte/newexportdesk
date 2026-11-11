import { connection } from "next/server"
import { companyIdFor } from "@/lib/memory"
import { listLeadEvents } from "@/lib/store"

export const maxDuration = 20

export async function GET(request: Request) {
  await connection()
  const url = new URL(request.url)
  const companyId =
    url.searchParams.get("companyId")?.trim() ||
    companyIdFor({
      name: url.searchParams.get("name") || "",
      domain: url.searchParams.get("domain") || "",
      url: url.searchParams.get("url") || "",
      country: url.searchParams.get("country") || "",
      market: url.searchParams.get("market") || "",
    })
  if (!companyId || companyId === "n:|unpublished") {
    return Response.json({ error: "Falta a empresa." }, { status: 400 })
  }
  const events = await listLeadEvents(companyId)
  return Response.json({ companyId, events })
}
