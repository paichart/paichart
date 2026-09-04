'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';

interface FormatDocumentationLinkProps {
  className?: string;
}

export function FormatDocumentationLink({ className }: FormatDocumentationLinkProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="/admin/templates/phase/format-guide" passHref>
            <Button variant="outline" className={`flex items-center ${className || ''}`}>
              <FileText className="h-4 w-4 mr-2" />
              Format Guide
            </Button>
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          <p>View documentation on template import/export format</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
