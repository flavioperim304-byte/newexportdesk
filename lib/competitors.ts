import type { Brief, Competitor } from "./types"
import { splitList } from "./text"

const ALIAS_GROUPS = [
  ["brazil", "brasil", "brazilian", "brasileiro", "brasileira"],
  [
    "dominican republic",
    "republica dominicana",
    "republica domincana",
    "dominicana",
    "domincana",
  ],
  ["south africa", "sudafrica", "south african"],
  ["morocco", "moroccan", "maroc"],
  ["portugal", "portuguese"],
  ["costa rica", "costa rican"],
  ["colombia", "colombian"],
  ["bolivia", "bolivian"],
  ["uganda", "ugandan"],
  ["chile", "chilean"],
  ["italy", "italian"],
  ["spain", "spanish"],
  ["france", "french"],
]

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function tokensFor(country: string): string[] {
  const folded = fold(country)
  if (!folded) return []
  for (const group of ALIAS_GROUPS) {
    if (group.some((item) => folded === item || folded.includes(item) || item.includes(folded))) {
      return group
    }
  }
  return [folded]
}

function mentions(corpus: string, country: string): boolean {
  const hay = fold(corpus)
  if (!hay) return false
  return tokensFor(country).some((token) => token.length >= 4 && hay.includes(token))
}

function matchMarket(corpus: string, markets: string[]): string | undefined {
  const ranked = [...markets].sort((left, right) => fold(right).length - fold(left).length)
  return ranked.find((market) => mentions(corpus, market))
}

function sameCountry(left: string, right: string): boolean {
  return Boolean(left && right && (mentions(left, right) || mentions(right, left)))
}

function blocked(country: string, excluded: string[]): boolean {
  return excluded.some((item) => sameCountry(country, item))
}

/** Stamp each rival with a search-market country, never headquarters. */
export function localizeCompetitors(competitors: Competitor[], brief: Brief): Competitor[] {
  const markets = splitList(brief.markets)
  const excluded = splitList(brief.excludedMarkets ?? "")
  const origin = brief.originCountry.trim()
  const originIsMarket = origin ? markets.some((market) => sameCountry(market, origin)) : false
  const seen = new Set<string>()
  const localized: Competitor[] = []

  for (const raw of competitors) {
    const name = raw.name.trim()
    if (!name) continue
    const whyRelevant = (raw.whyRelevant ?? "").trim()
    const url = (raw.url ?? "").trim()
    const stated = (raw.country ?? "").trim()
    if (stated && blocked(stated, excluded)) continue
    const evidence = `${stated} ${whyRelevant}`

    let country = matchMarket(stated, markets) || matchMarket(evidence, markets) || ""
    if (!country && markets.length === 1 && !blocked(markets[0], excluded)) {
      country = markets[0]
    }
    if (!country) continue
    if (blocked(country, excluded)) continue
    if (origin && !originIsMarket && sameCountry(country, origin)) continue

    const key = `${fold(country)}|${fold(name)}|${url.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    localized.push({ name, country, whyRelevant, url })
  }

  return localized.slice(0, 6)
}
