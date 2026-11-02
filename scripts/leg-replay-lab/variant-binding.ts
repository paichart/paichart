/**
 * Leg replay lab — L-2, the VARIANT binding (PLATFORM-HELD-BYTES Stage B plan §4; model-evaluation lane §1.3 L-2).
 *
 * An arm runs the held variant when its variant spec names `protocolName` + `protocolSource: 'commit:<sha>'`:
 *   - the protocol TEXT is the SEED FILE at that commit rendered over TODAY's `lib/` (`protocolTextAtCommit` rewrites the seed's
 *     `../lib/` imports to the working tree), so no production DRAFT row is needed. ⚠️ `commit:<sha>` therefore pins the seed's
 *     variant WIRING (version, base entry, the `PROTOCOLS.push`), NOT the lib-built text (`buildHeldVariant`, `HELD_EDIT_CLAUSE`
 *     live in lib). A §5 re-assert must render at the commit being SHIPPED — a scratch copy of the experiment with
 *     `protocolSource: commit:<that sha>` — never the tracked experiment.json alone (push-2 code review ME-P2-1). The lab refuses unless the obs base at that
 *     commit is byte-identical to the experiment's pinned baseline obs text (D-L: the base the variant was built over is the one
 *     the `base` arm runs).
 *   - a DEEP COPY of the node's snapshot is REBOUND: the leg's `metadata.protocol` stamp and its title token, and each leg-role
 *     template the snapshot carries (Author, Reviewer) — `metadata.protocol`, `name`, `constraints` — to the variant template
 *     built by the variant seed's own `buildHeldTemplateRow` (never by running a seed). The template promptTemplate is unchanged:
 *     the variant templates reuse the base roles' guidance (pinned by test-held-variant-protocol).
 * Nothing in the cached snapshot is written; the copy lives for the run.
 */
import { createHash } from 'crypto';
import { HELD_VARIANT_TEMPLATE_NAMES } from '../../lib/agents/harness/held-bytes/variant-protocol';
import { HELD_VARIANT_PROTOCOL, HELD_OBS_PROTOCOL } from '../../lib/agents/harness/held-bytes/variant';
import { protocolTextAtCommit } from './protocol-history';
import type { Snapshot } from './snapshot';
import type { ProtocolText } from './rebuild';

const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const BASE_NAME = 'observability-config-protocol';

/** The variant's text at `commit`, refusing unless that commit's obs base equals the pinned baseline text. */
export function heldVariantProtocolAt(protocolName: string, protocolSource: string, pinnedBaseline: { text: string; version: string }): ProtocolText {
  const m = /^commit:([0-9a-f]{7,40})$/.exec(protocolSource);
  if (!m) throw new Error(`protocolSource must be commit:<sha>, got ${protocolSource}`);
  const base = protocolTextAtCommit(BASE_NAME, m[1]);
  if (sha(base.text) !== sha(pinnedBaseline.text) || base.version !== pinnedBaseline.version) {
    throw new Error(`L-2: obs at ${m[1].slice(0, 12)} (${base.version}, ${sha(base.text).slice(0, 12)}) is not the pinned baseline (${pinnedBaseline.version}, ${sha(pinnedBaseline.text).slice(0, 12)}) — the variant would not be built over the base the base arm runs (D-L)`);
  }
  const v = protocolTextAtCommit(protocolName, m[1]);
  return { name: protocolName, version: v.version, text: v.text, source: `${protocolSource}` };
}

/** The key order a jsonb column serves an object in (shorter keys first, then bytewise) — what a SEEDED variant row returns.
 *  The production rows the snapshot carries already come back in this order; the seed's own literal order is not it. */
