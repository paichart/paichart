#!/usr/bin/env ts-node
/**
 * Leg replay lab — render the requirements-authoring texts AS THEY STAND AT A COMMIT (2026-10-10, Z49 lab gate). $0, no DB.
 *
 *   npx ts-node scripts/leg-replay-lab/render-requirements-texts.ts --commit <sha> --out <dir>
 *
 * Writes three files, each exactly what the owning seeds would write to production at that commit:
 *   requirements-authoring-protocol.md   PROTOCOLS[name].promptText from scripts/seed-protocol-prompts.ts (protocol-history.ts)
 *   requirements-author.template.md      PAICHART_UNIVERSAL_BASE_TEMPLATE with ${roleSpecificGuidance} replaced by
 *   requirements-reviewer.template.md    getRoleSpecificGuidance(<role>) — the seed's own composition
 *                                        (scripts/seed-requirements-authoring-templates.ts), from
 *                                        lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts at that commit.
 * plus versions.json (protocol version, sha256 of each file). Used for the bytes proofs: the render at the production
 * commit must be byte-identical to the pinned production rows, and pinned baseline + candidate edits must be
 * byte-identical to the render at the candidate commit.
 */
// The seed imports reach lib/prisma.ts transitively; nothing here queries it (same guard as lab.ts).
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgresql://leg-replay-lab:never@127.0.0.1:1/never_connects';
if (!process.env.PAICHART_SKIP_DB_CONNECT) process.env.PAICHART_SKIP_DB_CONNECT = 'true';
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'warn';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { protocolTextAtCommit } from './protocol-history';
import { CACHE_DIR } from './snapshot';
import { sha256 } from './rebuild';

const REPO = path.resolve(__dirname, '..', '..');
const TPL_REL = 'lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts';

export function requirementsTextsAt(commit: string) {
  const full = execFileSync('git', ['-C', REPO, 'rev-parse', commit]).toString().trim();
  const proto = protocolTextAtCommit('requirements-authoring-protocol', full);
  const dir = path.join(CACHE_DIR, 'template-at');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `pAIchartUniversalTemplate-${full.slice(0, 12)}.ts`);
  if (!fs.existsSync(file)) {
    const src = execFileSync('git', ['-C', REPO, 'show', `${full}:${TPL_REL}`], { maxBuffer: 64 * 1024 * 1024 }).toString();
    if (/^import |require\(/m.test(src)) throw new Error(`${TPL_REL} at ${commit} has imports — render by hand`);
    fs.writeFileSync(file, src);
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(file);
  const tpl = (role: string) => mod.PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', mod.getRoleSpecificGuidance(role));
  return { commit: full, protocolVersion: proto.version, protocol: proto.text, author: tpl('requirements_author'), reviewer: tpl('requirements_reviewer') };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const val = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const commit = val('--commit'); const out = val('--out');
  if (!commit || !out) { console.error('usage: render-requirements-texts.ts --commit <sha> --out <dir>'); process.exit(1); }
  const r = requirementsTextsAt(commit);
  fs.mkdirSync(out, { recursive: true });
  const files: Record<string, string> = {
    'requirements-authoring-protocol.md': r.protocol, 'requirements-author.template.md': r.author, 'requirements-reviewer.template.md': r.reviewer,
  };
  for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(out, f), t);
  const versions = { commit: r.commit, protocolVersion: r.protocolVersion, sha256: Object.fromEntries(Object.entries(files).map(([f, t]) => [f, sha256(t)])) };
  fs.writeFileSync(path.join(out, 'versions.json'), JSON.stringify(versions, null, 2) + '\n');
  console.log(JSON.stringify(versions, null, 2));
}
