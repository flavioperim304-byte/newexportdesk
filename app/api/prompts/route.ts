import { connection } from "next/server"
import { presentBrief, validateBrief } from "@/lib/example"
import { listPrompts, savePrompt } from "@/lib/prompt-store"

export async function GET() {
  await connection()
  return Response.json({ prompts: listPrompts() })
}

export async function POST(request: Request) {
  await connection()
  const body = await request.json().catch(() => null)
  const parsed = validateBrief(body)
  if (!parsed.brief) {
    return Response.json({ error: parsed.error ?? "Invalid prompt." }, { status: 400 })
  }
  const saved = savePrompt(presentBrief(parsed.brief))
  if (!saved) {
    return Response.json({ error: "Write the prompt before saving it." }, { status: 400 })
  }
  return Response.json({ prompt: saved })
}
