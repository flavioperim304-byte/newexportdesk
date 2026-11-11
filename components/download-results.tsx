"use client"

import { Button } from "@/components/ui/button"
import { csvFilename, resultsCsv } from "@/lib/csv"
import type { Run } from "@/lib/types"

export function DownloadResults({ run, className = "" }: { run: Run; className?: string }) {
  function download() {
    const file = new Blob([resultsCsv(run)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(file)
    const link = document.createElement("a")
    link.href = url
    link.download = csvFilename(run.brief)
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button type="button" variant="outline" className={`h-8 px-3 ${className}`} onClick={download} disabled={run.leads.length === 0}>
      Download CSV
    </Button>
  )
}
