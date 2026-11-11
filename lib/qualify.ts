import { activityLine, hasRecentActivity } from "./activity"
import { commerceLine } from "./commerce"
import { computeFitProbability, fitProbabilityLine, hasPublishedBuyFacts } from "./fit-probability"
import type { Brief, FitJudgment, Lead, LeadScore } from "./types"

export type IcpLevel = "high" | "medium" | "low"

export type QualificationRow = {
  company: string
  country: string
  level: IcpLevel
  rationale: string
  fits: { supplier: string; level: IcpLevel }[]
  bestFit: string
  qualificationNeeded: string
  source: "parallel" | "openai" | "checklist"
  fromParallel: boolean
  activity: string
  activityLive: boolean
  commerce: string
  fitLevel: IcpLevel
  fitIndex: number
  fitNote: string
}

export function icpLevel(score: LeadScore | undefined): IcpLevel {
  if (!score || score.disqualified) return "low"
  if (score.band === "best_fit" || score.band === "strong") return "high"
  if (score.band === "possible") return "medium"
  return "low"
}

function needed(score: LeadScore | undefined): string {
  if (!score) return "Collect page evidence before outreach."
  if (score.disqualified) return score.disqualifyReason || "Disqualified on the current evidence."
  const thin = (score.dimensions ?? []).filter((item) => item.max > 0 && item.points / item.max <= 0.45)
  if (thin.length === 0) {
    return "Confirm room for another brand, competing-brand restrictions, and an initial order."
  }
  return `Confirm ${thin
    .slice(0, 3)
    .map((item) => item.label.toLowerCase())
    .join(", ")} before treating this as a buyer.`
}

function fitTotal(score: LeadScore | undefined): number {
  if (!score || score.disqualified) return -1
  return score.total
}


function fromJudgment(
  lead: Lead,
  judgment: FitJudgment,
  source: "parallel" | "openai",
  rationale: string,
  brief: Brief
): QualificationRow {
  const fit = lead.fit ?? computeFitProbability(brief, lead)
  return {
    company: lead.name,
    country: lead.market || lead.extraction?.country || lead.country || "",
    level: judgment.icp,
    rationale: rationale || "No rationale was written.",
    fits: judgment.supplierFits,
    bestFit: judgment.bestFit || "unknown",
    qualificationNeeded: judgment.qualificationNeeded || "Nothing further was listed.",
    source,
    fromParallel: source === "parallel",
    activity: activityLine(lead),
    activityLive: hasRecentActivity(lead),
    commerce: commerceLine(lead),
    fitLevel: fit.level,
    fitIndex: fit.index,
    fitNote: fitProbabilityLine(fit),
  }
}

function hasPublishedBuyIntent(lead: Lead): boolean {
  return hasPublishedBuyFacts(lead)
}

function guardFit(lead: Lead, row: QualificationRow): QualificationRow {
  let next = row
  const notes: string[] = []
  if (lead.activity && !hasRecentActivity(lead)) {
    next = {
      ...next,
      level: next.level === "high" ? "medium" : next.level,
      activityLive: false,
    }
    notes.push(
      "No recent news, product launch, new brand, or social activity was found.",
      "Do not treat this as a confirmed best fit until a current buyer is named."
    )
  }
  if (next.fitLevel === "low" && row.level === "high") {
    next = {
      ...next,
      level: next.level === "high" ? "medium" : next.level,
    }
    notes.push(
      "Last purchase, stock, and sales were not published.",
      "Fit probability stays medium until one of those facts is found."
    )
  }
  if (!hasPublishedBuyIntent(lead) && next.bestFit && next.bestFit !== "neither") {
    notes.push(
      "Aderência de ICP/canal não comprova intenção de compra. Mantenha o Best Fit baseado na compatibilidade comercial e investigue compras, estoque, vendas e reposição na etapa de enriquecimento. Feira, vaga ou menção de marca, sozinha, não comprova intenção."
    )
  }
  if (notes.length) {
    next = {
      ...next,
      qualificationNeeded: [...notes, next.qualificationNeeded].join(" "),
    }
  }
  return next
}

export function qualificationRows(leads: Lead[], brief: Brief, also?: Brief): QualificationRow[] {
  return leads.map((lead) => {
    const parallelFits = lead.context?.supplierFits ?? []
    if (lead.context?.icp && parallelFits.length > 0) {
      return guardFit(
        lead,
        fromJudgment(
          lead,
          {
            icp: lead.context.icp,
            supplierFits: parallelFits,
            bestFit: lead.context.bestFit || "unknown",
            qualificationNeeded:
              lead.context.qualificationNeeded ||
              "Parallel did not say what still needs confirmation.",
            rationale: lead.context.fitNarrative || "Parallel did not write a rationale.",
          },
          "parallel",
          lead.context.fitNarrative || "Parallel did not write a rationale.",
          brief
        )
      )
    }
    if (lead.openai && (lead.openai.supplierFits?.length ?? 0) > 0) {
      return guardFit(lead, fromJudgment(lead, lead.openai, "openai", lead.openai.rationale, brief))
    }
    const fits = [
      { supplier: brief.supplierName, level: icpLevel(lead.score), total: fitTotal(lead.score) },
    ]
    if (also) {
      fits.push({
        supplier: also.supplierName,
        level: icpLevel(lead.alsoScore),
        total: fitTotal(lead.alsoScore),
      })
    }
    const open = fits.filter((fit) => fit.level !== "low")
    const ranked = [...fits].sort((left, right) => right.total - left.total)
    const best = ranked[0]
    const tied =
      also &&
      fits.length === 2 &&
      fits[0].level === fits[1].level &&
      fits[0].level !== "low" &&
      Math.abs(fits[0].total - fits[1].total) <= 5
    const bestFit = !best
      ? "unknown"
      : tied
        ? "both"
        : best.level === "low"
          ? (lead.score?.disqualified ? "neither" : "unknown")
          : best.supplier
    const level: IcpLevel = open.some((fit) => fit.level === "high")
      ? "high"
      : open.some((fit) => fit.level === "medium")
        ? "medium"
        : "low"
    const rationale = [lead.score?.headline, also ? lead.alsoScore?.headline : ""]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 280)
    const fit = lead.fit ?? computeFitProbability(brief, lead)
      return guardFit(lead, {
      company: lead.name,
      country: lead.market || lead.extraction?.country || lead.country || "",
      level,
      rationale: rationale || lead.exa?.summary || "No fit statement yet.",
      fits: fits.map(({ supplier, level: fitLevel }) => ({ supplier, level: fitLevel })),
      bestFit,
      qualificationNeeded: needed(open[0] ? (open[0].supplier === brief.supplierName ? lead.score : lead.alsoScore) : lead.score),
      source: "checklist",
      fromParallel: false,
      activity: activityLine(lead),
      activityLive: hasRecentActivity(lead),
      commerce: commerceLine(lead),
      fitLevel: fit.level,
      fitIndex: fit.index,
      fitNote: fitProbabilityLine(fit),
    })
  })
}
