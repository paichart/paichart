"use client";

import * as React from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { Card } from '@/components/ui/Card';
import { useTheme } from 'next-themes';

import { cn } from '@/lib/utils'; // Import cn utility

interface MarkdownRendererProps {
  content: string;
  className?: string; // Add className prop
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || theme === 'dusk';
  
  return (
    <Card className={cn("p-4 overflow-auto", className)}> {/* Apply className here, remove fixed height */}
      <div className={`prose prose-sm max-w-none ${isDark ? 'prose-invert' : ''}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ node, inline, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || '');
              return !inline && match ? (
                // Height-clamped + wrapped code blocks (Monitoring Medium,
                // 2026-06-10): long lines wrap instead of growing a nested
                // horizontal scrollbar; tall blocks scroll vertically within
                // a bounded box instead of dominating the panel.
                <div className="max-h-60 overflow-y-auto rounded">
                  <SyntaxHighlighter
                    style={isDark ? vscDarkPlus : vs}
                    language={match[1]}
                    PreTag="div"
                    wrapLongLines
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              ) : (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            // Add responsive styling to tables
            table({ node, ...props }: any) {
              return (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-300" {...props} />
                </div>
              );
            },
            // Style table headers
            th({ node, ...props }: any) {
              return (
                <th
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  {...props}
                />
              );
            },
            // Style table cells
            td({ node, ...props }: any) {
              return <td className="px-3 py-2 whitespace-nowrap" {...props} />;
            },
            // Style links
            a({ node, ...props }: any) {
              return <a className="text-blue-500 hover:underline" {...props} />;
            },
            // Style images
            img({ node, ...props }: any) {
              return (
                <div className="relative w-full h-[700px] my-4"> {/* Update image height */}
                  <Image
                    src={props.src || ''}
                    alt={props.alt || 'Image'}
                    fill
                    className="object-contain rounded-md"
                  />
                </div>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </Card>
  );
};

export default MarkdownRenderer;
