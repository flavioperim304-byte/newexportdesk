import assert from "node:assert/strict"
import test from "node:test"
import { acceptCompanies, companiesFromAgent } from "../lib/exa"
import { jobTimedOut, profileFromAgent, stageTimedOut, timedOutExtraction } from "../lib/firecrawl"
import { draftFromOpenAI, entryFromOpenAI, judgmentsFromOpenAI } from "../lib/openai"

test("Exa Agent search output becomes companies", () => {
  const companies = companiesFromAgent({
    status: "completed",
    output: {
      structured: {
        companies: [
          {
            name: "Dissol",
            website: "https://dissol.example",
            country: "Ecuador",
            why: "Commercial company with a published hair-care portfolio.",
            role: "distributor",
            roleStatus: "indicated",
            roleEvidence: [],
            buyerSignals: ["Buys keratin kits for salon accounts."],
            categoryEvidence: [{ url: "https://dissol.example/products", excerpt: "Professional keratin straightening products for salons and distributors.", category: "professional hair care" }],
            countryEvidence: [{ url: "https://dissol.example/contact", excerpt: "Our company operates and distributes across Ecuador.", }],
            brandPortfolio: "Professional hair lines",
            clientScale: "200 salons",
          },
        ],
      },
    },
  })
  assert.equal(companies.length, 1)
  assert.equal(companies[0].website, "https://dissol.example")
  assert.equal(companies[0].buyerSignals[0], "Buys keratin kits for salon accounts.")
  assert.equal(companies[0].brandPortfolio, "Professional hair lines")
  assert.equal(companies[0].categoryEvidence[0].category, "professional hair care")
  assert.equal(companies[0].countryEvidence[0].url, "https://dissol.example/contact")
  assert.equal(companies[0].roleStatus, "indicated")
  const accepted = acceptCompanies(companies, "Ecuador", new Set(), [], "distributor", ["LQ Professional"])
  assert.equal(accepted.leads.length, 1)
  assert.equal(accepted.leads[0].discoveryProfile, "distributor")
  assert.equal(accepted.leads[0].buyerType, undefined)
  assert.equal(accepted.leads[0].buyerRoleReported, "distributor")
  assert.equal(accepted.leads[0].buyerRoleStatus, "indicated")
  const withoutCategoryProof = acceptCompanies(
    [{ ...companies[0], categoryEvidence: [] }],
    "Ecuador",
    new Set(),
    [],
    "distributor",
    ["LQ Professional"],
  )
  assert.equal(withoutCategoryProof.leads.length, 0)
})

test("Firecrawl scrape output keeps published contacts and leaves the rest blank", () => {
  const profile = profileFromAgent({
    data: {
      companyName: "Dissol",
      role: "importer",
      summary: "Hair-care importer.",
      email: "compras@dissol.example",
      phone: "",
      whatsapp: "+593 99 000 0000",
      website: "https://dissol.example",
      keyPerson: "Ana Compras",
      keyPersonRole: "Purchasing",
      latestHires: ["Sales executive, 2026"],
    },
  })
  assert.equal(profile?.email, "compras@dissol.example")
  assert.equal(profile?.phone, "")
  assert.equal(profile?.whatsapp, "+593 99 000 0000")
  assert.equal(profile?.role, "importer")
  assert.equal(profile?.keyPerson, "Ana Compras")
  assert.equal(profile?.keyPersonRole, "Purchasing")
  assert.deepEqual(profile?.latestHires, ["Sales executive, 2026"])
})

test("a Firecrawl job older than 70 seconds is treated as timed out", () => {
  assert.equal(jobTimedOut("2026-10-31T20:00:00.000Z", Date.parse("2026-10-31T20:01:11.000Z")), true)
  assert.equal(jobTimedOut("2026-10-31T20:00:00.000Z", Date.parse("2026-10-31T20:00:20.000Z")), false)
  assert.equal(jobTimedOut(undefined, Date.parse("2026-10-31T20:10:00.000Z")), false)
  assert.equal(stageTimedOut("2026-10-31T20:00:00.000Z", Date.parse("2026-10-31T20:08:01.000Z")), true)
  assert.match(timedOutExtraction().error ?? "", /too long/)
})

test("OpenAI score JSON becomes a preliminary best fit", () => {
  const rows = judgmentsFromOpenAI({
    choices: [
      {
        message: {
          content: JSON.stringify({
            leads: [
              {
                company: "Dissol",
                icp: "high",
                rationale: "Retail importer.",
                supplier_fits: [{ supplier: "Kanechom", level: "high" }],
                best_fit: "Kanechom",
                qualification_needed: "Confirm an open slot.",
              },
            ],
            purchase_probability: "medium",
            purchase_probability_note: "Importers already carry a professional tier.",
            entry_strategy: "Appoint one importer and train the salon channel before retail.",
          }),
        },
      },
    ],
  })
  assert.equal(rows[0].bestFit, "Kanechom")
  assert.equal(rows[0].icp, "high")
  assert.equal(rows[0].supplierFits[0].level, "high")
  const entry = entryFromOpenAI({
    choices: [
      {
        message: {
          content: JSON.stringify({
            purchase_probability: "medium",
            purchase_probability_note: "Importers already carry a professional tier.",
            entry_strategy: "Appoint one importer and train the salon channel before retail.",
          }),
        },
      },
    ],
  })
  assert.equal(entry.purchaseProbability, "medium")
  assert.match(entry.strategy, /one importer/)
})

test("OpenAI due diligence JSON keeps findings and never a score field we trust", () => {
  const draft = draftFromOpenAI({
    choices: [
      {
        message: {
          content: JSON.stringify({
            structure: "Importer in Bogotá.",
            portfolio: "Skala on the grocery book.",
            import_note: "Last shipment named on the site.",
            recent_activity: "No fair listed.",
            opportunity: "Open a mass SKU next to Skala.",
            approach: "Write the grocery buyer. This is not a confirmed order.",
            findings: [
              {
                kind: "fact",
                polarity: "supports",
                topic: "import",
                text: "Imported a shipment in 2026.",
                urls: ["https://impo.example"],
                evidence_at: "2026-09-01T00:00:00.000Z",
              },
            ],
            citations: [{ url: "https://impo.example", title: "About", published_at: "2026-09-01" }],
          }),
        },
      },
    ],
  })
  assert.equal(draft.findings[0].polarity, "supports")
  assert.equal(draft.narratives.opportunity, "Open a mass SKU next to Skala.")
  assert.equal("opportunityScore" in draft, false)
})
