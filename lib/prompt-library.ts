import type { Brief } from "./types"

export type SavedPrompt = {
  id: string
  name: string
  createdAt: string
  brief: Brief
}

export function addSavedPrompt(
  list: SavedPrompt[],
  brief: Brief,
  createdAt: string,
  id: string
): SavedPrompt[] {
  const text = brief.instructions?.trim() ?? ""
  if (!text) return list
  const exists = list.some(
    (item) =>
      item.brief.supplierName === brief.supplierName &&
      item.brief.markets === brief.markets &&
      (item.brief.instructions?.trim() ?? "") === text
  )
  if (exists) return list
  const saved: SavedPrompt = {
    id,
    name: `${brief.supplierName} · ${brief.markets}`,
    createdAt,
    brief,
  }
  return [saved, ...list].slice(0, 40)
}