export function jsonbKeyOrder<T extends Record<string, unknown>>(o: T): T {
  const keys = Object.keys(o).sort((a, b) => (Buffer.byteLength(a) - Buffer.byteLength(b)) || Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return Object.fromEntries(keys.map((k) => [k, o[k]])) as T;
}

export interface VariantBindingReport { legTitle: string | null; legProtocol: string; templates: Array<{ role: 'author' | 'reviewer'; from: string; to: string; constraintsSha256: string }> }

/**
 * held-k8s step 3 (L-K-e, L-K2): a JOINED domain is held-capable under its OWN protocol name (`HELD_JOIN_VERSIONS`), so there is
 * no variant to bind. A deep copy keeps the leg's protocol stamp and title; each leg-role template the snapshot carries (Author,
 * Reviewer — or an Architect node's own template) takes the `constraints` the domain's OWNING seed builds in THIS tree
 * (`buildTemplateRow`, the function the seed writes the row with — never by running the seed), in jsonb key order. The template
 * promptTemplate is unchanged (step 3 moves constraints and descriptions only; a description never renders). Refuses a template
 * the seed does not own, and a leg whose protocol is not held-capable in this tree's `lib/` (the join line is the code lever).
 */
export function snapshotWithHeldJoin(snap: Snapshot, seedModule: string): { snap: Snapshot; report: VariantBindingReport } {
  const copy: Snapshot = JSON.parse(JSON.stringify(snap));
  if (!copy.leg) throw new Error('L-K-e: the snapshot carries no leg');
  const { isHeldCapableLeg } = require('../../lib/agents/harness/held-bytes/variant') as { isHeldCapableLeg: (l: { title?: string | null; metadata?: unknown }) => boolean };
  if (!isHeldCapableLeg(copy.leg)) throw new Error(`L-K-e: leg ${copy.leg.id} (${copy.leg.metadata?.protocol ?? copy.leg.title}) is not held-capable in this tree — a heldJoinSeed arm needs the join line (HELD_JOIN_VERSIONS)`);
  if (!/^seed-[a-z0-9-]+-templates$/.test(seedModule)) throw new Error(`L-K-e: heldJoinSeed must name a scripts/seed-*-templates module, got ${seedModule}`);
  const seed = require(`../${seedModule}`) as { TEMPLATES?: Array<Record<string, any>>; buildTemplateRow?: (t: any) => Record<string, any> };
  if (!Array.isArray(seed.TEMPLATES) || typeof seed.buildTemplateRow !== 'function') throw new Error(`L-K-e: ${seedModule} does not export TEMPLATES + buildTemplateRow (the V-0 shape)`);
  const templates: VariantBindingReport['templates'] = [];
  for (const role of ['author', 'reviewer'] as const) {
    const t = copy[role]?.template;
    if (!t) continue;
    const spec = seed.TEMPLATES.find((x) => x.name === t.name);
    if (!spec) throw new Error(`L-K-e: ${seedModule} owns no template named "${t.name}" (${role})`);
    const row = seed.buildTemplateRow(spec);
    t.constraints = jsonbKeyOrder(row.constraints);
    templates.push({ role, from: String(t.name), to: String(t.name), constraintsSha256: sha(JSON.stringify(row.constraints)) });
  }
  return { snap: copy, report: { legTitle: copy.leg.title ?? null, legProtocol: String(copy.leg.metadata?.protocol ?? ''), templates } };
}

export function snapshotWithVariantBinding(snap: Snapshot, protocolName: string): { snap: Snapshot; report: VariantBindingReport } {
  const copy: Snapshot = JSON.parse(JSON.stringify(snap));
  if (!copy.leg) throw new Error('L-2: the snapshot carries no leg to rebind');
  // Phase 10 panel D4: the retired variant token is not held-capable in lib, so the LEG is bound under the held-capable obs name (the
  // leaves still bind the variant protocol by template name, so the served text — the measured G1–G3 bytes — is unchanged).
  const legProtocol = protocolName === HELD_VARIANT_PROTOCOL ? HELD_OBS_PROTOCOL : protocolName;
  copy.leg.metadata = { ...(copy.leg.metadata ?? {}), protocol: legProtocol };
  if (typeof copy.leg.title === 'string') copy.leg.title = copy.leg.title.replace(/\(protocol: [a-z0-9-]+\)/, `(protocol: ${legProtocol.replace(/-protocol$/, '')})`);
  const seed = require('../seed-observability-held-templates') as { HELD_TEMPLATES: Array<Record<string, any>>; buildHeldTemplateRow: (t: any) => Record<string, any> };
  const templates: VariantBindingReport['templates'] = [];
  for (const role of ['author', 'reviewer'] as const) {
    const b = copy[role];
    const t = b?.template;
    if (!t) continue;
    const to = HELD_VARIANT_TEMPLATE_NAMES[t.name];
    if (!to) throw new Error(`L-2: ${role} template "${t.name}" has no held variant`);
    const spec = seed.HELD_TEMPLATES.find((x) => x.name === to);
    if (!spec) throw new Error(`L-2: the held seed has no "${to}"`);
    const row = seed.buildHeldTemplateRow(spec);
    const from = String(t.name);
    t.name = to; t.metadata = { ...(t.metadata ?? {}), protocol: protocolName }; t.constraints = jsonbKeyOrder(row.constraints);
    templates.push({ role, from, to, constraintsSha256: sha(JSON.stringify(row.constraints)) });
  }
  return { snap: copy, report: { legTitle: copy.leg.title ?? null, legProtocol, templates } };
}
