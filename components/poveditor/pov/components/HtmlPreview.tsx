"use client";

import * as React from 'react';
import sanitize from 'sanitize-html';
import { Card } from '@/components/ui/Card';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

import { cn } from '@/lib/utils'; // Import cn utility

interface HtmlPreviewProps {
  html: string;
  className?: string; // Add className prop
}

export const HtmlPreview: React.FC<HtmlPreviewProps> = ({ html, className }) => {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  
  // Function to sanitize HTML using sanitize-html library for comprehensive XSS protection
  const sanitizeHtml = React.useCallback((html: string): string => {
    return sanitize(html, {
      allowedTags: sanitize.defaults.allowedTags.concat(['img', 'h1', 'h2', 'style']),
      allowedAttributes: {
        ...sanitize.defaults.allowedAttributes,
        'a': ['href', 'name', 'target', 'rel'],
        'img': ['src', 'alt', 'title', 'width', 'height'],
        '*': ['class', 'style']
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      // Prevent javascript: and data: URLs
      allowedSchemesByTag: {
        a: ['http', 'https', 'mailto'],
        img: ['http', 'https']
      },
      // Transform links to open in new tab safely
      transformTags: {
        'a': (tagName, attribs) => ({
          tagName,
          attribs: {
            ...attribs,
            target: '_blank',
            rel: 'noopener noreferrer'
          }
        })
      }
    });
  }, []);
  
  // Function to create a full HTML document
  const createHtmlDocument = React.useCallback((html: string): string => {
    // Check if the HTML already includes doctype or html tags
    if (html.trim().toLowerCase().startsWith('<!doctype html>') || 
        html.trim().toLowerCase().startsWith('<html')) {
      return sanitizeHtml(html);
    }
    
    // Otherwise, wrap the content in a basic HTML document
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
              line-height: 1.5;
              color: #333;
              margin: 0;
              padding: 16px;
            }
            
            a {
              color: #0070f3;
              text-decoration: none;
            }
            
            a:hover {
              text-decoration: underline;
            }
            
            img {
              max-width: 100%;
              height: auto;
            }
            
            pre, code {
              background-color: #f5f5f5;
              border-radius: 3px;
              padding: 0.2em 0.4em;
              font-family: SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
            }
            
            pre {
              padding: 1em;
              overflow: auto;
            }
            
            table {
              border-collapse: collapse;
              width: 100%;
            }
            
            table, th, td {
              border: 1px solid #ddd;
            }
            
            th, td {
              padding: 8px;
              text-align: left;
            }
            
            th {
              background-color: #f5f5f5;
            }
            
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
          </style>
        </head>
        <body>
          ${sanitizeHtml(html)}
        </body>
      </html>
    `;
  }, [sanitizeHtml]);
  
  // Function to refresh the iframe
  const refreshIframe = React.useCallback(() => {
    setIsLoading(true);
    setError(null);
    
    if (iframeRef.current) {
      try {
        const iframe = iframeRef.current;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        
        if (doc) {
          doc.open();
          doc.write(createHtmlDocument(html));
          doc.close();
          
          // No longer adjusting iframe height to content, let CSS handle it
          iframe.onload = () => {
            setIsLoading(false);
          };
        }
      } catch {
        setError('Failed to render HTML content. There might be security restrictions or invalid HTML.');
        setIsLoading(false);
      }
    }
  }, [html, createHtmlDocument]);
  
  // Initialize the iframe
  React.useEffect(() => {
    refreshIframe();
    
    // Add event listener for iframe errors
    const handleIframeError = () => {
      setError('Failed to load HTML content');
      setIsLoading(false);
    };
    
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('error', handleIframeError);
    }
    
    return () => {
      if (iframe) {
        iframe.removeEventListener('error', handleIframeError);
      }
    };
  }, [refreshIframe]);
  
  return (
    <Card className={cn("overflow-hidden", className)}> {/* Apply className here */}
      {error && (
        <Alert variant="destructive" className="mb-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <div className="flex justify-end p-2 bg-muted/20 border-b">
        <Button
          variant="outline"
          size="sm"
          onClick={refreshIframe}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      
      <div className="relative w-full h-full"> {/* Remove fixed height, use h-full */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          className="w-full h-full border-0"
          sandbox="allow-same-origin"
          title="HTML Preview"
        />
      </div>
    </Card>
  );
};

export default HtmlPreview;
