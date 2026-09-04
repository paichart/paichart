"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { User, LayoutTemplate, ScrollText, ArrowRight } from 'lucide-react';

/**
 * "How it works" — a conceptual explainer for the role / agent-template / protocol model.
 *
 * Deliberately DURABLE: it describes the *architecture* (which is stable), never the *inventory*
 * (counts, specific role names, enum values) — those drift and would make this stale. The Templates
 * tab is the live source for what actually exists.
 */
export function AgentsHowItWorks() {
  return (
    <div className="max-w-4xl space-y-8 py-2">
      <section>
        <h2 className="text-xl font-bold">How agents are built</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Every agent’s behavior comes from three things that compose. Understanding how they fit together
          explains the whole Templates tab — including why one role shows up on several rows.
        </p>
      </section>

      {/* The three building blocks */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-foreground">
              <User className="h-4 w-4 text-primary" />
              <span className="font-semibold">Role</span>
            </div>
            <p className="text-sm text-muted-foreground">
              A block of <strong>behavior guidance</strong> — what this kind of specialist does, how it
              delivers, what mistakes to avoid. It is <strong>domain-neutral</strong> on purpose, so it can
              be reused. <span className="font-mono text-xs">e.g. config_change_author</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-foreground">
              <LayoutTemplate className="h-4 w-4 text-primary" />
              <span className="font-semibold">Agent (Template)</span>
            </div>
            <p className="text-sm text-muted-foreground">
              A configured agent — one row in the Templates tab. It has exactly <strong>one Role</strong>,
              one <strong>Type</strong> (its functional category), and for pipeline agents one{' '}
              <strong>Protocol</strong>. You choose these when you create it.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-foreground">
              <ScrollText className="h-4 w-4 text-primary" />
              <span className="font-semibold">Protocol</span>
            </div>
            <p className="text-sm text-muted-foreground">
              The <strong>domain playbook</strong> — how a kind of work is decomposed, plus its guard rails.
              It’s <strong>injected at run time</strong>, layered on top of the role.{' '}
              <span className="font-mono text-xs">e.g. terraform-iac</span>
            </p>
          </CardContent>
        </Card>
      </section>

      {/* The wiring rules */}
      <section>
        <h3 className="text-base font-semibold">How they connect</h3>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span><strong>One agent → one role + one type + one protocol.</strong> A template points at a single role and (if it’s a pipeline specialist) a single protocol.</span>
          </div>
          <div className="flex items-start gap-2">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span><strong>One role → many agents → many protocols.</strong> A role is reused across templates, and those templates can belong to different protocols. That’s why <span className="font-mono text-xs">config_change_author</span> appears on several rows — the role is neutral, the protocol on top makes each one domain-specific.</span>
          </div>
          <div className="flex items-start gap-2">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span><strong>The Pipeline Harness is the exception.</strong> It loads <em>all</em> protocols and picks the one matching your task; an ordinary specialist gets exactly one.</span>
          </div>
        </div>
      </section>

      {/* The 3-layer prompt */}
      <section>
        <h3 className="text-base font-semibold">An agent’s prompt, in three layers</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs">
          <span className="rounded border border-border bg-muted/40 px-3 py-2">universal base<br /><span className="text-muted-foreground">platform + output discipline</span></span>
          <span className="text-primary">+</span>
          <span className="rounded border border-border bg-muted/40 px-3 py-2">role guidance<br /><span className="text-muted-foreground">neutral behavior (baked in at build time)</span></span>
          <span className="text-primary">+</span>
          <span className="rounded border border-primary/40 bg-primary/5 px-3 py-2">injected protocol<br /><span className="text-muted-foreground">domain specifics (run time)</span></span>
          <span className="text-primary">+</span>
          <span className="rounded border border-primary/40 bg-primary/5 px-3 py-2">scope self-check<br /><span className="text-muted-foreground">always added (run time)</span></span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          How the role-guidance layer lands depends on the template. The built-in{' '}
          <span className="font-mono">pAIchart Universal Agent Template</span> (the default) keeps a{' '}
          <span className="font-mono">{'${roleSpecificGuidance}'}</span> slot and fills it with the guidance for
          whatever role runs it — so it <strong>adapts at run time</strong>. The seeded specialists use the same
          base but with the guidance <strong>baked in at build time</strong> (frozen to one role). A template you
          write from scratch is used <strong>verbatim</strong> — no base or role library is auto-added. In every
          case, only the protocol and the scope self-check are true run-time additions, and the protocol is meant
          to <em>supplement</em>, not contradict, the role — a convention, not a hard-enforced rule.
        </p>
      </section>

      {/* Worked example */}
      <section>
        <h3 className="text-base font-semibold">Why this matters: a new domain is text, not code</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          The infrastructure pipelines — <strong>network provisioning</strong>, <strong>Kubernetes / GitOps</strong>,
          and <strong>Terraform</strong> — all reuse the same neutral chain of roles (harvester → architect →
          author → reviewer). Adding Terraform added a <em>protocol and templates</em>, and <strong>zero new
          roles</strong>. So teaching the platform a new kind of work is mostly writing a protocol, not building
          new agents — and the Templates tab shows exactly that: the same roles, different protocols.
        </p>
      </section>

      {/* Reading the table — why Role leads */}
      <section>
        <h3 className="text-base font-semibold">Reading the Templates table</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          The table leads with the <strong>Role</strong> column on purpose — it makes the reuse visible at a
          glance. Scan the leftmost column and you’ll see the same role (e.g.{' '}
          <span className="font-mono text-xs">config_change_author</span>) repeat down the list, each time
          paired with a <em>different</em> Protocol: one neutral role serving network, Kubernetes, and
          Terraform. Leading with Role surfaces that architecture; leading with Name would hide it.
        </p>
      </section>

      {/* Builder field reference */}
      <section>
        <h3 className="text-base font-semibold">Builder field reference</h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Template Type</strong> feeds a run-time <em>scope check</em> — a specialized type flags a
              &quot;possible wrong template&quot; warning when the task&apos;s verbs don&apos;t match it;{' '}
              <strong>GENERALIST opts out</strong> of that guard. It&apos;s advisory (never blocks a run) — but pick
              a specialized type when one fits.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Protocol</strong> injects a domain playbook on top of the role at run time (most templates use{' '}
              <em>None</em>). It&apos;s meant to supplement the role, not fight it — keep them aligned.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>System Prompt</strong> placeholders use <span className="font-mono">{'${…}'}</span> —{' '}
              <span className="font-mono">{'${agentRole}'}</span>,{' '}
              <span className="font-mono">{'${contextualInformation}'}</span> (filled at run time),{' '}
              <span className="font-mono">{'${roleSpecificGuidance}'}</span>. <strong>Don&apos;t use{' '}
              <span className="font-mono">{'{{ }}'}</span></strong> — there&apos;s no Variables field here, so a{' '}
              <span className="font-mono">{'{{x}}'}</span> fails the save. Note{' '}
              <span className="font-mono">{'${formattedRole}'}</span> resolves to the <em>raw</em> role (no
              title-casing).
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Tools</strong> are the offer surface — a task <em>adds</em> to them, never subtracts.{' '}
              ⚠️ <strong>Clearing the list doesn&apos;t lock the agent down</strong>: an empty selection expands to{' '}
              <em>all</em> the built-in tools at run time. To narrow, select the specific few. Access control is
              enforced server-side regardless.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Model settings</strong> are a request, not a guarantee:{' '}
              <span className="font-mono">maxTokens</span> is clamped to the model&apos;s output ceiling, and{' '}
              <span className="font-mono">temperature</span> is <strong>dropped on Opus &amp; Fable</strong> (that
              tier doesn&apos;t accept it). <strong>Extended Thinking</strong> is an on/off opt-in — the numeric
              budget is model-managed.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Saving:</strong> a new template is created as <em>Draft</em> and stays{' '}
              <strong>hidden from the normal Templates list until you promote it to Active</strong>. Tools + model
              settings are <strong>defaults</strong> a task inherits (task selections take precedence).
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
