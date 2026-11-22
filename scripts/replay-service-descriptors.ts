#!/usr/bin/env ts-node
/**
 * replay-service-descriptors.ts — run the SHIPPING `deriveServiceDescriptors` of TWO trees (a base tree and this one) over every
 * stored interface contract, in BOTH awaiting states, and say what moves. READ-ONLY. Run by hand, never in CI.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/replay-service-descriptors.ts \
 *       --local-db <nets_replay_<id>> --base-tree <a tree at the base commit, with lib/ and node_modules>
 *
 * WHY (Config sources STEP 3 slice P4, plan §6 / §9.2 "the corpus replay of stored contracts"; pattern
 * platform-derived-contract-field-pattern.md "Replay first"). The derivation runs when a contract is WRITTEN, so no net replay sees a
 * change to it. This asks the only question a stored corpus can answer: handed the contracts production has stored, does the changed
 * derivation store anything different from the base — as shipped (must be nothing), and with every Config-sources row's text shipped
 * (the join: only what the change intends).
 *
 * WHERE. A LOCAL copy only — the scratch database `scripts/replay-nets-byte-identity.sh` restores from its read-only production
 * snapshot (`tasks` is one of its tables). ENFORCED, each a refusal with exit 2: the database name must start `nets_replay_`; the
 * URL's host must be localhost / 127.0.0.1 / ::1; the session must report `default_transaction_read_only = on` (the URL sets it);
 * the base tree must not be this tree. It never opens a production connection. The output names production task ids: keep it in
 * the session scratchpad, never in a work tree.
 *
 * WHAT IT PRINTS (each a count OF contracts — one stored `inputContext.interfaceContract` object on one task — unless said):
 *   population; per awaiting state: contracts whose STORED VALUE or FACT differs between base and new, each listed with the tokens
 *   that moved; the observability values (a `serviceDescriptors["observability-config"]` entry) and whether each is byte-unchanged
 *   by the new tree in both states; stored string descriptor URLs the new tree would change or remove at the join (must be 0);
 *   how many stored contracts re-derive to themselves (the pre-derivation contracts with a composed descriptor do not);
 *   a MEASUREMENT with no behaviour behind it (P4 review, sec-ops LOW 1): how many stored descriptor values, and how many services
 *   named on declared service lines, the keep arm's whole-URL-token test would refuse if it were applied to rule 4 and to the lane
 *   arms — with their shapes, MASKED (never a value).
 * Exit 0 when nothing moves AS SHIPPED and no stored observability value and no stored URL moves in either state; 1 otherwise; 2 usage.
 */
import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

type Fact = { derived: string[]; kept: string[]; added: string[]; replaced: unknown[]; removed: Array<{ token: string; reason: string }>; notDerived: Array<{ token: string; reason: string }>; unknownKeys: string[]; failed: boolean };
type Derive = (c: Record<string, unknown>, awaiting?: readonly string[]) => { contract: Record<string, unknown>; fact: Fact };
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const OBS = 'observability-config';

function arg(k: string): string | undefined { const a = process.argv.slice(2); const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; }
function localUrl(db: string): string {
  const raw = process.env.NETS_REPLAY_LOCAL_PG || process.env.DATABASE_URL;
  if (!raw) { console.error('✗ no local Postgres URL: set NETS_REPLAY_LOCAL_PG'); process.exit(2); }
  const u = new URL(raw);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname)) { console.error('✗ ABORT: --local-db needs a LOCAL Postgres URL (localhost) — refusing a non-local host'); process.exit(2); }
  u.pathname = `/${db}`; u.search = `?options=${encodeURIComponent('-c default_transaction_read_only=on')}`;
  return u.toString();
}

