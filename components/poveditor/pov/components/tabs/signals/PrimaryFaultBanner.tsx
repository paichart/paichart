"use client";

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type {
  ErrorCategory,
  ResultJsonSignals,
  ExecutionDegradation,
  ProtocolValidation,
  TemplateScopeMismatch,
} from './SignalTypes';

interface PrimaryFaultBannerProps {
  signals: ResultJsonSignals;
}

/**
 * Renders the cascade-winning errorCategory as a LOUD primary fault, with
 * nested "corroborated by" evidence beneath it for any co-occurring signals
 * that weren't the cascade winner.
 *
 * Per-category affordances (Pattern #: frontend-provocateur design):
 *   P10 TEMPLATE_MISMATCH_SELF_REPORTED — amber banner + AGENT SAID attribution
 *   P5  BUDGET_EXHAUSTED               — triangle glyph + budget error string
 *   P4  TOOL_LOOP_DEGRADED             — tail-failure count + failure rate
 *   P3  TOOL_FAILURES                  — failure rate
 *   P7  SILENT_REFUSAL                 — pull-quote (if available)
 *   P8  PROTOCOL_STEP_SKIPPED          — step list + expected/actual fraction
 *   P9  TEMPLATE_SCOPE_MISMATCH        — RETIRED 2026-07-17 (emitter removed; cases kept for historical artifacts)
 *
 * Sparklines (P3/P4) are deferred — text representations of the same evidence
 * for MVP; upgrade when we have per-tool-call result arrays surfaced.
 */
