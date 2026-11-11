export type DatabaseUrlOk = { url: string; note?: string }
export type DatabaseUrlFail = { error: string }
export type DatabaseUrlParse = DatabaseUrlOk | DatabaseUrlFail

export type DatabaseHint = {
  source: "env" | "file" | "none"
  host?: string
  port?: string
  user?: string
  redacted?: string
}

const PLACEHOLDER = /\[YOUR-PASSWORD\]|YOUR-PASSWORD|\[PASSWORD\]|your-password/i

export function stripDatabaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^DATABASE_URL\s*=\s*/i, "")
    .replace(/^['"]|['"]$/g, "")
    .trim()
}

export function redactDatabaseUrl(url: string): string {
  return url.replace(/:([^:@/]+)@/, ":****@")
}

function asHttp(url: string): URL | null {
  try {
    return new URL(url.replace(/^postgres(ql)?:/i, "http:"))
  } catch {
    return null
  }
}

export function databaseHintFromUrl(url: string, source: DatabaseHint["source"]): DatabaseHint {
  const parsed = asHttp(url)
  if (!parsed) return { source, redacted: redactDatabaseUrl(url) }
  return {
    source,
    host: parsed.hostname,
    port: parsed.port || "5432",
    user: decodeURIComponent(parsed.username || ""),
    redacted: redactDatabaseUrl(url),
  }
}

export function normalizeDatabaseUrl(raw: string): DatabaseUrlParse {
  const value = stripDatabaseUrl(raw)
  if (!value) return { error: "Cole a URI Postgres do Session pooler." }
  if (PLACEHOLDER.test(value)) {
    return {
      error:
        "A URI ainda tem o placeholder da senha. Em Supabase → Project Settings → Database → Connect, copie de novo e coloque a senha real no lugar de [YOUR-PASSWORD].",
    }
  }
  if (/^https?:\/\//i.test(value) || /^[a-z0-9]+\.supabase\.co\/?$/i.test(value)) {
    return {
      error:
        "Isso é a URL da API do projeto (https://….supabase.co), não o Postgres. Abra Connect → URI → Session pooler, porta 5432. Não use a anon/publishable key.",
    }
  }
  if (/^eyJ/.test(value) || /^sb_[a-z0-9_]+/i.test(value)) {
    return {
      error:
        "Isso é uma API key, não a URI do banco. A conexão usa postgresql://postgres.REF:SENHA@….pooler.supabase.com:5432/postgres.",
    }
  }
  if (!/^postgres(ql)?:\/\//i.test(value)) {
    return {
      error:
        "A URI tem que começar com postgresql://. Copie em Supabase → Database → Connect → Session pooler (não a URL https).",
    }
  }
  let url = value
  let note: string | undefined
  if (/:6543(?=\/|\?|$)/.test(url)) {
    url = url.replace(/:6543(?=\/|\?|$)/, ":5432")
    note =
      "A porta 6543 é Transaction pooler e quebra o node-pg. Troquei para 5432 (Session pooler)."
  }
  if (!/[?&]sslmode=/i.test(url) && /supabase\.(co|com)/i.test(url)) {
    url += (url.includes("?") ? "&" : "?") + "sslmode=require"
  }
  const parsed = asHttp(url)
  if (!parsed?.hostname) {
    return { error: "Essa URI não tem host. Copie de novo o Session pooler completo." }
  }
  if (/^postgres$/i.test(decodeURIComponent(parsed.username || "")) && /pooler\.supabase\.com$/i.test(parsed.hostname)) {
    return {
      error:
        "No Session pooler o usuário é postgres.REFERENCIA (ex.: postgres.xtmixcnaojzcrwcbxcnw), não só postgres. Copie a URI de Connect → Session pooler.",
    }
  }
  return note ? { url, note } : { url }
}

export function explainPostgresError(message: string): string {
  const text = message.trim() || "Postgres connection failed."
  if (/tenant or user not found/i.test(text)) {
    return `${text} No pooler o usuário é postgres.REFERENCIA e a porta é 5432. Não use só postgres@db.….supabase.co.`
  }
  if (/password authentication failed|28P01/i.test(text)) {
    return `${text} Senha errada. Em Supabase → Database, reset database password se precisar, e cole a URI de novo.`
  }
  if (/ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|timeout/i.test(text)) {
    return `${text} O host direto db.….supabase.co costuma falhar no Render (IPv6). Use Session pooler: aws-…pooler.supabase.com porta 5432.`
  }
  if (/SELF_SIGNED|certificate/i.test(text)) {
    return `${text} O desk já liga SSL para Supabase. Confirme que a URI tem sslmode=require.`
  }
  if (/ECONNREFUSED/i.test(text)) {
    return `${text} Porta ou host errados. Session pooler é 5432, não 6543.`
  }
  if (/EADDRNOTALLOWED|not in tenant allow_list/i.test(text)) {
    const octets = text.match(/allow_list:\s*\{(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\}/i)
    const ip = octets ? `${octets[1]}.${octets[2]}.${octets[3]}.${octets[4]}` : ""
    return `${text} O Supabase recusou o IP de saída do Render${ip ? ` (${ip})` : ""}. Abra Database Settings → Network Restrictions (https://supabase.com/dashboard/project/xtmixcnaojzcrwcbxcnw/database/settings) e permita 0.0.0.0/0 e ::/0. O Render starter não tem IP fixo, então um único endereço não segura. As tabelas desk_runs e desk_leads já existem neste projeto. Leads, leads_master e tradeindata_* não são usadas.`
  }
  return text
}
