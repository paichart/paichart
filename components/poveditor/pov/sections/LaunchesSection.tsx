"use client";

import { useEditorContext } from '../context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Checkbox } from '@/components/ui/Checkbox';
import { Progress } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useState } from 'react';
import { Rocket, CheckCircle, AlertCircle, Clock, Calendar, PlusCircle, Edit, Save } from 'lucide-react';

// Launch checklist item interface
interface ChecklistItem {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  required: boolean;
  category: string;
}

// Launch interface
interface Launch {
  id: string;
  povId: string;
  confirmed: boolean;
  checklist: ChecklistItem[];
  launchedAt?: string;
  launchedBy?: string;
}

export default function LaunchesSection() {
  const { state, updateField } = useEditorContext();
  const { data } = state;
  
  // Local state for launch management
  const [activeTab, setActiveTab] = useState('checklist');
  const [editMode, setEditMode] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('General');
  const [newItemRequired, setNewItemRequired] = useState(true);
  
  // Get launch data from state
  const launch = data.launch ? JSON.parse(data.launch as string) as Launch : {
    id: `launch-${Date.now()}`,
    povId: data.id || '',
    confirmed: false,
    checklist: [],
  };
  
  // Group checklist items by category
  const groupedChecklist = launch.checklist.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);
  
  // Calculate progress
  const calculateProgress = () => {
    if (launch.checklist.length === 0) return 0;
    
    const completed = launch.checklist.filter(item => item.completed).length;
    return Math.round((completed / launch.checklist.length) * 100);
  };
  
  // Calculate required items progress
  const calculateRequiredProgress = () => {
    const requiredItems = launch.checklist.filter(item => item.required);
    if (requiredItems.length === 0) return 0;
    
    const completedRequired = requiredItems.filter(item => item.completed).length;
    return Math.round((completedRequired / requiredItems.length) * 100);
  };
  
  // Check if all required items are completed
  const allRequiredCompleted = () => {
    const requiredItems = launch.checklist.filter(item => item.required);
    return requiredItems.every(item => item.completed);
  };
  
  // Handle checklist item toggle
  const handleToggleItem = (itemId: string) => {
    const updatedChecklist = launch.checklist.map(item => {
      if (item.id === itemId) {
        return { ...item, completed: !item.completed };
      }
      return item;
    });
    
    const updatedLaunch = { ...launch, checklist: updatedChecklist };
    updateField(['data', 'launch'], JSON.stringify(updatedLaunch));
  };
  
  // Handle add new checklist item
  const handleAddItem = () => {
    if (!newItemTitle.trim()) return;
    
    const newItem: ChecklistItem = {
      id: `checklist-item-${Date.now()}`,
      title: newItemTitle,
      description: newItemDescription || undefined,
      completed: false,
      required: newItemRequired,
      category: newItemCategory || 'General',
    };
    
    const updatedChecklist = [...launch.checklist, newItem];
    const updatedLaunch = { ...launch, checklist: updatedChecklist };
    updateField(['data', 'launch'], JSON.stringify(updatedLaunch));
    
    // Reset form
    setNewItemTitle('');
    setNewItemDescription('');
    setNewItemRequired(true);
  };
  
  // Handle launch confirmation
  const handleConfirmLaunch = () => {
    if (!allRequiredCompleted()) {
      alert('Please complete all required checklist items before confirming launch.');
      return;
    }
    
    const updatedLaunch = { 
      ...launch, 
      confirmed: true,
      launchedAt: new Date().toISOString(),
      launchedBy: 'Current User', // This would be replaced with actual user info
    };
    
    updateField(['data', 'launch'], JSON.stringify(updatedLaunch));
  };
  
  // Format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleString();
    } catch (error) {
      return '';
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Launch Management</CardTitle>
            <CardDescription>
              Manage launch checklist and confirm POV launch
            </CardDescription>
          </div>
          <div className="flex space-x-2">
            {activeTab === 'checklist' && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Done Editing
                  </>
                ) : (
                  <>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Checklist
                  </>
                )}
              </Button>
            )}
            {!launch.confirmed && (
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleConfirmLaunch}
                disabled={!allRequiredCompleted()}
              >
                <Rocket className="h-4 w-4 mr-2" />
                Confirm Launch
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Launch Status */}
        <Card className="border">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <div>
                <h3 className="text-lg font-medium mb-1">Launch Status</h3>
                <div className="flex items-center">
                  {launch.confirmed ? (
                    <>
                      <Badge className="bg-success/20 text-success">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Launched
                      </Badge>
                      <span className="ml-2 text-sm text-muted-foreground">
                        Launched on {formatDate(launch.launchedAt)}
                      </span>
                    </>
                  ) : (
                    <>
                      <Badge className="bg-warning/20 text-warning">
                        <Clock className="h-4 w-4 mr-1" />
                        Pending
                      </Badge>
                      <span className="ml-2 text-sm text-muted-foreground">
                        {allRequiredCompleted() 
                          ? 'Ready to launch' 
                          : 'Complete required checklist items to launch'}
                      </span>
                    </>
                  )}
                </div>
              </div>
              
              <div className="space-y-2 w-full md:w-1/2">
                <div className="flex justify-between text-sm">
                  <span>Overall Progress</span>
                  <span>{calculateProgress()}%</span>
                </div>
                <Progress value={calculateProgress()} className="h-2" />
                
                <div className="flex justify-between text-sm">
                  <span>Required Items</span>
                  <span>{calculateRequiredProgress()}%</span>
                </div>
                <Progress value={calculateRequiredProgress()} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Tabs */}
        <Tabs defaultValue="checklist" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="status">Launch Status</TabsTrigger>
          </TabsList>
          
          <TabsContent value="checklist" className="pt-4">
            {/* Add New Item Form (in edit mode) */}
            {editMode && (
              <Card className="border mb-6">
                <CardHeader className="py-4">
                  <CardTitle className="text-lg">Add Checklist Item</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="item-title">Title</Label>
                    <Input
                      id="item-title"
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      placeholder="Enter checklist item title"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="item-description">Description (Optional)</Label>
                    <Input
                      id="item-description"
                      value={newItemDescription}
                      onChange={(e) => setNewItemDescription(e.target.value)}
                      placeholder="Enter description"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="item-category">Category</Label>
                    <Input
                      id="item-category"
                      value={newItemCategory}
                      onChange={(e) => setNewItemCategory(e.target.value)}
                      placeholder="Enter category"
                    />
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="item-required"
                      checked={newItemRequired}
                      onCheckedChange={(checked) => setNewItemRequired(checked as boolean)}
                    />
                    <Label htmlFor="item-required">Required for launch</Label>
                  </div>
                  
                  <Button onClick={handleAddItem}>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </CardContent>
              </Card>
            )}
            
            {/* Checklist */}
            {Object.keys(groupedChecklist).length > 0 ? (
              <div className="space-y-6">
                {Object.entries(groupedChecklist).map(([category, items]) => (
                  <div key={category}>
                    <h3 className="font-medium mb-3">{category}</h3>
                    <div className="space-y-2">
                      {items.map(item => (
                        <div 
                          key={item.id} 
                          className={`p-4 border rounded-md ${item.completed ? 'bg-success/5 border-success/20' : ''}`}
                        >
                          <div className="flex items-start">
                            <Checkbox
                              id={item.id}
                              checked={item.completed}
                              onCheckedChange={() => handleToggleItem(item.id)}
                              className="mt-1"
                              disabled={launch.confirmed}
                            />
                            <div className="ml-3">
                              <Label 
                                htmlFor={item.id} 
                                className={`font-medium ${item.completed ? 'line-through text-muted-foreground' : ''}`}
                              >
                                {item.title}
                                {item.required && (
                                  <span className="ml-2 text-destructive">*</span>
                                )}
                              </Label>
                              {item.description && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 border rounded-md bg-muted/20">
                <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Checklist Items</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add checklist items to prepare for launch
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setEditMode(true);
                    setActiveTab('checklist');
                  }}
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add Checklist Item
                </Button>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="status" className="pt-4">
            <Card className="border">
              <CardContent className="p-6 space-y-6">
                <div>
                  <h3 className="font-medium mb-2">Launch Details</h3>
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm text-muted-foreground">Status</Label>
                        <div className="font-medium">
                          {launch.confirmed ? (
                            <Badge className="bg-success/20 text-success">
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Launched
                            </Badge>
                          ) : (
                            <Badge className="bg-warning/20 text-warning">
                              <Clock className="h-4 w-4 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {launch.confirmed && (
                        <>
                          <div>
                            <Label className="text-sm text-muted-foreground">Launch Date</Label>
                            <div className="font-medium flex items-center">
                              <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                              {formatDate(launch.launchedAt)}
                            </div>
                          </div>
                          
                          <div>
                            <Label className="text-sm text-muted-foreground">Launched By</Label>
                            <div className="font-medium">
                              {launch.launchedBy || 'Unknown'}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Checklist Summary</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className="border">
                        <CardContent className="p-4 text-center">
                          <div className="text-3xl font-bold mb-1">
                            {launch.checklist.length}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Total Items
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className="border">
                        <CardContent className="p-4 text-center">
                          <div className="text-3xl font-bold mb-1 text-success">
                            {launch.checklist.filter(item => item.completed).length}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Completed
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className="border">
                        <CardContent className="p-4 text-center">
                          <div className="text-3xl font-bold mb-1 text-warning">
                            {launch.checklist.filter(item => !item.completed).length}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Pending
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Overall Progress</span>
                        <span>{calculateProgress()}%</span>
                      </div>
                      <Progress value={calculateProgress()} className="h-2" />
                      
                      <div className="flex justify-between text-sm">
                        <span>Required Items</span>
                        <span>{calculateRequiredProgress()}%</span>
                      </div>
                      <Progress value={calculateRequiredProgress()} className="h-2" />
                    </div>
                  </div>
                </div>
                
                {!launch.confirmed && (
                  <div className="pt-4">
                    <Button 
                      onClick={handleConfirmLaunch}
                      disabled={!allRequiredCompleted()}
                      className="w-full"
                    >
                      <Rocket className="h-4 w-4 mr-2" />
                      {allRequiredCompleted() 
                        ? 'Confirm Launch' 
                        : 'Complete Required Items to Launch'}
                    </Button>
                    {!allRequiredCompleted() && (
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        All required checklist items must be completed before launch
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
