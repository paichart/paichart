'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { FileText, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';

export default function FormatGuidePage() {
  const handleDownload = () => {
    window.open('/api/docs/template-format', '_blank');
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Template Format Guide</h1>
          <p className="text-gray-500">Documentation for importing and exporting phase templates</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Template Import/Export Format</CardTitle>
          <CardDescription>
            This guide explains the expected format for importing and exporting phase templates in the system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4">
            Phase templates are exported and imported in JSON format with a specific structure. This guide provides detailed information about:
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>The expected format for template files</li>
            <li>Required and optional fields</li>
            <li>Validation checks performed during import</li>
            <li>Import and export options</li>
            <li>Troubleshooting tips</li>
          </ul>
          <p className="mb-6">
            Download the complete guide to ensure your template files are correctly formatted for import and export.
          </p>
          <Button 
            onClick={handleDownload}
            className="flex items-center"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Format Guide
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Example Template Structure</CardTitle>
          <CardDescription>
            A simplified example of the template format
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-100 p-4 rounded-md overflow-auto text-sm">
{`{
  "version": "1.0",
  "exportedAt": "2025-02-27T05:20:00.000Z",
  "templates": [
    {
      "name": "Template Name",
      "description": "Template Description",
      "type": "PLANNING",
      "isDefault": false,
      "workflow": {
        "stages": [
          {
            "id": "stage_1",
            "name": "Stage Name",
            "description": "Stage Description",
            "color": "#4299e1",
            "tasks": [
              {
                "id": "task_1_1",
                "name": "Task Name",
                "type": "action",
                "description": "Task Description",
                "assignee": "Assignee Name",
                "dueDate": "+3d",
                "dependencies": []
              }
            ]
          }
        ]
      }
    }
  ]
}`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
