"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import type { KeyFlags } from "@/lib/types"

export function Header() {
  const [ready, setReady] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch("/api/keys")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { flags: KeyFlags } | null) => {
        if (cancelled || !data?.flags) return
        const count = [data.flags.exa, data.flags.firecrawl, data.flags.openai, data.flags.parallel].filter(Boolean).length
        setReady(count)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <header className="border-b border-border/80 bg-card/80 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="min-w-0">
          <span className="font-serif text-xl tracking-tight text-foreground">Export desk</span>
        </Link>
        <nav className="flex flex-wrap gap-2">
          <Button variant="ghost" className="h-11 shrink-0 px-4 sm:h-8" nativeButton={false} render={<Link href="/" />}>
            Painel
          </Button>
          <Button variant="ghost" className="h-11 shrink-0 px-4 sm:h-8" nativeButton={false} render={<Link href="/leads" />}>
            Leads
          </Button>
          <Button variant="ghost" className="h-11 shrink-0 px-4 sm:h-8" nativeButton={false} render={<Link href="/qualify" />}>
            Nova busca
          </Button>
          <Button
            variant={ready === 0 ? "default" : "outline"}
            className="h-11 shrink-0 px-4 sm:h-8"
            nativeButton={false}
            render={<Link href="/sources" />}
          >
            Fontes
          </Button>
        </nav>
      </div>
    </header>
  )
}
