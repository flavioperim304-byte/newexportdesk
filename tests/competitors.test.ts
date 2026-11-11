import assert from "node:assert/strict"
import test from "node:test"
import { localizeCompetitors } from "../lib/competitors"
import { KANECHOM_BRIEF, LQ_BRIEF } from "../lib/example"
import { parallelInstructions } from "../lib/prompts"
import type { Competitor } from "../lib/types"

function rival(name: string, country: string, whyRelevant = "", url = "https://rival.example"): Competitor {
  return { name, country, whyRelevant, url }
}

test("a Colombia search stamps Brazil-headquartered rivals as Colombia", () => {
  const brief = { ...LQ_BRIEF, markets: "Colombia" }
  const rows = localizeCompetitors(
    [
      rival(
        "Unika",
        "Brazil",
        "Skalante names Unika in its Brazilian-origin professional portfolio."
      ),
      rival(
        "milk_shake",
        "Italy",
        "Italian Beauty Concept publishes official Colombian distribution."
      ),
    ],
    brief
  )
  assert.deepEqual(
    rows.map((row) => [row.name, row.country]),
    [
      ["Unika", "Colombia"],
      ["milk_shake", "Colombia"],
    ]
  )
})

test("a multi-market search drops origin-HQ rivals that never name a search country", () => {
  const rows = localizeCompetitors(
    [
      rival("Skala", "Brazil", "A Brazilian retail hair-care benchmark."),
      rival("Novex", "Brasil", "Embelleze treatment creams from Brazil."),
      rival("Dark and Lovely", "South Africa", "Named in a Johannesburg wholesaler catalogue."),
    ],
    KANECHOM_BRIEF
  )
  assert.deepEqual(
    rows.map((row) => [row.name, row.country]),
    [["Dark and Lovely", "South Africa"]]
  )
})

test("a named search market wins over headquarters even across several countries", () => {
  const rows = localizeCompetitors(
    [
      rival("Skala", "Brazil", "ImpoHogar lists Skala treatment creams in Costa Rica."),
      rival("TRUSS", "Italy", "LVM’s professional hair portfolio in Portugal."),
    ],
    {
      ...LQ_BRIEF,
      markets: "Costa Rica, Portugal",
    }
  )
  assert.equal(rows[0].country, "Costa Rica")
  assert.equal(rows[1].country, "Portugal")
})

test("a misspelled Dominican market still replaces Brazil", () => {
  const rows = localizeCompetitors(
    [rival("Skala", "Brazil", "Brazilian retail hair-care benchmark.")],
    { ...KANECHOM_BRIEF, markets: "Republica Domincana" }
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].country, "Republica Domincana")
})

test("excluded markets stay off the competitor list", () => {
  const rows = localizeCompetitors(
    [rival("Dissol", "Ecuador", "Imports hair care in Ecuador.")],
    {
      ...LQ_BRIEF,
      markets: "Peru",
      excludedMarkets: "Ecuador, Colombia, India",
      searchKind: "competitors",
    }
  )
  assert.deepEqual(rows, [])
})

test("blank names are ignored and duplicate market rows collapse", () => {
  const brief = { ...LQ_BRIEF, markets: "Colombia" }
  const rows = localizeCompetitors(
    [
      rival("", "Colombia"),
      rival("Unika", "Brazil", "Local professional line.", "https://unika.example"),
      rival("Unika", "Colombia", "Same line again.", "https://unika.example"),
    ],
    brief
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].country, "Colombia")
})

test("Parallel is told to list rivals in the search country, not origin headquarters", () => {
  const colombia = parallelInstructions({ ...LQ_BRIEF, markets: "Colombia" })
  assert.match(colombia, /already sell this category in Colombia/)
  assert.match(colombia, /never headquarters/)
  assert.match(colombia, /only sell in Brazil/)
  assert.match(colombia, /country is that search country/)
  assert.match(colombia, /not factories that only sell in the origin country/)

  const mapped = parallelInstructions({
    ...LQ_BRIEF,
    searchKind: "competitors",
    markets: "Chile",
  })
  assert.match(mapped, /already sell this category in Chile/)
  assert.match(mapped, /country is the searched country, not the rival brand’s headquarters/)
})
