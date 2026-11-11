import { connection } from "next/server"
import { presentBrief, validateBrief } from "@/lib/example"

export const maxDuration = 60
import { getKeys } from "@/lib/keys"
import { startRun } from "@/lib/pipeline"
import { savePrompt } from "@/lib/prompt-store"

export async function POST(request: Request) {
  await connection()
  const body = await request.json().catch(() => null)
  const parsed = validateBrief(body)
  if (!parsed.brief) {
    return Response.json({ error: parsed.error ?? "Invalid brief." }, { status: 400 })
  }
  if (!getKeys().exa) {
    return Response.json(
      {
        error:
          "Add an Exa API key under Sources before a live run. The worked example on the desk is available without keys.",
      },
      { status: 400 }
    )
  }
  const brief = presentBrief(parsed.brief)
  try {
    savePrompt(brief)
  } catch {
    // Netlify cannot write data/prompts.json. The run still starts.
  }
  const run = await startRun(brief)
  return Response.json({ id: run.id })
}
