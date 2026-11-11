export class ApiError extends Error {
  status: number
  retryAfterMs?: number

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

function errorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback
  const record = data as Record<string, unknown>
  if (typeof record.error === "string" && record.error.trim()) return record.error
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>
    if (typeof nested.message === "string" && nested.message.trim()) {
      return nested.message
    }
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message
  }
  return fallback
}

export async function requestJson(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<unknown> {
  const timeoutMs = init.timeoutMs ?? 45000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = new Headers(init.headers)
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json")
    }
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    })
    const text = await response.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = { error: text.slice(0, 500) }
      }
    }
    if (!response.ok) {
      const host = (() => {
        try {
          return new URL(url).host
        } catch {
          return "the API"
        }
      })()
      throw new ApiError(
        `${host} returned ${response.status}: ${errorMessage(data, text.slice(0, 400) || response.statusText)}`,
        response.status,
        headerRetryAfterMs(response)
      )
    }
    return data
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(
        `Timed out after ${Math.round(timeoutMs / 1000)}s calling ${safeHost(url)}`,
        408
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function headerRetryAfterMs(response: Response): number | undefined {
  const raw = response.headers.get("retry-after")
  if (!raw) return undefined
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000)
  const when = Date.parse(raw)
  if (!Number.isFinite(when)) return undefined
  return Math.max(0, when - Date.now())
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return "the API"
  }
}

export function publicError(error: unknown, secrets: string[]): string {
  const raw = error instanceof Error ? error.message : String(error)
  let text = raw
  for (const secret of secrets) {
    if (secret && secret.length > 6) text = text.split(secret).join("[key]")
  }
  return text.slice(0, 500)
}
