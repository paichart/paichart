'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Download, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';

interface ExportButtonProps {
  onExport: (format: 'csv' | 'pdf' | 'json') => Promise<void> | void;
  disabled?: boolean;
  formats?: ('csv' | 'pdf' | 'json')[];
  label?: string;
}

/**
 * ExportButton Component
 * Phase 1+3B: Reusable export functionality
 *
 * Features:
 * - Export analytics data to CSV, PDF, or JSON
 * - Dropdown menu for format selection
 * - Loading state during export
 * - Customizable formats and label
 *
 * Usage:
 * <ExportButton
 *   onExport={async (format) => {
 *     const data = await fetchData();
 *     downloadFile(data, format);
 *   }}
 *   formats={['csv', 'pdf']}
 * />
 */
export function ExportButton({
  onExport,
  disabled = false,
  formats = ['csv', 'pdf', 'json'],
  label = 'Export'
}: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: 'csv' | 'pdf' | 'json') => {
    try {
      setIsExporting(true);
      await onExport(format);
    } catch {
      // Export failed
    } finally {
      setIsExporting(false);
    }
  };

  if (formats.length === 1) {
    // Single format - direct button
    return (
      <Button
        onClick={() => handleExport(formats[0])}
        disabled={disabled || isExporting}
        variant="outline"
        size="sm"
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        {label}
      </Button>
    );
  }

  // Multiple formats - dropdown menu
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          disabled={disabled || isExporting}
          variant="outline"
          size="sm"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.includes('csv') && (
          <DropdownMenuItem onClick={() => handleExport('csv')}>
            Export as CSV
          </DropdownMenuItem>
        )}
        {formats.includes('pdf') && (
          <DropdownMenuItem onClick={() => handleExport('pdf')}>
            Export as PDF
          </DropdownMenuItem>
        )}
        {formats.includes('json') && (
          <DropdownMenuItem onClick={() => handleExport('json')}>
            Export as JSON
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
