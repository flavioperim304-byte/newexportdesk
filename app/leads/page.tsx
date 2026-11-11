
import Link from "next/link"
import { LeadsBoard } from "@/components/leads-board"
import { postgresStatus } from "@/lib/lead-db"
import { listLeadRecords } from "@/lib/store"

export const dynamic = "force-dynamic"

export default async function LeadsPage() {
  const [records, db] = await Promise.all([listLeadRecords(), postgresStatus()])
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:py-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <Link href="/" className="underline-offset-2 hover:underline">
            Desk
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Leads</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Empresas descobertas nas buscas. O perfil atual fica em desk_leads; o histórico vai
          para desk_lead_events e snapshots em desk_*_versions. O monitoramento Exa por webhook
          será implementado em uma etapa posterior. Por enquanto, os sinais são atualizados pelo
          fluxo manual disponível no painel.
        </p>
      </div>
      <LeadsBoard records={records} postgres={db.postgres && !db.error} error={db.error} />
    </main>
  )
}
