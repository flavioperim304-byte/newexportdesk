import fs from "node:fs"
import path from "node:path"
import { getStore } from "@netlify/blobs"
import { SAMPLE_RUN_ID } from "./ids"
import {
  pgDeleteRun,
  pgGetRun,
  pgListLeadEvents,
  pgListLeadRecords,
  pgListRuns,
  pgSaveRun,
  readyPostgres,
  listLeadRecordsFromRuns,
  normalizeRun,
} from "./lead-db"
import { sampleRun } from "./sample"
import type { LeadMemoryEvent, LeadRecord, Run } from "./types"

function durable(): boolean {
  return process.env.NETLIFY === "true" && process.env.NEXT_PHASE !== "phase-production-build"
}

function blobs() {
  return getStore({ name: "export-desk", consistency: "strong" })
}

async function blobGet(id: string): Promise<Run | null> {
  try {
    const value = await blobs().get(`run:${id}`, { type: "json", consistency: "strong" })
    if (!value || typeof value !== "object") return null
    return value as Run
  } catch {
    return null
  }
}

async function blobList(): Promise<Run[]> {
  try {
    const store = blobs()
    const listed = await store.list({ prefix: "run:" })
    const runs: Run[] = []
    for (const blob of listed.blobs) {
      const value = await store.get(blob.key, { type: "json", consistency: "strong" })
      if (value && typeof value === "object") runs.push(value as Run)
    }
    return runs
  } catch {
    return []
  }
}

const file = path.join(process.cwd(), "data", "runs.json")
const seedFile = path.join(process.cwd(), "lib", "data", "seed-runs.json")

type Database = { runs: Run[] }

let queue: Promise<void> = Promise.resolve()

function readDisk(): Database {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Database
    if (!parsed || !Array.isArray(parsed.runs)) return { runs: [] }
    return parsed
  } catch {
    return { runs: [] }
  }
}

function readSeed(): Run[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(seedFile, "utf8")) as Database
    if (!parsed || !Array.isArray(parsed.runs)) return []
    return parsed.runs.filter((run) => run?.id && run.id !== SAMPLE_RUN_ID)
  } catch {
    return []
  }
}

function loadDatabase(): Database {
  const disk = readDisk()
  const seed = readSeed()
  if (seed.length === 0) return disk
  const have = new Set(disk.runs.map((run) => run.id))
  const missing = seed.filter((run) => !have.has(run.id))
  if (missing.length === 0) return disk
  const merged: Database = { runs: [...disk.runs, ...missing] }
  try {
    write(merged)
  } catch {
    return merged
  }
  return merged
}

function write(db: Database) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(db))
  fs.renameSync(tmp, file)
}

async function postgresReady(): Promise<boolean> {
  return readyPostgres(() => loadDatabase().runs)
}

export async function listRuns(): Promise<Run[]> {
  const fromPg = (await postgresReady()) ? await pgListRuns() : null
  const stored = (fromPg ?? (durable() ? await blobList() : loadDatabase().runs)).filter(
    (run) => run.id !== SAMPLE_RUN_ID
  )
  stored.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return [sampleRun(), ...stored.map(normalizeRun)]
}

export async function getRun(id: string): Promise<Run | null> {
  if (id === SAMPLE_RUN_ID) return sampleRun()
  if (await postgresReady()) return pgGetRun(id)
  if (durable()) {
    const blob = await blobGet(id)
    return blob ? normalizeRun(blob) : null
  }
  const found = loadDatabase().runs.find((run) => run.id === id) ?? null
  return found ? normalizeRun(found) : null
}

export async function listLeadRecords(): Promise<LeadRecord[]> {
  if (await postgresReady()) return pgListLeadRecords()
  const runs = await listRuns()
  return listLeadRecordsFromRuns(runs)
}

export async function listLeadEvents(companyId: string): Promise<LeadMemoryEvent[]> {
  if (!(await postgresReady())) return []
  return pgListLeadEvents(companyId)
}

function writeJson(run: Run) {
  const db = loadDatabase()
  db.runs = db.runs.filter((item) => item.id !== run.id)
  db.runs.unshift(run)
  write(db)
}

export async function insertRun(run: Run): Promise<void> {
  const job = queue.then(async () => {
    if (await postgresReady()) {
      await pgSaveRun(run)
      try {
        writeJson(run)
      } catch {
        // Disk backup is optional once Postgres holds the run.
      }
      return
    }
    if (durable()) {
      await blobs().setJSON(`run:${run.id}`, run)
      return
    }
    writeJson(run)
  })
  queue = job.then(
    () => undefined,
    () => undefined
  )
  await job
}

export async function updateRun<T>(
  id: string,
  fn: (run: Run) => T
): Promise<T | null> {
  if (id === SAMPLE_RUN_ID) return null
  let result: T | null = null
  let failed: unknown
  const job = queue.then(async () => {
    try {
      const usePg = await postgresReady()
      const run = usePg
        ? await pgGetRun(id)
        : durable()
          ? await blobGet(id)
          : loadDatabase().runs.find((item) => item.id === id)
      if (!run) return
      result = fn(run)
      run.updatedAt = new Date().toISOString()
      if (usePg) {
        await pgSaveRun(run)
        try {
          writeJson(run)
        } catch {
          // Disk backup is optional once Postgres holds the run.
        }
      } else if (durable()) await blobs().setJSON(`run:${id}`, run)
      else {
        const db = loadDatabase()
        const index = db.runs.findIndex((item) => item.id === id)
        if (index < 0) return
        db.runs[index] = run
        write(db)
      }
    } catch (error) {
      failed = error
    }
  })
  queue = job.then(
    () => undefined,
    () => undefined
  )
  await job
  if (failed) throw failed
  return result
}

export async function deleteRun(id: string): Promise<void> {
  const job = queue.then(async () => {
    if (await postgresReady()) {
      await pgDeleteRun(id)
      try {
        const db = loadDatabase()
        db.runs = db.runs.filter((item) => item.id !== id)
        write(db)
      } catch {
        // Disk backup is optional once Postgres holds the run.
      }
      return
    }
    if (durable()) {
      try {
        await blobs().delete(`run:${id}`)
      } catch {
        // Older blob stores ignore a missing key.
      }
      return
    }
    const db = loadDatabase()
    db.runs = db.runs.filter((item) => item.id !== id)
    write(db)
  })
  queue = job.then(
    () => undefined,
    () => undefined
  )
  await job
}
