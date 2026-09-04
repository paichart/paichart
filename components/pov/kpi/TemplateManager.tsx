import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { 
  KPIType,
  KPITemplateCreateInput,
  KPITemplateUpdateInput,
  KPIVisualization,
  KPITarget,
  KPIThreshold 
} from "@/lib/pov/types/kpi"
import type { JsonValue } from "@prisma/client/runtime/library"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/Alert"
import { Skeleton } from "@/components/ui/Skeleton"

interface TemplateManagerProps {
  onSelect?: (templateId: string) => void
}

type TemplateFormVisualization = Omit<KPITemplateCreateInput, 'visualization' | 'defaultTarget'> & {
  visualization: KPIVisualization
  target: KPITarget
}

interface TemplateFormData extends Omit<TemplateFormVisualization, 'description' | 'calculation'> {
  description: string
  calculation: string
}

const DEFAULT_VISUALIZATION: KPIVisualization = {
  type: 'line',
  options: {
    min: 0,
    max: 100,
    unit: '%',
    colors: {
      success: '#10B981',
      warning: '#F59E0B',
      critical: '#EF4444'
    }
  }
}

const DEFAULT_TARGET: KPITarget = {
  value: 0,
  threshold: {
    warning: 70,
    critical: 50
  }
}

function serializeVisualization(vis: KPIVisualization): string {
  return JSON.stringify(vis)
}

function deserializeVisualization(vis: string | null): KPIVisualization {
  if (!vis) return DEFAULT_VISUALIZATION
  try {
    return JSON.parse(vis) as KPIVisualization
  } catch {
    return DEFAULT_VISUALIZATION
  }
}

function serializeTarget(target: KPITarget): JsonValue {
  return JSON.stringify(target)
}

function deserializeTarget(target: JsonValue | null): KPITarget {
  if (!target) return DEFAULT_TARGET
  try {
    if (typeof target === 'string') {
      const parsed = JSON.parse(target)
      if (typeof parsed === 'object' && parsed !== null && 'value' in parsed) {
        return parsed as KPITarget
      }
    }
    return DEFAULT_TARGET
  } catch {
    return DEFAULT_TARGET
  }
}

interface TemplateResponse {
  id: string
  name: string
  description: string | null
  type: KPIType
  isCustom: boolean
  defaultTarget: JsonValue | null
  calculation: string | null
  visualization: string | null
}

async function fetchTemplates(): Promise<TemplateResponse[]> {
  const response = await fetch('/api/pov/kpi/templates')
  if (!response.ok) throw new Error('Failed to fetch templates')
  return response.json()
}

