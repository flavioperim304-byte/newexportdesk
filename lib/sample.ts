import { EXAMPLE_BRIEF } from "./example"
import { buildReport } from "./diligence"
import { stampIntelligence } from "./intelligence"
import { SAMPLE_RUN_ID } from "./ids"
import { compareLeads, scoreLead } from "./score"
import type { Competitor, Lead, Run, StageState } from "./types"

const WHEN = "2026-10-27T15:00:00.000Z"

function hit(partial: {
  title: string
  url: string
  domain: string
  text: string
  highlights: string[]
  summary: string
}): Lead["exa"] {
  return { publishedDate: "2026-03-12", ...partial }
}

function leads(): Lead[] {
  const nordlicht: Lead = {
    id: "lead-nordlicht",
    name: "Nordlicht Kaffeeimport",
    domain: "nordlicht.example",
    url: "https://nordlicht.example/",
    country: "Germany",
    exa: hit({
      title: "Nordlicht Kaffeeimport",
      url: "https://nordlicht.example/",
      domain: "nordlicht.example",
      summary:
        "Hamburg specialty importer of green arabica. The book includes Brazilian naturals and organic microlots for roasters in Germany and the Netherlands.",
      highlights: [
        "We import green arabica, including Brazilian natural microlots scored for the specialty book.",
        "Organic and Rainforest Alliance lots are listed beside the conventional container program.",
      ],
      text: "Nordlicht Kaffeeimport is a Hamburg importer of green coffee. The company imports green arabica for roasters in Germany and the Netherlands, with a published interest in Brazilian natural microlots and organic certified lots. Buyers can request a container program or smaller microlot allocations from the same harvest. The office is in Hamburg and the warehouse releases into Germany and the Netherlands. Rainforest Alliance and organic paperwork is requested before the first shipment.",
    }),
    extraction: {
      ok: true,
      companyName: "Nordlicht Kaffeeimport",
      headquarters: "Hamburg, Germany",
      country: "Germany",
      role: "Specialty importer",
      buys: [
        "green arabica",
        "Brazilian natural microlots",
        "organic certified arabica",
      ],
      sells: ["green coffee allocations to German and Dutch roasters"],
      markets: ["Germany", "Netherlands"],
      certifications: ["Organic", "Rainforest Alliance"],
      buyerSignals: [
        "We import green arabica, including Brazilian natural microlots.",
        "Container program or smaller microlot allocations from the same harvest.",
      ],
      lastPurchase: "Received a Brazilian natural shipment in August 2026.",
      stock: "Microlot inventory is in stock in Hamburg for the autumn book.",
      brandPerformance: "Brazilian naturals are listed as a growing part of the specialty book.",
      salesNote: "Container program sales grew in 2026 versus the previous harvest.",
      competitorMoves: ["A rival Hamburg importer signed an exclusive Ethiopian line."],
      summary:
        "Hamburg importer of green arabica. Imports Brazilian natural microlots and organic lots for roasters in Germany and the Netherlands.",
      excerpt:
        "Nordlicht Kaffeeimport buys green arabica for a specialty book. Brazilian natural microlots and organic lots are named on the buying page. Releases go to roasters in Germany and the Netherlands.",
    },
    context: {
      fitNarrative:
        "Hamburg importer. The book already carries two Brazilian exporters. Natural microlots are an active request.",
      knownSuppliers: ["Fazenda Norte Export", "a Sul de Minas cooperative"],
      risks: [
        "Cup scores are published as a range. Confirm the 84 floor before sending microlots.",
      ],
      citations: ["Sample trade note · Hamburg specialty importers"],
    },
    activity: {
      fetchedAt: "2026-10-27T15:05:00.000Z",
      signals: [
        {
          kind: "news",
          title: "Nordlicht adds Brazilian naturals to the Hamburg book",
          url: "https://nordlicht.example/news/brazilian-naturals",
          publishedAt: "2026-08-12T00:00:00.000Z",
          quote: "The importer named a new Brazilian natural program for German roasters.",
        },
        {
          kind: "social",
          title: "Nordlicht Kaffeeimport on Instagram",
          url: "https://www.instagram.com/nordlichtkaffee",
          publishedAt: "2026-09-03T00:00:00.000Z",
          quote: "Harvest photos and a buying-trip reel from Minas Gerais.",
        },
      ],
    },
    commerce: {
      fetchedAt: "2026-10-27T15:05:00.000Z",
      signals: [
        {
          kind: "customs",
          title: "Hamburg bill of lading: Nordlicht receives Brazilian naturals",
          url: "https://trade.example/nordlicht-bl",
          publishedAt: "2026-08-20T00:00:00.000Z",
          quote:
            "Bill of lading lists Nordlicht Kaffeeimport as importer of record for a Brazilian natural container.",
        },
      ],
    },
  }

  const haven: Lead = {
    id: "lead-haven",
    name: "Haven & Lot",
    domain: "havenlot.example",
    url: "https://havenlot.example/",
    country: "Netherlands",
    exa: hit({
      title: "Haven & Lot",
      url: "https://havenlot.example/",
      domain: "havenlot.example",
      summary:
        "Rotterdam green-coffee distributor supplying roasters in the Netherlands and Germany. Brazil is one origin in a wider book.",
      highlights: [
        "We import green coffee into Rotterdam and release it to roasters across the Netherlands and Germany.",
      ],
      text: "Haven & Lot distributes green coffee from a Rotterdam warehouse. The company imports green coffee from several origins, including Brazil, Colombia, and Ethiopia, and sells to roasters in the Netherlands and Germany. The site describes a broad book rather than a single-origin desk. Staff invite new exporter introductions for the next harvest. Logistics coverage is the EU, with the warehouse in Rotterdam.",
    }),
    extraction: {
      ok: true,
      companyName: "Haven & Lot",
      headquarters: "Rotterdam, Netherlands",
      country: "Netherlands",
      role: "Green coffee distributor",
      buys: ["green coffee from several origins, including Brazil"],
      sells: ["green coffee to roasters in the Netherlands and Germany"],
      markets: ["Netherlands", "Germany"],
      certifications: ["IFS Logistics"],
      buyerSignals: [
        "We import green coffee into Rotterdam and release it to roasters.",
      ],
      summary:
        "Haven & Lot distributes green coffee from Rotterdam. Brazil sits among several origins, and the company imports green coffee for EU roasters.",
      excerpt:
        "Rotterdam distributor. Imports green coffee, including Brazil, and sells to roasters in the Netherlands and Germany.",
    },
    context: {
      fitNarrative:
        "Open to differentiated lots beside two larger Brazilian container exporters. Microlots are a side desk, and the core book is broader than one origin.",
      knownSuppliers: ["Two large Brazilian container exporters"],
      risks: ["Microlots may stay a side desk next to the container book."],
      citations: ["Sample note · Rotterdam green coffee warehouses"],
    },
  }

  const kumo: Lead = {
    id: "lead-kumo",
    name: "Kumo Roasters",
    domain: "kumo.example",
    url: "https://kumo.example/",
    country: "Japan",
    exa: hit({
      title: "Kumo Roasters",
      url: "https://kumo.example/",
      domain: "kumo.example",
      summary:
        "Kyoto roaster selling to cafes and subscribers in Japan. A few green lots are imported directly. Most green coffee arrives via importers.",
      highlights: [
        "We roast in Kyoto and buy the rest via importers.",
      ],
      text: "Kumo Roasters roasts in Kyoto for cafes and home subscribers in Japan. The company writes that they import a few green lots themselves each season and buy the rest via importers. The page describes the cafe and the roasting room. It does not publish a container program or a list of origins. Visitors can book a cupping in Kyoto.",
    }),
    extraction: {
      ok: true,
      companyName: "Kumo Roasters",
      headquarters: "Kyoto, Japan",
      country: "Japan",
      role: "Roaster",
      buys: ["a few green lots", "the rest via importers"],
      sells: ["roasted coffee for cafes and subscribers in Japan"],
      markets: ["Japan"],
      certifications: [],
      buyerSignals: ["They import a few green lots and buy the rest via importers."],
      summary:
        "Kyoto roaster. They import a few green lots themselves and buy the rest via importers. Sales are roasted coffee in Japan.",
      excerpt:
        "Kumo Roasters in Kyoto. They import a few green lots and buy the rest via importers.",
    },
    context: {
      fitNarrative:
        "Most green coffee arrives through a trading house. Direct lots are the exception, and the roaster is not the importer of record for the core menu.",
      knownSuppliers: ["A Tokyo trading house"],
      risks: ["The account is unlikely to contract a container without the trading house."],
      citations: ["Sample note · Japan specialty roasting buying path"],
    },
  }

  const atlas: Lead = {
    id: "lead-atlas",
    name: "Atlas Instant Beverages",
    domain: "atlas-instant.example",
    url: "https://atlas-instant.example/",
    country: "United States",
    exa: hit({
      title: "Atlas Instant Beverages",
      url: "https://atlas-instant.example/",
      domain: "atlas-instant.example",
      summary:
        "Atlas Instant Beverages makes instant coffee drinks for retail in the United States.",
      highlights: ["Shelf-stable instant coffee drinks for grocery."],
      text: "Atlas Instant Beverages produces instant coffee drinks for grocery retailers in the United States. The brand owns the recipe and the can. The site is a consumer catalogue. It does not buy green coffee and it does not describe an import desk. Manufacturing is described as a soluble line.",
    }),
    extraction: {
      ok: true,
      companyName: "Atlas Instant Beverages",
      headquarters: "Chicago, United States",
      country: "United States",
      role: "Brand owner",
      buys: [],
      sells: ["instant coffee drinks"],
      markets: ["United States"],
      certifications: [],
      buyerSignals: [],
      summary:
        "Atlas Instant Beverages makes instant coffee drinks for retail. There is no green-coffee buying desk on the site.",
      excerpt: "Consumer brand. Instant coffee drinks for grocery in the United States.",
    },
    context: {
      fitNarrative:
        "Soluble retail brand. The public site is a consumer catalogue with no green-coffee buying desk.",
      knownSuppliers: [],
      risks: ["The company matches the instant coffee exclusion on this brief."],
      citations: ["Sample note · soluble coffee brands"],
    },
  }

  const estate: Lead = {
    id: "lead-estate",
    name: "Mantiqueira Estate Coffee",
    domain: "mantiqueira-estate.example",
    url: "https://mantiqueira-estate.example/",
    country: "Brazil",
    exa: hit({
      title: "Mantiqueira Estate Coffee",
      url: "https://mantiqueira-estate.example/",
      domain: "mantiqueira-estate.example",
      summary:
        "Brazilian estate exporter of arabica microlots and natural process lots from Minas Gerais.",
      highlights: [
        "We export arabica microlots and natural lots from Mantiqueira de Minas.",
      ],
      text: "Mantiqueira Estate Coffee is a grower and exporter in Minas Gerais, Brazil. The estate exports arabica microlots, natural lots, and pulped natural lots to overseas roasters. The page presents the farm, the mill, and the export offer. Organic certification is listed. There is no buying desk and no imported coffee.",
    }),
    extraction: {
      ok: true,
      companyName: "Mantiqueira Estate Coffee",
      headquarters: "Carmo de Minas, Brazil",
      country: "Brazil",
      role: "Exporter",
      buys: [],
      sells: ["arabica microlots", "natural lots", "pulped natural lots"],
      markets: ["Europe", "Asia"],
      certifications: ["Organic"],
      buyerSignals: [],
      summary:
        "Estate exporter in Brazil. Sells arabica microlots, natural lots, and pulped natural lots from its own farms.",
      excerpt:
        "Exporter in Minas Gerais. Arabica microlots and pulped natural lots from the estate.",
    },
    context: {
      fitNarrative:
        "Same-origin estate exporter. Importers that already list this farm are comparing offers, and the account itself does not buy coffee.",
      knownSuppliers: [],
      risks: ["A direct competitor for the Mantiqueira microlot slot."],
      citations: ["Sample note · Minas Gerais estate exporters"],
    },
  }

  return [nordlicht, haven, kumo, atlas, estate]
}

