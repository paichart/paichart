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
import { Upload, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { 
  exportPhaseTemplates, 
  downloadPhaseTemplates,
  parsePhaseTemplatesFile,
  importPhaseTemplates,
  PhaseTemplateImportResult
} from '@/lib/pov/phase-templates/import-export';

interface ImportExportButtonsProps {
  selectedTemplateIds?: string[];
  onImportComplete?: () => void;
}

export function ImportExportButtons({ 
  selectedTemplateIds = [], 
  onImportComplete 
}: ImportExportButtonsProps) {
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [importResult, setImportResult] = useState<PhaseTemplateImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [parsedTemplates, setParsedTemplates] = useState<any[] | null>(null);
  
  // Import options
  const [validateOnly, setValidateOnly] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [createMissing, setCreateMissing] = useState(false);
  
  // Export options
  const [exportAll, setExportAll] = useState(false);
  
  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Handle file selection
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      setImportLoading(true);
      setImportError(null);
      setImportResult(null);
      
      // Parse the file
      const templates = await parsePhaseTemplatesFile(file);
      
      // Store the parsed templates for later use
      setParsedTemplates(templates);
      
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
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  // Handle export
  const handleExport = async () => {
    try {
      setExportLoading(true);
      setExportError(null);
      
      // Export the templates
      const exportData = await exportPhaseTemplates(
        exportAll ? undefined : selectedTemplateIds.length > 0 ? selectedTemplateIds : undefined,
        exportAll
      );
      
      // Download the templates
      downloadPhaseTemplates(
        exportData,
        `phase-templates-${new Date().toISOString().split('T')[0]}.json`
      );
      
      // Close the dialog
      setShowExportDialog(false);
    } catch (error) {
      // Export error occurred
      setExportError((error as Error).message || 'Failed to export templates');
    } finally {
      setExportLoading(false);
    }
  };
  
  // Reset import state
  const resetImport = () => {
    setImportResult(null);
    setImportError(null);
    setParsedTemplates(null);
    setValidateOnly(true);
    setOverwrite(false);
    setCreateMissing(false);
  };
  
  // Reset export state
  const resetExport = () => {
    setExportError(null);
    setExportAll(false);
  };
  
  return (
    <>
      <div className="flex space-x-2">
        <Button
          variant="outline"
          onClick={() => {
            resetImport();
            setShowImportDialog(true);
          }}
        >
          <Upload className="h-4 w-4 mr-2" />
          Import
        </Button>
        
        <Button
          variant="outline"
          onClick={() => {
            resetExport();
            setShowExportDialog(true);
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>
      
      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Phase Templates</DialogTitle>
            <DialogDescription>
              Import phase templates from a JSON file.
            </DialogDescription>
          </DialogHeader>
          
          {importError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4 mr-2" />
              <AlertDescription>{importError}</AlertDescription>
            </Alert>
          )}
          
          {importResult && (
            <div className="mt-4 p-4 border rounded-md">
              <div className="flex items-center mb-2">
                {importResult.success ? (
                  <CheckCircle className="h-5 w-5 text-primary mr-2" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-destructive mr-2" />
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
              
              {importResult.validateOnly && importResult.success && parsedTemplates && (
                <div className="mt-4">
                  <Button
                    onClick={async () => {
                      try {
                        setImportLoading(true);
                        
                        // Re-import with validateOnly=false using stored templates
                        const result = await importPhaseTemplates(parsedTemplates, {
                          validateOnly: false,
                          overwrite,
                          createMissing
                        });
                        
                        setImportResult(result);
                        
                        if (result.success && onImportComplete) {
                          onImportComplete();
                        }
                      } catch (error) {
                        // Import error occurred
                        setImportError((error as Error).message || 'Failed to import templates');
                      } finally {
                        setImportLoading(false);
                      }
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
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="file">Select a JSON file</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="file"
                    accept=".json"
                    onChange={handleFileChange}
                    disabled={importLoading}
                    className="block w-full text-sm text-muted-foreground
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-primary file:text-primary-foreground
                      hover:file:bg-primary/90"
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
              </div>
              
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowImportDialog(false)}
                >
                  Cancel
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export Phase Templates</DialogTitle>
            <DialogDescription>
              Export phase templates to a JSON file.
            </DialogDescription>
          </DialogHeader>
          
          {exportError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4 mr-2" />
              <AlertDescription>{exportError}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              {selectedTemplateIds.length > 0 ? (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="exportSelected"
                    checked={!exportAll}
                    onCheckedChange={(checked) => setExportAll(checked !== true)}
                  />
                  <Label htmlFor="exportSelected">
                    Export selected templates ({selectedTemplateIds.length})
                  </Label>
                </div>
              ) : null}
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="exportAll"
                  checked={exportAll}
                  onCheckedChange={(checked) => setExportAll(checked === true)}
                />
                <Label htmlFor="exportAll">Export all templates</Label>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowExportDialog(false)}
            >
              Cancel
            </Button>
            
            <Button
              onClick={handleExport}
              disabled={exportLoading || (!exportAll && selectedTemplateIds.length === 0)}
            >
              {exportLoading && <Spinner className="mr-2" size="sm" />}
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ImportExportButtons;
