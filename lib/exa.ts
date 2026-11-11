import type { Brief, Evidence, Lead } from "./types"
import { ApiError, requestJson } from "./http"
import {
  buyerTypes,
  competitorQuery,
  competitorSystemPrompt,
  exaBackupQuery,
  exaQuery,
  exaSystemPrompt,
  LEADS_PER_COUNTRY,
  searchBrief,
  targetCountries,
} from "./prompts"
import { countryIsExcluded, fitsRequestedMarket } from "./score"
import { asString, domainOf, sameSite } from "./text"

const SOCIAL = /linkedin\.com|facebook\.com|instagram\.com|wikipedia\.org|youtube\.com/i

const COMPANY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    companies: {
      type: "array",
      maxItems: LEADS_PER_COUNTRY,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          website: { type: "string" },
          country: { type: "string" },
          role: { type: "string" },
          roleStatus: { type: "string", enum: ["confirmed", "indicated", "unknown"] },
          roleEvidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { url: { type: "string" }, excerpt: { type: "string" } },
              required: ["url", "excerpt"],
            },
          },
          why: { type: "string" },
          buyerSignals: { type: "array", items: { type: "string" } },
          categoryEvidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                url: { type: "string" },
                excerpt: { type: "string" },
                category: { type: "string" },
              },
              required: ["url", "excerpt", "category"],
            },
          },
          countryEvidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              properties: { url: { type: "string" }, excerpt: { type: "string" } },
              required: ["url", "excerpt"],
            },
          },
          brandPortfolio: { type: "string" },
          clientScale: { type: "string" },
        },
        required: ["name", "website", "country", "why", "roleStatus", "categoryEvidence", "countryEvidence"],
      },
    },
  },
  required: ["companies"],
}

function exaHeaders(key: string): HeadersInit {
  return { Authorization: `Bearer ${key}`, "x-api-key": key }
}

export type AgentCompany = {
  name: string
  website: string
  country: string
  why: string
  role: string
  roleStatus: "confirmed" | "indicated" | "unknown"
  roleEvidence: { url: string; excerpt: string }[]
  buyerSignals: string[]
  brandPortfolio: string
  clientScale: string
  categoryEvidence: { url: string; excerpt: string; category: string }[]
  countryEvidence: { url: string; excerpt: string }[]
}

function parseRoleStatus(value: unknown): AgentCompany["roleStatus"] {
  if (value === "confirmed" || value === "indicated") return value
  return "unknown"
}

export function companiesFromAgent(data: unknown): AgentCompany[] {
  if (!data || typeof data !== "object") return []
  const output = (data as { output?: { structured?: unknown } }).output
  const structured = output?.structured
  const record =
    structured && typeof structured === "object" && !Array.isArray(structured)
      ? (structured as Record<string, unknown>)
      : {}
  const list = Array.isArray(record.companies)
    ? record.companies
    : Array.isArray(structured)
      ? structured
      : []
  return list
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>
      const company: AgentCompany = {
        name: asString(row.name),
        website: asString(row.website || row.url),
        country: asString(row.country),
        why: asString(row.why),
        role: asString(row.role),
        roleStatus: parseRoleStatus(row.roleStatus),
        roleEvidence: Array.isArray(row.roleEvidence)
          ? row.roleEvidence.map((item) => {
              const evidence = (item ?? {}) as Record<string, unknown>
              return { url: asString(evidence.url), excerpt: asString(evidence.excerpt) }
            }).filter((item) => item.url && item.excerpt).slice(0, 3)
          : [],
        buyerSignals: Array.isArray(row.buyerSignals)
          ? row.buyerSignals.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 4)
          : [],
        brandPortfolio: asString(row.brandPortfolio),
        clientScale: asString(row.clientScale),
        categoryEvidence: Array.isArray(row.categoryEvidence)
          ? row.categoryEvidence.map((item) => {
              const evidence = (item ?? {}) as Record<string, unknown>
              return { url: asString(evidence.url), excerpt: asString(evidence.excerpt), category: asString(evidence.category) }
            }).filter((item) => item.url && item.excerpt && item.category).slice(0, 4)
          : [],
        countryEvidence: Array.isArray(row.countryEvidence)
          ? row.countryEvidence.map((item) => {
              const evidence = (item ?? {}) as Record<string, unknown>
              return { url: asString(evidence.url), excerpt: asString(evidence.excerpt) }
            }).filter((item) => item.url && item.excerpt).slice(0, 3)
          : [],
      }
      return company
    })
    .filter((item) => item.name && item.website)
}

