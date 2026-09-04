'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download, HelpCircle, Lightbulb, FileText } from 'lucide-react';
import Link from 'next/link';

const KNOWLEDGE_BASE_DOCS = [
  { filename: 'getting_started.md', title: 'Getting Started' },
  { filename: 'security_policy.md', title: 'Security Policy' },
  { filename: 'architecture_sanitized.md', title: 'Architecture Overview' },
  { filename: 'paichart_features.md', title: 'pAIchart Features' },
  { filename: 'trust_levels.md', title: 'Trust Levels' },
  { filename: 'validation_showcase.md', title: 'Validation Showcase' },
  { filename: 'external_service_auth.md', title: 'External Service Authentication' },
  { filename: 'workflow_guide.md', title: 'Workflow Guide' },
  { filename: 'register_guide.md', title: 'Registration Guide' },
];

export default function SupportPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Support</h1>

      {/* Knowledge Base */}
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Knowledge Base</h2>
        <p className="text-muted-foreground mb-4">
          Download documentation and reference guides for the platform.
        </p>
        <div className="divide-y">
          {KNOWLEDGE_BASE_DOCS.map((doc) => (
            <div
              key={doc.filename}
              className="flex items-center justify-between py-3"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{doc.title}</span>
              </div>
              <a
                href={`/api/support/knowledge/${doc.filename}`}
                download
              >
                <Button variant="ghost" size="sm">
                  <Download className="h-4 w-4" />
                </Button>
              </a>
            </div>
          ))}
        </div>
      </Card>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/support/request">
          <Card className="p-6 hover:bg-muted/50 transition-colors cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <HelpCircle className="h-5 w-5 text-blue-500" />
              <h3 className="text-lg font-semibold">Support Request</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Report technical issues, access problems, or data issues.
            </p>
          </Card>
        </Link>

        <Link href="/support/feature">
          <Card className="p-6 hover:bg-muted/50 transition-colors cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              <h3 className="text-lg font-semibold">Feature Request</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Suggest new features, improvements, or integrations.
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
