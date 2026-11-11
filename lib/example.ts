import { parseHsCode } from "./comexstat-map"
import { LEADS_PER_COUNTRY, isPromptOnly } from "./prompts"
import type { Brief } from "./types"

export const EXAMPLE_BRIEF: Brief = {
  supplierName: "Serra Alta Exportadora",
  originCountry: "Brazil",
  website: "https://serraalta.example",
  products:
    "green specialty arabica, 84+ SCA microlots, natural and pulped natural process",
  differentiators:
    "Farm-level lots from Mantiqueira de Minas, EUDR-ready lot traceability, container and microlot programs from the same harvest",
  certifications: "organic, Rainforest Alliance, BSCA",
  markets: "Germany, Netherlands, Japan",
  buyerTypes: "specialty importers, green coffee distributors, roasters that import",
  mustHaves: "imports or distributes green coffee",
  exclusions: "instant coffee, equipment manufacturers, cafes with no wholesale",
  leadCount: LEADS_PER_COUNTRY,
  hsCode: "0901",
}

export const HAIR_MARKETS = "Dominican Republic, South Africa, Chile"
export const HAIR_HS = "3305"

export const KANECHOM_BRIEF: Brief = {
  supplierName: "Kanechom",
  originCountry: "Brazil",
  website: "https://kanechom.com",
  products: "mass-market retail hair care: shampoo, conditioner, treatments, and styling",
  differentiators:
    "Brazilian hair care for mass-market and low-end retail. Skala is a major competitor, so a distributor that already carries Skala or a similar brand is a strong lead.",
  certifications: "GMP, ANVISA",
  markets: HAIR_MARKETS,
  buyerTypes: "mass-market distributor, wholesaler, trading company",
  mustHaves:
    "imports retail hair care, coverage in mass-market and low-end retail, experience importing an international brand",
  exclusions: "salons with no wholesale, equipment-only suppliers",
  instructions:
    "A strong signal is a distributor of competitor hair-care brands, especially Skala.",
  leadCount: LEADS_PER_COUNTRY,
  hsCode: HAIR_HS,
}

export const LQ_BRIEF: Brief = {
  supplierName: "LQ Professional",
  originCountry: "Brazil",
  website: "https://lqprofessional.com.br",
  products: "professional hair care for beauty salons, including straightening sets",
  differentiators:
    "Brazilian professional hair care for beauty salons, including straightening sets. The buyer should be able to train hairdressers.",
  certifications: "GMP, ANVISA",
  markets: HAIR_MARKETS,
  buyerTypes: "distributor, wholesaler, trading company",
  mustHaves:
    "distributes professional salon hair care, capacity to train hairdressers, experience importing an international brand",
  exclusions: "salons with no wholesale, equipment-only suppliers",
  instructions:
    "Look for distributors of professional salon brands and straightening systems, not mass-market grocery hair care.",
  leadCount: LEADS_PER_COUNTRY,
  hsCode: HAIR_HS,
}

export function emptyBrief(): Brief {
  return {
    supplierName: "",
    originCountry: "",
    website: "",
    products: "",
    differentiators: "",
    certifications: "",
    markets: "",
    buyerTypes: "",
    mustHaves: "",
    exclusions: "",
    instructions: "",
    leadCount: LEADS_PER_COUNTRY,
    searchKind: "buyers",
    exaEffort: "ultra",
    countryCount: 5,
    excludedMarkets: "",
    parallelMode: "task",
    anchorUse: false,
    hsCode: "",
  }
}

export const CADIVEU_COMPETITOR_BRIEF: Brief = {
  supplierName: "Cadiveu",
  originCountry: "Brazil",
  website: "https://cadiveu.com.br",
  products: "",
  differentiators: "",
  certifications: "",
  markets: "",
  buyerTypes: "",
  mustHaves: "",
  exclusions: "",
  instructions:
    "Find distributors that import the Brazilian brand Cadiveu. Cover 5 countries. Do not include Ecuador, Colombia, or India. In each country, name the Cadiveu distributor and the direct competitor distributors who import rival professional hair brands.",
  leadCount: LEADS_PER_COUNTRY,
  searchKind: "competitors",
  exaEffort: "ultra",
  countryCount: 5,
  excludedMarkets: "Ecuador, Colombia, India",
  hsCode: HAIR_HS,
}

function countryCountOf(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(count) || count < 1) return 5
  return Math.min(8, Math.round(count))
}

function parallelModeOf(value: unknown): "task" | "decisions" {
  return value === "decisions" ? "decisions" : "task"
}

function searchFields(
  brief: Brief
): Pick<Brief, "searchKind" | "exaEffort" | "countryCount" | "excludedMarkets" | "parallelMode" | "hsCode"> {
  return {
    searchKind: brief.searchKind === "competitors" ? "competitors" : "buyers",
    exaEffort: brief.exaEffort === "deep" ? "deep" : "ultra",
    countryCount: countryCountOf(brief.countryCount),
    excludedMarkets: brief.excludedMarkets?.trim() ?? "",
    parallelMode: parallelModeOf(brief.parallelMode),
    hsCode: brief.hsCode?.replace(/\D/g, "") ?? "",
  }
}

