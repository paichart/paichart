'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download, HelpCircle, Lightbulb, FileText } from 'lucide-react';
import Link from 'next/link';

// Keep in step with ALLOWED_FILES in app/api/support/knowledge/[filename]/route.ts (the route's allowlist is what is enforced).
const KNOWLEDGE_BASE_DOCS = [
  { filename: 'READING-A-RUN.md', title: 'Reading a run', description: 'How to follow a run and judge its result: what is a measured fact and what is an agent\'s judgement.' },
  { filename: 'TROUBLESHOOTING-A-RUN.md', title: 'Troubleshooting a run', description: 'A run has stopped, or you cannot tell whether it has: where it is, why, and what to do.' },
  { filename: 'OPERATING.md', title: 'Operating: running a program', description: 'From a spec to a change package you apply: launch, gates, the result.' },
  { filename: 'WRITING-A-SPEC.md', title: 'Writing a spec', description: 'The checklist for writing the two input files of a program for a change of your own.' },
  { filename: 'FIRST-RUN.md', title: 'Your first run', description: 'See a finished run, then run the same use case on your own install.' },
  { filename: 'GLOSSARY.md', title: 'Glossary', description: 'Every term these documents use, in plain words.' },
];

export default function SupportPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Support</h1>

      {/* Knowledge Base */}
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Knowledge Base</h2>
        <p className="text-muted-foreground mb-4">
          Download the guides for running pAIchart. The full set, including installation, is in the docs/ folder of the
          public repository.
        </p>
        <div className="divide-y">
          {KNOWLEDGE_BASE_DOCS.map((doc) => (
            <div
              key={doc.filename}
              className="flex items-center justify-between py-3"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="font-medium">{doc.title}</span>
                  <p className="text-sm text-muted-foreground">{doc.description}</p>
                </div>
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