export function PrimaryFaultBanner({ signals }: PrimaryFaultBannerProps) {
  const category = signals.errorCategory;
  if (!category) return null;

  const tone = toneForCategory(category);

  return (
    <div className={`border ${tone.bg} ${tone.border} font-mono`}>
      {/* Primary fault header */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`${tone.fg} font-bold`}>{tone.glyph} PRIMARY FAULT</span>
          <span className={`${tone.fg} font-bold`}>{category}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {describeCategory(category, signals)}
        </div>
      </div>

      {/* Per-category affordance body */}
      <div className="px-3 py-2 border-t border-border/30">
        {renderCategoryBody(category, signals)}
      </div>

      {/* Corroborated-by evidence (co-occurring signals that didn't win the cascade) */}
      <CorroboratedBy signals={signals} cascadeWinner={category} />

      {/* finalResponse narrative (optional — render as collapsed detail) */}
      {signals.finalResponse && <FinalResponseBlock text={signals.finalResponse} />}

      {/* Metadata chrome strip — correction turn + confidence cap */}
      <MetadataChrome signals={signals} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Tone + category metadata
// ----------------------------------------------------------------------------

interface Tone {
  fg: string;
  bg: string;
  border: string;
  glyph: string;
}

function toneForCategory(cat: ErrorCategory): Tone {
  switch (cat) {
    case 'TEMPLATE_MISMATCH_SELF_REPORTED':
      return { fg: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', glyph: '⚠' };
    case 'BUDGET_EXHAUSTED':
      return { fg: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', glyph: '◣' };
    case 'TOOL_LOOP_DEGRADED':
    case 'TOOL_FAILURES':
      return { fg: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', glyph: '◣' };
    case 'SILENT_REFUSAL':
      return { fg: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', glyph: '"' };
    case 'PROTOCOL_STEP_SKIPPED':
      return { fg: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', glyph: '◣' };
    case 'TEMPLATE_SCOPE_MISMATCH':
      return { fg: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', glyph: '≠' };
  }
}

function describeCategory(cat: ErrorCategory, s: ResultJsonSignals): string {
  switch (cat) {
    case 'TEMPLATE_MISMATCH_SELF_REPORTED':
      return 'Agent self-reported a template/task mismatch via [TEMPLATE_MISMATCH] escape hatch';
    case 'BUDGET_EXHAUSTED':
      return 'Agent ran out of token budget mid-flight';
    case 'TOOL_LOOP_DEGRADED':
      return 'Last consecutive tool calls all failed — agent lost forward progress';
    case 'TOOL_FAILURES':
      return `Tool failure rate above threshold${
        s.executionDegradation?.toolFailureRate != null ? ` (${s.executionDegradation.toolFailureRate}%)` : ''
      }`;
    case 'SILENT_REFUSAL':
      return 'Agent ended turn with "I cannot / unable to..." pattern';
    case 'PROTOCOL_STEP_SKIPPED':
      return 'Pipeline harness skipped required protocol step(s)';
    case 'TEMPLATE_SCOPE_MISMATCH':
      return 'Template type expected verbs do not overlap with task description';
  }
}

// ----------------------------------------------------------------------------
// Per-category body renderers
// ----------------------------------------------------------------------------

function renderCategoryBody(cat: ErrorCategory, s: ResultJsonSignals) {
  switch (cat) {
    case 'TEMPLATE_MISMATCH_SELF_REPORTED':
      return <SelfReportedBody signals={s} />;
    case 'BUDGET_EXHAUSTED':
      return <BudgetBody deg={s.executionDegradation} />;
    case 'TOOL_LOOP_DEGRADED':
    case 'TOOL_FAILURES':
      return <ToolDegradationBody deg={s.executionDegradation} />;
    case 'SILENT_REFUSAL':
      return <SilentRefusalBody signals={s} />;
    case 'PROTOCOL_STEP_SKIPPED':
      return <ProtocolBody pv={s.protocolValidation} />;
    case 'TEMPLATE_SCOPE_MISMATCH':
      return <ScopeMismatchBody tsm={s.templateScopeMismatch} />;
  }
}

function SelfReportedBody({ signals }: { signals: ResultJsonSignals }) {
  const quote = extractSelfReportedQuote(signals.finalResponse);
  return (
    <div className="text-xs">
      <div className="text-muted-foreground mb-1">AGENT SAID:</div>
      <blockquote className="border-l-2 border-amber-500/50 pl-3 text-amber-300 italic">
        {quote || '(marker present, no additional text captured)'}
      </blockquote>
    </div>
  );
}

function extractSelfReportedQuote(final?: string): string | null {
  if (!final) return null;
  // The P10 marker is anchored at the start; grab the first ~300 chars
  const firstLines = final.substring(0, 500).trim();
  return firstLines || null;
}

function BudgetBody({ deg }: { deg?: ExecutionDegradation }) {
  if (!deg) return <span className="text-xs text-muted-foreground">No execution degradation detail.</span>;
  return (
    <div className="text-xs space-y-1">
      {deg.budgetError && (
        <div className="text-red-300 font-mono text-[11px] break-all">{deg.budgetError}</div>
      )}
      {typeof deg.toolFailureRate === 'number' && (
        <div className="text-muted-foreground">
          Tool failure rate: <span className="text-foreground">{deg.toolFailureRate}%</span>
        </div>
      )}
      {typeof deg.consecutiveTailFailures === 'number' && deg.consecutiveTailFailures > 0 && (
        <div className="text-muted-foreground">
          Consecutive tail failures: <span className="text-foreground">{deg.consecutiveTailFailures}</span>
        </div>
      )}
    </div>
  );
}

function ToolDegradationBody({ deg }: { deg?: ExecutionDegradation }) {
  if (!deg) return <span className="text-xs text-muted-foreground">No execution degradation detail.</span>;
  return (
    <div className="text-xs space-y-1">
      {typeof deg.toolFailureRate === 'number' && (
        <div>
          <span className="text-muted-foreground">Tool failure rate: </span>
          <span className="text-red-400 font-bold">{deg.toolFailureRate}%</span>
        </div>
      )}
      {typeof deg.consecutiveTailFailures === 'number' && (
        <div>
          <span className="text-muted-foreground">Consecutive tail failures: </span>
          <span className="text-red-400 font-bold">{deg.consecutiveTailFailures}</span>
        </div>
      )}
      {deg.degradationReason && (
        <div className="text-muted-foreground italic">{deg.degradationReason}</div>
      )}
    </div>
  );
}

function SilentRefusalBody({ signals }: { signals: ResultJsonSignals }) {
  const snippet = signals.finalResponse?.substring(0, 300).trim() || null;
  return (
    <div className="text-xs">
      <div className="text-muted-foreground mb-1">Response matched refusal pattern:</div>
      {snippet ? (
        <blockquote className="border-l-2 border-yellow-500/50 pl-3 text-yellow-200 italic">
          {snippet}
        </blockquote>
      ) : (
        <div className="text-muted-foreground">(no final response captured)</div>
      )}
    </div>
  );
}

function ProtocolBody({ pv }: { pv?: ProtocolValidation }) {
  if (!pv) return <span className="text-xs text-muted-foreground">No protocol validation detail.</span>;
  const fractionVisible =
    typeof pv.expectedChildCount === 'number' && typeof pv.actualAssignedCount === 'number';
  return (
    <div className="text-xs space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">Mode:</span>
        <span className="text-foreground font-bold">{pv.mode}</span>
        {fractionVisible && (
          <>
            <span className="text-muted-foreground ml-2">Children:</span>
            <span className="text-foreground font-bold">
              {pv.actualAssignedCount} of {pv.expectedChildCount} templated
            </span>
          </>
        )}
      </div>
      {pv.missingSteps?.length > 0 && (
        <div>
          <div className="text-muted-foreground mb-1">Missing steps:</div>
          <ul className="space-y-0.5 ml-1">
            {pv.missingSteps.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-red-400" aria-hidden="true">✗</span>
                <span className="text-foreground">{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ScopeMismatchBody({ tsm }: { tsm?: TemplateScopeMismatch }) {
  if (!tsm) return <span className="text-xs text-muted-foreground">No template scope mismatch detail.</span>;
  return (
    <div className="text-xs space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-muted-foreground">Template:</span>
        <span className="text-foreground font-bold">{tsm.templateName}</span>
        <span className="text-muted-foreground">[{tsm.templateType}]</span>
      </div>
      {tsm.reason && <div className="text-yellow-300 italic">{tsm.reason}</div>}
      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="border border-border/50 p-2">
          <div className="text-muted-foreground text-[10px] mb-1 uppercase tracking-wide">
            Expected verbs ({tsm.expectedVerbs.length})
          </div>
          <div className="text-foreground text-[11px]">{tsm.expectedVerbs.join(', ')}</div>
        </div>
        <div className="border border-border/50 p-2">
          <div className="text-muted-foreground text-[10px] mb-1 uppercase tracking-wide">
            Task keywords ({tsm.taskKeywords.length})
          </div>
          <div className="text-foreground text-[11px]">{tsm.taskKeywords.join(', ')}</div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Corroborated-by (nested evidence from co-occurring signals)
// ----------------------------------------------------------------------------

function CorroboratedBy({
  signals,
  cascadeWinner,
}: {
  signals: ResultJsonSignals;
  cascadeWinner: ErrorCategory;
}) {
  const rows: Array<{ label: string; value: string }> = [];

  if (signals.protocolValidation && cascadeWinner !== 'PROTOCOL_STEP_SKIPPED') {
    const pv = signals.protocolValidation;
    if (pv.expectedChildCount != null && pv.actualAssignedCount != null) {
      rows.push({
        label: 'Protocol',
        value: `${pv.actualAssignedCount} of ${pv.expectedChildCount} children templated`,
      });
    }
  }

  if (
    signals.executionDegradation &&
    cascadeWinner !== 'BUDGET_EXHAUSTED' &&
    cascadeWinner !== 'TOOL_LOOP_DEGRADED' &&
    cascadeWinner !== 'TOOL_FAILURES' &&
    cascadeWinner !== 'SILENT_REFUSAL'
  ) {
    const d = signals.executionDegradation;
    if (typeof d.toolFailureRate === 'number' && d.toolFailureRate > 0) {
      rows.push({ label: 'Execution', value: `${d.toolFailureRate}% tool failure rate` });
    }
  }

  if (signals.templateScopeMismatch && cascadeWinner !== 'TEMPLATE_SCOPE_MISMATCH') {
    rows.push({
      label: 'Scope',
      value: `Template ${signals.templateScopeMismatch.templateName} [${signals.templateScopeMismatch.templateType}] verbs do not match task`,
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="px-3 py-2 border-t border-border/30 text-xs">
      <div className="text-muted-foreground mb-1">├─ corroborated by ───</div>
      <ul className="ml-3 space-y-0.5">
        {rows.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-muted-foreground">│</span>
            <span className="text-muted-foreground w-20">{r.label}:</span>
            <span className="text-foreground">{r.value}</span>
          </li>
        ))}
        <li>
          <span className="text-muted-foreground">└─ ────</span>
        </li>
      </ul>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Final response (collapsed narrative)
// ----------------------------------------------------------------------------

function FinalResponseBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const snippet = text.substring(0, 500);
  const hasMore = text.length > 500;

  return (
    <div className="px-3 py-2 border-t border-border/30 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>Agent narrative {hasMore && !expanded ? '(truncated)' : ''}</span>
      </button>
      {expanded && (
        <blockquote className="mt-2 ml-4 border-l-2 border-border pl-3 text-foreground/80 whitespace-pre-wrap">
          {snippet}
          {hasMore && <span className="text-muted-foreground"> …(see full artifact)</span>}
        </blockquote>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Metadata chrome (correction turn + confidence cap)
// ----------------------------------------------------------------------------

function MetadataChrome({ signals }: { signals: ResultJsonSignals }) {
  const chips: string[] = [];
  if (signals.toolLoop?.correctionTurnUsed === true) {
    chips.push('› correction turn fired');
  }
  if (signals.confidenceCapped === true) {
    chips.push(
      `› confidence capped${
        signals.originalConfidence != null ? ` (original: ${signals.originalConfidence})` : ''
      }`
    );
  }

  if (chips.length === 0) return null;

  return (
    <div className="px-3 py-1.5 border-t border-border/30 bg-muted/30 text-[10px] text-muted-foreground font-mono">
      {chips.join(' · ')}
    </div>
  );
}
