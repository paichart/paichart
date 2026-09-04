import React, { useState } from 'react';
import { Info, GitBranch } from 'lucide-react';
import { Stage } from '../types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { DependencyGraph } from './DependencyGraph';

interface TemplatePreviewProps {
  name: string;
  description: string;
  stages: Stage[];
  getTaskTypeIcon: (type: string) => React.ReactNode;
}

export function TemplatePreview({ 
  name, 
  description, 
  stages,
  getTaskTypeIcon
}: TemplatePreviewProps) {
  const [activeTab, setActiveTab] = useState('standard');
  
  // Check if there are any dependencies in the template
  const hasDependencies = stages.some(stage => 
    stage.tasks.some(task => task.dependencies && task.dependencies.length > 0)
  );
  
  return (
    <div className="space-y-6">
      <div className="bg-primary/10 border border-primary/20 p-4 rounded-md">
        <div className="flex items-start">
          <Info className="h-5 w-5 text-primary mr-2 mt-0.5" />
          <div>
            <h3 className="font-medium text-primary-foreground">Template Preview</h3>
            <p className="text-sm text-primary-foreground/80 mt-1">
              This is a preview of how your phase template will look when applied to a POV.
            </p>
          </div>
        </div>
      </div>
      
      <div className="border rounded-lg p-6 bg-card">
        <h2 className="text-2xl font-bold mb-2">{name || 'Untitled Template'}</h2>
        {description && <p className="text-muted-foreground mb-4">{description}</p>}
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList>
            <TabsTrigger value="standard" className="flex items-center">Standard View</TabsTrigger>
            <TabsTrigger value="dependencies" disabled={!hasDependencies} className="flex items-center">
              <GitBranch className="h-4 w-4 mr-2" />
              Dependencies
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="dependencies" className="pt-4">
            {hasDependencies ? (
              <DependencyGraph 
                stages={stages}
                templateName={name || 'Untitled Template'}
              />
            ) : (
              <div className="text-center p-8 border rounded-lg bg-muted">
                <p className="text-muted-foreground">No task dependencies defined</p>
                <p className="text-sm text-muted-foreground/80 mt-1">
                  Add dependencies between tasks to see the dependency graph
                </p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="standard" className="pt-4">
            {stages.length === 0 ? (
              <div className="text-center p-8 border rounded-lg bg-muted">
                <p className="text-muted-foreground">No stages defined yet</p>
                <p className="text-sm text-muted-foreground/80 mt-1">
                  Switch to the Design tab to add stages and tasks
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {stages.map((stage, index) => (
                  <div 
                    key={stage.name}
                    className="border rounded-lg overflow-hidden"
                    style={{ borderLeftWidth: '4px', borderLeftColor: 'hsl(var(--primary))' }}
                  >
                    <div className="bg-muted p-4">
                      <div className="flex items-center">
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center mr-3 text-primary-foreground font-medium"
                          style={{ backgroundColor: 'hsl(var(--primary))' }}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <h3 className="font-bold">{stage.name}</h3>
                          {stage.description && (
                            <p className="text-sm text-muted-foreground">{stage.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4">
                      {stage.tasks.length === 0 ? (
                        <div className="text-center p-4 border rounded-md bg-muted">
                          <p className="text-muted-foreground">No tasks in this stage</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {stage.tasks.map((task) => (
                            <div
                              key={task.id || (task as any).key}
                              className="flex items-center p-2 border rounded-md"
                            >
                              <div className="mr-2">
                                {getTaskTypeIcon(task.type)}
                              </div>
                              <div className="flex-1">
                                <div className="font-medium">{task.title}</div>
                                {task.description && (
                                  <div className="text-xs text-muted-foreground">{task.description}</div>
                                )}
                                {task.dependencies && task.dependencies.length > 0 && (
                                  <div className="mt-1 flex items-center">
                                    <GitBranch className="h-3 w-3 text-primary mr-1" />
                                    <span className="text-xs text-primary">
                                      {task.dependencies.length} {task.dependencies.length === 1 ? 'dependency' : 'dependencies'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
