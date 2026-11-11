import assert from "node:assert/strict"
import test from "node:test"
import {
  companyIdFor,
  leadAudit,
  markLeadScan,
  memoryEvents,
  mergeActivitySignals,
  mergeCommerceSignals,
} from "../lib/memory"
import type { Lead } from "../lib/types"

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    name: "Casa Andes",
    domain: "casaandes.example",
    url: "https://casaandes.example",
    country: "Chile",
    exa: {
      title: "Casa Andes",
      url: "https://casaandes.example",
      domain: "casaandes.example",
      text: "",
      highlights: [],
      summary: "",
    },
    ...overrides,
  }
}

test("the company key is stable across two Kanechom runs in the same country", () => {
  const first = companyIdFor(baseLead())
  const second = companyIdFor(baseLead({ id: "other-run-lead", name: "Casa Andes Ltda" }))
  assert.equal(first, "d:casaandes.example|chile")
  assert.equal(first, second)
  assert.notEqual(companyIdFor(baseLead({ country: "Peru", market: "Peru" })), first)
})

test("a best-fit change becomes a chronological score event", () => {
  const before = leadAudit(
    baseLead({
      openai: {
        icp: "high",
        supplierFits: [{ supplier: "Kanechom", level: "high" }],
        bestFit: "Kanechom",
        qualificationNeeded: "",
        rationale: "",
      },
    })
  )
  const after = leadAudit(
    baseLead({
      context: {
        fitNarrative: "No published purchase.",
        knownSuppliers: [],
        risks: [],
        citations: [],
        icp: "medium",
        supplierFits: [{ supplier: "Kanechom", level: "medium" }],
        bestFit: "neither",
        qualificationNeeded: "",
      },
    })
  )
  const events = memoryEvents(before, after, "run")
  assert.equal(
    events.some((item) => item.kind === "score_changed" && /best_fit Kanechom → neither/.test(item.summary)),
    true
  )
})

test("a manual refresh is logged even when no new URL appears", () => {
  const audit = leadAudit(baseLead())
  const events = memoryEvents(audit, audit, "refresh")
  assert.deepEqual(
    events.map((item) => item.kind),
    ["scan"]
  )
})

test("refresh merges new activity and does not drop the previous URL", () => {
  const kept = mergeActivitySignals(
    {
      fetchedAt: "2026-01-01T00:00:00.000Z",
      signals: [{ kind: "news", title: "Old", url: "https://news.example/old", quote: "Before." }],
    },
    {
      fetchedAt: "2026-02-01T00:00:00.000Z",
      signals: [
        { kind: "launch", title: "New", url: "https://news.example/new", quote: "After." },
        { kind: "news", title: "Old again", url: "https://news.example/old", quote: "Dup." },
      ],
    }
  )
  assert.equal(kept.signals.length, 2)
  assert.equal(kept.signals[0].url, "https://news.example/old")
  assert.equal(kept.signals[1].url, "https://news.example/new")
  const commerce = mergeCommerceSignals(
    {
      fetchedAt: "2026-01-01T00:00:00.000Z",
      signals: [{ kind: "restock", title: "Stock", url: "https://shop.example/stock", quote: "In stock." }],
    },
    {
      fetchedAt: "2026-02-01T00:00:00.000Z",
      signals: [{ kind: "hiring_buy", title: "Hire", url: "https://jobs.example/buy", quote: "Buyer role." }],
    }
  )
  assert.equal(commerce.signals.length, 2)
})

test("markLeadScan writes last-scan metadata for the company profile", () => {
  const lead = baseLead()
  markLeadScan(lead, "refresh", "2026-03-01T12:00:00.000Z")
  assert.equal(lead.lastScanSource, "refresh")
  assert.equal(lead.lastScanAt, "2026-03-01T12:00:00.000Z")
  assert.equal(lead.signalsAt, "2026-03-01T12:00:00.000Z")
})
