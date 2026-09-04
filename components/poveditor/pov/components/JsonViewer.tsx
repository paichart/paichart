"use client";

import * as React from 'react';
import { Card } from '@/components/ui/Card';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface JsonViewerProps {
  data: any;
  expandedByDefault?: boolean;
  className?: string; // Add className prop
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ 
  data, 
  expandedByDefault = false,
  className // Destructure className
}) => {
  const [copied, setCopied] = React.useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <Card className={cn("p-4 overflow-auto relative", className)}> {/* Apply className here */}
      <Button
        variant="outline"
        size="sm"
        className="absolute top-2 right-2 z-10"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-4 w-4 mr-1" />
        ) : (
          <Copy className="h-4 w-4 mr-1" />
        )}
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <div className="font-mono text-sm mt-8">
        <JsonNode data={data} name="root" isRoot expandedByDefault={expandedByDefault} />
      </div>
    </Card>
  );
};

interface JsonNodeProps {
  data: any;
  name: string;
  isRoot?: boolean;
  expandedByDefault?: boolean;
}

const JsonNode: React.FC<JsonNodeProps> = ({ 
  data, 
  name, 
  isRoot = false,
  expandedByDefault = false
}) => {
  const [expanded, setExpanded] = React.useState(expandedByDefault);
  
  // Determine the type of data
  const type = Array.isArray(data) ? 'array' : typeof data;
  
  // Format the value based on type
  const formatValue = (value: any): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    return String(value);
  };
  
  // Check if the data is expandable
  const isExpandable = type === 'object' || type === 'array';
  
  // Get the number of items (with null check)
  const itemCount = isExpandable && data !== null && data !== undefined ? Object.keys(data).length : 0;
  
  // Toggle expanded state
  const toggleExpanded = () => {
    setExpanded(!expanded);
  };
  
  // Render the node
  return (
    <div className={cn("ml-4", isRoot && "ml-0")}>
      <div 
        className="flex items-center cursor-pointer" 
        onClick={isExpandable ? toggleExpanded : undefined}
      >
        {isExpandable ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 mr-1 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 mr-1 text-muted-foreground" />
          )
        ) : (
          <span className="w-4 mr-1" />
        )}
        
        {!isRoot && (
          <>
            <span className="text-blue-500">{name}</span>
            <span className="mr-1">: </span>
          </>
        )}
        
        {isExpandable ? (
          <>
            <span className="text-muted-foreground">
              {type === 'array' ? '[' : '{'}
            </span>
            {!expanded && (
              <>
                <span className="text-muted-foreground ml-1">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
                <span className="text-muted-foreground ml-1">
                  {type === 'array' ? ']' : '}'}
                </span>
              </>
            )}
          </>
        ) : (
          <span className={cn(
            type === 'string' && "text-green-500",
            type === 'number' && "text-amber-500",
            type === 'boolean' && "text-purple-500",
            (data === null || data === undefined) && "text-gray-500"
          )}>
            {formatValue(data)}
          </span>
        )}
      </div>
      
      {isExpandable && expanded && data !== null && data !== undefined && (
        <div className="ml-4">
          {Object.entries(data).map(([key, value]) => (
            <JsonNode 
              key={key} 
              data={value} 
              name={key} 
              expandedByDefault={expandedByDefault} 
            />
          ))}
          <div className="text-muted-foreground">
            {type === 'array' ? ']' : '}'}
          </div>
        </div>
      )}
    </div>
  );
};

export default JsonViewer;
