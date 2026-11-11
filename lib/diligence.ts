import { hasRecentActivity, recentSignals } from "./activity"
import { buyingFacts, hasPublishedBuyFacts } from "./fit-probability"
import type {
  Brief,
  DiligenceBlock,
  DiligenceBlockScore,
  DiligenceBrandKind,
  DiligenceConfidence,
  DiligenceDiff,
  DiligenceEvidenceState,
  DiligenceFinding,
  DiligenceGapKind,
  DiligenceImportCapacity,
  DiligencePolarity,
  DiligencePriority,
  DiligenceProbe,
  DiligenceQuestionId,
  DiligenceReport,
  DiligenceSection,
  Lead,
} from "./types"
import { clip } from "./text"

export const DILIGENCE_BLOCKS: DiligenceBlock[] = [
  "channel",
  "portfolio",
  "import",
  "geography",
  "activity",
  "opening",
]

export const BLOCK_MAX: Record<DiligenceBlock, number> = {
  channel: 25,
  portfolio: 20,
  import: 20,
  geography: 15,
  activity: 10,
  opening: 10,
}

export const BLOCK_LABEL: Record<DiligenceBlock, string> = {
  channel: "Canal",
  portfolio: "Portfólio e conflito",
  import: "Capacidade de trazer marca",
  geography: "Geografia e cliente",
  activity: "Atividade comercial útil",
  opening: "Abertura",
}

/** Months after which a fact no longer answers that question. */
export const FRESH_MONTHS: Record<DiligenceBlock, number> = {
  channel: 36,
  portfolio: 12,
  import: 12,
  geography: 24,
  activity: 12,
  opening: 6,
}

/**
 * Deterministic points for every evidence state.
 * Kanechom and LQ share the numbers so companies stay comparable.
 * Brand-specific rules decide the state, not the points.
 */
export const SCORE_TABLE: Record<DiligenceBlock, Record<DiligenceEvidenceState, number>> = {
  channel: {
    strong: 25,
    partial: 16,
    stale: 12,
    absent: 10,
    contradictory: 10,
    inadequate: 8,
    negative: 4,
  },
  portfolio: {
    strong: 20,
    partial: 12,
    stale: 10,
    contradictory: 9,
    absent: 8,
    inadequate: 6,
    negative: 5,
  },
  import: {
    strong: 20,
    partial: 12,
    stale: 10,
    absent: 8,
    contradictory: 8,
    inadequate: 6,
    negative: 2,
  },
  geography: {
    strong: 15,
    partial: 10,
    stale: 8,
    absent: 6,
    contradictory: 6,
    inadequate: 5,
    negative: 2,
  },
  activity: {
    strong: 10,
    partial: 6,
    stale: 4,
    absent: 3,
    contradictory: 3,
    inadequate: 2,
    negative: 1,
  },
  opening: {
    strong: 10,
    partial: 6,
    absent: 4,
    contradictory: 4,
    inadequate: 3,
    stale: 3,
    negative: 1,
  },
}

const MASS =
  /\b(supermarket|grocery|mass[- ]market|varejo popular|low-end retail|skala|farmacia|drugstore|atacado popular)\b/i
const SALON =
  /\b(salons?|salones|sal[oó]n(?:es)?|sal[aã]o|cabeleireiro|hairdresser|capilar|belleza profesional|professional (?:line|hair|salon|beauty)|alisamento|straightening|keratin treat)\b/i
const WHOLESALE =
  /\b(importer|importador|distributor|distribuidor|distribuye|distribuci[oó]n|wholesaler|atacadista|mayorista|trading)\b/i
const SALON_ONLY =
  /\b(salon|sal[aã]o|cabeleireiro)\b/i
const IMPORT_YES =
  /\b(importer of record|importamos|we import|direct import|importador direto|importador directo|importador de registro|somos importadores)\b/i
const IMPORT_HINT =
  /\b(importer|importador|importamos)\b/i
const IMPORT_NO =
  /\b(via|through) (an |the )?(importer|importador)|not the importer|buy the rest via|sem mesa de importa/i
const EXCLUSIVE =
  /\b(exclusive|exclusiv|sole (distributor|supplier)|representante exclusivo)\b/i
const OPEN_BOOK =
  /\b(not exclusive|non-exclusive|open to|seeking suppliers|adding (brands|origins)|livro aberto)\b/i
