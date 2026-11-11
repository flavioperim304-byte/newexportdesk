import assert from "node:assert/strict"
import test from "node:test"
import {
  activityLine,
  activityQuery,
  classifyActivity,
  hasRecentActivity,
  signalsFromSearch,
} from "../lib/activity"
import { EXAMPLE_BRIEF, KANECHOM_BRIEF } from "../lib/example"
import { openaiInstructions } from "../lib/prompts"
import { qualificationRows } from "../lib/qualify"
import { sampleRun } from "../lib/sample"
import { scoreLead } from "../lib/score"
import type { Lead, LeadScore } from "../lib/types"

function lead(name = "Skalante"): Lead {
  return {
    id: "lead-skalante",
    name,
    domain: "skalante.com.co",
    url: "https://skalante.com.co",
    country: "Colombia",
    market: "Colombia",
    exa: {
      title: name,
      url: "https://skalante.com.co",
      domain: "skalante.com.co",
      text: "Professional hair care distributor.",
      highlights: [],
      summary: "Imports professional hair care in Colombia.",
    },
  }
}

test("Exa activity hits become news, launch, brand, and social signals", () => {
  const rows = signalsFromSearch(
    [
      {
        title: "Skalante launches a new keratin line in Bogotá",
        url: "https://beautynews.example/skalante-launch",
        text: "The distributor launched a new keratin line.",
        publishedDate: "2026-09-01T00:00:00.000Z",
      },
      {
        title: "Skalante signs a new brand for salons",
        url: "https://trade.example/skalante-brand",
        text: "Skalante added a new brand to its salon portfolio.",
        publishedDate: "2026-07-10T00:00:00.000Z",
      },
      {
        title: "Skalante Cosméticos",
        url: "https://www.instagram.com/skalante.co",
        text: "Salon training reel.",
        publishedDate: "2026-10-01T00:00:00.000Z",
      },
      {
        title: "Unrelated factory in Brazil",
        url: "https://other.example/factory",
        text: "A factory in São Paulo.",
      },
      {
        title: "Skalante home",
        url: "https://skalante.com.co/about",
        text: "About the company.",
      },
    ],
    lead()
  )
  assert.deepEqual(
    rows.map((row) => row.kind),
    ["launch", "brand", "social"]
  )
})

test("Instagram is social and a press note is news", () => {
  assert.equal(classifyActivity("https://www.instagram.com/marca", "Marca", ""), "social")
  assert.equal(
    classifyActivity("https://diario.example/nota", "Distributor expands in Medellín", "Imports hair care."),
    "news"
  )
})

test("follower growth and a dropped brand are mapped as 24-month signals", () => {
  assert.equal(
    classifyActivity(
      "https://www.instagram.com/skalante.co",
      "Skalante",
      "Crescimento de seguidores no Instagram."
    ),
    "social_growth"
  )
  assert.equal(
    classifyActivity(
      "https://news.example/skalante-mix",
      "Skalante dropped the brand",
      "The distributor dropped the brand and mudou o mix de produtos."
    ),
    "mix_change"
  )
})

test("the activity query names the company and the search country", () => {
  const query = activityQuery(lead(), { ...KANECHOM_BRIEF, markets: "Colombia" })
  assert.match(query, /Skalante/)
  assert.match(query, /Colombia/)
  assert.match(query, /lançamento|launch/i)
})

test("a quiet company cannot stay a best fit after activity is searched", () => {
  const nord = sampleRun().leads.find((item) => item.id === "lead-nordlicht")
  assert.ok(nord)
  assert.equal(nord.score?.band, "best_fit")
  const scored = scoreLead(EXAMPLE_BRIEF, {
    ...nord,
    activity: { fetchedAt: "2026-10-30T00:00:00.000Z", signals: [] },
  })
  assert.equal(scored.band, "possible")
  assert.match(scored.headline, /No recent public activity/)
  assert.match(activityLine({ ...nord, activity: { fetchedAt: "2026-10-30T00:00:00.000Z", signals: [] } }), /No news/)
})

test("recent launches lift the activity dimension", () => {
  const item = lead()
  item.activity = {
    fetchedAt: "2026-10-30T00:00:00.000Z",
    signals: [
      {
        kind: "launch",
        title: "Skalante launches keratin",
        url: "https://news.example/skalante",
        publishedAt: "2026-09-01T00:00:00.000Z",
        quote: "New keratin line.",
      },
      {
        kind: "social",
        title: "Instagram",
        url: "https://www.instagram.com/skalante.co",
        publishedAt: "2026-09-20T00:00:00.000Z",
        quote: "Training reel.",
      },
    ],
  }
  assert.equal(hasRecentActivity(item), true)
  const scored = scoreLead(KANECHOM_BRIEF, item)
  const activity = scored.dimensions.find((row) => row.key === "activity")
  assert.ok(activity)
  assert.ok((activity.points ?? 0) >= 8)
})

test("OpenAI high is pulled down when the company is publicly quiet", () => {
  const item = lead()
  item.activity = { fetchedAt: "2026-10-30T00:00:00.000Z", signals: [] }
  item.openai = {
    icp: "high",
    supplierFits: [{ supplier: "Kanechom", level: "high" }],
    bestFit: "Kanechom",
    qualificationNeeded: "Send a price list.",
    rationale: "Looks like a distributor.",
  }
  const [row] = qualificationRows([item], KANECHOM_BRIEF)
  assert.equal(row.level, "medium")
  assert.equal(row.activityLive, false)
  assert.match(row.qualificationNeeded, /Do not treat this as a confirmed best fit/)
})

test("the score prompt forbids a high best fit without recent activity", () => {
  assert.match(openaiInstructions(KANECHOM_BRIEF), /Hiring, social posts, and ICP fit are not purchase intent/)
})

test("checklist still files a thin excerpt without invented activity", () => {
  const score: LeadScore = scoreLead(EXAMPLE_BRIEF, lead("Unknown Trading"))
  const activity = score.dimensions.find((row) => row.key === "activity")
  assert.equal(activity?.points, 0)
  assert.match(activity?.rationale ?? "", /has not been searched/)
})
