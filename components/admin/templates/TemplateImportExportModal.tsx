"use client";

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/Dialog';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { Checkbox } from '@/components/ui/Checkbox';
import { Label } from '@/components/ui/Label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Upload, Download, AlertCircle, CheckCircle, FileJson } from 'lucide-react';

// Import phase template import/export functions
import { 
  exportPhaseTemplates, 
  downloadPhaseTemplates,
  parsePhaseTemplatesFile,
  importPhaseTemplates,
  PhaseTemplateImportResult
} from '@/lib/pov/phase-templates/import-export';

export type TemplateType = 'pov' | 'phase';

interface TemplateImportExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'import' | 'export';
  type?: TemplateType;
  onImportComplete?: () => void;
}

export function TemplateImportExportModal({
  open,
  onOpenChange,
  mode,
  type = 'phase',
  onImportComplete
}: TemplateImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<TemplateType>(type);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [importResult, setImportResult] = useState<PhaseTemplateImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  
  // Import options
  const [validateOnly, setValidateOnly] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [createMissing, setCreateMissing] = useState(false);
  
  // Export options
  const [exportAll, setExportAll] = useState(true);
  
  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Reset state when modal is closed
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setImportFile(null);
      setImportResult(null);
      setImportError(null);
      setExportError(null);
      setValidateOnly(true);
      setOverwrite(false);
      setCreateMissing(false);
      setExportAll(true);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
    
    onOpenChange(open);
  };
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImportFile(e.target.files[0]);
      setImportError(null);
      setImportResult(null);
    }
  };
  
  // Handle import for phase templates
  const handlePhaseTemplateImport = async () => {
    if (!importFile) {
      setImportError('Please select a file to import');
      return;
    }
    
    try {
      setImportLoading(true);
      setImportError(null);
      setImportResult(null);
      
      // Parse the file
      const templates = await parsePhaseTemplatesFile(importFile);
      
      // Import the templates
      const result = await importPhaseTemplates(templates, {
        validateOnly,
        overwrite,
        createMissing
      });
      
      setImportResult(result);
      
      // If not in validate-only mode and import was successful, call the onImportComplete callback
      if (!validateOnly && result.success && onImportComplete) {
        onImportComplete();
      }
    } catch (error) {
      // Import error occurred
      setImportError((error as Error).message || 'Failed to import templates');
    } finally {
      setImportLoading(false);
    }
  };
  
  // Handle export for phase templates
  const handlePhaseTemplateExport = async () => {
    try {
      setExportLoading(true);
      setExportError(null);
      
      // Export all templates
      const exportData = await exportPhaseTemplates(undefined, exportAll);
      
      // Download the templates
      downloadPhaseTemplates(
        exportData,
        `phase-templates-${new Date().toISOString().split('T')[0]}.json`
      );
      
      // Close the dialog
      handleOpenChange(false);
    } catch (error) {
      // Export error occurred
      setExportError((error as Error).message || 'Failed to export templates');
    } finally {
      setExportLoading(false);
    }
  };
  
  // Handle import button click
  const handleImport = () => {
    if (activeTab === 'phase') {
      handlePhaseTemplateImport();
    } else {
      setImportError('POV template import is not yet implemented');
    }
  };
  
  // Handle export button click
  const handleExport = () => {
    if (activeTab === 'phase') {
      handlePhaseTemplateExport();
    } else {
      setExportError('POV template export is not yet implemented');
    }
  };
  
  // Render import content
  const renderImportContent = () => {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Import Templates</DialogTitle>
          <DialogDescription>
            Import templates from a JSON file.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue={activeTab} onValueChange={(value) => setActiveTab(value as TemplateType)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pov" className="flex items-center">POV Templates</TabsTrigger>
            <TabsTrigger value="phase" className="flex items-center">Phase Templates</TabsTrigger>
          </TabsList>
          
          <TabsContent value="pov" className="space-y-4 py-4">
            <Alert>
              <AlertDescription>
                POV template import is coming soon.
              </AlertDescription>
            </Alert>
          </TabsContent>
          
          <TabsContent value="phase" className="space-y-4 py-4">
            {importError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4 mr-2" />
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}
            
            {importResult && (
              <div className="p-4 border rounded-md">
                <div className="flex items-center mb-2">
                  {importResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-amber-500 mr-2" />
                  )}
                  <span className="font-medium">
                    {importResult.validateOnly ? 'Validation' : 'Import'} {importResult.success ? 'successful' : 'completed with issues'}
                  </span>
                </div>
                
                <div className="text-sm space-y-1">
                  <p>Valid templates: {importResult.results.valid}</p>
                  <p>Invalid templates: {importResult.results.invalid}</p>
                  
                  {importResult.results.invalidDetails.length > 0 && (
                    <div className="mt-2">
                      <p className="font-medium">Issues:</p>
                      <ul className="list-disc list-inside text-xs mt-1 space-y-1">
                        {importResult.results.invalidDetails.map((detail, index) => (
                          <li key={index}>
                            {detail.template.name || `Template ${index + 1}`}: {detail.errors.join(', ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                
                {importResult.validateOnly && importResult.success && (
                  <div className="mt-4">
                    <Button
                      onClick={() => {
                        setValidateOnly(false);
                        handleImport();
                      }}
                      disabled={importLoading}
                    >
                      {importLoading && <Spinner className="mr-2" size="sm" />}
                      Apply Import
                    </Button>
                  </div>
                )}
              </div>
            )}
            
            {!importResult && (
              <>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <FileJson className="h-8 w-8 mx-auto text-gray-400" />
                  <p className="mt-2 text-sm text-gray-500">
                    Select a JSON file with phase templates
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="mt-4 block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100"
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="validateOnly"
                      checked={validateOnly}
                      onCheckedChange={(checked) => setValidateOnly(checked === true)}
                    />
                    <Label htmlFor="validateOnly">Validate only (don&apos;t apply changes)</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="overwrite"
                      checked={overwrite}
                      onCheckedChange={(checked) => setOverwrite(checked === true)}
                    />
                    <Label htmlFor="overwrite">Overwrite existing templates</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="createMissing"
                      checked={createMissing}
                      onCheckedChange={(checked) => setCreateMissing(checked === true)}
                    />
                    <Label htmlFor="createMissing">Create missing templates</Label>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          
          {activeTab === 'phase' && !importResult && (
            <Button
              onClick={handleImport}
              disabled={!importFile || importLoading}
            >
              {importLoading && <Spinner className="mr-2" size="sm" />}
              {validateOnly ? 'Validate' : 'Import'}
            </Button>
          )}
        </DialogFooter>
      </>
    );
  };
  
  // Render export content
  const renderExportContent = () => {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Export Templates</DialogTitle>
          <DialogDescription>
            Export templates to a JSON file.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue={activeTab} onValueChange={(value) => setActiveTab(value as TemplateType)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pov">POV Templates</TabsTrigger>
            <TabsTrigger value="phase">Phase Templates</TabsTrigger>
          </TabsList>
          
          <TabsContent value="pov" className="space-y-4 py-4">
            <Alert>
              <AlertDescription>
                POV template export is coming soon.
              </AlertDescription>
            </Alert>
          </TabsContent>
          
          <TabsContent value="phase" className="space-y-4 py-4">
            {exportError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4 mr-2" />
                <AlertDescription>{exportError}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="exportAll"
                  checked={exportAll}
                  onCheckedChange={(checked) => setExportAll(checked === true)}
                />
                <Label htmlFor="exportAll">Export all phase templates</Label>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          
          {activeTab === 'phase' && (
            <Button
              onClick={handleExport}
              disabled={exportLoading}
            >
              {exportLoading && <Spinner className="mr-2" size="sm" />}
              Export
            </Button>
          )}
        </DialogFooter>
      </>
    );
  };
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {mode === 'import' ? renderImportContent() : renderExportContent()}
      </DialogContent>
    </Dialog>
  );
}

export default TemplateImportExportModal;
