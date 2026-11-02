#!/usr/bin/env ts-node
/**
 * test-held-variant-golden — the PLATFORM-HELD-BYTES Stage B goldens (plan v4.1 §3 V-0, built 2026-10-15).
 *
 * WHAT IT PINS (sha256 of what agents RECEIVE, present-and-equal; `--update` rewrites):
 *   base       — the RENDERED observability-config protocol, with its version. Stage B froze it (D-L) because the variant was
 *                built over it by anchors; since PHASE 10 (2026-10-17, the fold) the held text IS in the obs source and no
 *                variant is built, so the seed no longer refuses a moved base. This entry stays as the obs text's LEDGER: an
 *                obs edit fails here, and `--update` records it as a conscious change (now an ordinary obs version bump).
 *   roles      — ROLE_GUIDANCE_LIBRARY for the four roles the variant reuses (config_change_author, change_reviewer,
 *                infra_change_architect, infra_state_harvester). test-protocol-golden pins them too; repeating them here
 *                is deliberate: a role edit is a variant event (plan §5 item 2), and this file is the variant's ledger.
 *   templates  — the prompt-reaching fields of the four observability templates (the G1 `base` arm, §5 item 4) and of
 *                both Node C templates: promptTemplate (sha), constraints, templateType, defaultRole, protocol binding and
 *                modelParameters — built by each seed's own `buildTemplateRow`, never by running a seed.
 *   variant    — the variant row's rendered sha + size. Since Phase 10 it is the DEPRECATED tombstone (a few hundred chars).
 *   nets/chain DI property — no module on the nets/chain path reads the module-global Prisma client; every read goes
 *                through the injected one. replay-held-variant.ts's positive control overlays a leg BY INJECTION, so a
 *                bypassing read would silently see the un-overlaid row and the control would pass while testing nothing.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/test-held-variant-golden.ts            # check (CI)
 *   npx ts-node -r tsconfig-paths/register scripts/test-held-variant-golden.ts --update   # regenerate (state why in the commit)
 */
// The seed modules instantiate PrismaClient at load (no connection). Stub the URL before requiring them.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const GOLDEN = join(__dirname, 'fixtures', 'held-variant-golden.json');
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

type AnyRec = Record<string, unknown>;
type TemplateEntry = { sha256: string; promptTemplateSha256: string; model: unknown; maxTokens: unknown; maxToolTurns: unknown; constraints: string[] };
type Golden = {
  base: { name: string; version: string; sha256: string; chars: number };
  roles: Record<string, { sha256: string; chars: number }>;
  templates: Record<string, TemplateEntry>;
  variant: null | AnyRec;
};

const VARIANT_ROLES = ['config_change_author', 'change_reviewer', 'infra_change_architect', 'infra_state_harvester'];
const OBS_TEMPLATES = ['Observability State Harvester', 'Observability Change Architect', 'Observability Config Rollback Author', 'Observability Change Reviewer'];
const NODE_C_TEMPLATES: Array<[string, string]> = [
  ['seed-program-templates', 'Program Integration Reviewer'],
  ['seed-value-chain-templates', 'Value-Chain Program Integration Reviewer'],
];

function templateEntry(row: AnyRec): TemplateEntry {
  const meta = (row.metadata ?? {}) as AnyRec;
  const mp = (meta.modelParameters ?? {}) as AnyRec;
  const agentFacing = {
    name: row.name, templateType: row.templateType, defaultRole: row.defaultRole,
    protocol: 'protocol' in meta ? meta.protocol : '<unbound>',
    promptTemplateSha256: sha(String(row.promptTemplate)), constraints: row.constraints, modelParameters: mp,
  };
  return {
    sha256: sha(JSON.stringify(agentFacing)),
    promptTemplateSha256: agentFacing.promptTemplateSha256,
    model: mp.model ?? null, maxTokens: mp.maxTokens ?? null, maxToolTurns: mp.maxToolTurns ?? null,
    constraints: Object.keys((row.constraints ?? {}) as AnyRec),
  };
}

function current(): Golden {
  const { PROTOCOLS } = require('./seed-protocol-prompts') as { PROTOCOLS: Array<{ name: string; promptText: string; version?: string }> };
  const { ROLE_GUIDANCE_LIBRARY } = require('../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate') as { ROLE_GUIDANCE_LIBRARY: Record<string, string> };
  const obs = PROTOCOLS.find((p) => p.name === 'observability-config-protocol');
  if (!obs) throw new Error('observability-config-protocol is not in PROTOCOLS');
  const roles: Golden['roles'] = {};
  for (const r of VARIANT_ROLES) {
    const t = ROLE_GUIDANCE_LIBRARY[r];
    if (typeof t !== 'string') throw new Error(`ROLE_GUIDANCE_LIBRARY has no ${r}`);
    roles[r] = { sha256: sha(t), chars: t.length };
  }
  const templates: Golden['templates'] = {};
  const obsSeed = require('./seed-observability-templates') as { TEMPLATES: AnyRec[]; buildTemplateRow: (t: AnyRec) => AnyRec };
  for (const name of OBS_TEMPLATES) {
    const t = obsSeed.TEMPLATES.find((x) => x.name === name);
    if (!t) throw new Error(`seed-observability-templates has no "${name}"`);
    templates[name] = templateEntry(obsSeed.buildTemplateRow(t));
  }
  for (const [file, name] of NODE_C_TEMPLATES) {
    const seed = require(`./${file}`) as { TEMPLATES: AnyRec[]; buildTemplateRow: (t: AnyRec) => AnyRec };
    const t = seed.TEMPLATES.find((x) => x.name === name);
    if (!t) throw new Error(`${file} has no "${name}"`);
    templates[name] = templateEntry(seed.buildTemplateRow(t));
  }
  // V-8 (2026-10-15): the variant row (ACTIVE since flip commit 2) and its four templates (ACTIVE since flip commit 1). The size budget (PC S-16) is ≤ base + 3,000; the
  // exact number lands here and in the G1 experiment.json.
  const v = PROTOCOLS.find((p) => p.name === 'observability-config-held-protocol');
  if (!v) throw new Error('the held variant row is not in PROTOCOLS');
  const heldSeed = require('./seed-observability-held-templates') as { HELD_TEMPLATES: AnyRec[]; buildHeldTemplateRow: (t: AnyRec) => AnyRec };
  const heldTemplates: Record<string, TemplateEntry> = {};
  for (const t of heldSeed.HELD_TEMPLATES) heldTemplates[String(t.name)] = templateEntry(heldSeed.buildHeldTemplateRow(t));
  const variant = { name: v.name, version: String(v.version), sha256: sha(v.promptText), chars: v.promptText.length,
    baseSha256: sha(obs.promptText), deltaChars: v.promptText.length - obs.promptText.length, templates: heldTemplates };
  return { base: { name: obs.name, version: String(obs.version), sha256: sha(obs.promptText), chars: obs.promptText.length }, roles, templates, variant };
}

