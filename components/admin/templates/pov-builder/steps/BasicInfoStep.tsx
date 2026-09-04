"use client";

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { X, Plus } from 'lucide-react';

interface BasicInfoStepProps {
  name: string;
  description: string;
  tags: string[];
  onUpdate: (name: string, description: string, tags: string[]) => void;
}

export function BasicInfoStep({ name, description, tags, onUpdate }: BasicInfoStepProps) {
  const [localName, setLocalName] = useState(name);
  const [localDescription, setLocalDescription] = useState(description);
  const [localTags, setLocalTags] = useState<string[]>(tags);
  const [newTag, setNewTag] = useState('');
  
  // Update local state when props change
  useEffect(() => {
    setLocalName(name);
    setLocalDescription(description);
    setLocalTags(tags);
  }, [name, description, tags]);
  
  // Add a new tag
  const handleAddTag = () => {
    if (newTag.trim() && !localTags.includes(newTag.trim())) {
      const updatedTags = [...localTags, newTag.trim()];
      setLocalTags(updatedTags);
      setNewTag('');
      onUpdate(localName, localDescription, updatedTags);
    }
  };
  
  // Remove a tag
  const handleRemoveTag = (tagToRemove: string) => {
    const updatedTags = localTags.filter(tag => tag !== tagToRemove);
    setLocalTags(updatedTags);
    onUpdate(localName, localDescription, updatedTags);
  };
  
  // Handle Enter key in tag input
  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="template-name">Template Name</Label>
        <Input
          id="template-name"
          placeholder="Enter template name"
          value={localName}
          onChange={(e) => {
            const newName = e.target.value;
            setLocalName(newName);
            onUpdate(newName, localDescription, localTags);
          }}
          className="w-full"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="template-description">Description</Label>
        <Textarea
          id="template-description"
          placeholder="Enter template description"
          value={localDescription}
          onChange={(e) => {
            const newDescription = e.target.value;
            setLocalDescription(newDescription);
            onUpdate(localName, newDescription, localTags);
          }}
          className="w-full min-h-[100px]"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="template-tags">Tags</Label>
        <div className="flex">
          <Input
            id="template-tags"
            placeholder="Add a tag"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={handleTagKeyDown}
            className="flex-1 mr-2"
          />
          <Button 
            type="button" 
            onClick={handleAddTag}
            disabled={!newTag.trim() || localTags.includes(newTag.trim())}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>
        
        <div className="flex flex-wrap gap-2 mt-2">
          {localTags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tags added yet</p>
          ) : (
            localTags.map(tag => (
              <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                {tag}
                <button 
                  type="button" 
                  onClick={() => handleRemoveTag(tag)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
        </div>
      </div>
      
      <div className="space-y-2">
        <Label>Template Type</Label>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="bg-primary/10 dark:bg-primary/20">POV Template</Badge>
          <span className="text-sm text-muted-foreground">
            This template will be used for creating new POVs
          </span>
        </div>
      </div>
      
      {/* Template Preview removed as requested */}
    </div>
  );
}

export default BasicInfoStep;