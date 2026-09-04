"use client"

import { Card } from "@/components/ui/Card"
import { cn } from "@/lib/utils"
import { ReactNode } from "react"
import { useMediaQuery } from "@/lib/hooks/useMediaQuery"

interface DashboardLayoutProps {
  widgets: ReactNode[]
  loading?: boolean
}

export function Widget({ children }: { children: ReactNode }) {
  return (
    <Card className="h-full flex flex-col p-6">
      {children}
    </Card>
  )
}

export function DashboardLayout({ widgets, loading = false }: DashboardLayoutProps) {
  const isMobile = useMediaQuery("(max-width: 640px)")
  const isTablet = useMediaQuery("(max-width: 768px)")
  const isDesktop = useMediaQuery("(min-width: 1024px)")

  // Determine grid columns based on screen size
  const getGridColumns = () => {
    if (isMobile) return "col-span-12"
    if (isTablet) return "col-span-6"
    if (isDesktop) return "col-span-4"
    return "col-span-6"
  }

  return (
    <div className="flex-grow p-6">
      <div className="grid grid-cols-12 gap-6">
        {widgets.map((widget, index) => (
          <div key={index} className={cn(getGridColumns())}>
            {widget}
          </div>
        ))}
      </div>
    </div>
  )
}
