import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface BreadcrumbItem {
  title: string
  href?: string
  icon?: React.ComponentType<{ className?: string }>
}

const Breadcrumb = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & {
    items: BreadcrumbItem[]
    separator?: React.ReactNode
  }
>(({ className, items, separator = <ChevronRight className="h-4 w-4" />, ...props }, ref) => (
  <nav
    ref={ref}
    aria-label="breadcrumb"
    className={cn("flex", className)}
    {...props}
  >
    <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const Component = item.href && !isLast ? "a" : "span";

        return (
          <li key={item.title} className="flex items-center gap-2">
            <Component
              {...(item.href && !isLast ? { href: item.href } : {})}
              className={cn(
                "flex items-center gap-2 transition-colors hover:text-foreground",
                isLast ? "text-foreground font-medium" : "text-muted-foreground",
                item.href && !isLast && "hover:underline"
              )}
            >
              {item.icon && (
                <item.icon className="h-4 w-4" aria-hidden="true" />
              )}
              {item.title}
            </Component>
            {!isLast && (
              <span
                className="text-muted-foreground"
                aria-hidden="true"
              >
                {separator}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  </nav>
))
Breadcrumb.displayName = "Breadcrumb"

export default Breadcrumb