const COMMERCIAL_K =
  /\b(restock|reposi[cç]|sku|retail campaign|campanha (varejo|retail)|new (mass|retail) (line|sku))\b/i
const COMMERCIAL_LQ =
  /\b(training|treino|capacita[cç][aãá]o|capacitaci[oó]n|entrenamiento|feira|trade fair|expo|new professional (line|range)|demonstra[cç])\b/i
const ROUTINE_SOCIAL =
  /\b(follow us|instagram|facebook|linkedin|tiktok)\b/i

export type DiligenceGap = {
  questionId: DiligenceQuestionId
  gap: DiligenceGapKind
  question: string
  query: string
  block: DiligenceBlock
}

export function brandKindOf(name: string): DiligenceBrandKind {
  const value = name.toLowerCase()
  if (value.includes("kanechom")) return "kanechom"
  if (/\blq\b/.test(value) || value.includes("lq professional")) return "lq"
  return "generic"
}

export function pointsFor(block: DiligenceBlock, state: DiligenceEvidenceState): number {
  return SCORE_TABLE[block][state]
}

export function opportunityFromStates(
  states: Record<DiligenceBlock, DiligenceEvidenceState>
): { total: number; blocks: DiligenceBlockScore[] } {
  const blocks = DILIGENCE_BLOCKS.map((key) => {
    const state = states[key]
    return {
      key,
      label: BLOCK_LABEL[key],
      state,
      points: pointsFor(key, state),
      max: BLOCK_MAX[key],
      rationale: `${BLOCK_LABEL[key]} · ${state} · ${pointsFor(key, state)}/${BLOCK_MAX[key]}`,
    }
  })
  const total = blocks.reduce((sum, item) => sum + item.points, 0)
  return { total, blocks }
}

export function approachPriority(
  opportunityScore: number,
  confidence: DiligenceConfidence
): DiligencePriority {
  if (opportunityScore < 40) return "skip"
  if (opportunityScore < 55) return "watch"
  if (opportunityScore >= 70 && confidence === "high") return "pursue"
  if (opportunityScore >= 55) return "investigate"
  return "watch"
}

export function priorityNote(priority: DiligencePriority): string {
  if (priority === "pursue") {
    return "Prioridade de abordagem comercial. Não é confirmação de intenção de compra."
  }
  if (priority === "investigate") {
    return "Há potencial, mas a evidência ainda é fraca ou velha. Confirme antes de uma oferta."
  }
  if (priority === "watch") {
    return "Não é a primeira onda. Falta canal, portfólio ou evidência comercial."
  }
  return "Fora da abordagem agora. O canal ou o conflito de marcas não sustentam uma oferta."
}

export function importCapacityOf(state: DiligenceEvidenceState): DiligenceImportCapacity {
  if (state === "strong") return "confirmed"
  if (state === "partial" || state === "stale") return "indicated"
  if (state === "absent") return "not_found"
  if (state === "negative") return "negative"
  return "unknown"
}

export function importNoteOf(capacity: DiligenceImportCapacity): string {
  if (capacity === "confirmed") return "Uma fonte publicada descreve importação em nome próprio."
  if (capacity === "indicated") {
    return "Há sinal de importação, ou um embarque antigo. Isso não confirma capacidade atual sozinho."
  }
  if (capacity === "not_found") {
    return "Não encontramos registro de importação. Isso não permite concluir que a empresa não importa."
  }
  if (capacity === "negative") {
    return "Uma fonte diz que a empresa não importa em nome próprio, ou que compra via terceiro."
  }
  return "Ainda não investigamos o caminho de importação o bastante."
}

function corpus(lead: Lead): string {
  const extraction = lead.extraction
  return [
    extraction?.role,
    extraction?.summary,
    (extraction?.buys ?? []).join(" "),
    (extraction?.sells ?? []).join(" "),
    (extraction?.buyerSignals ?? []).join(" "),
    extraction?.lastPurchase,
    extraction?.stock,
    extraction?.brandPerformance,
    extraction?.salesNote,
    (extraction?.competitorMoves ?? []).join(" "),
    lead.exa.summary,
    lead.exa.text,
    (lead.context?.knownSuppliers ?? []).join(" "),
    (lead.context?.risks ?? []).join(" "),
    (lead.activity?.signals ?? []).map((signal) => `${signal.title} ${signal.quote}`).join(" "),
    (lead.commerce?.signals ?? []).map((signal) => `${signal.title} ${signal.quote}`).join(" "),
  ]
    .filter(Boolean)
    .join("\n")
}

