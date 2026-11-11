import { connection } from "next/server"
import { keyFlags, saveKeys } from "@/lib/keys"

export async function GET() {
  await connection()
  return Response.json({ flags: keyFlags() })
}

export async function PUT(request: Request) {
  await connection()
  const body = (await request.json().catch(() => null)) as {
    exa?: string
    firecrawl?: string
    openai?: string
    parallel?: string
  } | null
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Missing key payload." }, { status: 400 })
  }
  const result = saveKeys({
    exa: typeof body.exa === "string" ? body.exa : undefined,
    firecrawl: typeof body.firecrawl === "string" ? body.firecrawl : undefined,
    openai: typeof body.openai === "string" ? body.openai : undefined,
    parallel: typeof body.parallel === "string" ? body.parallel : undefined,
  })
  return Response.json(result)
}
