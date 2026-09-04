"use client";

import { useEditorContext } from '../context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useState } from 'react';
import { PlusCircle, Trash2, Edit, CheckCircle, XCircle, AlertCircle, Clock, ArrowRight } from 'lucide-react';

// Workflow types
type WorkflowType = 'POV_APPROVAL' | 'PHASE_APPROVAL' | 'TASK_APPROVAL' | 'CUSTOM';
type WorkflowStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
type WorkflowStepStatus = 'PENDING' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED' | 'SKIPPED';

// Workflow interfaces
interface WorkflowStep {
  id: string;
  name: string;
  order: number;
  status: WorkflowStepStatus;
  role: string;
  comment?: string;
}

interface Workflow {
  id: string;
  type: WorkflowType;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

export default function WorkflowSection() {
  const { state, updateField } = useEditorContext();
  const { data } = state;
  
  // Local state for workflow management
  const [activeTab, setActiveTab] = useState('active');
  const [showForm, setShowForm] = useState(false);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [workflowType, setWorkflowType] = useState<WorkflowType>('POV_APPROVAL');
  const [workflowSteps, setWorkflowSteps] = useState<Partial<WorkflowStep>[]>([]);
  const [stepName, setStepName] = useState('');
  const [stepRole, setStepRole] = useState('');
  
  // Get workflows from state
  const workflows = data.workflows ? JSON.parse(data.workflows as string) as Workflow[] : [];
  
  // Filter workflows by status
  const activeWorkflows = workflows.filter(w => 
    w.status === 'PENDING' || w.status === 'IN_PROGRESS'
  );
  
  const completedWorkflows = workflows.filter(w => 
    w.status === 'COMPLETED' || w.status === 'REJECTED' || w.status === 'CANCELLED'
  );
  
  // Reset form
  const resetForm = () => {
    setWorkflowType('POV_APPROVAL');
    setWorkflowSteps([]);
    setStepName('');
    setStepRole('');
    setEditingWorkflowId(null);
    setShowForm(false);
  };
  
  // Add step to workflow
  const addStep = () => {
    if (!stepName || !stepRole) return;
    
    const newStep: Partial<WorkflowStep> = {
      name: stepName,
      role: stepRole,
      order: workflowSteps.length,
      status: 'PENDING',
    };
    
    setWorkflowSteps([...workflowSteps, newStep]);
    setStepName('');
    setStepRole('');
  };
  
  // Remove step from workflow
  const removeStep = (index: number) => {
    const updatedSteps = [...workflowSteps];
    updatedSteps.splice(index, 1);
    
    // Update order
    const reorderedSteps = updatedSteps.map((step, idx) => ({
      ...step,
      order: idx,
    }));
    
    setWorkflowSteps(reorderedSteps);
  };
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (workflowSteps.length === 0) {
      alert('Please add at least one step to the workflow');
      return;
    }
    
    const newWorkflow: Workflow = {
      id: editingWorkflowId || `workflow-${Date.now()}`,
      type: workflowType,
      status: 'PENDING',
      steps: workflowSteps.map((step, index) => ({
        id: step.id || `step-${Date.now()}-${index}`,
        name: step.name!,
        order: index,
        status: 'PENDING',
        role: step.role!,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    let updatedWorkflows: Workflow[];
    
    if (editingWorkflowId) {
      // Update existing workflow
      updatedWorkflows = workflows.map(workflow => 
        workflow.id === editingWorkflowId ? newWorkflow : workflow
      );
    } else {
      // Add new workflow
      updatedWorkflows = [...workflows, newWorkflow];
    }
    
    // Update state
    updateField(['data', 'workflows'], JSON.stringify(updatedWorkflows));
    
    resetForm();
  };
  
  // Format workflow type for display
  const formatWorkflowType = (type: WorkflowType) => {
    return type.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  };
  
  // Get status badge color
  const getStatusBadgeColor = (status: WorkflowStatus | WorkflowStepStatus) => {
    switch (status) {
      case 'PENDING':
        return 'bg-muted text-muted-foreground';
      case 'IN_PROGRESS':
        return 'bg-primary/20 text-primary';
      case 'COMPLETED':
      case 'APPROVED':
        return 'bg-success/20 text-success';
      case 'REJECTED':
        return 'bg-destructive/20 text-destructive';
      case 'CANCELLED':
      case 'SKIPPED':
        return 'bg-warning/20 text-warning';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };
  
  // Get status icon
  const getStatusIcon = (status: WorkflowStatus | WorkflowStepStatus) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="h-4 w-4" />;
      case 'IN_PROGRESS':
        return <ArrowRight className="h-4 w-4" />;
      case 'COMPLETED':
      case 'APPROVED':
        return <CheckCircle className="h-4 w-4" />;
      case 'REJECTED':
        return <XCircle className="h-4 w-4" />;
      case 'CANCELLED':
      case 'SKIPPED':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };
  
  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (error) {
      return dateString;
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Workflow Management</CardTitle>
            <CardDescription>
              Manage approval workflows and processes
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : (
              <>
                <PlusCircle className="h-4 w-4 mr-2" />
                Create Workflow
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Workflow Form */}
        {showForm && (
          <Card className="border border-muted">
            <CardHeader className="py-4">
              <CardTitle className="text-lg">
                {editingWorkflowId ? 'Edit Workflow' : 'Create New Workflow'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="workflow-type">Workflow Type</Label>
                  <Select
                    value={workflowType}
                    onValueChange={(value) => setWorkflowType(value as WorkflowType)}
                  >
                    <SelectTrigger id="workflow-type">
                      <SelectValue placeholder="Select workflow type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POV_APPROVAL">POV Approval</SelectItem>
                      <SelectItem value="PHASE_APPROVAL">Phase Approval</SelectItem>
                      <SelectItem value="TASK_APPROVAL">Task Approval</SelectItem>
                      <SelectItem value="CUSTOM">Custom Workflow</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Steps Section */}
                <div className="space-y-4 border rounded-md p-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">Workflow Steps</h3>
                    <Badge variant="outline">
                      {workflowSteps.length} {workflowSteps.length === 1 ? 'Step' : 'Steps'}
                    </Badge>
                  </div>
                  
                  {/* Steps List */}
                  {workflowSteps.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {workflowSteps.map((step, index) => (
                          <TableRow key={index}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>{step.name}</TableCell>
                            <TableCell>{step.role}</TableCell>
                            <TableCell className="text-right">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => removeStep(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Remove</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  
                  {/* Add Step Form */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                      <Label htmlFor="step-name">Step Name</Label>
                      <Input
                        id="step-name"
                        value={stepName}
                        onChange={(e) => setStepName(e.target.value)}
                        placeholder="Enter step name"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="step-role">Required Role</Label>
                      <Input
                        id="step-role"
                        value={stepRole}
                        onChange={(e) => setStepRole(e.target.value)}
                        placeholder="Enter required role"
                      />
                    </div>
                    
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={addStep}
                    >
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Add Step
                    </Button>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2 pt-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={resetForm}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingWorkflowId ? 'Update Workflow' : 'Create Workflow'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        
        {/* Workflows List */}
        <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active">
              Active Workflows
              {activeWorkflows.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeWorkflows.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed Workflows
              {completedWorkflows.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {completedWorkflows.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="active" className="pt-4">
            {activeWorkflows.length > 0 ? (
              <div className="space-y-4">
                {activeWorkflows.map((workflow) => (
                  <Card key={workflow.id} className="overflow-hidden">
                    <CardHeader className="py-4 bg-muted/30">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-lg flex items-center">
                            {formatWorkflowType(workflow.type)}
                            <Badge className={`ml-2 ${getStatusBadgeColor(workflow.status)}`}>
                              <span className="flex items-center">
                                {getStatusIcon(workflow.status)}
                                <span className="ml-1">{workflow.status}</span>
                              </span>
                            </Badge>
                          </CardTitle>
                          <CardDescription>
                            Created: {formatDate(workflow.createdAt)}
                          </CardDescription>
                        </div>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="py-4">
                      <div className="space-y-4">
                        <h4 className="font-medium">Workflow Steps</h4>
                        <div className="space-y-2">
                          {workflow.steps.map((step, index) => (
                            <div 
                              key={step.id} 
                              className="flex items-center p-3 border rounded-md"
                            >
                              <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted">
                                {index + 1}
                              </div>
                              <div className="ml-4 flex-grow">
                                <div className="font-medium">{step.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  Role: {step.role}
                                </div>
                              </div>
                              <Badge className={getStatusBadgeColor(step.status)}>
                                <span className="flex items-center">
                                  {getStatusIcon(step.status)}
                                  <span className="ml-1">{step.status}</span>
                                </span>
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 border rounded-md bg-muted/20">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Active Workflows</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a new workflow to get started
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => setShowForm(true)}
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Create Workflow
                </Button>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="completed" className="pt-4">
            {completedWorkflows.length > 0 ? (
              <div className="space-y-4">
                {completedWorkflows.map((workflow) => (
                  <Card key={workflow.id} className="overflow-hidden">
                    <CardHeader className="py-4 bg-muted/30">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-lg flex items-center">
                            {formatWorkflowType(workflow.type)}
                            <Badge className={`ml-2 ${getStatusBadgeColor(workflow.status)}`}>
                              <span className="flex items-center">
                                {getStatusIcon(workflow.status)}
                                <span className="ml-1">{workflow.status}</span>
                              </span>
                            </Badge>
                          </CardTitle>
                          <CardDescription>
                            Completed: {formatDate(workflow.updatedAt)}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="py-4">
                      <div className="space-y-4">
                        <h4 className="font-medium">Workflow Steps</h4>
                        <div className="space-y-2">
                          {workflow.steps.map((step, index) => (
                            <div 
                              key={step.id} 
                              className="flex items-center p-3 border rounded-md"
                            >
                              <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-muted">
                                {index + 1}
                              </div>
                              <div className="ml-4 flex-grow">
                                <div className="font-medium">{step.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  Role: {step.role}
                                </div>
                                {step.comment && (
                                  <div className="text-sm mt-1 p-2 bg-muted rounded-md">
                                    {step.comment}
                                  </div>
                                )}
                              </div>
                              <Badge className={getStatusBadgeColor(step.status)}>
                                <span className="flex items-center">
                                  {getStatusIcon(step.status)}
                                  <span className="ml-1">{step.status}</span>
                                </span>
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 border rounded-md bg-muted/20">
                <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Completed Workflows</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Completed workflows will appear here
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