function latestEvidenceAt(lead: Lead, extra: DiligenceFinding[] = []): string | undefined {
  const stamps = [
    ...buyingFacts(lead).filter((fact) => fact.found).map((fact) => recencyStamp(fact.recency, fact.quote)),
    ...(lead.activity?.signals ?? []).map((signal) => signal.publishedAt),
    ...(lead.commerce?.signals ?? []).map((signal) => signal.publishedAt),
    ...extra.map((item) => item.evidenceAt),
  ]
    .filter((value): value is string => Boolean(value))
    .sort()
  return stamps.at(-1)
}

function recencyStamp(recency: "recent" | "stale" | "unknown", quote: string): string | undefined {
  const year = quote.match(/\b(20\d{2})\b/)
  if (year) return `${year[1]}-06-01T00:00:00.000Z`
  if (recency === "recent") return new Date().toISOString()
  if (recency === "stale") return "2023-01-01T00:00:00.000Z"
  return undefined
}

export function isOlderThan(evidenceAt: string | undefined, months: number, now = new Date()): boolean {
  if (!evidenceAt) return false
  const stamp = Date.parse(evidenceAt)
  if (Number.isNaN(stamp)) return false
  return now.getTime() - stamp > months * 30 * 24 * 60 * 60 * 1000
}

function findingTouches(item: DiligenceFinding, block: DiligenceBlock): boolean {
  const topic = item.topic.toLowerCase()
  if (item.topic === block) return true
  return block === "import" && (topic.includes("import") || topic === "import_path")
}

function polaritiesFor(
  block: DiligenceBlock,
  findings: DiligenceFinding[],
  probes: DiligenceProbe[]
): DiligencePolarity[] {
  const related = findings.filter((item) => findingTouches(item, block))
  const values: DiligencePolarity[] = []
  for (const item of related) {
    if (item.kind === "interpretation" || item.kind === "needs_confirmation") continue
    values.push(item.polarity)
  }
  const probeIds: Partial<Record<DiligenceBlock, DiligenceQuestionId>> = {
    import: "import_path",
    opening: "exclusivity",
    portfolio: "portfolio",
    activity: "launch_capacity",
    channel: "channel_fit",
  }
  const probe = probes.filter((item) => item.questionId === probeIds[block])
  for (const item of probe) {
    if (item.result === "found") {
      if (block === "import" && !IMPORT_YES.test(item.note) && !IMPORT_HINT.test(item.note)) continue
      values.push("supports")
    }
    if (item.result === "not_found") values.push("absent")
  }
  return values
}

function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
}

function applyPolarity(
  base: DiligenceEvidenceState,
  poles: DiligencePolarity[]
): DiligenceEvidenceState {
  const support = poles.includes("supports")
  const against = poles.includes("against")
  const absent = poles.includes("absent")
  if (support && against) return "contradictory"
  if (against) return "negative"
  if (base === "negative") return "negative"
  if (support && (base === "absent" || base === "inadequate")) return "partial"
  if (absent && base === "strong") return base
  if (absent && base === "partial") return base
  return base
}

function maybeStale(
  state: DiligenceEvidenceState,
  block: DiligenceBlock,
  evidenceAt: string | undefined,
  now?: Date
): DiligenceEvidenceState {
  if (state === "negative" || state === "contradictory" || state === "absent" || state === "inadequate") {
    return state
  }
  if (isOlderThan(evidenceAt, FRESH_MONTHS[block], now)) return "stale"
  return state
}

