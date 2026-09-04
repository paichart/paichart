import * as React from "react"
import { cn } from "@/lib/utils"

interface MigrationTemplateProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
  variant?: "shadcn" | "mui"
}

const ShadcnTemplate = React.forwardRef<
  HTMLDivElement,
  Omit<MigrationTemplateProps, "variant">
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "container mx-auto p-6 space-y-4 bg-background text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})

ShadcnTemplate.displayName = "ShadcnTemplate"

const MuiTemplate = React.forwardRef<
  HTMLDivElement,
  Omit<MigrationTemplateProps, "variant">
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={className}
      style={{
        margin: "0 auto",
        padding: "24px",
        maxWidth: "1200px"
      }}
      {...props}
    >
      {children}
    </div>
  )
})

MuiTemplate.displayName = "MuiTemplate"

const MigrationTemplate = React.forwardRef<
  HTMLDivElement,
  MigrationTemplateProps
>(({ variant = "shadcn", ...props }, ref) => {
  const Component = variant === "shadcn" ? ShadcnTemplate : MuiTemplate
  return <Component {...props} ref={ref} />
})

MigrationTemplate.displayName = "MigrationTemplate"

export default MigrationTemplate
