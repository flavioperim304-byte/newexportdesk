import assert from "node:assert/strict"
import test from "node:test"
import { KANECHOM_BRIEF } from "../lib/example"
import {
  DESK_COMPANIES_TABLE,
  DESK_LEAD_EVENTS_TABLE,
  DESK_LEAD_VERSIONS_TABLE,
  DESK_LEADS_TABLE,
  DESK_RUN_VERSIONS_TABLE,
  DESK_RUNS_TABLE,
  IGNORED_SUPABASE_TABLES,
  listLeadRecordsFromRuns,
  normalizeRun,
  postgresConfigured,
  postgresWantsSsl,
  toLeadRecord,
} from "../lib/lead-db"
import { createRun } from "../lib/pipeline"
import { SAMPLE_RUN_ID } from "../lib/ids"
import { sampleRun } from "../lib/sample"

test("postgres stays off when DATABASE_URL is missing", () => {
  assert.equal(Boolean(process.env.DATABASE_URL), false)
  assert.equal(postgresConfigured(), false)
})

test("Supabase and Render URLs use SSL; localhost does not", () => {
  assert.equal(postgresWantsSsl("postgres://x@db.abcd.supabase.co:5432/postgres"), true)
  assert.equal(
    postgresWantsSsl("postgres://x@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"),
    true
  )
  assert.equal(postgresWantsSsl("postgres://x@dpg-xxx.render.com/desk"), true)
  assert.equal(postgresWantsSsl("postgres://x@localhost:5432/desk"), false)
  assert.equal(
    postgresWantsSsl("postgres://x@db.abcd.supabase.co:5432/postgres?sslmode=disable"),
    false
  )
})

test("toLeadRecord copies published contacts and records the Exa discovery source", () => {
  const run = createRun(KANECHOM_BRIEF)
  run.id = "run-pg-1"
  run.status = "complete"
  run.leads = [
    {
      id: "lead-1",
      name: "Casa Andes",
      domain: "casaandes.example",
      url: "https://casaandes.example",
      country: "Chile",
      seed: "exa",
      discoveryProfile: "distributor",
      buyerRoleReported: "wholesaler",
      buyerRoleStatus: "indicated",
      exa: {
        title: "Casa Andes",
        url: "https://casaandes.example",
        domain: "casaandes.example",
        text: "",
        highlights: [],
        summary: "",
      },
      extraction: {
        ok: true,
        companyName: "Casa Andes",
        headquarters: "Santiago",
        country: "Chile",
        role: "distributor",
        buys: ["shampoo"],
        sells: ["hair care"],
        markets: ["Chile"],
        certifications: [],
        buyerSignals: [],
        summary: "Distributor",
        excerpt: "",
        email: "compras@casaandes.example",
        phone: "+56 2 0000",
        website: "https://casaandes.example",
      },
      score: {
        total: 62,
        band: "possible",
        headline: "Possible",
        nextAction: "Call",
        disqualified: false,
        dimensions: [],
      },
      fit: {
        level: "medium",
        index: 40,
        note: "No last purchase on the page.",
        missing: ["last_purchase"],
        facts: [],
      },
      openai: {
        icp: "medium",
        supplierFits: [{ supplier: "Kanechom", level: "medium" }],
        bestFit: "Kanechom",
        qualificationNeeded: "Confirm a first order.",
        rationale: "Looks like a distributor.",
      },
      rag: {
        checked: true,
        match: false,
        neighbor: "Another Distributor Ltd",
        note: "Neighbor is a different company.",
      },
    },
  ]
  const row = toLeadRecord(run, run.leads[0])
  assert.equal(row.runId, "run-pg-1")
  assert.equal(row.name, "Casa Andes")
  assert.equal(row.seed, "exa")
  assert.equal(row.discoveryProfile, "distributor")
  assert.equal(row.buyerRoleReported, "wholesaler")
  assert.equal(row.buyerRoleStatus, "indicated")
  assert.equal(row.email, "compras@casaandes.example")
  assert.equal(row.fit, "medium")
  assert.equal(row.fitIndex, 40)
  assert.equal(row.icp, "medium")
  assert.equal(row.band, "possible")
  assert.equal(row.supplier, run.brief.supplierName)
  assert.equal(row.lastPurchase, undefined)
  assert.equal(row.ragMatch, false)
  assert.equal(row.ragNeighbor, "Another Distributor Ltd")
  assert.equal(row.companyId, "d:casaandes.example|chile")
})

test("desk tables are new and old CRM names stay ignored", () => {
  assert.equal(DESK_RUNS_TABLE, "desk_runs")
  assert.equal(DESK_LEADS_TABLE, "desk_leads")
  assert.equal(DESK_COMPANIES_TABLE, "desk_companies")
  assert.equal(DESK_RUN_VERSIONS_TABLE, "desk_run_versions")
  assert.equal(DESK_LEAD_VERSIONS_TABLE, "desk_lead_versions")
  assert.equal(DESK_LEAD_EVENTS_TABLE, "desk_lead_events")
  assert.ok(IGNORED_SUPABASE_TABLES.includes("Leads"))
  assert.ok(IGNORED_SUPABASE_TABLES.includes("leads_master"))
  assert.ok(IGNORED_SUPABASE_TABLES.includes("tradeindata_novas_leads_import"))
  assert.equal(
    (IGNORED_SUPABASE_TABLES as readonly string[]).includes(DESK_LEADS_TABLE),
    false
  )
})

test("listLeadRecordsFromRuns skips the coffee sample", () => {
  const live = createRun(KANECHOM_BRIEF)
  live.id = "run-pg-2"
  live.mode = "live"
  live.leads = [
    {
      id: "lead-2",
      name: "Beta Hair",
      domain: "beta.example",
      url: "https://beta.example",
      country: "Kenya",
      exa: {
        title: "Beta Hair",
        url: "https://beta.example",
        domain: "beta.example",
        text: "",
        highlights: [],
        summary: "",
      },
    },
  ]
  const sample = sampleRun()
  assert.equal(sample.id, SAMPLE_RUN_ID)
  const rows = listLeadRecordsFromRuns([sample, live])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, "Beta Hair")
  assert.equal(rows[0].runId, "run-pg-2")
})

test("normalizeRun fills missing arrays and does not invent scores", () => {
  const run = normalizeRun({
    ...createRun(KANECHOM_BRIEF),
    id: "run-thin",
    mode: "live",
    leads: [
      {
        id: "thin",
        name: "Thin Co",
        domain: "thin.example",
        url: "https://thin.example",
        country: "Chile",
        exa: { title: "Thin Co", url: "https://thin.example", domain: "thin.example", text: "", highlights: undefined as never, summary: "" },
        score: { total: 40, band: "possible", headline: "possible", nextAction: "", disqualified: false, dimensions: undefined as never },
        fit: { level: "medium", index: 40, note: "saved", facts: undefined as never, missing: undefined as never },
        activity: { fetchedAt: "2026-11-05T00:00:00.000Z", signals: undefined as never },
      },
    ],
    competitors: undefined as never,
  })
  const lead = run.leads[0]
  assert.deepEqual(lead.exa.highlights, [])
  assert.deepEqual(lead.score?.dimensions, [])
  assert.deepEqual(lead.fit?.facts, [])
  assert.deepEqual(lead.activity?.signals, [])
  assert.deepEqual(run.competitors, [])
  assert.equal(lead.score?.total, 40)
})