export function classifyBlocks(
  brand: DiligenceBrandKind,
  lead: Lead,
  findings: DiligenceFinding[] = [],
  probes: DiligenceProbe[] = [],
  now = new Date()
): Record<DiligenceBlock, DiligenceEvidenceState> {
  const text = corpus(lead)
  const role = `${lead.extraction?.role ?? ""} ${lead.exa.summary}`
  const when = latestEvidenceAt(lead, findings)
  const facts = buyingFacts(lead)
  const hasBuying = facts.some((fact) => fact.found)
  const activityLive = hasRecentActivity(lead)
  const commercial = recentSignals(lead.activity).some((signal) =>
    signal.kind === "launch" || signal.kind === "brand" || signal.kind === "news"
  )

  let channel: DiligenceEvidenceState = "absent"
  if (brand === "kanechom") {
    if (SALON_ONLY.test(text) && !WHOLESALE.test(role) && !MASS.test(text)) channel = "negative"
    else if (MASS.test(text) && WHOLESALE.test(role)) channel = "strong"
    else if (WHOLESALE.test(role) && !SALON.test(text)) channel = "partial"
    else if (WHOLESALE.test(role) && SALON.test(text) && !MASS.test(text)) channel = "partial"
    else if (ROUTINE_SOCIAL.test(text) && !WHOLESALE.test(role)) channel = "inadequate"
  } else if (brand === "lq") {
    if (MASS.test(text) && !SALON.test(text) && !/professional/i.test(text)) channel = "negative"
    else if (SALON.test(text) && WHOLESALE.test(role)) channel = "strong"
    else if (WHOLESALE.test(role) && /professional|salon|sal[aã]o/i.test(text)) channel = "strong"
    else if (WHOLESALE.test(role)) channel = "partial"
    else if (ROUTINE_SOCIAL.test(text) && !WHOLESALE.test(role)) channel = "inadequate"
  } else if (WHOLESALE.test(role)) {
    channel = "strong"
  } else if (text.trim()) {
    channel = "inadequate"
  }

  let portfolio: DiligenceEvidenceState = "absent"
  const skala = /\bskala\b/i.test(text)
  const proLine = SALON.test(text)
  if (brand === "kanechom") {
    if (proLine && !skala && !MASS.test(text)) portfolio = "negative"
    else if (skala || (MASS.test(text) && /hair|shampoo|condicion/i.test(text))) portfolio = "strong"
    else if (/hair|cabelo|shampoo/i.test(text)) portfolio = "partial"
    else if (text.trim() && !/hair|cabelo|shampoo|cosmet/i.test(text)) portfolio = "inadequate"
  } else if (brand === "lq") {
    if (skala && !proLine) portfolio = "negative"
    else if (proLine) portfolio = "strong"
    else if (/hair|cabelo|capilar|profissional|professional/i.test(text)) portfolio = "partial"
    else if (text.trim() && !/hair|cabelo|capilar/i.test(text)) portfolio = "inadequate"
  } else if (hasBuying) {
    portfolio = "partial"
  }
  let imports: DiligenceEvidenceState = "absent"
  const publishedPurchase = facts.some((fact) => fact.kind === "last_purchase" && fact.found)
  if (IMPORT_NO.test(text) && !IMPORT_YES.test(text) && !publishedPurchase) imports = "negative"
  else if (IMPORT_YES.test(text) || publishedPurchase) imports = "strong"
  else if (IMPORT_HINT.test(role) || IMPORT_HINT.test(text)) imports = "partial"
  else if (ROUTINE_SOCIAL.test(text) && !IMPORT_HINT.test(text)) imports = "inadequate"

  let geography: DiligenceEvidenceState = "absent"
  const market = foldText(lead.market || lead.country || "")
  const place = foldText(
    `${lead.extraction?.country ?? ""} ${lead.extraction?.headquarters ?? ""} ${(lead.extraction?.markets ?? []).join(" ")}`
  )
  const foldedText = foldText(text)
  if (market && place.includes(market)) geography = "strong"
  else if (market && foldedText.includes(market)) geography = "partial"
  else if (place.trim() && market && !place.includes(market)) geography = "negative"
  else if (text.trim()) geography = "inadequate"

  let activity: DiligenceEvidenceState = "absent"
  const useful =
    brand === "lq" ? COMMERCIAL_LQ.test(text) : brand === "kanechom" ? COMMERCIAL_K.test(text) : commercial
  if (useful && activityLive) activity = "strong"
  else if (commercial && activityLive) activity = "partial"
  else if (lead.activity && recentSignals(lead.activity).every((signal) => signal.kind === "social")) {
    activity = "inadequate"
  } else if (lead.activity && !activityLive) activity = "absent"

  let opening: DiligenceEvidenceState = "absent"
  if (EXCLUSIVE.test(text) && !OPEN_BOOK.test(text)) opening = "negative"
  else if (OPEN_BOOK.test(text)) opening = "strong"
  else if ((lead.context?.knownSuppliers ?? []).length > 0) opening = "partial"
  else if (text.trim() && !EXCLUSIVE.test(text)) opening = "inadequate"

  const raw: Record<DiligenceBlock, DiligenceEvidenceState> = {
    channel,
    portfolio,
    import: imports,
    geography,
    activity,
    opening,
  }
  const next = { ...raw }
  for (const block of DILIGENCE_BLOCKS) {
    next[block] = applyPolarity(raw[block], polaritiesFor(block, findings, probes))
    next[block] = maybeStale(next[block], block, when, now)
  }
  return next
}