function stages(): StageState[] {
  return [
    {
      id: "search",
      status: "done",
      detail: "Sample search returned five companies for this supplier and these markets.",
      startedAt: "2026-10-27T15:00:00.000Z",
      finishedAt: "2026-10-27T15:01:00.000Z",
    },
    {
      id: "extract",
      status: "done",
      detail: "Sample page extracts are attached for every company.",
      startedAt: "2026-10-27T15:01:00.000Z",
      finishedAt: "2026-10-27T15:03:00.000Z",
    },
    {
      id: "classify",
      status: "done",
      detail: "This example has no OpenAI score. The table is the evidence checklist.",
      startedAt: "2026-10-27T15:03:00.000Z",
      finishedAt: "2026-10-27T15:04:00.000Z",
    },
    {
      id: "context",
      status: "done",
      detail: "Sample market note and competitor notes are attached. They do not replace a best-fit score.",
      startedAt: "2026-10-27T15:04:00.000Z",
      finishedAt: "2026-10-27T15:06:00.000Z",
    },
    {
      id: "diligence",
      status: "pending",
      detail: "Commercial due diligence waits until you select companies and a brand.",
    },
  ]
}

function sampleCompetitors(): Competitor[] {
  return [
    {
      name: "Fazenda Norte Export",
      country: "Brazil",
      whyRelevant:
        "Mantiqueira microlots already sitting on two Hamburg importer lists in this sample.",
      url: "",
    },
    {
      name: "Andean Verde",
      country: "Colombia",
      whyRelevant:
        "Competes for the 84+ natural slot when a buyer wants a non-Brazilian alternative.",
      url: "",
    },
    {
      name: "Cup Line Cooperatives",
      country: "Brazil",
      whyRelevant:
        "Larger container programs at a lower cup score. A price comparison on the container desk.",
      url: "",
    },
  ]
}

