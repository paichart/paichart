import "./globals.css"
import { Inter } from "next/font/google"
import { Providers } from "./providers"
import { Toaster } from "@/components/ui/Toaster"

const inter = Inter({ subsets: ["latin"] })

// `template` brands every nested segment's title automatically: a child layout/page that
// exports `title: 'POVs'` renders as "POVs | pAIchart". `default` is what unbranded routes
// get — e.g. /auth/oauth/success, which exports no metadata of its own and previously
// inherited the literal "POV Management". Add a bare `title` string to a new page and it is
// branded for free; there is no per-page suffix to remember or keep in sync.
export const metadata = {
  title: {
    default: "pAIchart",
    template: "%s | pAIchart",
  },
  description: "Manage and track POV projects",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
        {/* Toaster viewport — the useToast hook is used across the app but the viewport was never mounted,
            so every toast was silently dispatched-but-not-rendered. Mounting it here fixes toasts app-wide. */}
        <Toaster />
      </body>
    </html>
  )
}
