"use client";

import { useEditorContext } from '../context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useState } from 'react';
import { PlusCircle, Trash2, Edit, Link, FileText, ExternalLink, Upload } from 'lucide-react';

// Resource types
type ResourceType = 'LINK' | 'DOCUMENT' | 'CONTACT' | 'OTHER';

interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  url?: string;
  description?: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

export default function ResourcesSection() {
  const { state, updateField } = useEditorContext();
  const { data } = state;
  
  // Local state for resource management
  const [showForm, setShowForm] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [resourceName, setResourceName] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType>('LINK');
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceDescription, setResourceDescription] = useState('');
  
  // Get resources from state
  const resources = data.resources ? JSON.parse(data.resources as string) as Resource[] : [];
  
  // Reset form
  const resetForm = () => {
    setResourceName('');
    setResourceType('LINK');
    setResourceUrl('');
    setResourceDescription('');
    setEditingResourceId(null);
    setShowForm(false);
  };
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newResource: Resource = {
      id: editingResourceId || `resource-${Date.now()}`,
      name: resourceName,
      type: resourceType,
      url: resourceUrl,
      description: resourceDescription,
      uploadedBy: 'Current User', // This would be replaced with actual user info
      uploadedAt: new Date().toISOString(),
    };
    
    let updatedResources: Resource[];
    
    if (editingResourceId) {
      // Update existing resource
      updatedResources = resources.map(resource => 
        resource.id === editingResourceId ? newResource : resource
      );
    } else {
      // Add new resource
      updatedResources = [...resources, newResource];
    }
    
    // Update state
    updateField(['data', 'resources'], JSON.stringify(updatedResources));
    
    resetForm();
  };
  
  // Delete resource
  const handleDeleteResource = (resourceId: string) => {
    const updatedResources = resources.filter(resource => resource.id !== resourceId);
    updateField(['data', 'resources'], JSON.stringify(updatedResources));
  };
  
  // Edit resource
  const handleEditResource = (resource: Resource) => {
    setEditingResourceId(resource.id);
    setResourceName(resource.name);
    setResourceType(resource.type);
    setResourceUrl(resource.url || '');
    setResourceDescription(resource.description || '');
    setShowForm(true);
  };
  
  // Get icon for resource type
  const getResourceIcon = (type: ResourceType) => {
    switch (type) {
      case 'LINK':
        return <Link className="h-4 w-4" />;
      case 'DOCUMENT':
        return <FileText className="h-4 w-4" />;
      case 'CONTACT':
        return <ExternalLink className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };
  
  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (error) {
      return '';
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Resources</CardTitle>
            <CardDescription>
              Manage documents, links, and other resources for this POV
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
                Add Resource
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Resource Form */}
        {showForm && (
          <Card className="border border-muted">
            <CardHeader className="py-4">
              <CardTitle className="text-lg">
                {editingResourceId ? 'Edit Resource' : 'Add New Resource'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="resource-name">Resource Name</Label>
                  <Input
                    id="resource-name"
                    value={resourceName}
                    onChange={(e) => setResourceName(e.target.value)}
                    placeholder="Enter resource name"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="resource-type">Resource Type</Label>
                  <select
                    id="resource-type"
                    value={resourceType}
                    onChange={(e) => setResourceType(e.target.value as ResourceType)}
                    className="w-full p-2 border rounded-md"
                    required
                  >
                    <option value="LINK">Link</option>
                    <option value="DOCUMENT">Document</option>
                    <option value="CONTACT">Contact</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="resource-url">URL / Location</Label>
                  <Input
                    id="resource-url"
                    value={resourceUrl}
                    onChange={(e) => setResourceUrl(e.target.value)}
                    placeholder="Enter URL or location"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="resource-description">Description</Label>
                  <Input
                    id="resource-description"
                    value={resourceDescription}
                    onChange={(e) => setResourceDescription(e.target.value)}
                    placeholder="Enter description"
                  />
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
                    {editingResourceId ? 'Update Resource' : 'Add Resource'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        
        {/* Upload Section */}
        <div className="border border-dashed rounded-md p-6 text-center">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <h3 className="text-lg font-medium mb-1">Upload Files</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Drag and drop files here or click to browse
          </p>
          <Button variant="outline">
            Browse Files
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Max file size: 10MB
          </p>
        </div>
        
        {/* Resources Table */}
        {resources.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((resource: Resource) => (
                <TableRow key={resource.id}>
                  <TableCell>
                    <div className="flex items-center">
                      {getResourceIcon(resource.type)}
                      <span className="ml-2">{resource.type}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {resource.url ? (
                      <a 
                        href={resource.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center"
                      >
                        {resource.name}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    ) : (
                      resource.name
                    )}
                  </TableCell>
                  <TableCell>{resource.description}</TableCell>
                  <TableCell>{formatDate(resource.uploadedAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleEditResource(resource)}
                      >
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDeleteResource(resource.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 border rounded-md bg-muted/20">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Resources</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add documents, links, and other resources to help with this POV
            </p>
            <Button 
              variant="outline" 
              onClick={() => setShowForm(true)}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Your First Resource
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