async function main() {
  const db = arg('--local-db'); const baseTree = arg('--base-tree');
  if (db && !/^nets_replay_[a-z0-9_]+$/.test(db)) { console.error('✗ ABORT: --local-db must name a nets replay scratch database (nets_replay_<id>) — refusing any other database'); process.exit(2); }
  if (!db || !baseTree) { console.error('usage: replay-service-descriptors.ts --local-db <database name> --base-tree <tree at the base commit>'); process.exit(2); }
  const baseMod = path.join(path.resolve(baseTree), 'lib/agents/harness/service-descriptors-derivation');
  const newMod = path.join(__dirname, '../lib/agents/harness/service-descriptors-derivation');
  if (!fs.existsSync(`${baseMod}.ts`)) { console.error(`✗ ${baseMod}.ts not found — --base-tree must be a tree with lib/`); process.exit(2); }
  if (fs.realpathSync(`${baseMod}.ts`) === fs.realpathSync(`${newMod}.ts`)) { console.error('✗ --base-tree is THIS tree: both sides would run the same code and prove nothing'); process.exit(2); }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const base = require(baseMod) as { deriveServiceDescriptors: Derive };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const next = require(newMod) as { deriveServiceDescriptors: Derive; isWholeTokenDescriptorUrl: (v: unknown) => boolean; isUsableDescriptorValue: (v: unknown) => boolean; knownDescriptorTokens: (a?: readonly string[]) => string[] };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const variant = require(path.join(__dirname, '../lib/agents/harness/held-bytes/variant')) as { CONFIG_SOURCE_AWAITING_TEXT: readonly string[] };
  const STATES: Array<[string, readonly string[]]> = [['as shipped', variant.CONFIG_SOURCE_AWAITING_TEXT], ['every row shipped (the join)', []]];
  // The base tree takes the awaiting list as a parameter only since STEP 3 P1; a base without it would ignore the second argument
  // and both states would silently be "as shipped".
  if (base.deriveServiceDescriptors.length < 2 && !/awaiting/.test(String(base.deriveServiceDescriptors))) {
    console.error('✗ the base tree\'s derivation takes no awaiting list — the join state cannot be asked of it'); process.exit(2);
  }

  const prisma = new PrismaClient({ datasources: { db: { url: localUrl(db) } } });
  try {
    const ro = await prisma.$queryRaw<Array<{ ro: string }>>`SELECT current_setting('default_transaction_read_only') AS ro`;
    if (ro[0]?.ro !== 'on') { console.error('✗ the session is not read-only'); process.exit(2); }
    const rows = await prisma.$queryRaw<Array<{ id: string; type: string; created: Date; contract: unknown; fact: unknown }>>`
      SELECT id, type::text AS type, created_at AS created, "inputContext"->'interfaceContract' AS contract, metadata->'interfaceContractSource' AS fact
        FROM tasks WHERE jsonb_typeof("inputContext"->'interfaceContract') = 'object' ORDER BY created_at`;
    console.log(`# service-descriptors replay — database ${db}; base ${path.resolve(baseTree)}; new ${path.resolve(__dirname, '..')}`);
    console.log(`population: ${rows.length} stored contracts (tasks whose inputContext.interfaceContract is an object); ${rows.filter((r) => isObj(r.fact) && isObj((r.fact as Record<string, unknown>).serviceDescriptors)).length} of them carry a stored derivation fact (resolver v5+)`);

    let bad = 0;
    const obsRows = rows.filter((r) => isObj(r.contract) && isObj(r.contract.serviceDescriptors) && OBS in r.contract.serviceDescriptors);
    const obsBlock = rows.filter((r) => isObj(r.contract) && isObj(r.contract.configSources) && OBS in r.contract.configSources).length;
    console.log(`observability: ${obsRows.length} contracts carry a serviceDescriptors["${OBS}"] entry (${new Set(obsRows.map((r) => JSON.stringify((r.contract as Record<string, Record<string, unknown>>).serviceDescriptors[OBS]))).size} distinct value(s)); ${obsBlock} carry a configSources["${OBS}"] key`);
    const perToken = new Map<string, number>();
    for (const r of rows) if (isObj(r.contract) && isObj(r.contract.serviceDescriptors)) for (const k of Object.keys(r.contract.serviceDescriptors)) perToken.set(k, (perToken.get(k) ?? 0) + 1);
    console.log(`stored serviceDescriptors entries by key: ${[...perToken.entries()].sort().map(([k, n]) => `${k} ${n}`).join(' · ') || 'none'}`);

    for (const [name, awaiting] of STATES) {
      let moved = 0, obsMoved = 0, urlMoved = 0, selfSame = 0, newReasons = 0;
      const lines: string[] = [];
      for (const r of rows) {
        const c = r.contract as Record<string, unknown>;
        const b = base.deriveServiceDescriptors(JSON.parse(JSON.stringify(c)), awaiting);
        const n = next.deriveServiceDescriptors(JSON.parse(JSON.stringify(c)), awaiting);
        if (JSON.stringify(n.contract) === JSON.stringify(c)) selfSame++;
        if (n.fact.notDerived.some((x) => x.reason === 'no-service-line')) newReasons++;
        const sd = isObj(c.serviceDescriptors) ? c.serviceDescriptors : {};
        const nsd = isObj(n.contract.serviceDescriptors) ? n.contract.serviceDescriptors : {};
        // a stored observability value the NEW tree would not store byte-unchanged
        if (OBS in sd && JSON.stringify(nsd[OBS]) !== JSON.stringify(sd[OBS])) obsMoved++;
        // a stored string descriptor URL the NEW tree would change or remove where the BASE tree keeps it
        const bsd = isObj(b.contract.serviceDescriptors) ? b.contract.serviceDescriptors : {};
        for (const [k, v] of Object.entries(sd)) {
          if (typeof v === 'string' && /^https?:\/\//i.test(v) && bsd[k] === v && nsd[k] !== v) urlMoved++;
        }
        if (JSON.stringify(b.contract) !== JSON.stringify(n.contract) || JSON.stringify(b.fact) !== JSON.stringify(n.fact)) {
          moved++;
          const toks = new Set<string>([...Object.keys(bsd), ...Object.keys(nsd)].filter((k) => JSON.stringify(bsd[k]) !== JSON.stringify(nsd[k])));
          for (const x of [...b.fact.notDerived, ...n.fact.notDerived, ...b.fact.removed, ...n.fact.removed]) toks.add(x.token);
          lines.push(`  moved ${r.id} ${r.type} ${r.created.toISOString().slice(0, 10)} tokens ${[...toks].sort().join(',') || '—'} value ${JSON.stringify(b.contract) === JSON.stringify(n.contract) ? 'same' : 'DIFFERS'} · base removed ${JSON.stringify(b.fact.removed)} notDerived ${JSON.stringify(b.fact.notDerived)} → new removed ${JSON.stringify(n.fact.removed)} notDerived ${JSON.stringify(n.fact.notDerived)}`);
        }
      }
      console.log(`\n[${name}] base against new: ${moved} of ${rows.length} contracts differ (stored value or fact) · stored observability values not byte-unchanged by the new tree: ${obsMoved} of ${obsRows.length} · stored descriptor URLs the base keeps and the new tree changes or removes: ${urlMoved} · contracts carrying the new reason: ${newReasons} · contracts the new tree re-derives to themselves: ${selfSame} of ${rows.length}`);
      lines.slice(0, 40).forEach((l) => console.log(l));
      if (lines.length > 40) console.log(`  … ${lines.length - 40} more`);
      if (obsMoved || urlMoved) bad++;
      if (name === 'as shipped' && moved) bad++;
    }
    // ── MEASUREMENT ONLY (sec-ops LOW 1): the keep arm's whole-URL-token test, asked of what rule 4 and the lane arms accept today.
    // A value's SHAPE is printed, never the value: its type, its length bucket, and which part of the tight test it fails.
    const shapeOf = (v: string): string => {
      const why: string[] = [];
      if (v.length > 2048) why.push('over-2048');
      if (/\s/.test(v)) why.push('whitespace');
      if (/[\u0000-\u001f\u007f-\u009f]/.test(v)) why.push('control');
      if (/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/.test(v)) why.push('bidi-or-zero-width');
      else if (/[^\u0000-\u007f]/.test(v)) why.push('non-ascii');
      try { const u = new URL(v); if (u.username || u.password) why.push('userinfo'); if (!/^https?:$/.test(u.protocol)) why.push('scheme'); if (!u.hostname) why.push('no-host'); } catch { why.push('not-a-url'); }
      return `string len ${v.length < 64 ? '<64' : v.length < 256 ? '<256' : '>=256'} fails ${why.join('+') || '(nothing)'}`;
    };
    const known = new Set(next.knownDescriptorTokens([]));
    let storedUrlValues = 0, storedObjectValues = 0, storedOther = 0; const refusedStored = new Map<string, number>();
    let lineServices = 0; const refusedLine = new Map<string, number>();
    for (const r of rows) {
      const c = r.contract as Record<string, unknown>;
      if (isObj(c.serviceDescriptors)) for (const [k, v] of Object.entries(c.serviceDescriptors)) {
        if (!known.has(k)) continue;
        if (typeof v === 'string' && next.isUsableDescriptorValue(v)) { storedUrlValues++; if (!next.isWholeTokenDescriptorUrl(v)) { const s = `${k}: ${shapeOf(v)}`; refusedStored.set(s, (refusedStored.get(s) ?? 0) + 1); } }
        else if (isObj(v) && next.isUsableDescriptorValue(v)) storedObjectValues++;
        else storedOther++;
      }
      for (const field of ['deviceSources', 'configSources']) {
        const f = c[field]; if (!isObj(f)) continue;
        for (const [k, v] of Object.entries(f)) {
          const lines = typeof v === 'string' ? v.split(/\r?\n/) : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
          for (const l of lines) {
            const m = /(?:device-read|live-read|service-held)\s+—\s+service\s+(https?:\/\/.*)$/i.exec(l.trim());
            if (!m) continue;
            lineServices++;
            if (!next.isWholeTokenDescriptorUrl(m[1])) { const s = `${field}.${k}: ${shapeOf(m[1])}`; refusedLine.set(s, (refusedLine.get(s) ?? 0) + 1); }
          }
        }
      }
    }
    const show = (m: Map<string, number>) => [...m.entries()].sort().map(([k, n]) => `\n    ${n} × ${k}`).join('') || ' none';
    console.log(`\n[measurement only — no behaviour] the keep arm's whole-URL-token test, if it were applied elsewhere:`);
    console.log(`  rule 4 / stored values under a known token: ${storedUrlValues} string URL values, ${[...refusedStored.values()].reduce((a, b) => a + b, 0)} would be refused:${show(refusedStored)}`);
    console.log(`  (also stored under a known token: ${storedObjectValues} inline objects with an endpoint — rule 4 keeps them, the keep arm would not; ${storedOther} values rule 4 already refuses)`);
    console.log(`  lane arms / URL services named on declared service lines: ${lineServices} line(s), ${[...refusedLine.values()].reduce((a, b) => a + b, 0)} would be refused:${show(refusedLine)}`);
    console.log(bad ? '\n❌ STOP: a stored value moves (see above) — bring the measurement to the coordinator' : '\n✅ nothing moves as shipped; no stored observability value and no stored descriptor URL moves in either state');
    process.exitCode = bad ? 1 : 0;
  } finally { await prisma.$disconnect(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