export function confidenceOf(
  states: Record<DiligenceBlock, DiligenceEvidenceState>,
  findings: DiligenceFinding[],
  probes: DiligenceProbe[],
  commercialFacts = false
): { level: DiligenceConfidence; note: string } {
  const strong = DILIGENCE_BLOCKS.filter((key) => states[key] === "strong").length
  const facts = findings.filter((item) => item.kind === "fact" && item.urls.length > 0).length
  const foundProbes = probes.filter((item) => item.result === "found").length
  const importStrong = states.import === "strong"
  if (strong >= 2 && (facts > 0 || foundProbes > 0 || strong >= 3)) {
    if (commercialFacts || importStrong) {
      return { level: "high", note: "Dois ou mais blocos com fato recente e fonte." }
    }
    return {
      level: "medium",
      note: "Canal ou portfólio publicaram, mas última compra, estoque, vendas e importação em nome próprio não. A confiança não sobe para alta só com folheto ou busca complementar.",
    }
  }
  const partial = DILIGENCE_BLOCKS.filter((key) =>
    states[key] === "partial" || states[key] === "strong" || states[key] === "stale"
  ).length
  if (partial >= 2 || facts > 0) {
    return { level: "medium", note: "Há indícios ou um fato. Ainda falta cobertura nas perguntas da due diligence." }
  }
  return {
    level: "low",
    note: "Folheto, rede social de rotina ou só ausência de registro. A confiança é baixa.",
  }
}

export function coverageGaps(
  brand: DiligenceBrandKind,
  lead: Lead,
  brief: Brief,
  states: Record<DiligenceBlock, DiligenceEvidenceState>
): DiligenceGap[] {
  const market = lead.market || lead.country || brief.markets
  const name = lead.name
  const brandHint =
    brand === "kanechom" ? "Skala OR grocery OR supermarket OR shampoo" : brand === "lq" ? "salon OR professional OR keratin OR straightening" : "import OR distributor"
  const need: { block: DiligenceBlock; questionId: DiligenceQuestionId; question: string; query: string }[] = [
    {
      block: "import",
      questionId: "import_path",
      question: `Esta empresa importa em nome próprio em ${market}?`,
      query: `"${name}" ${market} (import OR importer OR importador OR shipment OR "importer of record")`,
    },
    {
      block: "opening",
      questionId: "exclusivity",
      question: `Há exclusividade ou representação fechada publicada para ${name} em ${market}?`,
      query: `"${name}" ${market} (exclusive OR exclusividade OR "sole distributor" OR representation OR representante)`,
    },
    {
      block: "portfolio",
      questionId: "portfolio",
      question: `Quais marcas de hair care ${name} representa hoje em ${market}?`,
      query: `"${name}" ${market} (portfolio OR marcas OR brands OR ${brandHint})`,
    },
    {
      block: "activity",
      questionId: "launch_capacity",
      question:
        brand === "lq"
          ? `Há treino, feira ou nova linha profissional publicada para ${name}?`
          : `Há reposição, novo SKU ou campanha de varejo publicada para ${name}?`,
      query: `"${name}" ${market} (fair OR feira OR training OR lançamento OR "new line" OR restock OR campaign OR hiring OR vaga OR compras OR "sales executive")`,
    },
    {
      block: "channel",
      questionId: "channel_fit",
      question:
        brand === "lq"
          ? `Esta empresa distribui para salões ou atacado profissional em ${market}?`
          : `Esta empresa distribui para varejo de massa ou grocery em ${market}?`,
      query: `"${name}" ${market} (${brand === "lq" ? "salon OR professional OR cabeleireiro" : "supermarket OR grocery OR mass-market OR varejo"})`,
    },
  ]
  const gaps: DiligenceGap[] = []
  for (const item of need) {
    const state = states[item.block]
    let gap: DiligenceGapKind | null = null
    if (state === "absent") gap = "missing"
    else if (state === "stale") gap = "stale"
    else if (state === "inadequate") gap = "inadequate"
    if (!gap) continue
    gaps.push({ ...item, gap })
  }
  gaps.push({
    block: "activity",
    questionId: "hiring_signal",
    question: `Há contratação publicada em vendas ou compras para ${name} em ${market}?`,
    query: `"${name}" ${market} (hiring OR "we're hiring" OR vaga OR "ejecutivo de ventas" OR "purchasing manager" OR compras OR "key account")`,
    gap: "missing",
  })
  return gaps
}

