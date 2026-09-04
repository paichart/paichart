"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs"

export default function POVLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  // Extract povId from pathname
  const povId = pathname?.split('/')[2]
  const currentTab = pathname?.includes('/launch/status') ? 'status' : 'checklist'

  const handleTabChange = (value: string) => {
    router.push(`/pov/${povId}/launch/${value}`)
  }

  return (
    <div className="flex-1">
      <div className="border-b bg-background">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <h1 className="text-xl font-semibold">
              POV Launch
            </h1>
            <Tabs value={currentTab} onValueChange={handleTabChange}>
              <TabsList>
                <TabsTrigger value="checklist">Checklist</TabsTrigger>
                <TabsTrigger value="status">Status</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      <div className="py-6">
        {children}
      </div>
    </div>
  )
}
