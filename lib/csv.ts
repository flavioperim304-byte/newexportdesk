import { formatKg, formatUsd, tradeForCountry, yearLabel } from "./comexstat-map"
import type { Brief, Run } from "./types"
import { qualificationRows } from "./qualify"

function cell(value: string): string {
  const text = value.replace(/\r?\n/g, " ").trim()
  if (/[",]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function csvFilename(brief: Brief): string {
  const slug = `${brief.supplierName}-${brief.markets}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `${slug || "results"}.csv`
}

function tradeCell(run: Pick<Run, "trade">, country: string): string {
  const series = tradeForCountry(run.trade, country)
  if (!run.trade || !series) return ""
  if (series.error) return series.error
  return series.years
    .map((year) => `${yearLabel(year, run.trade!.periodTo)} ${formatUsd(year.usdFob)} / ${formatKg(year.kg)}`)
    .join("; ")
}

export function resultsCsv(run: Pick<Run, "leads" | "brief" | "also" | "trade">): string {
  const leads = new Map(run.leads.map((lead) => [lead.name, lead]))
  const rows = qualificationRows(run.leads, run.brief, run.also)
  const header = [
    "Company",
    "Country",
    "Discovery profile",
    "Reported buyer role",
    "Buyer role status",
    "Confirmed buyer role",
    "ICP",
    "Best fit",
    "Activity",
    "Commerce",
    "Fit probability",
    "Fit evidence",
    "Email",
    "Phone",
    "WhatsApp",
    "Website",
    "Still to confirm",
    "RAG match",
    "Brazil exports",
  ]
  const lines = rows.map((row) => {
    const lead = leads.get(row.company)
    return [
      row.company,
      row.country,
      lead?.discoveryProfile || "",
      lead?.buyerRoleReported || "",
      lead?.buyerRoleStatus || "unknown",
      lead?.buyerType || "",
      row.level,
      row.bestFit,
      row.activity,
      row.commerce,
      `${row.fitLevel} ${row.fitIndex}/100`,
      row.fitNote,
      lead?.extraction?.email || "",
      lead?.extraction?.phone || "",
      lead?.extraction?.whatsapp || "",
      lead?.extraction?.website || lead?.url || "",
      row.qualificationNeeded,
      lead?.rag?.checked ? (lead.rag.match ? "yes" : "no") : "",
      tradeCell(run, row.country),
    ]
      .map(cell)
      .join(",")
  })
  return `\uFEFF${[header.join(","), ...lines].join("\n")}\n`
}
