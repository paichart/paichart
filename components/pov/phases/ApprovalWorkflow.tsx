import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { Phase } from ".prisma/client"
import { 
  WorkflowTask, 
  PhaseDetails, 
  PhaseProgress, 
  PhaseValidation,
  TaskUpdate 
} from "@/lib/pov/types/workflow"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/Alert"
import { Skeleton } from "@/components/ui/Skeleton"
import { Timeline, TimelineItem } from "@/components/ui/Timeline"

interface ApprovalWorkflowProps {
  phaseId: string
  onComplete?: () => void
}

interface TaskItemProps {
  task: WorkflowTask
  isBlocked: boolean
  onUpdate: (update: TaskUpdate) => void
  onAddNote: (id: string, note: string) => void
}

interface PhaseDetailsResponse {
  phase: Phase
  details: PhaseDetails
  progress: PhaseProgress
  validation: PhaseValidation
}

async function fetchPhaseDetails(phaseId: string): Promise<PhaseDetailsResponse> {
  const response = await fetch(`/api/pov/phases/${phaseId}`)
  if (!response.ok) throw new Error('Failed to fetch phase details')
  return response.json()
}

function TaskItem({ task, isBlocked, onUpdate, onAddNote }: TaskItemProps) {
  const [note, setNote] = React.useState(task.notes || '')
  const [isEditing, setIsEditing] = React.useState(false)

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={isBlocked}
              onClick={() => onUpdate({
                id: task.id,
                completed: !task.completed,
                notes: note
              })}
            >
              {task.completed ? '✓' : '○'}
            </Button>
            <div>
              <span className="font-medium">
                {task.label}
                {task.required && <span className="text-red-500 ml-1">*</span>}
              </span>
              {isBlocked && (
                <span className="text-sm text-muted-foreground ml-2">
                  (Blocked by dependencies)
                </span>
              )}
            </div>
          </div>

          {/* Notes section */}
          <div className="mt-2 pl-8">
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  className="w-full p-2 border rounded-md"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add notes..."
                  rows={3}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNote(task.notes || '')
                      setIsEditing(false)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      onAddNote(task.id, note)
                      setIsEditing(false)
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="text-sm text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => setIsEditing(true)}
              >
                {note || 'Add notes...'}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

export function ApprovalWorkflowSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-6 w-2/3 mb-2" />
            <Skeleton className="h-4 w-full" />
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function PhaseApprovalWorkflow({
  phaseId,
  onComplete,
}: ApprovalWorkflowProps) {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<PhaseDetailsResponse>({
    queryKey: ["phase-details", phaseId],
    queryFn: () => fetchPhaseDetails(phaseId),
  })

  const updateMutation = useMutation({
    mutationFn: async (update: TaskUpdate) => {
      const response = await fetch(`/api/pov/phases/${phaseId}/tasks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      })
      if (!response.ok) throw new Error('Failed to update task')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["phase-details", phaseId] })
    },
  })

  const addNoteMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const response = await fetch(`/api/pov/phases/${phaseId}/tasks/${id}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      })
      if (!response.ok) throw new Error('Failed to add note')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["phase-details", phaseId] })
    },
  })

  if (isLoading) return <ApprovalWorkflowSkeleton />

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load phase details</AlertDescription>
      </Alert>
    )
  }

  if (!data) return null

  const { details, progress, validation } = data

  // Check if a task is blocked by dependencies
  const isTaskBlocked = (task: WorkflowTask) => {
    if (!task.dependencies?.length) return false
    return task.dependencies.some(
      (depId) => !details.tasks.find((t: WorkflowTask) => t.id === depId)?.completed
    )
  }

  return (
    <div className="space-y-6">
      {/* Progress bar and status */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Phase Progress</h2>
          <div className="text-sm text-muted-foreground">
            {progress.completed}/{progress.total} tasks completed
          </div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{
              width: `${(progress.completed / progress.total) * 100}%`,
            }}
          />
        </div>
        {!validation.valid && (
          <Alert variant="destructive">
            <AlertTitle>Validation Errors</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside">
                {validation.errors.map((error: string, index: number) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Tasks */}
      <div className="space-y-4">
        {details.tasks.map((task: WorkflowTask) => (
          <TaskItem
            key={task.id}
            task={task}
            isBlocked={isTaskBlocked(task)}
            onUpdate={updateMutation.mutate}
            onAddNote={(id, note) => addNoteMutation.mutate({ id, note })}
          />
        ))}
      </div>

      {/* Complete button */}
      <div className="flex justify-end">
        <Button
          disabled={!validation.valid}
          onClick={onComplete}
        >
          Complete Phase
        </Button>
      </div>

      {/* Error states */}
      {updateMutation.error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to update task</AlertDescription>
        </Alert>
      )}
      {addNoteMutation.error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to add note</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
