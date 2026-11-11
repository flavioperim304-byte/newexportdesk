import assert from "node:assert/strict"
import test from "node:test"
import {
  explainPostgresError,
  normalizeDatabaseUrl,
  redactDatabaseUrl,
} from "../lib/database-url"
import { postgresWantsSsl } from "../lib/lead-db"

test("Session pooler URI is accepted and gets sslmode", () => {
  const parsed = normalizeDatabaseUrl(
    "postgresql://postgres.xtmixcnaojzcrwcbxcnw:secret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
  )
  assert.ok("url" in parsed)
  assert.match(parsed.url, /sslmode=require/)
  assert.match(parsed.url, /pooler\.supabase\.com:5432/)
  assert.equal(postgresWantsSsl(parsed.url), true)
})

test("the API URL and an anon key are rejected", () => {
  const site = normalizeDatabaseUrl("https://xtmixcnaojzcrwcbxcnw.supabase.co")
  assert.ok("error" in site)
  assert.match(site.error, /URL da API/)
  const key = normalizeDatabaseUrl("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb")
  assert.ok("error" in key)
  assert.match(key.error, /API key/)
})

test("a leftover password placeholder is rejected", () => {
  const parsed = normalizeDatabaseUrl(
    "postgresql://postgres.xtmixcnaojzcrwcbxcnw:[YOUR-PASSWORD]@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
  )
  assert.ok("error" in parsed)
  assert.match(parsed.error, /placeholder/)
})

test("Transaction pooler port 6543 is rewritten to 5432", () => {
  const parsed = normalizeDatabaseUrl(
    "postgresql://postgres.xtmixcnaojzcrwcbxcnw:secret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"
  )
  assert.ok("url" in parsed)
  assert.match(parsed.url, /:5432/)
  assert.doesNotMatch(parsed.url, /:6543/)
  assert.match(parsed.note ?? "", /6543/)
})

test("pooler user must be postgres.projectref", () => {
  const parsed = normalizeDatabaseUrl(
    "postgresql://postgres:secret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
  )
  assert.ok("error" in parsed)
  assert.match(parsed.error, /postgres\.REFERENCIA/)
})

test("passwords stay out of the redacted URI", () => {
  assert.equal(
    redactDatabaseUrl("postgresql://postgres.x:s3cret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"),
    "postgresql://postgres.x:****@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
  )
})

test("pooler IPv6 and tenant errors point back to Session pooler", () => {
  assert.match(explainPostgresError("connect ENETUNREACH"), /Session pooler/)
  assert.match(explainPostgresError("Tenant or user not found"), /postgres\.REFERENCIA/)
})

test("an allow-list rejection names Network Restrictions and the Render IP", () => {
  const explained = explainPostgresError(
    "(EADDRNOTALLOWED) address not in tenant allow_list: {74, 220, 48, 166}"
  )
  assert.match(explained, /74\.220\.48\.166/)
  assert.match(explained, /Network Restrictions/)
  assert.match(explained, /0\.0\.0\.0\/0/)
  assert.match(explained, /desk_leads/)
  assert.match(explained, /não são usadas/)
})