export async function startAgentRun(
  key: string,
  query: string,
  websites: string[],
  options?: {
    effort?: string
    systemPrompt?: string
    schema?: unknown
    budget?: { maxCostDollars: number; maxDurationSeconds: number }
  }
): Promise<string> {
  const created = await requestJson("https://api.exa.ai/agent/runs", {
    method: "POST",
    timeoutMs: 40000,
    headers: exaHeaders(key),
    body: JSON.stringify({
      query,
      systemPrompt: options?.systemPrompt ?? exaSystemPrompt(),
      effort: options?.effort ?? "medium",
      outputSchema: options?.schema ?? COMPANY_SCHEMA,
      budget: options?.budget,
      input: websites.length
        ? { exclusion: websites.map((website) => ({ website })) }
        : undefined,
    }),
  })
  const id = asString((created as { id?: unknown } | null)?.id)
  if (!id) throw new ApiError("Exa Agent did not return a run id.", 502)
  return id
}

export async function pollAgentRun(
  key: string,
  id: string
): Promise<{ status: string; companies: AgentCompany[] }> {
  const latest = await requestJson(`https://api.exa.ai/agent/runs/${id}`, {
    method: "GET",
    timeoutMs: 20000,
    headers: exaHeaders(key),
  })
  const status = asString((latest as { status?: unknown } | null)?.status).toLowerCase() || "running"
  return { status, companies: status === "completed" ? companiesFromAgent(latest) : [] }
}

async function runAgentSearch(
  key: string,
  query: string,
  websites: string[],
  options?: {
    effort?: string
    systemPrompt?: string
    schema?: unknown
    budget?: { maxCostDollars: number; maxDurationSeconds: number }
    waitMs?: number
  }
): Promise<AgentCompany[]> {
  const id = await startAgentRun(key, query, websites, options)
  const deadline = Date.now() + (options?.waitMs ?? 4 * 60 * 1000)
  while (Date.now() < deadline) {
    const polled = await pollAgentRun(key, id)
    if (polled.status === "completed") return polled.companies
    if (polled.status === "failed" || polled.status === "cancelled") {
      throw new ApiError("Exa Agent search failed.", 502)
    }
    await new Promise((resolve) => setTimeout(resolve, 4000))
  }
  const minutes = Math.round((options?.waitMs ?? 4 * 60 * 1000) / 60000)
  throw new ApiError(`Exa Agent is still searching after ${minutes} minutes.`, 408)
}

