import { connection } from "next/server"
import { ragStatus } from "@/lib/rag"

export const maxDuration = 30

export async function GET() {
  await connection()
  return Response.json(await ragStatus())
}
