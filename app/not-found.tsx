import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">404</p>
      <h1 className="font-serif text-3xl">Esta página não está neste deploy.</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        A página solicitada não faz parte desta versão do Export Desk. Volte ao painel e inicie uma
        nova busca com o ICP estruturado.
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Se você abriu uma busca em <code>/runs/…</code>: ela foi gravada neste preview, noutro PC, ou
        ainda não está no disco/Postgres do Render. O exemplo de café (Serra Alta) continua no painel.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button className="h-10 w-fit px-4" nativeButton={false} render={<Link href="/" />}>
          Painel
        </Button>
      </div>
    </main>
  )
}
