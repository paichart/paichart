import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import type { KPIHistoryEntry, KPITarget, KPICalculationResult } from "@/lib/pov/types/kpi"
import { Card } from "@/components/ui/Card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/Alert"
import { Skeleton } from "@/components/ui/Skeleton"

interface HistoryChartProps {
  kpiId: string
  target: KPITarget
  showTrend?: boolean
  showThresholds?: boolean
  showMilestones?: boolean
}

interface KPIHistoryResponse {
  history: KPIHistoryEntry[]
  current: KPICalculationResult
}

async function fetchKPIHistory(kpiId: string): Promise<KPIHistoryResponse> {
  const response = await fetch(`/api/pov/kpi/${kpiId}/history`)
  if (!response.ok) throw new Error('Failed to fetch KPI history')
  return response.json()
}

function calculateMovingAverage(data: number[], window: number): number[] {
  const result: number[] = []
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1)
    const values = data.slice(start, i + 1)
    const average = values.reduce((a, b) => a + b, 0) / values.length
    result.push(average)
  }
  return result
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

export function HistoryChartSkeleton() {
  return (
    <Card className="p-4">
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    </Card>
  )
}

export default function KPIHistoryChart({
  kpiId,
  target,
  showTrend = true,
  showThresholds = true,
  showMilestones = true,
}: HistoryChartProps) {
  const chartRef = React.useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = React.useState(0)
  const [chartHeight, setChartHeight] = React.useState(0)

  const { data, isLoading, error } = useQuery<KPIHistoryResponse>({
    queryKey: ["kpi-history", kpiId],
    queryFn: () => fetchKPIHistory(kpiId),
  })

  React.useEffect(() => {
    if (!chartRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(entry.contentRect.width)
        setChartHeight(entry.contentRect.height)
      }
    })

    resizeObserver.observe(chartRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  if (isLoading) return <HistoryChartSkeleton />

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load KPI history</AlertDescription>
      </Alert>
    )
  }

  if (!data?.history.length) {
    return (
      <Alert>
        <AlertTitle>No Data</AlertTitle>
        <AlertDescription>No historical data available for this KPI</AlertDescription>
      </Alert>
    )
  }

  const values = data.history.map(entry => entry.value)
  const timestamps = data.history.map(entry => entry.timestamp)
  const trendLine = showTrend ? calculateMovingAverage(values, 5) : []

  // Calculate scales
  const minValue = Math.min(...values, target.value)
  const maxValue = Math.max(...values, target.value)
  const padding = (maxValue - minValue) * 0.1
  const yMin = Math.floor(minValue - padding)
  const yMax = Math.ceil(maxValue + padding)

  // Calculate points
  const points = values.map((value, i) => {
    const x = (i / (values.length - 1)) * chartWidth
    const y = chartHeight - ((value - yMin) / (yMax - yMin)) * chartHeight
    return `${x},${y}`
  }).join(' ')

  const trendPoints = trendLine.map((value, i) => {
    const x = (i / (trendLine.length - 1)) * chartWidth
    const y = chartHeight - ((value - yMin) / (yMax - yMin)) * chartHeight
    return `${x},${y}`
  }).join(' ')

  const targetY = chartHeight - ((target.value - yMin) / (yMax - yMin)) * chartHeight

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-medium">KPI History</h3>
            <p className="text-sm text-muted-foreground">
              Current: {data.current.value.toFixed(2)}
              {data.current.status !== 'success' && (
                <span className={`ml-2 ${
                  data.current.status === 'warning' ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  ({data.current.status})
                </span>
              )}
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            Target: {target.value}
          </div>
        </div>

        <div ref={chartRef} className="relative h-[300px]">
          <svg width={chartWidth} height={chartHeight} className="overflow-visible">
            {/* Grid lines */}
            {Array.from({ length: 5 }).map((_, i) => {
              const y = (i / 4) * chartHeight
              const value = yMax - (i / 4) * (yMax - yMin)
              return (
                <React.Fragment key={i}>
                  <line
                    x1="0"
                    y1={y}
                    x2={chartWidth}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeDasharray="4,4"
                  />
                  <text
                    x="-8"
                    y={y}
                    textAnchor="end"
                    alignmentBaseline="middle"
                    className="text-xs text-muted-foreground"
                  >
                    {value.toFixed(1)}
                  </text>
                </React.Fragment>
              )
            })}

            {/* Target line */}
            <line
              x1="0"
              y1={targetY}
              x2={chartWidth}
              y2={targetY}
              stroke="#10B981"
              strokeDasharray="4,4"
            />

            {/* Threshold lines */}
            {showThresholds && target.threshold && (
              <>
                <line
                  x1="0"
                  y1={chartHeight - ((target.value * target.threshold.warning / 100 - yMin) / (yMax - yMin)) * chartHeight}
                  x2={chartWidth}
                  y2={chartHeight - ((target.value * target.threshold.warning / 100 - yMin) / (yMax - yMin)) * chartHeight}
                  stroke="#F59E0B"
                  strokeDasharray="4,4"
                  opacity="0.5"
                />
                <line
                  x1="0"
                  y1={chartHeight - ((target.value * target.threshold.critical / 100 - yMin) / (yMax - yMin)) * chartHeight}
                  x2={chartWidth}
                  y2={chartHeight - ((target.value * target.threshold.critical / 100 - yMin) / (yMax - yMin)) * chartHeight}
                  stroke="#EF4444"
                  strokeDasharray="4,4"
                  opacity="0.5"
                />
              </>
            )}

            {/* Value line */}
            <polyline
              points={points}
              fill="none"
              stroke="#6366F1"
              strokeWidth="2"
            />

            {/* Trend line */}
            {showTrend && (
              <polyline
                points={trendPoints}
                fill="none"
                stroke="#8B5CF6"
                strokeWidth="2"
                strokeDasharray="4,4"
              />
            )}

            {/* Data points and milestones */}
            {data.history.map((entry, i) => {
              const x = (i / (values.length - 1)) * chartWidth
              const y = chartHeight - ((entry.value - yMin) / (yMax - yMin)) * chartHeight
              return (
                <React.Fragment key={i}>
                  <circle
                    cx={x}
                    cy={y}
                    r="4"
                    fill="#6366F1"
                    className="hover:r-6 transition-all"
                  />
                  {showMilestones && entry.metadata?.milestone && (
                    <g transform={`translate(${x},${y - 20})`}>
                      <circle r="8" fill="#8B5CF6" />
                      <title>{entry.metadata.milestone}</title>
                    </g>
                  )}
                </React.Fragment>
              )
            })}
          </svg>

          {/* X-axis labels */}
          <div className="flex justify-between mt-2">
            {timestamps.map((timestamp, i) => (
              <div
                key={i}
                className="text-xs text-muted-foreground"
                style={{
                  position: 'absolute',
                  left: `${(i / (timestamps.length - 1)) * 100}%`,
                  transform: 'translateX(-50%)',
                }}
              >
                {formatDate(timestamp)}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#6366F1] rounded-full" />
            <span>Value</span>
          </div>
          {showTrend && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#8B5CF6] rounded-full" />
              <span>Trend</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#10B981] rounded-full" />
            <span>Target</span>
          </div>
          {showThresholds && target.threshold && (
            <>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-[#F59E0B] rounded-full" />
                <span>Warning</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-[#EF4444] rounded-full" />
                <span>Critical</span>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
