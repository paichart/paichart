"use client";

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { HelpCircle } from 'lucide-react';

/**
 * Plain-language explainer for how an agent's effective configuration is
 * constructed (2026-06-10). Deliberately avoids internal names
 * (promptTemplate, defaultRole, §-numbers) — written for users, not devs.
 * One content component, multiple doors: the Configuration tab button and
 * the Agent Builder preview header both open this.
 */
export function AgentExecutionExplainer({
  trigger,
}: {
  /** Custom trigger element; defaults to a "How agents work" outline button. */
  trigger?: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <HelpCircle className="h-3.5 w-3.5 mr-1.5" />
            How agents work
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How your agent&apos;s instructions are built</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm leading-relaxed">
          <p>When you execute an agent, it receives two things:</p>

          <div>
            <h3 className="font-semibold mb-1">1. Its expertise (from the template)</h3>
            <p className="text-muted-foreground">
              The template you choose gives the agent its persona and working style —
              how a Business Analyst thinks, what a Researcher prioritizes. You see
              this as the template&apos;s &quot;System Prompt&quot;. At run time the
              platform adds three things on top:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground mt-1 space-y-0.5">
              <li>
                <strong className="text-foreground">Its coordinates</strong> — the exact
                task, phase, and POV identifiers it needs for tool calls, plus the task
                description and assignee
              </li>
              <li>
                <strong className="text-foreground">Its tool list</strong> — which tools
                are available this run, and any step-by-step protocol the template follows
              </li>
              <li>
                <strong className="text-foreground">A safety check</strong> — permission
                to decline a task that doesn&apos;t fit its role instead of inventing
                plausible-looking output
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-1">2. Its work order (built fresh, every run)</h3>
            <p className="text-muted-foreground">
              The platform writes a detailed brief the moment you hit Execute. It
              includes: your task instructions, the task&apos;s current details
              (title, description, priority, due date), the project environment
              (which POV, customer, phase, and team),{' '}
              <strong className="text-foreground">the outputs of earlier tasks it depends on</strong>,
              the list of tools it may use, and the reporting rules every agent must
              follow. This is why the final instructions look much bigger than the
              template — most of it is your live project data, not the template.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-1">Settings</h3>
            <p className="text-muted-foreground">
              Model, creativity (temperature), tools, and turn limits come from the
              task if you set them, otherwise the template, otherwise sensible
              defaults.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-1">Why a few things appear twice</h3>
            <p className="text-muted-foreground">
              Key facts like the POV identifier are deliberately repeated in more than
              one place — repetition is what makes agents reliable about using them
              correctly. The reporting rules also appear in both the template and the
              work order, so they hold even if a template omits them.
            </p>
          </div>

          <div className="rounded border border-border bg-muted/30 p-3">
            <h3 className="font-semibold mb-1">Seeing exactly what the agent saw</h3>
            <p className="text-muted-foreground">
              During and right after a run, open{' '}
              <strong className="text-foreground">Monitoring → Prompts (this run)</strong>{' '}
              to see the exact instructions, word for word.{' '}
              <strong className="text-foreground">
                ⚠️ This view is live-only — it is not saved.
              </strong>{' '}
              If you want to keep it for investigation, copy it before leaving or
              reloading the page.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
