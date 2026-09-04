import * as React from "react"
import { useCallback } from "react"
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd"
import { CRMFieldType, CRMFieldConfig } from "@/lib/pov/types/crm"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/Alert"
import { Skeleton } from "@/components/ui/Skeleton"
import { DragHandle } from "@/components/ui/icons"

interface CRMFieldMapping {
  id: string
  crmField: string
  localField: string
  transformer?: string | null
  isRequired: boolean
  createdAt: Date
  updatedAt: Date
}

interface FieldMappingProps {
  fields: CRMFieldConfig[]
  mappings: CRMFieldMapping[]
  onUpdateMappings: (mappings: CRMFieldMapping[]) => void
  isLoading?: boolean
  error?: string
}

export default function FieldMapping({
  fields,
  mappings,
  onUpdateMappings,
  isLoading,
  error,
}: FieldMappingProps) {
  const handleDragEnd = useCallback(
    (result: any) => {
      if (!result.destination) return

      const items = Array.from(mappings)
      const [reorderedItem] = items.splice(result.source.index, 1)
      items.splice(result.destination.index, 0, reorderedItem)

      onUpdateMappings(items)
    },
    [mappings, onUpdateMappings]
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="field-mappings">
        {(provided) => (
          <div {...provided.droppableProps} ref={provided.innerRef}>
            {mappings.map((mapping, index) => (
              <Draggable
                key={mapping.id}
                draggableId={mapping.id}
                index={index}
              >
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className="mb-4"
                  >
                    <Card>
                      <div className="p-4 flex items-center gap-4">
                        <div {...provided.dragHandleProps}>
                          <DragHandle className="h-5 w-5 text-gray-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">{mapping.crmField}</h4>
                          <p className="text-sm text-gray-500">
                            Maps to: {mapping.localField}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newMappings = mappings.filter(
                              (m) => m.id !== mapping.id
                            )
                            onUpdateMappings(newMappings)
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </Card>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  )
}
