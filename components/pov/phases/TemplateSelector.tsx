import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { PhaseTemplate } from ".prisma/client"
import { PhaseType } from ".prisma/client"
import { WorkflowStage } from "@/lib/pov/types/phase"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/Alert"
import { Skeleton } from "@/components/ui/Skeleton"

interface TemplateSelectorProps {
  onSelect: (templateId: string) => void
  preselectedType?: PhaseType
}

interface TemplateCardProps {
  template: PhaseTemplate & { 
    workflow: { stages: WorkflowStage[] }
    type: PhaseType 
  }
  isSelected: boolean
  onSelect: () => void
  onCompare: () => void
}

async function fetchTemplates(): Promise<(PhaseTemplate & { 
  workflow: { stages: WorkflowStage[] }
  type: PhaseType 
})[]> {
  const response = await fetch('/api/pov/templates')
  if (!response.ok) throw new Error('Failed to fetch templates')
  return response.json()
}

function TemplateCard({ template, isSelected, onSelect, onCompare }: TemplateCardProps) {
  return (
    <Card className={`p-4 ${isSelected ? 'ring-2 ring-primary' : ''}`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-medium">{template.name}</h3>
          {template.isDefault && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
              Default
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onCompare}>
          Compare
        </Button>
      </div>

      {template.description && (
        <p className="text-sm text-muted-foreground mb-4">{template.description}</p>
      )}

      <div className="space-y-2">
        {template.workflow.stages.map((stage, index) => (
          <div key={index} className="text-sm">
            <span className="font-medium">{stage.name}</span>
            <span className="text-muted-foreground ml-2">
              ({stage.tasks.length} tasks)
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          variant={isSelected ? "secondary" : "default"}
          onClick={onSelect}
        >
          {isSelected ? "Selected" : "Select"}
        </Button>
      </div>
    </Card>
  )
}

export function TemplateSelectorSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-6 w-2/3 mb-4" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-2/3" />
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function PhaseTemplateSelector({
  onSelect,
  preselectedType,
}: TemplateSelectorProps) {
  const [selectedId, setSelectedId] = React.useState<string>()
  const [compareId, setCompareId] = React.useState<string>()
  const [typeFilter, setTypeFilter] = React.useState<PhaseType | undefined>(
    preselectedType
  )

  const { data: templates, isLoading, error } = useQuery({
    queryKey: ["phase-templates"],
    queryFn: fetchTemplates,
  })

  if (isLoading) return <TemplateSelectorSkeleton />

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load phase templates</AlertDescription>
      </Alert>
    )
  }

  const filteredTemplates = typeFilter
    ? templates?.filter((t) => t.type === typeFilter)
    : templates

  const handleSelect = (templateId: string) => {
    setSelectedId(templateId)
    onSelect(templateId)
  }

  const handleCompare = (templateId: string) => {
    setCompareId(compareId === templateId ? undefined : templateId)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Select Phase Template</h2>
        <Button
          onClick={() => {
            // TODO: Open modal to create new template
          }}
        >
          Create Template
        </Button>
      </div>

      {/* Type filter */}
      <div className="flex gap-2">
        <Button
          variant={!typeFilter ? "default" : "outline"}
          onClick={() => setTypeFilter(undefined)}
        >
          All
        </Button>
        {Object.values(PhaseType).map((type) => (
          <Button
            key={type}
            variant={typeFilter === type ? "default" : "outline"}
            onClick={() => setTypeFilter(type)}
          >
            {type}
          </Button>
        ))}
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates?.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedId === template.id}
            onSelect={() => handleSelect(template.id)}
            onCompare={() => handleCompare(template.id)}
          />
        ))}
      </div>

      {/* Comparison view */}
      {compareId && selectedId && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Template Comparison</h3>
          <div className="grid grid-cols-2 gap-4">
            {[selectedId, compareId].map((id) => {
              const template = templates?.find((t) => t.id === id)
              if (!template) return null

              return (
                <Card key={id} className="p-4">
                  <h4 className="font-medium mb-2">{template.name}</h4>
                  <div className="space-y-2">
                    {template.workflow.stages.map((stage, index) => (
                      <div key={index}>
                        <div className="font-medium">{stage.name}</div>
                        <ul className="list-disc list-inside text-sm text-muted-foreground">
                          {stage.tasks.map((task) => (
                            <li key={task.id}>
                              {task.label}
                              {task.required && (
                                <span className="text-red-500 ml-1">*</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
