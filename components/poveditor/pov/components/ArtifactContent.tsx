"use client";

import * as React from 'react';
import Image from 'next/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Textarea } from '@/components/ui/Textarea';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { AlertCircle } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { JsonViewer } from './JsonViewer';
import { HtmlPreview } from './HtmlPreview';

interface Artifact {
  id: string;
  name: string;
  type: string;
  content: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

interface ArtifactContentProps {
  artifact: Artifact;
  error?: string | null;
}

export const ArtifactContent: React.FC<ArtifactContentProps> = ({
  artifact,
  error
}) => {
  // Determine if content is JSON
  const isJson = React.useMemo(() => {
    try {
      if (artifact.type === 'json') return true;
      JSON.parse(artifact.content);
      return true;
    } catch (e) {
      return false;
    }
  }, [artifact.content, artifact.type]);

  // Extract finalResponse from JSON artifacts for the "Report" tab.
  // Specialist executions (result.json) and pipeline harness executions
  // (pipeline-index.json) both embed their human-readable narrative in
  // `finalResponse`. When present, surface it as a pre-rendered markdown
  // tab so humans don't have to ctrl-F the JSON blob for the prose.
  // This compensates for Phase 1 of the 2026-04-15 artifact-naming reform
  // where we stopped writing report.md for intermediate specialists.
  const extractedReport = React.useMemo<string | null>(() => {
    if (!isJson || !artifact.content) return null;
    try {
      const parsed = typeof artifact.content === 'string'
        ? JSON.parse(artifact.content)
        : artifact.content;
      const candidate = parsed?.finalResponse;
      return typeof candidate === 'string' && candidate.trim().length > 0
        ? candidate
        : null;
    } catch {
      return null;
    }
  }, [artifact.content, isJson]);
  
  // Determine if content is HTML
  const isHtml = React.useMemo(() => {
    if (!artifact.content) return false;
    return artifact.type === 'html' || 
      artifact.content.trim().startsWith('<!DOCTYPE html>') || 
      artifact.content.trim().startsWith('<html');
  }, [artifact.content, artifact.type]);
  
  // Determine if content is Markdown
  const isMarkdown = React.useMemo(() => {
    if (!artifact.name) return false;
    return artifact.type === 'markdown' || 
      artifact.name.endsWith('.md') || 
      artifact.name.endsWith('.markdown');
  }, [artifact.name, artifact.type]);
  
  // Determine if content is an image
  const isImage = React.useMemo(() => {
    if (!artifact.name) return false;
    return artifact.type === 'image' || 
      /\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(artifact.name);
  }, [artifact.name, artifact.type]);
  
  // Determine if content is code
  const isCode = React.useMemo(() => {
    if (!artifact.name) return false;
    return artifact.type === 'code' || 
      /\.(js|ts|jsx|tsx|py|java|c|cpp|cs|go|rb|php|swift|kt|rs|sql)$/i.test(artifact.name);
  }, [artifact.name, artifact.type]);
  
  // Get language for code highlighting
  const getLanguage = React.useMemo(() => {
    if (!artifact.name) return 'plaintext';
    const extension = artifact.name.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'js':
        return 'javascript';
      case 'ts':
        return 'typescript';
      case 'jsx':
        return 'jsx';
      case 'tsx':
        return 'tsx';
      case 'py':
        return 'python';
      case 'java':
        return 'java';
      case 'c':
        return 'c';
      case 'cpp':
        return 'cpp';
      case 'cs':
        return 'csharp';
      case 'go':
        return 'go';
      case 'rb':
        return 'ruby';
      case 'php':
        return 'php';
      case 'swift':
        return 'swift';
      case 'kt':
        return 'kotlin';
      case 'rs':
        return 'rust';
      case 'sql':
        return 'sql';
      default:
        return 'plaintext';
    }
  }, [artifact.name]);
  
  // Render content for the "rendered" tab — format-appropriate view for the
  // artifact's primary content type. The "report" and "raw" tabs have their
  // own TabsContent blocks that render directly.
  const renderContent = () => {
    if (isJson) {
      try {
        if (!artifact.content) return null;
        const jsonData = typeof artifact.content === 'string' 
          ? JSON.parse(artifact.content) 
          : artifact.content;
        return <JsonViewer data={jsonData} className="h-[700px] overflow-y-auto" />;
      } catch (e) {
        return (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to parse JSON content</AlertDescription>
          </Alert>
        );
      }
    }
    
    if (isHtml) {
      return <HtmlPreview html={artifact.content} className="h-[700px] overflow-y-auto" />;
    }
    
    if (isMarkdown) {
      return <MarkdownRenderer content={artifact.content} className="h-[700px] overflow-y-auto" />;
    }
    
    if (isImage) {
      try {
        if (!artifact.content) return null;
        // Try to render as base64 image
        const isBase64 = artifact.content.startsWith('data:image/');
        const src = isBase64 ? artifact.content : `data:image/png;base64,${artifact.content}`;
        
        return (
          <div className="flex justify-center p-4">
            <div className="relative w-full h-[700px]">
              <Image
                src={src}
                alt={artifact.name}
                fill
                className="object-contain"
              />
            </div>
          </div>
        );
      } catch (e) {
        return (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to render image content</AlertDescription>
          </Alert>
        );
      }
    }
    
    if (isCode) {
      // For code, we'll just use a textarea for now
      // In a future enhancement, we could add syntax highlighting
      return (
        <Textarea
          value={artifact.content}
          readOnly
          className="font-mono text-sm h-[700px] resize-none"
        />
      );
    }
    
    // Default to raw view for unknown types
    return (
      <Textarea
        value={artifact.content}
        readOnly
        className="font-mono text-sm h-[700px] resize-none"
      />
    );
  };
  
  // Determine if we should show view mode tabs
  const showViewModeTabs = isJson || isHtml || isMarkdown || isImage || isCode;
  const showReportTab = !!extractedReport;
  const defaultTab = showReportTab ? 'report' : 'rendered';

  return (
    <div className="p-3">
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showViewModeTabs ? (
        <Tabs key={artifact.id} defaultValue={defaultTab}>
          <TabsList className="mb-2">
            {showReportTab && <TabsTrigger value="report">Report</TabsTrigger>}
            <TabsTrigger value="rendered">{isJson ? 'JSON' : 'Rendered'}</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
          </TabsList>
          {showReportTab && (
            <TabsContent value="report" className="mt-0">
              <MarkdownRenderer content={extractedReport!} className="h-[700px] overflow-y-auto" />
            </TabsContent>
          )}
          <TabsContent value="rendered" className="mt-0">
            {renderContent()}
          </TabsContent>
          <TabsContent value="raw" className="mt-0">
            <Textarea
              value={artifact.content}
              readOnly
              className="font-mono text-sm h-[700px] resize-none"
            />
          </TabsContent>
        </Tabs>
      ) : (
        renderContent()
      )}
    </div>
  );
};

export default ArtifactContent;
