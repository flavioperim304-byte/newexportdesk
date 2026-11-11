import { computeFitProbability } from "./fit-probability"
import { scoreLead } from "./score"
import type { Lead, Run } from "./types"

export function stampIntelligence(run: Run, lead: Lead) {
  lead.fit = computeFitProbability(run.brief, lead, run.competitors)
  lead.score = scoreLead(run.brief, lead, run.competitors)
  lead.alsoScore = run.also ? scoreLead(run.also, lead, run.competitors) : undefined
}
