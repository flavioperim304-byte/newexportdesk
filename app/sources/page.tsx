import Link from "next/link"
import { SourcesForm } from "@/components/sources-form"

export default function SourcesPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:py-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <Link href="/" className="underline-offset-2 hover:underline">
            Desk
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Fontes</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Configure aqui as chaves das APIs utilizadas pelo pipeline. O banco de dados e o RAG são
          opcionais nesta etapa. Nenhum dado de contato, volume, marca ou compra pode ser inventado.
        </p>
      </div>
      <SourcesForm />
    </main>
  )
}