export function probeFromSearch(
  gap: DiligenceGap,
  results: { url: string; title: string; publishedAt?: string; quote?: string }[],
  ranAt = new Date().toISOString()
): DiligenceProbe {
  const hits = results.filter((item) => item.url && item.title)
  if (hits.length === 0) {
    return {
      questionId: gap.questionId,
      question: gap.question,
      gap: gap.gap,
      query: gap.query,
      ranAt,
      result: "not_found",
      urls: [],
      note: "A busca complementar não encontrou evidência. Isso não é evidência negativa.",
    }
  }
  return {
    questionId: gap.questionId,
    question: gap.question,
    gap: gap.gap,
    query: gap.query,
    ranAt,
    result: "found",
    evidenceAt: hits.find((item) => item.publishedAt)?.publishedAt,
    urls: hits.slice(0, 4).map((item) => item.url),
    note: clip(hits[0].quote || hits[0].title, 220),
  }
}

export function failedProbe(gap: DiligenceGap, error: string, ranAt = new Date().toISOString()): DiligenceProbe {
  return {
    questionId: gap.questionId,
    question: gap.question,
    gap: gap.gap,
    query: gap.query,
    ranAt,
    result: "failed",
    urls: [],
    note: error,
  }
}

export function evidenceRange(
  lead: Lead,
  findings: DiligenceFinding[],
  probes: DiligenceProbe[]
): { from?: string; to?: string } {
  const stamps = [
    latestEvidenceAt(lead, findings),
    ...probes.map((item) => item.evidenceAt),
    ...findings.map((item) => item.evidenceAt),
    ...(lead.activity?.signals ?? []).map((signal) => signal.publishedAt),
  ]
    .filter((value): value is string => Boolean(value))
    .sort()
  return { from: stamps[0], to: stamps.at(-1) }
}

export function staleSectionsOf(
  states: Record<DiligenceBlock, DiligenceEvidenceState>
): DiligenceBlock[] {
  return DILIGENCE_BLOCKS.filter((key) => states[key] === "stale")
}

export function latestReport(reports: DiligenceReport[] | undefined, brand: string): DiligenceReport | undefined {
  return [...(reports ?? [])].reverse().find((item) => item.brand.toLowerCase() === brand.toLowerCase() && item.status !== "running")
}

export function diffReports(previous: DiligenceReport, next: DiligenceReport): DiligenceDiff {
  const changes: DiligenceDiff["changes"] = []
  if (previous.opportunityScore !== next.opportunityScore) {
    changes.push({
      field: "opportunity",
      before: String(previous.opportunityScore),
      after: String(next.opportunityScore),
    })
  }
  if (previous.confidence !== next.confidence) {
    changes.push({ field: "confidence", before: previous.confidence, after: next.confidence })
  }
  if (previous.importCapacity !== next.importCapacity) {
    changes.push({
      field: "importCapacity",
      before: previous.importCapacity,
      after: next.importCapacity,
    })
  }
  const beforeBrands = previous.findings.filter((item) => item.topic === "portfolio").map((item) => item.text)
  const afterBrands = next.findings.filter((item) => item.topic === "portfolio").map((item) => item.text)
  if (beforeBrands.join("|") !== afterBrands.join("|")) {
    changes.push({
      field: "portfolio",
      before: beforeBrands.join("; ") || "—",
      after: afterBrands.join("; ") || "—",
    })
  }
  const prevProbes = new Map(previous.probes.map((item) => [item.questionId, item.result]))
  for (const probe of next.probes) {
    const was = prevProbes.get(probe.questionId)
    if (was && was !== probe.result) {
      changes.push({ field: `probe:${probe.questionId}`, before: was, after: probe.result })
    } else if (!was) {
      changes.push({ field: `probe:${probe.questionId}`, before: "—", after: probe.result })
    }
  }
  if ((previous.evidenceTo || "") !== (next.evidenceTo || "")) {
    changes.push({ field: "evidenceTo", before: previous.evidenceTo || "—", after: next.evidenceTo || "—" })
  }
  return {
    previousInvestigatedAt: previous.investigatedAt,
    opportunity: { before: previous.opportunityScore, after: next.opportunityScore },
    confidence: { before: previous.confidence, after: next.confidence },
    importCapacity: { before: previous.importCapacity, after: next.importCapacity },
    changes,
  }
}

