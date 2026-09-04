import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CRMSyncResult } from '@/lib/pov/types/crm'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert'
import { Timeline, TimelineItem } from '@/components/ui/Timeline'
import { Progress } from '@/components/ui/Progress'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip'
import { formatDistanceToNow, format } from 'date-fns'
import { Loader2, AlertCircle, CheckCircle, XCircle } from 'lucide-react'

interface SyncStatusProps {
  povId: string
  onSync: () => void
}

interface SyncDetails {
  recordsProcessed?: number
  totalRecords?: number
  errors?: Array<{
    type: string
    message: string
    field?: string
  }>
}

type CRMSyncHistory = {
  id: string
  povId: string
  status: string
  details: Record<string, any> | null
  createdAt: Date
}

async function fetchSyncStatus(povId: string): Promise<{
  lastSync: CRMSyncHistory
  history: CRMSyncHistory[]
}> {
  const response = await fetch(`/api/pov/${povId}/crm?type=history`)
  if (!response.ok) throw new Error('Failed to fetch sync status')
  const data = await response.json()
  return data.data
}

async function triggerSync(povId: string): Promise<CRMSyncResult> {
  const response = await fetch(`/api/pov/${povId}/crm`, {
    method: 'POST'
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to trigger sync')
  }
  const data = await response.json()
  return data.data
}

function SyncProgress({ details }: { details: SyncDetails }) {
  if (!details.recordsProcessed || !details.totalRecords) return null
  
  const progress = (details.recordsProcessed / details.totalRecords) * 100
  
  return (
    <div className="space-y-2">
      <Progress value={progress} />
      <p className="text-sm text-muted-foreground">
        {details.recordsProcessed} of {details.totalRecords} records processed
      </p>
    </div>
  )
}

function SyncErrorDetails({ errors }: { errors: SyncDetails['errors'] }) {
  if (!errors?.length) return null

  return (
    <div className="mt-2 space-y-2">
      {errors.map((error, index) => (
        <div key={index} className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">{error.type}</p>
            <p>{error.message}</p>
            {error.field && (
              <p className="text-xs text-muted-foreground">Field: {error.field}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function SyncStatusSkeleton() {
  return (
    <Card className="p-4 space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </Card>
  )
}

export default function CRMSyncStatus({ povId, onSync }: SyncStatusProps) {
  const queryClient = useQueryClient()
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['crm-sync', povId],
    queryFn: () => fetchSyncStatus(povId),
    refetchInterval: 30000, // Refetch every 30 seconds
    select: (data) => ({
      lastSync: data.lastSync,
      history: data.history
    })
  })

  const syncMutation = useMutation({
    mutationFn: () => triggerSync(povId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-sync', povId] })
      onSync()
    }
  })

  if (isLoading) return <SyncStatusSkeleton />

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load sync status
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['crm-sync', povId] })}
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!data) return null
  const { lastSync, history } = data

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle className="h-4 w-4 text-success" />
      case 'ERROR':
        return <XCircle className="h-4 w-4 text-destructive" />
      case 'IN_PROGRESS':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />
      default:
        return null
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">CRM Sync Status</h3>
            {getStatusIcon(lastSync.status)}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-sm text-muted-foreground cursor-help">
                  Last synced: {formatDistanceToNow(new Date(lastSync.createdAt), { addSuffix: true })}
                </p>
              </TooltipTrigger>
              <TooltipContent>
                <div>
                  <p className="font-medium">Last Sync Details</p>
                  <p className="text-sm">{format(new Date(lastSync.createdAt), 'PPpp')}</p>
                  {lastSync.details && (
                    <SyncProgress details={lastSync.details as SyncDetails} />
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="flex items-center gap-2"
        >
          {syncMutation.isPending && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
        </Button>
      </div>

      {syncMutation.isPending && lastSync.details && (
        <SyncProgress details={lastSync.details as SyncDetails} />
      )}

      {syncMutation.error && (
        <Alert variant="destructive">
          <AlertTitle>Sync Failed</AlertTitle>
          <AlertDescription>
            {syncMutation.error instanceof Error ? syncMutation.error.message : 'An error occurred'}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => syncMutation.reset()}
            >
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Timeline>
        {history.map((item) => (
          <TimelineItem
            key={item.id}
            title={item.status}
            timestamp={item.createdAt}
            description={
              item.details ? (
                <div className="mt-2">
                  <SyncProgress details={item.details as SyncDetails} />
                  <SyncErrorDetails errors={(item.details as SyncDetails).errors} />
                </div>
              ) : undefined
            }
            status={item.status === 'SUCCESS' ? 'success' : item.status === 'ERROR' ? 'error' : 'pending'}
            icon={getStatusIcon(item.status)}
          />
        ))}
      </Timeline>
    </Card>
  )
}