function TemplateForm({
  initialData,
  onSubmit,
  onCancel
}: {
  initialData?: Partial<TemplateFormData>
  onSubmit: (data: TemplateFormData) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = React.useState<TemplateFormData>({
    name: '',
    description: '',
    type: 'NUMERIC',
    isCustom: true,
    calculation: '',
    ...initialData,
    target: initialData?.target || DEFAULT_TARGET,
    visualization: initialData?.visualization || DEFAULT_VISUALIZATION
  })

  const handleChange = (field: keyof TemplateFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="space-y-4">
        {/* Basic Info */}
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            className="w-full p-2 border rounded-md"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            className="w-full p-2 border rounded-md"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={3}
          />
        </div>

        {/* Type Selection */}
        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            className="w-full p-2 border rounded-md"
            value={formData.type}
            onChange={(e) => handleChange('type', e.target.value)}
          >
            <option value="NUMERIC">Numeric</option>
            <option value="PERCENTAGE">Percentage</option>
            <option value="CURRENCY">Currency</option>
            <option value="BOOLEAN">Boolean</option>
          </select>
        </div>

        {/* Formula Editor */}
        <div>
          <label className="block text-sm font-medium mb-1">Calculation Formula</label>
          <textarea
            className="w-full p-2 border rounded-md font-mono"
            value={formData.calculation}
            onChange={(e) => handleChange('calculation', e.target.value)}
            placeholder="Enter calculation formula..."
            rows={4}
          />
          <p className="text-sm text-muted-foreground mt-1">
            Use JavaScript syntax. Available variables: current, target, history
          </p>
        </div>

        {/* Visualization Settings */}
        <div>
          <label className="block text-sm font-medium mb-1">Visualization Type</label>
          <select
            className="w-full p-2 border rounded-md"
            value={formData.visualization.type}
            onChange={(e) => handleChange('visualization', {
              ...formData.visualization,
              type: e.target.value as KPIVisualization['type']
            })}
          >
            <option value="line">Line Chart</option>
            <option value="bar">Bar Chart</option>
            <option value="gauge">Gauge</option>
          </select>
        </div>

        {/* Target Configuration */}
        <div className="space-y-4">
          <h4 className="font-medium">Target Configuration</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Default Target</label>
              <input
                type="number"
                className="w-full p-2 border rounded-md"
                value={formData.target.value}
                onChange={(e) => handleChange('target', {
                  ...formData.target,
                  value: parseFloat(e.target.value)
                })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Warning Threshold (%)</label>
              <input
                type="number"
                className="w-full p-2 border rounded-md"
                value={formData.target.threshold?.warning || 70}
                onChange={(e) => handleChange('target', {
                  ...formData.target,
                  threshold: {
                    ...formData.target.threshold,
                    warning: parseFloat(e.target.value)
                  }
                })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Critical Threshold (%)</label>
              <input
                type="number"
                className="w-full p-2 border rounded-md"
                value={formData.target.threshold?.critical || 50}
                onChange={(e) => handleChange('target', {
                  ...formData.target,
                  threshold: {
                    ...formData.target.threshold,
                    critical: parseFloat(e.target.value)
                  }
                })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSubmit(formData)}>
          {initialData ? 'Update' : 'Create'} Template
        </Button>
      </div>
    </Card>
  )
}

export function TemplateManagerSkeleton() {
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
            <Skeleton className="h-4 w-full" />
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function KPITemplateManager({ onSelect }: TemplateManagerProps) {
  const queryClient = useQueryClient()
  const [editingTemplate, setEditingTemplate] = React.useState<string | null>(null)
  const [isCreating, setIsCreating] = React.useState(false)

  const { data: templates, isLoading, error } = useQuery<TemplateResponse[]>({
    queryKey: ["kpi-templates"],
    queryFn: fetchTemplates,
  })

  const createMutation = useMutation({
    mutationFn: async (template: TemplateFormData) => {
      const response = await fetch('/api/pov/kpi/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...template,
          visualization: serializeVisualization(template.visualization),
          defaultTarget: serializeTarget(template.target)
        }),
      })
      if (!response.ok) throw new Error('Failed to create template')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kpi-templates"] })
      setIsCreating(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TemplateFormData }) => {
      const response = await fetch(`/api/pov/kpi/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          visualization: serializeVisualization(data.visualization),
          defaultTarget: serializeTarget(data.target)
        }),
      })
      if (!response.ok) throw new Error('Failed to update template')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kpi-templates"] })
      setEditingTemplate(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/pov/kpi/templates/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete template')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kpi-templates"] })
    },
  })

  if (isLoading) return <TemplateManagerSkeleton />

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load KPI templates</AlertDescription>
      </Alert>
    )
  }

  if (isCreating) {
    return (
      <TemplateForm
        onSubmit={(data) => createMutation.mutate(data)}
        onCancel={() => setIsCreating(false)}
      />
    )
  }

  if (editingTemplate) {
    const template = templates?.find(t => t.id === editingTemplate)
    if (!template) return null

    return (
      <TemplateForm
        initialData={{
          name: template.name,
          description: template.description || '',
          type: template.type,
          isCustom: template.isCustom,
          calculation: template.calculation || '',
          visualization: deserializeVisualization(template.visualization),
          target: deserializeTarget(template.defaultTarget)
        }}
        onSubmit={(data) => updateMutation.mutate({ id: editingTemplate, data })}
        onCancel={() => setEditingTemplate(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">KPI Templates</h2>
        <Button onClick={() => setIsCreating(true)}>
          Create Template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates?.map((template) => {
          const visualization = deserializeVisualization(template.visualization)
          const target = deserializeTarget(template.defaultTarget)
          return (
            <Card key={template.id} className="p-4">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-medium">{template.name}</h3>
                  {template.isCustom && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      Custom
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingTemplate(template.id)}
                  >
                    Edit
                  </Button>
                  {template.isCustom && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(template.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>

              {template.description && (
                <p className="text-sm text-muted-foreground mb-4">
                  {template.description}
                </p>
              )}

              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Type:</span>{' '}
                  {template.type}
                </div>
                <div>
                  <span className="font-medium">Visualization:</span>{' '}
                  {visualization.type === 'line' ? 'Line Chart' :
                   visualization.type === 'bar' ? 'Bar Chart' : 'Gauge'}
                </div>
                <div>
                  <span className="font-medium">Default Target:</span>{' '}
                  {target.value}
                </div>
              </div>

              {onSelect && (
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onSelect(template.id)}
                  >
                    Select
                  </Button>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Error states */}
      {createMutation.error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to create template</AlertDescription>
        </Alert>
      )}
      {updateMutation.error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to update template</AlertDescription>
        </Alert>
      )}
      {deleteMutation.error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to delete template</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