function section(title: string, text: string, stale: boolean, evidenceAt?: string): DiligenceSection {
  return { title, text, stale, evidenceAt }
}

export function buildReport(input: {
  brand: string
  lead: Lead
  brief: Brief
  findings?: DiligenceFinding[]
  probes?: DiligenceProbe[]
  narratives?: Partial<
    Record<"structure" | "portfolio" | "import" | "recentActivity" | "opportunity" | "approach", string>
  >
  citations?: DiligenceReport["citations"]
  complementary?: { ran: boolean; reason: string }
  previous?: DiligenceReport
  now?: Date
  status?: DiligenceReport["status"]
  error?: string
}): DiligenceReport {
  const now = input.now ?? new Date()
  const kind = brandKindOf(input.brand)
  const findings = input.findings ?? []
  const probes = input.probes ?? []
  const states = classifyBlocks(kind, input.lead, findings, probes, now)
  const scored = opportunityFromStates(states)
  const confidence = confidenceOf(states, findings, probes, hasPublishedBuyFacts(input.lead))
  const priority = approachPriority(scored.total, confidence.level)
  const capacity = importCapacityOf(states.import)
  const range = evidenceRange(input.lead, findings, probes)
  const stale = staleSectionsOf(states)
  const empty = "Sem evidência suficiente. Registrado como desconhecido."
  const report: DiligenceReport = {
    brand: input.brand,
    brandKind: kind,
    status: input.status ?? "done",
    investigatedAt: now.toISOString(),
    evidenceFrom: range.from,
    evidenceTo: range.to,
    staleSections: stale,
    opportunityScore: scored.total,
    confidence: confidence.level,
    confidenceNote: confidence.note,
    priority,
    priorityNote: priorityNote(priority),
    importCapacity: capacity,
    importNote: importNoteOf(capacity),
    blocks: scored.blocks,
    structure: section("Estrutura comercial", input.narratives?.structure || empty, stale.includes("channel"), range.to),
    portfolio: section("Portfólio e conflitos", input.narratives?.portfolio || empty, stale.includes("portfolio"), range.to),
    import: section("Capacidade de importação", input.narratives?.import || importNoteOf(capacity), stale.includes("import"), range.to),
    recentActivity: section(
      "Atividade comercial recente",
      input.narratives?.recentActivity || empty,
      stale.includes("activity"),
      range.to
    ),
    opportunity: section("Oportunidade para a marca", input.narratives?.opportunity || empty, false, range.to),
    approach: section("Abordagem comercial", input.narratives?.approach || empty, false, range.to),
    findings,
    probes,
    citations: input.citations ?? [],
    complementary: input.complementary ?? { ran: false, reason: "Checklist coberto pelo dossiê existente." },
    error: input.error,
  }
  if (input.previous && input.previous.status === "done") {
    report.diff = diffReports(input.previous, report)
  }
  return report
}

export function diligenceBrands(brief: Brief, also?: Brief): string[] {
  return [brief.supplierName, also?.supplierName].filter((name): name is string => Boolean(name?.trim()))
}

export function hitsFromSearch(results: unknown[]): { url: string; title: string; publishedAt?: string; quote?: string }[] {
  if (!Array.isArray(results)) return []
  const hits: { url: string; title: string; publishedAt?: string; quote?: string }[] = []
  for (const item of results) {
    const row = (item ?? {}) as Record<string, unknown>
    const url = typeof row.url === "string" ? row.url : ""
    const title = typeof row.title === "string" ? row.title : ""
    if (!url || !title) continue
    const highlights = Array.isArray(row.highlights) ? row.highlights.map((part) => String(part)) : []
    hits.push({
      url,
      title,
      publishedAt: typeof row.publishedDate === "string" ? row.publishedDate : undefined,
      quote: highlights[0] || (typeof row.text === "string" ? row.text : title),
    })
  }
  return hits
}
