#!/usr/bin/env ts-node
/**
 * A deliverable must begin at its first heading. Anything before it is the model's own working-out,
 * and it lands VERBATIM in the customer-facing report.md.
 *
 * Observed twice on the program-synthesis producer (2026-09-14/15), both reaching report.md — once
 * quoting the very instruction it was violating. Specimens below are the real openings.
 *
 * The strip is safe because report.md is a DERIVED view: the full finalResponse stays in the source
 * execution's result.json. Nothing is lost, which is why this can be deterministic rather than a
 * heuristic — and why the NEGATIVE cases matter more than the positive one: a wrong strip would
 * silently truncate a customer artifact to enforce a formatting rule.
 */
import { stripPreHeadingPreamble } from '@/lib/services/execution-terminal-persist';

let pass = 0, fail = 0;
const t = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.error(`  ❌ ${name}${extra ? '\n     ' + extra : ''}`); }
};

console.log('🧪 pre-heading preamble strip\n');

// ---- positive: the two real specimens ----
const run4 = `Now I'll compose the final program-level deliverable. Based on the task description and the two chained pipeline outputs, I need to synthesize:

1. **Pipeline 1 (network-provisioning)**: Exporter loopback aggregate

# PROGRAM DELIVERABLE: Telemetry Archive Authorization

## Executive Summary
Real content.`;
const r1 = stripPreHeadingPreamble(run4);
t('run-4 specimen: strips the planning preamble', r1.text.startsWith('# PROGRAM DELIVERABLE'));
t('run-4 specimen: records what was stripped', (r1.stripped ?? '').startsWith("Now I'll compose"));
t('run-4 specimen: keeps ALL content from the heading on', r1.text.includes('Real content.'));

const run2 = `Now I'll compose the final customer-facing program deliverable. Per the task instructions, I must begin at the first heading with no preamble.

# PROGRAM DELIVERABLE: Telemetry Archive Authorization
body`;
t('run-2 specimen (quoted its own violation): stripped',
  stripPreHeadingPreamble(run2).text.startsWith('# PROGRAM DELIVERABLE'));

// ---- negative: must NOT strip ----
t('already clean → untouched, no allocation of a stripped record',
  (() => { const r = stripPreHeadingPreamble('# Title\n\nbody'); return r.text === '# Title\n\nbody' && r.stripped === null; })());

const noHeading = 'A deliverable with no heading at all.\n\nStill the only content we have.';
t('NO heading → NEVER strips (would destroy the artifact)',
  (() => { const r = stripPreHeadingPreamble(noHeading); return r.text === noHeading && r.stripped === null; })());

t('leading blank lines only → trimmed, but nothing RECORDED as stripped',
  (() => { const r = stripPreHeadingPreamble('\n\n# Title\nbody'); return r.text.startsWith('# Title') && r.stripped === null; })());

t('empty string → untouched', (() => { const r = stripPreHeadingPreamble(''); return r.text === '' && r.stripped === null; })());

t('a "#" that is NOT a heading (no space) does not count',
  (() => { const r = stripPreHeadingPreamble('prose #hashtag more\n\n## Real\nx'); return r.text.startsWith('## Real'); })());

t('fenced code containing a #comment before the heading is still preamble, not a heading',
  (() => { const r = stripPreHeadingPreamble('intro\n```\n#!/bin/bash\n```\n# Title\nx'); return r.text.startsWith('# Title'); })());

console.log(`\n${'='.repeat(46)}\nResults: ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail > 0 ? 1 : 0);