function websiteUrl(value: string): string {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`
  return ""
}

function companyToLead(company: AgentCompany): Lead | null {
  const url = websiteUrl(company.website)
  if (!url) return null
  const domain = domainOf(url)
  if (!domain) return null
  const name = company.name.trim().slice(0, 80) || domain
  const validRoleEvidence = company.roleEvidence.filter((item) =>
    /^https?:\/\//i.test(item.url) && item.excerpt.trim().length >= 20,
  )
  const buyerRoleStatus = company.role && company.roleStatus === "confirmed" && validRoleEvidence.length > 0
    ? "confirmed"
    : company.role && company.roleStatus !== "unknown"
      ? "indicated"
      : "unknown"
  const discoveryEvidence: Evidence[] = [
    ...company.categoryEvidence.map((item) => ({ source: "exa" as const, label: `Categoria: ${item.category}`, quote: item.excerpt, url: item.url })),
    ...company.countryEvidence.map((item) => ({ source: "exa" as const, label: "Operação comercial no país", quote: item.excerpt, url: item.url })),
  ]
  return {
    id: crypto.randomUUID(),
    name,
    domain,
    url,
    country: company.country,
    seed: "exa",
    buyerType: buyerRoleStatus === "confirmed" ? company.role : undefined,
    buyerRoleReported: company.role || undefined,
    buyerRoleStatus,
    buyerRoleEvidence: validRoleEvidence.map((item) => ({ source: "exa" as const, label: "Evidência de papel comercial", quote: item.excerpt, url: item.url })),
    discoveryEvidence,
    exa: {
      title: name,
      url,
      domain,
      text: [company.brandPortfolio, company.clientScale].filter(Boolean).join(" "),
      highlights: [
        ...company.buyerSignals,
        ...discoveryEvidence.map((item) => `${item.label}: ${item.quote} (${item.url})`),
      ],
      summary: company.why,
    },
  }
}

function namesSupplier(name: string, suppliers: string[]): boolean {
  const folded = name.toLowerCase()
  return suppliers.some((supplier) => {
    const token = supplier.toLowerCase().trim()
    if (token.length < 4) return false
    return folded === token || folded.startsWith(`${token} `) || folded.includes(` ${token}`)
  })
}

export function acceptCompanies(
  companies: AgentCompany[],
  country: string,
  seen: Set<string>,
  websites: string[],
  buyerType = "",
  suppliers: string[] = []
): { leads: Lead[]; outside: number } {
  const local = new Set(seen)
  const leads: Lead[] = []
  let outside = 0
  for (const company of companies) {
    const lead = companyToLead(company)
    if (!lead) continue
    if (websites.some((site) => sameSite(site, lead.url))) continue
    if (namesSupplier(lead.name, suppliers)) continue
    const hasCategoryEvidence = company.categoryEvidence.some((item) =>
      /^https?:\/\//i.test(item.url) && item.excerpt.trim().length >= 20 && item.category.trim().length > 0,
    )
    const hasCountryEvidence = company.countryEvidence.some((item) =>
      /^https?:\/\//i.test(item.url) && item.excerpt.trim().length >= 20,
    )
    if (!hasCategoryEvidence || !hasCountryEvidence || !company.country.trim()) continue
    if (!fitsRequestedMarket(country, company.country, lead.domain)) {
      outside += 1
      continue
    }
    if (local.has(lead.domain)) continue
    local.add(lead.domain)
    lead.market = country
    lead.discoveryProfile = buyerType || undefined
    leads.push(lead)
  }
  const ownSites = leads.filter((lead) => !SOCIAL.test(lead.domain))
  const social = leads.filter((lead) => SOCIAL.test(lead.domain))
  return { leads: [...ownSites, ...social], outside }
}

async function searchCountry(
  brief: Brief,
  key: string,
  country: string,
  seen: Set<string>,
  websites: string[],
  suppliers: string[]
): Promise<{ leads: Lead[]; outside: number }> {
  const types = buyerTypes(brief)
  const wanted = types.length ? types : [""]
  const leads: Lead[] = []
  const found = new Set(seen)
  let outside = 0

  for (const type of wanted) {
    const primary = await runAgentSearch(
      key,
      type ? exaQuery(brief, country, type) : exaQuery(brief, country),
      websites,
      { systemPrompt: exaSystemPrompt(brief) },
    )
    const accepted = acceptCompanies(primary, country, found, websites, type, suppliers)
    outside += accepted.outside
    for (const lead of accepted.leads.slice(0, LEADS_PER_COUNTRY)) {
      found.add(lead.domain)
      leads.push(lead)
    }

    const countForType = leads.filter((lead) => lead.market === country && (lead.discoveryProfile ?? "") === type).length
    if (countForType < LEADS_PER_COUNTRY) {
      const backup = await runAgentSearch(
        key,
        exaBackupQuery(brief, country, type || undefined),
        websites,
        { systemPrompt: exaSystemPrompt(brief) },
      ).catch(() => [] as AgentCompany[])
      const more = acceptCompanies(backup, country, found, websites, type, suppliers)
      outside += more.outside
      for (const lead of more.leads.slice(0, LEADS_PER_COUNTRY - countForType)) {
        found.add(lead.domain)
        leads.push(lead)
      }
    }
  }
  return { leads, outside }
}

const COMPETITOR_SCHEMA = {
  ...COMPANY_SCHEMA,
  properties: {
    companies: {
      ...COMPANY_SCHEMA.properties.companies,
      maxItems: 24,
      items: {
        ...COMPANY_SCHEMA.properties.companies.items,
        required: ["name", "website", "country", "role", "why"],
      },
    },
  },
}

async function runDeepSearch(key: string, query: string): Promise<AgentCompany[]> {
  const data = await requestJson("https://api.exa.ai/search", {
    method: "POST",
    timeoutMs: 90000,
    headers: exaHeaders(key),
    body: JSON.stringify({
      query,
      type: "deep",
      numResults: 12,
      contents: { highlights: { maxCharacters: 1500 } },
    }),
  })
  const results = Array.isArray((data as { results?: unknown } | null)?.results)
    ? (data as { results: unknown[] }).results
    : []
  return results
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>
      const highlights = Array.isArray(row.highlights)
        ? row.highlights.filter((part): part is string => typeof part === "string")
        : []
      return {
        name: asString(row.title),
        website: asString(row.url),
        country: "",
        why: highlights[0] || asString(row.text),
        role: "",
        roleStatus: "unknown" as const,
        roleEvidence: [],
        buyerSignals: highlights.slice(0, 4),
        brandPortfolio: "",
        clientScale: "",
        categoryEvidence: [],
        countryEvidence: [],
      }
    })
    .filter((item) => item.name && item.website)
}

async function searchCompetitors(
  brief: Brief,
  key: string,
  websites: string[]
): Promise<{ leads: Lead[]; outside: number }> {
  const query = competitorQuery(brief)
  const companies =
    brief.exaEffort === "deep"
      ? await runDeepSearch(key, query)
      : await runAgentSearch(key, query, websites, {
          effort: "ultra",
          systemPrompt: competitorSystemPrompt(),
          schema: COMPETITOR_SCHEMA,
          budget: { maxCostDollars: 8, maxDurationSeconds: 900 },
          waitMs: 16 * 60 * 1000,
        })
  const seen = new Set<string>()
  const leads: Lead[] = []
  let outside = 0
  for (const company of companies) {
    const lead = companyToLead({ ...company, role: company.role })
    if (!lead) continue
    if (websites.some((site) => sameSite(site, lead.url))) continue
    if (countryIsExcluded(company.country, lead.domain, brief.excludedMarkets ?? "")) {
      outside += 1
      continue
    }
    if (seen.has(lead.domain)) continue
    seen.add(lead.domain)
    lead.market = company.country || "Unassigned"
    lead.buyerType = company.role
    leads.push(lead)
  }
  return { leads: leads.slice(0, 24), outside }
}

export async function searchLeads(
  brief: Brief,
  key: string,
  also?: Brief
): Promise<{ leads: Lead[]; outside: number }> {
  if (also) throw new Error("Run each supplier and ICP separately. Combined discovery can contaminate buyer profiles.")
  const queryBrief = searchBrief(brief)
  const websites = [brief.website].filter((site): site is string => Boolean(site))
  if (queryBrief.searchKind === "competitors") {
    return searchCompetitors(queryBrief, key, websites)
  }
  const suppliers = [brief.supplierName]
  const countries = targetCountries(queryBrief)
  const targets = countries.length ? countries : [queryBrief.markets.trim() || "the target market"]
  const seen = new Set<string>()
  const leads: Lead[] = []
  let outside = 0
  for (const country of targets) {
    const found = await searchCountry(queryBrief, key, country, seen, websites, suppliers)
    outside += found.outside
    for (const lead of found.leads) {
      seen.add(lead.domain)
      leads.push(lead)
    }
  }
  return { leads, outside }
}

export type SearchTask = { country: string; buyerType: string; backup: boolean }

export type ExaProgress = {
  tasks: SearchTask[]
  index: number
  jobId?: string
  outside: number
}

function buyerTasks(brief: Brief): SearchTask[] {
  const countries = targetCountries(brief)
  const markets = countries.length ? countries : [brief.markets.trim() || "the target market"]
  const types = buyerTypes(brief)
  const wanted = types.length ? types : [""]
  const tasks: SearchTask[] = []
  for (const country of markets) {
    for (const buyerType of wanted) tasks.push({ country, buyerType, backup: false })
  }
  return tasks
}

function withBackups(tasks: SearchTask[], index: number, task: SearchTask, leads: Lead[]): SearchTask[] {
  if (task.backup || !task.country) return tasks
  const rest = tasks.slice(index + 1)
  if (rest.some((item) => !item.backup && item.country === task.country)) return tasks
  const types = [...new Set(tasks
    .filter((item) => !item.backup && item.country === task.country)
    .map((item) => item.buyerType))]
    .filter((buyerType) => leads.filter((lead) => lead.market === task.country && (lead.discoveryProfile ?? "") === buyerType).length < LEADS_PER_COUNTRY)
  const backups = types.map((buyerType) => ({ country: task.country, buyerType, backup: true }))
  return [...tasks.slice(0, index + 1), ...backups, ...rest]
}

export async function advanceExa(
  brief: Brief,
  key: string,
  progress: ExaProgress | undefined,
  leads: Lead[],
  also?: Brief
): Promise<{
  progress: ExaProgress
  leads: Lead[]
  outside: number
  done: boolean
  pending: boolean
  error?: string
}> {
  if (also) throw new Error("Run each supplier and ICP separately. Combined discovery can contaminate buyer profiles.")
  const queryBrief = searchBrief(brief)
  const state: ExaProgress = progress ?? {
    tasks:
      queryBrief.searchKind === "competitors"
        ? [{ country: "", buyerType: "", backup: false }]
        : buyerTasks(queryBrief),
    index: 0,
    outside: 0,
  }
  const websites = [brief.website].filter((site): site is string => Boolean(site))
  const suppliers = [brief.supplierName]

  if (queryBrief.searchKind === "competitors" && queryBrief.exaEffort === "deep" && !state.jobId) {
    const companies = await runDeepSearch(key, competitorQuery(queryBrief))
    const merged = mergeCompanies(queryBrief, state.tasks[0], companies, leads, websites, suppliers)
    return {
      progress: { ...state, index: 1, outside: state.outside + merged.outside },
      leads: merged.leads,
      outside: state.outside + merged.outside,
      done: true,
      pending: false,
    }
  }

  if (state.jobId) {
    const task = state.tasks[state.index]
    const polled = await pollAgentRun(key, state.jobId)
    if (polled.status !== "completed" && polled.status !== "failed" && polled.status !== "cancelled") {
      return { progress: state, leads, outside: state.outside, done: false, pending: true }
    }
    if ((polled.status === "failed" || polled.status === "cancelled") && !task?.backup) {
      return {
        progress: { ...state, jobId: undefined },
        leads,
        outside: state.outside,
        done: false,
        pending: false,
        error: "Exa Agent search failed.",
      }
    }
    const merged =
      polled.status === "completed" && task
        ? mergeCompanies(queryBrief, task, polled.companies, leads, websites, suppliers)
        : { leads, outside: 0 }
    const nextLeads = merged.leads
    const outside = state.outside + merged.outside
    const tasks = task ? withBackups(state.tasks, state.index, task, nextLeads) : state.tasks
    const index = state.index + 1
    const done = index >= tasks.length
    return {
      progress: { tasks, index, outside },
      leads: nextLeads,
      outside,
      done,
      pending: false,
    }
  }

  if (state.index >= state.tasks.length) {
    return { progress: state, leads, outside: state.outside, done: true, pending: false }
  }
  const task = state.tasks[state.index]
  const planned = queryFor(queryBrief, task)
  const jobId = await startAgentRun(key, planned.query, websites, planned.options)
  return {
    progress: { ...state, jobId },
    leads,
    outside: state.outside,
    done: false,
    pending: true,
  }
}

function queryFor(
  brief: Brief,
  task: SearchTask
): {
  query: string
  options?: { effort?: string; systemPrompt?: string; schema?: unknown; budget?: { maxCostDollars: number; maxDurationSeconds: number } }
} {
  if (brief.searchKind === "competitors") {
    return {
      query: competitorQuery(brief),
      options: {
        effort: "ultra",
        systemPrompt: competitorSystemPrompt(),
        schema: COMPETITOR_SCHEMA,
        budget: { maxCostDollars: 8, maxDurationSeconds: 900 },
      },
    }
  }
  const query = task.backup
    ? exaBackupQuery(brief, task.country, task.buyerType || undefined)
    : task.buyerType
      ? exaQuery(brief, task.country, task.buyerType)
      : exaQuery(brief, task.country)
  return { query, options: { systemPrompt: exaSystemPrompt(brief) } }
}

function mergeCompanies(
  brief: Brief,
  task: SearchTask,
  companies: AgentCompany[],
  leads: Lead[],
  websites: string[],
  suppliers: string[]
): { leads: Lead[]; outside: number } {
  const seen = new Set(leads.map((lead) => lead.domain))
  if (brief.searchKind === "competitors") {
    const next = [...leads]
    let outside = 0
    for (const company of companies) {
      const lead = companyToLead({ ...company, role: company.role })
      if (!lead) continue
      if (websites.some((site) => sameSite(site, lead.url))) continue
      if (countryIsExcluded(company.country, lead.domain, brief.excludedMarkets ?? "")) {
        outside += 1
        continue
      }
      if (seen.has(lead.domain)) continue
      seen.add(lead.domain)
      lead.market = company.country || "Unassigned"
      lead.buyerType = company.role
      next.push(lead)
    }
    return { leads: next.slice(0, 24), outside }
  }
  const accepted = acceptCompanies(companies, task.country, seen, websites, task.buyerType, suppliers)
  const room = LEADS_PER_COUNTRY - leads.filter((lead) => lead.market === task.country && (lead.discoveryProfile ?? "") === task.buyerType).length
  return {
    leads: [...leads, ...accepted.leads.slice(0, Math.max(0, room))],
    outside: accepted.outside,
  }
}
