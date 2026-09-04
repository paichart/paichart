"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { FileText, Braces, ListChecks, Tag, GitBranch, Search, Gauge } from 'lucide-react';

/**
 * "How it works" — a conceptual explainer for the prompt-library model, plus a
 * field reference for the non-obvious, code-verified behaviours an author needs
 * (tags, {{ }} resolution paths, protocol injection, confidence). Durable by
 * design: describes the architecture, not the inventory.
 */
export function PromptsHowItWorks() {
  return (
    <div className="max-w-4xl space-y-8 py-2">
      <section>
        <h2 className="text-xl font-bold">How skills work</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A <strong>skill</strong> is a reusable, versioned prompt template — written once, parameterized with
          variables, and shared across agents and workflows instead of being retyped each time.
        </p>
      </section>

      {/* Building blocks */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-foreground">
              <FileText className="h-4 w-4 text-primary" />
              <span className="font-semibold">Prompt text</span>
            </div>
            <p className="text-sm text-muted-foreground">
              The template body. <span className="font-mono text-xs">{'{{placeholders}}'}</span> are filled in only
              when the skill is invoked from the <span className="font-mono text-xs">/prompt</span> menu — not when
              it&apos;s injected into an agent (see below).
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-foreground">
              <Braces className="h-4 w-4 text-primary" />
              <span className="font-semibold">Variables</span>
            </div>
            <p className="text-sm text-muted-foreground">
              The named inputs the template expects — edited as raw JSON, so any shape is preserved exactly.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-foreground">
              <ListChecks className="h-4 w-4 text-primary" />
              <span className="font-semibold">Examples</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Sample inputs and outputs for humans and clients to read — documentation only, never parsed at
              runtime.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Tags */}
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Tag className="h-4 w-4 text-primary" /> Tags: <span className="font-mono text-sm">mcp</span> &amp;{' '}
          <span className="font-mono text-sm">protocol</span> change behaviour
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Most tags are just labels for search and filtering. Two are functional:
        </p>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-sky-400">•</span>
            <span>
              <span className="font-mono text-sky-400">mcp</span> — lists the skill in the{' '}
              <span className="font-mono">/prompt</span> menu for AI clients (Claude Desktop, ChatGPT). Without it,
              the skill is usable here but invisible to those clients. Non-admins only see it if it&apos;s also{' '}
              <em>Public</em> and <em>Active</em>.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-violet-400">•</span>
            <span>
              <span className="font-mono text-violet-400">protocol</span> — the skill&apos;s text is inserted into
              the system prompt of every <strong>type-PIPELINE</strong> task (the pipeline harness). Only the first{' '}
              <strong>10</strong> active protocol skills load, <strong>ordered by name A→Z</strong> — an 11th is
              silently skipped, so naming decides which survive. The harness&apos;s child agents each receive only
              the <strong>one</strong> protocol their task selects.
            </span>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          <strong>Public</strong> controls who can see a skill (Off = private = admins only, in both the list and
          the <span className="font-mono">/prompt</span> menu) — it does <strong>not</strong> gate protocol
          injection: a private <span className="font-mono">protocol</span> skill still runs in pipelines. Edits to{' '}
          <span className="font-mono">mcp</span>/<span className="font-mono">protocol</span> skills go live
          immediately (no restart).
        </p>
      </section>

      {/* Variables & {{ }} */}
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Braces className="h-4 w-4 text-primary" /> Variables &amp;{' '}
          <span className="font-mono text-sm">{'{{ }}'}</span>
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Two resolution paths.</strong> <span className="font-mono">{'{{var}}'}</span> and{' '}
              <span className="font-mono">{'{{#if var}}…{{/if}}'}</span> resolve <strong>only</strong> on the{' '}
              <span className="font-mono">/prompt</span> menu path (an AI client fills the args). When a skill is
              injected as a <span className="font-mono">protocol</span> — or otherwise fed to an agent — the text is
              used <strong>raw</strong>, so any placeholder ships literally to the model. Don&apos;t use{' '}
              <span className="font-mono">{'{{ }}'}</span> in protocol skills.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              An unmatched <span className="font-mono">{'{{var}}'}</span> (no matching Variables entry) prints
              literally — every placeholder needs a Variables entry.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>required</strong> is advisory, not enforced — a missing value renders the{' '}
              <span className="font-mono">default</span> (or empty string). Set a{' '}
              <span className="font-mono">default</span> on any variable the prompt breaks without.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              Variable names: letters, digits, underscore only. Object values render as{' '}
              <span className="font-mono">[object Object]</span> — pass scalars.
            </span>
          </div>
        </div>
      </section>

      {/* Discoverability */}
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Search className="h-4 w-4 text-primary" /> Discoverability
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Use Case and Description are both searched</strong> by AI clients (matched against the query
              in the <span className="font-mono">/prompt</span> listing) — write them with the words a user would
              search, not just as a blurb. Only the first ~200 characters of Use Case show in the menu, so
              front-load it.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Category</strong> is a real filter facet clients use. <strong>Complexity</strong> and{' '}
              <strong>Est Time</strong> are informational only — no behavioural effect.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              A <span className="font-mono">domain:&lt;x&gt;</span> tag scopes a skill to a POV domain: when a POV
              of that domain is active, the <span className="font-mono">/prompt</span> menu shows{' '}
              <strong>only</strong> skills tagged <span className="font-mono">mcp</span> +{' '}
              <span className="font-mono">domain:&lt;x&gt;</span> — so a skill with <strong>no</strong> domain tag
              is <strong>hidden</strong> in that context (it still appears in the general, no-POV menu).
            </span>
          </div>
        </div>
      </section>

      {/* Authoring a protocol skill */}
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <GitBranch className="h-4 w-4 text-primary" /> Authoring a{' '}
          <span className="font-mono text-sm">protocol</span> skill
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-violet-400">•</span>
            <span>
              <strong>Description is the harness&apos;s selection cue</strong> — it&apos;s injected verbatim above
              the prompt text when the harness reads its protocol list. But the child-agent path injects only the
              prompt text (no name, no description), so put everything load-bearing <strong>in the body</strong>.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-violet-400">•</span>
            <span>
              Include an explicit <strong>&quot;When to Use&quot;</strong> section — the harness selects protocols by
              reading their text, not by parsing the <span className="font-mono">(protocol: X)</span> tag in a task
              title. A wrong or misspelled name silently falls back to inference (no error).
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-violet-400">•</span>
            <span>
              The <strong>same body is used for both CREATE and SYNTHESIZE</strong> harness passes — carry both the
              decompose-time and the synthesize-time guidance in one document.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-violet-400">•</span>
            <span>
              <strong>Renaming or deprecating a protocol silently un-protocols</strong> every template that points at
              it by the old name — the child then runs with no protocol, no warning.
            </span>
          </div>
        </div>
      </section>

      {/* Confidence & output */}
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Gauge className="h-4 w-4 text-primary" /> Confidence &amp; output
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              The engine re-parses the agent&apos;s <strong>final response</strong> for a{' '}
              <span className="font-mono">Confidence: N/100</span> line. If a skill prescribes a rigid output format
              <strong> without</strong> a trailing confidence line, agents omit it and the pipeline quality gate
              reads as indeterminate — always end a prescribed format with a literal{' '}
              <span className="font-mono">Confidence: N/100</span>.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              Parsing is <strong>last-match-wins</strong> — don&apos;t let an example or quoted{' '}
              <span className="font-mono">NN/100</span> sit after the agent&apos;s own score. A self-reported score
              above 60 is capped to 60 when more than half of tool calls failed.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              Prompt text isn&apos;t truncated at injection — within the 50 KB save cap, a long skill injects in
              full, and every pipeline agent carries the summed protocol budget, so keep protocol skills lean.
            </span>
          </div>
        </div>
      </section>

      {/* Lifecycle + editing */}
      <section>
        <h3 className="text-base font-semibold">Lifecycle + editing</h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Status</strong> is one of <em>DRAFT / ACTIVE / DEPRECATED / INACTIVE</em>; only{' '}
              <em>ACTIVE</em> skills go live (in the menu or as a protocol).
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Name is unique</strong> — a duplicate name fails the save. Only admins can create or edit
              skills.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Save caps</strong> (exceeding any one fails the save): prompt text ≤ 50 KB, name ≤ 200,
              description ≤ 5000, use case ≤ 2000, up to 20 tags (≤ 50 chars each), est time ≤ 7200 s.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              Use the <strong>Builder</strong> tab (or the edit icon on any row) — metadata on the left, prompt text
              on the right. Clone an existing skill to start from a known-good template.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
