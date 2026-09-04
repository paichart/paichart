import * as React from "react"
import {
  Area,
  Bar,
  Line,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  BarChart,
  LineChart,
  PieChart,
  type AreaProps,
  type BarProps,
  type LineProps,
  type PieProps,
} from "recharts"
import { cn } from "@/lib/utils"

export type ChartData = Record<string, any>[]

export interface ChartProps {
  type: "area" | "bar" | "line" | "pie"
  data: ChartData
  xKey: string
  yKeys: string[]
  width?: number | string
  height?: number | string
  className?: string
  colors?: string[]
  showGrid?: boolean
  showLegend?: boolean
  showTooltip?: boolean
  stackOffset?: "none" | "expand" | "wiggle" | "silhouette"
  layout?: "horizontal" | "vertical"
}

const defaultColors = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(var(--accent))",
  "hsl(var(--muted))",
]

const Chart = React.forwardRef<HTMLDivElement, ChartProps>(
  ({ 
    type,
    data,
    xKey,
    yKeys,
    width = "100%",
    height = 300,
    className,
    colors = defaultColors,
    showGrid = true,
    showLegend = true,
    showTooltip = true,
    stackOffset = "none",
    layout = "horizontal",
    ...props
  }, ref) => {
    const ChartComponent = React.useMemo(() => {
      switch (type) {
        case "area":
          return AreaChart;
        case "bar":
          return BarChart;
        case "line":
          return LineChart;
        case "pie":
          return PieChart;
      }
    }, [type]);

    const DataComponent = React.useMemo(() => {
      switch (type) {
        case "area":
          return Area as React.ComponentType<AreaProps>;
        case "bar":
          return Bar as React.ComponentType<BarProps>;
        case "line":
          return Line as React.ComponentType<LineProps>;
        case "pie":
          return Pie as React.ComponentType<PieProps>;
      }
    }, [type]);

    return (
      <div
        ref={ref}
        className={cn("w-full", className)}
        {...props}
      >
        <ResponsiveContainer width={width} height={height}>
          <ChartComponent
            data={data}
            layout={type === "pie" ? undefined : layout}
          >
            {showGrid && type !== "pie" && (
              <CartesianGrid strokeDasharray="3 3" />
            )}
            {type !== "pie" && (
              <>
                <XAxis
                  dataKey={xKey}
                  type={typeof data[0]?.[xKey] === "number" ? "number" : "category"}
                />
                <YAxis />
              </>
            )}
            {showTooltip && <Tooltip />}
            {showLegend && <Legend />}
            {type === "pie" ? (
              <DataComponent
                data={data}
                dataKey={yKeys[0]}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill={colors[0]}
              />
            ) : (
              yKeys.map((key, index) => (
                <DataComponent
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors[index % colors.length]}
                  fill={colors[index % colors.length]}
                  {...(type === "area" || type === "bar" ? { stackOffset } : {})}
                  fillOpacity={type === "area" ? 0.3 : 1}
                />
              ))
            )}
          </ChartComponent>
        </ResponsiveContainer>
      </div>
    )
  }
)
Chart.displayName = "Chart"

export default Chart