export function sampleRun(): Run {
  const brief = EXAMPLE_BRIEF
  const competitors = sampleCompetitors()
  const ranked = leads()
    .map((lead) => {
      const scored = { ...lead, score: scoreLead(brief, lead, competitors) }
      if (scored.id !== "lead-nordlicht") return scored
      return {
        ...scored,
        diligence: [
          buildReport({
            brand: brief.supplierName,
            lead: scored,
            brief,
            now: new Date("2026-10-27T15:06:00.000Z"),
            complementary: { ran: false, reason: "Sample dossier already answers the due-diligence questions." },
          }),
        ],
      }
    })
    .sort(compareLeads)

  const run: Run = {
    id: SAMPLE_RUN_ID,
    createdAt: WHEN,
    updatedAt: "2026-10-27T15:06:20.000Z",
    mode: "sample",
    status: "complete",
    brief,
    stages: stages(),
    contextState: "done",
    competitors,
    market: {
      outlook:
        "Germany remains a core European consumption market for coffee, and specialty importers in Hamburg and the Dutch ports still buy Brazilian naturals as part of the main book. Japan’s specialty roasters pay for traceable microlots, usually through a trading house, with fewer direct-import relationships. Container programs and 84+ microlots are often bought by different desks inside the same importer.",
      buyerDynamics:
        "EU specialty importers commonly contract a container for the harvest and add microlots against a published cup-score floor. They already name two or three Brazilian exporters. A new exporter is easier to sample when lot-level traceability and a distinct process, such as pulped natural, are both documented. Japanese roasters more often ask their importer to cup the lot than open a direct account.",
      importSignals: [
        "Hamburg and Rotterdam are the practical entry points for German and Dutch roasters.",
        "Organic and Rainforest Alliance are the certificates specialty buyers ask about before a first container.",
        "Lot-level traceability is now part of the first-sample conversation for Brazilian arabica.",
      ],
      citations: [
        "Sample trade note · EU specialty green coffee",
        "Sample note · Japanese roaster buying pattern",
      ],
    },
    logs: [
      {
        at: "2026-10-27T15:01:00.000Z",
        stage: "search",
        message: "Sample search kept five companies and dropped the supplier’s own domain.",
      },
      {
        at: "2026-10-27T15:03:00.000Z",
        stage: "extract",
        message: "Sample extracts recorded role, buying language, markets, and certifications.",
      },
      {
        at: "2026-10-27T15:06:00.000Z",
        stage: "context",
        message: "Sample research attached a market note, three competitor suppliers, and a fit note on each lead.",
      },
      {
        at: "2026-10-27T15:06:20.000Z",
        stage: "classify",
        message: "Classification used only the evidence stored on each lead.",
      },
    ],
    leads: ranked,
    error: undefined,
  }
  for (const lead of run.leads) stampIntelligence(run, lead)
  return run
}
