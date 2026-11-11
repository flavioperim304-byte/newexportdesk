import type { Metadata, Viewport } from "next"
import { Fraunces, Outfit } from "next/font/google"
import { Header } from "@/components/header"
import "./globals.css"

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
})

export const metadata: Metadata = {
  title: "Export desk",
  description:
    "Search buyers, read their pages, research the market, and score each lead against the supplier you represent.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-clip pb-[env(safe-area-inset-bottom)]">
        <div className="h-1 bg-[linear-gradient(90deg,var(--primary),var(--copper))]" />
        <Header />
        {children}
      </body>
    </html>
  )
}
