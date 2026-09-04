import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle, AlertCircle, Clock } from "lucide-react";

interface TimelineItemProps extends React.HTMLAttributes<HTMLLIElement> {
  title: string;
  timestamp: string | Date;
  description?: React.ReactNode;
  status?: 'success' | 'error' | 'pending';
  icon?: React.ReactNode;
}

const Timeline = React.forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement>
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("relative space-y-4 ml-4", className)}
    {...props}
  />
));
Timeline.displayName = "Timeline";

const TimelineItem = React.forwardRef<HTMLLIElement, TimelineItemProps>(
  ({ className, title, timestamp, description, status, icon, ...props }, ref) => {
    const getStatusColor = (status?: string) => {
      switch (status) {
        case 'success':
          return "text-green-500";
        case 'error':
          return "text-destructive";
        case 'pending':
          return "text-primary";
        default:
          return "text-muted-foreground";
      }
    };

    const getStatusIcon = (status?: string) => {
      switch (status) {
        case 'success':
          return <CheckCircle className="h-5 w-5" />;
        case 'error':
          return <AlertCircle className="h-5 w-5" />;
        case 'pending':
          return <Clock className="h-5 w-5" />;
        default:
          return icon;
      }
    };

    return (
      <li
        ref={ref}
        className={cn(
          "relative flex gap-6 pb-8 last:pb-0",
          "before:absolute before:left-[11px] before:top-[26px] before:h-full before:w-[2px]",
          "before:bg-border last:before:hidden",
          className
        )}
        {...props}
      >
        <div className="flex flex-col items-center">
          <time className="mb-2 block text-sm text-muted-foreground">
            {typeof timestamp === 'string' ? timestamp : timestamp.toLocaleString()}
          </time>
          <div className={cn(
            "z-10 flex h-7 w-7 items-center justify-center rounded-full border bg-background",
            getStatusColor(status)
          )}>
            {getStatusIcon(status)}
          </div>
        </div>
        <div className="flex-1 pt-1.5">
          <h4 className="text-base font-semibold">
            {title}
          </h4>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </li>
    );
  }
);
TimelineItem.displayName = "TimelineItem";

export { Timeline, TimelineItem }
export type { TimelineItemProps }
