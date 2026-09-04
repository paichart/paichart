#!/usr/bin/env ts-node
/**
 * List every PROHIBITION and MANDATE that will be in one role's prompt, with its SOURCE.
 *
 * WHY THIS EXISTS. An agent's prompt is assembled from several independently-authored prose sources.
 * Measured 2026-08-04 (`cline_docs/reviews/prose-architecture-2026-08-04/LAYER-INVENTORY-PASS-2.md`):
 * ROLE_GUIDANCE_LIBRARY is 90,358 chars across 26 roles and names UNIVERSAL_AGENT_RULES **zero** times;
 * the rules name role guidance zero times back. Neither file points at the other, so a seam between them
 * is visible only to someone holding both open.
 *
 * That is not hypothetical. Five collisions on 2026-08-03/04 sat at exactly that seam, and FOUR of the
 * five were caught by a specialist panel reading two files side by side — there was no other way to find
 * them. This turns that reading into a command.
 *
 * WHY IT IS AUTHORING-TIME AND NOT PROMPT TEXT. Four of the five never reached an agent; they were
 * authoring errors caught pre-ship. Putting a cross-reference in the PROMPT would charge every agent, on
 * every turn, forever, to solve a problem that bites the AUTHOR. This costs zero tokens.
 *
 * ⚠️ IT LISTS. IT DOES NOT JUDGE. No "these conflict" verdict is emitted, deliberately (Protocol 10 —
 * ship the fact, earn the verdict). The reason is concrete: `change_reviewer` says *"Do NOT call
 * perform(agent.results, verbose: true)"* and the network protocol says *"verbose: true is REQUIRED"*,
 * which reads as a flat contradiction — until you see that the role prohibition is scoped **against the
 * Author** (already auto-chained into §6) while the protocol mandate is for reading the *architect /
 * producer / Node C*. A tool that judged would have called that a live contradiction, confidently and
 * possibly wrongly. Side by side, a human settles it in five seconds. Listing is right either way.
 *
 * SOURCE OF ROLE GUIDANCE — read this before trusting the output. By default this reads the LIBRARY
 * (the file you are about to edit), which is the correct source when authoring. It is NOT necessarily
 * what agents are running: `agent_templates` rows are seeded MANUALLY (deploy deliberately does not
 * re-seed them, to protect GUI edits — `scripts/deploy/blue-green-deploy.sh:243-246`), so the library and the live row
 * can drift, and nothing measures that today (the unbuilt `report:template-freshness` gap). Pass
 * `--live` to read the stored row instead and see what agents actually get.
 *
 * Usage:
 *   npm run prompt:directives -- change_reviewer
 *   npm run prompt:directives -- change_reviewer --protocol network-provisioning-protocol
 *   npm run prompt:directives -- change_reviewer --live
 *   npm run prompt:directives -- --roles            # list the roles that have guidance
 *
 * Exit 0 always when it ran. This is a VIEWER, not a gate — it has no opinion to fail on.
 */
import {
  ROLE_GUIDANCE_LIBRARY,
  PAICHART_UNIVERSAL_BASE_TEMPLATE,
} from '../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';
import { UNIVERSAL_AGENT_RULES } from '../lib/agents/universal-agent-rules';

// `base` was MISSING from the first version, and it was found by using the tool. Sweeping the 26 roles
// surfaced two that demonstrate an unfiltered `task.list`; chasing the rule they breach led to
// PAICHART_UNIVERSAL_BASE_TEMPLATE — the wrapper every role's guidance is interpolated INTO — which
// carries directives of its own ("Never issue an unfiltered `project(action: \"task.list\")`"). A viewer
// built to expose sources that don't know about each other did not itself know about one of them.
type Source = 'base' | 'universal' | 'role' | 'protocol';
interface Directive {
  kind: 'PROHIBITION' | 'MANDATE';
  source: Source;
  origin: string; // which protocol / which role — so a hit is traceable to a file
  text: string;
}

// Matched case-sensitively where the corpus uses caps for emphasis (MUST, NEVER, MANDATORY), and
// case-insensitively only for the two forms that are routinely written in prose ("do not", "never").
const PROHIBITION = /\b(?:Do NOT|DO NOT|do not|NEVER|Never|never|must not|MUST NOT|FORBIDDEN)\b/;
const MANDATE = /\b(?:MUST|MANDATORY|ALWAYS|Always|REQUIRED|Required)\b/;

/**
 * Split prose into the units a reader actually judges. Bullets and sentences, not lines: the corpus
 * wraps mid-sentence, so a line-based split truncates directives at the wrap and silently changes what
 * they say — which is the same shape as the render bug this module's siblings keep producing.
 */