/** The nets/chain path reads only through the injected client (see header). Returns the violations. */
export function globalClientReads(): string[] {
  const dir = join(ROOT, 'lib/agents/harness');
  const files = [
    'context-chainer.ts', 'net-context.ts', 'net-registry.ts', 'mechanical-nets.ts', 'program-protocol.ts',
    'render-pipeline-context.ts',
    ...require('fs').readdirSync(dir).filter((f: string) => /-enrichment\.ts$/.test(f)),
  ].map((f) => join(dir, f)).concat(join(ROOT, 'lib/services/execution-selection.ts'));
  const bad: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const imports = /from '@\/lib\/prisma'|require\('@\/lib\/prisma'\)/.test(src);
    // A read of the global client is `prisma.<model|$op>` where `prisma` is the imported singleton. An injected client
    // named `prisma` (a parameter or a ctx field) is only possible in a file that does NOT import the singleton.
    const reads = imports ? (src.match(/(?<![\w.])prisma\.(?:\$\w+|[a-z]\w*)\b/g) ?? []) : [];
    if (reads.length) bad.push(`${f.replace(ROOT + '/', '')}: ${reads.length} read(s) of the global client (${[...new Set(reads)].join(', ')})`);
  }
  return bad;
}

function main() {
  const update = process.argv.includes('--update');
  const cur = current();
  let fails = 0;
  const ok = (c: boolean, m: string) => { console.log(`  ${c ? '✓' : '❌'} ${m}`); if (!c) fails++; };

  if (update || !existsSync(GOLDEN)) {
    const prev = existsSync(GOLDEN) ? (JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden) : null;
    void prev;
    writeFileSync(GOLDEN, JSON.stringify(cur, null, 2) + '\n');
    console.log(`wrote ${GOLDEN}`);
  }
  const g = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden;

  console.log('base (the rendered protocol the variant is built over):');
  ok(g.base.name === cur.base.name && g.base.version === cur.base.version,
    `${cur.base.name} version ${cur.base.version} (golden ${g.base.version})`);
  ok(g.base.sha256 === cur.base.sha256,
    `rendered sha ${cur.base.sha256.slice(0, 12)}… equals the golden — a change is a variant event (D-L freeze; V-8 seed refusal)`);
  console.log('roles the variant reuses:');
  for (const [r, e] of Object.entries(g.roles)) ok(cur.roles[r]?.sha256 === e.sha256, `${r} ${e.chars} chars`);
  ok(Object.keys(g.roles).sort().join() === VARIANT_ROLES.slice().sort().join(), 'role set is exactly the four reused roles');
  console.log('templates (observability base arm + Node C):');
  for (const [n, e] of Object.entries(g.templates)) {
    const c = cur.templates[n];
    ok(!!c && c.sha256 === e.sha256, `${n}${c && c.sha256 !== e.sha256 ? ` — moved (prompt ${c.promptTemplateSha256 === e.promptTemplateSha256 ? 'same' : 'CHANGED'})` : ''}`);
  }
  ok(Object.keys(g.templates).length === OBS_TEMPLATES.length + NODE_C_TEMPLATES.length, `${Object.keys(g.templates).length} templates pinned (4 observability + 2 Node C)`);
  console.log('variant:');
  ok(!!g.variant && JSON.stringify(g.variant) === JSON.stringify(cur.variant),
    `rendered variant ${String((cur.variant as AnyRec).sha256).slice(0, 12)}… ${(cur.variant as AnyRec).chars} chars (base + ${(cur.variant as AnyRec).deltaChars}) + its 4 templates equal the golden`);
  ok(!!cur.variant && Number((cur.variant as AnyRec).deltaChars) <= 3000, 'variant within the ≤ base + 3,000 budget (PC S-16)');
  ok(!!g.variant && (g.variant as AnyRec).baseSha256 === g.base.sha256, 'the variant golden was built over the recorded base');
  console.log('nets/chain path reads only through the injected client:');
  const bad = globalClientReads();
  ok(bad.length === 0, bad.length ? bad.join('; ') : 'no module on the path reads the global Prisma client');

  if (fails) { console.log(`\n❌ ${fails} failure(s). A legitimate change: --update, and state the variant consequence in the commit.`); process.exit(1); }
  console.log('\n✅ held-variant goldens hold');
}

if (require.main === module) main();
