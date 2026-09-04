#!/usr/bin/env ts-node
/**
 * Render the six seeded protocol bodies to the PUBLIC repo (~/paichart/protocols/), verbatim.
 *
 * SOURCE OF TRUTH: the LOCAL DB rows (agent_prompt_library) — the exact text agents receive —
 * not the seed script's template literals (which cannot be safely imported: the seed auto-runs).
 * The verify-seed-with-ts-node discipline keeps the local DB current at every seed change; the
 * STALENESS GUARD below fails loudly if the seed file is newer than the DB rows.
 *
 * MODES:
 *   ts-node scripts/render-public-protocols.ts           # render (writes the public files)
 *   ts-node scripts/render-public-protocols.ts --check   # parity: diff rendered-vs-published,
 *                                                        # exit 1 naming the first divergent file.
 * The --check mode is registered as `npm run test:protocol-public-parity` — deliberately OUT of
 * the CI chain (needs the local ~/paichart checkout + DB); the quarterly out-of-CI battery picks
 * it up automatically. SKIPS LOUDLY (named, counted, exit 0) when ~/paichart is absent.
 *
 * The header is DETERMINISTIC (name + version + description; no timestamps) so byte-parity holds
 * across re-renders of the same version. protocols/README.md is hand-authored (editorial status
 * notes) and NOT touched here.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const PROTOCOLS = [
  'pipeline-orchestrator-protocol',
  'artifact-synthesis-protocol',
  'network-provisioning-protocol',
  'kubernetes-gitops-protocol',
  'terraform-iac-protocol',
  'pov-program-protocol',
];

const PUB_DIR = process.env.PAICHART_PUBLIC_REPO
  ? path.join(process.env.PAICHART_PUBLIC_REPO, 'protocols')
  : path.join(os.homedir(), 'paichart/protocols');
const SEED_FILE = path.join(__dirname, 'seed-protocol-prompts.ts');
const CHECK = process.argv.includes('--check');

function renderOne(name: string, version: string, description: string, body: string): string {
  return `> **Rendered verbatim from the pAIchart platform seed — version ${version}.**
> This is the exact protocol text injected into pipeline agents' system prompts. Internal
> cross-references (file paths, review records, role-guidance names, tool-call mechanics) are part
> of the record and resolve inside the platform, not in this repository. Nothing is edited for
> publication — the fidelity is the point.
>
> **Seeded routing description**: ${description.replace(/\n/g, ' ')}

---

${body}
`;
}

async function main() {
  if (!fs.existsSync(path.dirname(PUB_DIR))) {
    console.log(`⏭️  SKIP (named, counted): public repo not present at ${path.dirname(PUB_DIR)} — parity unverified on this machine, not clean.`);
    process.exit(0);
  }
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.agentPromptLibrary.findMany({
      where: { name: { in: PROTOCOLS } },
      select: { name: true, version: true, description: true, promptText: true, updatedAt: true },
    });
    if (rows.length !== PROTOCOLS.length) {
      const missing = PROTOCOLS.filter(p => !rows.find(r => r.name === p));
      console.error(`❌ local DB is missing seeded protocol rows: ${missing.join(', ')} — run the seed first (npx ts-node --transpile-only scripts/seed-protocol-prompts.ts)`);
      process.exit(1);
    }
    // STALENESS GUARD: an edited-but-not-reseeded seed file means the DB (and any render from it)
    // is behind the source. Fail loudly rather than render/verify stale text.
    const seedMtime = fs.statSync(SEED_FILE).mtimeMs;
    const newestRow = Math.max(...rows.map(r => r.updatedAt.getTime()));
    if (seedMtime > newestRow + 5000) {
      console.error(`❌ ${path.basename(SEED_FILE)} is newer than the DB rows — run the local seed first, then re-render.`);
      process.exit(1);
    }

    let diverged = 0;
    if (!CHECK) fs.mkdirSync(PUB_DIR, { recursive: true });
    for (const name of PROTOCOLS.map(p => rows.find(r => r.name === p)!)) {
      const rendered = renderOne(name.name, name.version ?? '0.0.0', name.description ?? '', name.promptText);
      const target = path.join(PUB_DIR, `${name.name}.md`);
      if (CHECK) {
        const published = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : null;
        if (published === rendered) {
          console.log(`✅ ${name.name} v${name.version}: byte-identical`);
        } else {
          diverged++;
          console.error(published === null
            ? `❌ ${name.name}: NOT PUBLISHED (expected at ${target})`
            : `❌ ${name.name}: DIVERGED — re-render (canonical: seed -> local DB -> render; never edit the public copy)`);
        }
      } else {
        fs.writeFileSync(target, rendered);
        console.log(`📄 rendered ${name.name} v${name.version} (${rendered.length} chars)`);
      }
    }
    if (CHECK && diverged > 0) process.exit(1);
    if (CHECK) console.log('✅ protocol public parity: all six byte-identical');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