function units(text: string): string[] {
  const out: string[] = [];
  for (const block of text.split(/\n(?=\s*[-*]\s|\s*\d+\.\s|#{1,4}\s)/)) {
    const flat = block.replace(/\s*\n\s*/g, ' ').trim();
    if (!flat) continue;
    // A long bullet can carry several independent directives; split on sentence ends, but not on the
    // abbreviations and version numbers that pepper this corpus.
    // A heading is a LABEL, not a directive. `### Never Fabricate — Report What Is True` matched the
    // prohibition regex and listed as a rule; it instructs nobody. Dropped, or the listing pads itself
    // with its own section names and the real count is wrong.
    if (/^#{1,4}\s/.test(flat)) continue;
    const parts = flat.split(/(?<=[.!?])\s+(?=[A-Z*`•\-])/);
    for (const p of parts) {
      // Trim a dangling fence: a directive that introduces a code block splits just before it, leaving
      // a bare ``` on the end of otherwise-complete prose.
      const t = p.replace(/\s*```\s*$/, '').trim();
      if (t.length > 3) out.push(t);
    }
  }
  return out;
}

function extract(text: string, source: Source, origin: string): Directive[] {
  const found: Directive[] = [];
  for (const u of units(text)) {
    // A unit can be both (a mandate with a carve-out). Record it under each — dropping one would hide
    // exactly the half a reader is looking for.
    if (PROHIBITION.test(u)) found.push({ kind: 'PROHIBITION', source, origin, text: u });
    if (MANDATE.test(u)) found.push({ kind: 'MANDATE', source, origin, text: u });
  }
  return found;
}

function clean(s: string): string {
  return s
    .replace(/\\`/g, '`')
    .replace(/\\\$\{/g, '${')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrap(s: string, indent: number, width = 108): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && cur.length + w.length + 1 > width - indent) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Strip an embedded copy of the universal rules from a protocol body, and say so.
 *
 * FOUND ON THIS TOOL'S FIRST REAL RUN. All six ACTIVE protocol rows in the LOCAL dev database begin with
 * `## Universal Agent Rules` at position 0 — the pre-rec-9 shape, because a dev DB is only re-seeded when
 * someone runs the seed by hand. Production was verified clean the same morning, so this is dev-fidelity,
 * not a production defect. It matters anyway for two reasons:
 *
 *   1. Without this, the listing double-counts every universal directive and tags the copy `[protocol]` —
 *      the tool would invent a cross-source disagreement out of one rule appearing twice.
 *   2. It means prompt behaviour tested locally is NOT the prompt production serves. Worth knowing before
 *      you conclude anything from a local run.
 *
 * ⚠️ DEDUPED PER DIRECTIVE, NOT BY STRIPPING A PREFIX — and the first attempt at the prefix version is
 * why. The seeded copy and the checked-out constant share only their first **85 characters**: the stored
 * one still says the rules are *"prepended to this protocol at seed time"*, which is precisely the
 * self-description rec #9 made false and corrected. A longest-common-prefix strip therefore matched 1.7%
 * and silently did nothing, leaving the double-listing it was written to prevent. Comparing individual
 * directives is immune to that skew and to position.
 */
function dedupeAgainstUniversal(
  protocolDirectives: Directive[],
  universal: Directive[]
): { kept: Directive[]; removed: number } {
  const seen = new Set(universal.map(d => `${d.kind}::${clean(d.text)}`));
  const kept = protocolDirectives.filter(d => !seen.has(`${d.kind}::${clean(d.text)}`));
  return { kept, removed: protocolDirectives.length - kept.length };
}

async function loadProtocol(name: string): Promise<{ name: string; text: string } | null> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.agentPromptLibrary.findMany({
      where: { tags: { has: 'protocol' }, status: 'ACTIVE' },
      select: { name: true, promptText: true },
    });
    const hit =
      rows.find(r => r.name === name) ??
      rows.find(r => r.name.includes(name)) ??
      null;
    if (!hit) {
      console.error(`  ⚠️  no ACTIVE protocol matching "${name}". Available:`);
      rows.forEach(r => console.error(`        ${r.name}`));
      return null;
    }
    return { name: hit.name, text: hit.promptText ?? '' };
  } finally {
    await prisma.$disconnect();
  }
}

async function loadLiveGuidance(role: string): Promise<string | null> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const row = await prisma.agentTemplate.findFirst({
      where: { defaultRole: role },
      select: { name: true, promptTemplate: true },
    });
    if (!row) {
      console.error(`  ⚠️  no agent_templates row with defaultRole="${role}"`);
      return null;
    }
    console.log(`  (live row: "${row.name}")`);
    return row.promptTemplate ?? '';
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--roles') || argv.length === 0) {
    const keys = Object.keys(ROLE_GUIDANCE_LIBRARY).sort();
    console.log(`\n${keys.length} roles with guidance:\n`);
    keys.forEach(k => console.log(`  ${k}`));
    console.log('\nUsage: npm run prompt:directives -- <role> [--protocol <name>] [--live]\n');
    process.exit(0);
  }

  const role = argv.find(a => !a.startsWith('--'))!;
  const pIdx = argv.indexOf('--protocol');
  const protocolName = pIdx >= 0 ? argv[pIdx + 1] : null;
  const live = argv.includes('--live');

  let guidance: string | null;
  if (live) {
    guidance = await loadLiveGuidance(role);
  } else {
    guidance = ROLE_GUIDANCE_LIBRARY[role] ?? null;
    if (!guidance) {
      console.error(`  ⚠️  no ROLE_GUIDANCE_LIBRARY entry for "${role}". Run with --roles to list.`);
      process.exit(0);
    }
  }

  const universalDirectives = extract(UNIVERSAL_AGENT_RULES, 'universal', 'UNIVERSAL_AGENT_RULES');
  const directives: Directive[] = [
    ...extract(PAICHART_UNIVERSAL_BASE_TEMPLATE, 'base', 'PAICHART_UNIVERSAL_BASE_TEMPLATE'),
    ...universalDirectives,
    ...(guidance ? extract(guidance, 'role', role) : []),
  ];

  let embeddedRulesNotice: string | null = null;
  if (protocolName) {
    const p = await loadProtocol(protocolName);
    if (p) {
      const raw = extract(p.text, 'protocol', p.name);
      const { kept, removed } = dedupeAgainstUniversal(raw, universalDirectives);
      if (removed > 0) {
        embeddedRulesNotice =
          `${removed} directive(s) in this protocol row are identical to universal rules — the row carries ` +
          `an embedded copy (the PRE-rec-9 shape). Hidden here so the listing does not invent a ` +
          `cross-source disagreement out of one rule appearing twice. Re-seed to clear it, and note that ` +
          `prompts served from this database are NOT what production serves.`;
      }
      directives.push(...kept);
    }
  }

  const label: Record<Source, string> = {
    base: 'base',
    universal: 'universal',
    role: 'role',
    protocol: 'protocol',
  };

  console.log(`\n${'='.repeat(112)}`);
  console.log(`  DIRECTIVES IN SCOPE FOR ROLE: ${role}`);
  console.log(
    `  sources: base template + universal rules${guidance ? ` + role guidance (${live ? 'LIVE agent_templates row' : 'LIBRARY'})` : ''}` +
      `${protocolName ? ` + protocol` : ''}`
  );
  if (!live) {
    console.log(`  ⚠️  role guidance read from the LIBRARY. Agents run the stored agent_templates row,`);
    console.log(`      which is seeded MANUALLY and can drift. Use --live to see what agents get.`);
  }
  if (!protocolName) {
    console.log(`  ⚠️  no protocol included — most directives an agent sees come from one. Add --protocol.`);
  }
  if (embeddedRulesNotice) {
    wrap(embeddedRulesNotice, 6).forEach((l, i) => console.log(`  ${i === 0 ? '🔁' : '  '}  ${l}`));
  }
  console.log(`${'='.repeat(112)}`);

  for (const kind of ['PROHIBITION', 'MANDATE'] as const) {
    const rows = directives.filter(d => d.kind === kind);
    console.log(`\n${kind}S (${rows.length})\n`);
    if (rows.length === 0) console.log('  (none)');
    for (const d of rows) {
      const tag = `[${label[d.source]}]`.padEnd(11);
      const lines = wrap(clean(d.text), 15);
      console.log(`  ${tag}  ${lines[0]}`);
      lines.slice(1).forEach(l => console.log(`  ${' '.repeat(11)}  ${l}`));
      if (d.source === 'protocol' || (d.source === 'role' && directives.some(x => x.source === 'protocol'))) {
        // origin only matters once more than one file is in play
      }
      console.log('');
    }
  }

  console.log(`${'-'.repeat(112)}`);
  console.log('  This is a LISTING, not a verdict. Nothing here claims two directives conflict —');
  console.log('  read them side by side and judge scope. See the module header for why.');
  console.log(`${'-'.repeat(112)}\n`);
}

main().catch(err => {
  console.error('❌ failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