export function presentBrief(brief: Brief): Brief {
  return {
    ...brief,
    supplierName: brief.supplierName.trim(),
    originCountry: brief.originCountry.trim(),
    website: brief.website.trim(),
    products: brief.products.trim(),
    differentiators: brief.differentiators.trim(),
    certifications: brief.certifications.trim(),
    markets: brief.markets.trim(),
    buyerTypes: brief.buyerTypes.trim(),
    mustHaves: brief.mustHaves.trim(),
    exclusions: brief.exclusions.trim(),
    instructions: brief.instructions?.trim() ?? "",
    leadCount: LEADS_PER_COUNTRY,
    ...searchFields(brief),
  }
}

/** Conservative conflict checks: only flag explicit contradictions we can identify deterministically. */
export function findBriefConflicts(brief: Brief): string[] {
  const prompt = brief.instructions?.trim() ?? ""
  if (!prompt) return []
  const conflicts: string[] = []
  const buyerTypes = brief.buyerTypes.split(/[,;\n]/).map((value) => value.trim()).filter(Boolean)
  const exclusionDirectives = prompt.match(/(?:exclude|do not include|don't include|not looking for|não incluir|nao incluir|não procurar|nao procurar|excluir|sem)[^.;\n]*/gi) ?? []
  const onlyDirectives = prompt.match(/only (?:look for|search for|include|find)[^.;\n]*/gi) ?? []
  for (const type of buyerTypes) {
    const tokens = type.toLowerCase().split(/\s+/).filter((token) => token.length >= 6)
    const excluded = exclusionDirectives.some((directive) => {
      const value = directive.toLowerCase()
      return value.includes(type.toLowerCase()) || tokens.some((token) => value.includes(token))
    })
    const narrowedOut = onlyDirectives.some((directive) => {
      const value = directive.toLowerCase()
      return !value.includes(type.toLowerCase()) && !tokens.some((token) => value.includes(token))
    })
    if (excluded || narrowedOut) {
      conflicts.push(`O prompt livre restringe ou exclui “${type}”, mas esse perfil está selecionado em Buyer types.`)
    }
  }
  const exclusions = brief.exclusions.split(/[,;\n]/).map((value) => value.trim()).filter((value) => value.length >= 4)
  for (const item of exclusions) {
    const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    if (new RegExp(`\\b(include|accept|prioritize|look for|incluir|aceitar|priorizar|buscar)\\b.{0,80}\\b${escaped}\\b`, "i").test(prompt)) {
      conflicts.push(`O campo Do not include exclui “${item}”, mas o prompt livre pede para incluir ou priorizar esse perfil.`)
    }
  }
  return [...new Set(conflicts)]
}

export function validateBrief(input: unknown): { brief?: Brief; error?: string } {
  if (!input || typeof input !== "object") {
    return { error: "The brief was empty." }
  }
  const raw = input as Partial<Brief>
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")
  const brief: Brief = {
    supplierName: text(raw.supplierName),
    originCountry: text(raw.originCountry),
    website: text(raw.website),
    products: text(raw.products),
    differentiators: text(raw.differentiators),
    certifications: text(raw.certifications),
    markets: text(raw.markets),
    buyerTypes: text(raw.buyerTypes),
    mustHaves: text(raw.mustHaves),
    exclusions: text(raw.exclusions),
    instructions: text(raw.instructions).slice(0, 8000),
    leadCount: LEADS_PER_COUNTRY,
    searchKind: raw.searchKind === "competitors" ? "competitors" : "buyers",
    anchorUse: raw.anchorUse === true,
    exaEffort: raw.exaEffort === "deep" ? "deep" : "ultra",
    countryCount: countryCountOf(raw.countryCount),
    excludedMarkets: text(raw.excludedMarkets),
    parallelMode: parallelModeOf(raw.parallelMode),
    hsCode: text(raw.hsCode).replace(/\D/g, ""),
  }
  if (!brief.supplierName) return { error: "Name the supplier you are representing." }
  if (!brief.originCountry) return { error: "Add the supplier’s origin country." }
  if (brief.searchKind !== "competitors" && !brief.markets) {
    return { error: "Add at least one target market." }
  }
  if (!brief.products && !brief.instructions) {
    return { error: "Write the prompt for this search." }
  }
  if (!brief.buyerTypes && !brief.instructions) {
    return { error: "Write the prompt for this search." }
  }
  const conflicts = findBriefConflicts(brief)
  if (conflicts.length) return { error: `Resolve brief conflicts before running: ${conflicts.join(" ")}` }
  if (brief.website && !/^https?:\/\//i.test(brief.website)) {
    brief.website = `https://${brief.website}`
  }
  if (brief.hsCode) {
    const parsed = parseHsCode(brief.hsCode)
    if ("error" in parsed) return { error: parsed.error }
    brief.hsCode = parsed.digits
  }
  return { brief }
}
