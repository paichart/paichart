/**
 * `lab.ts blind`: arm-blind copies of every sample's final Author text for a hand read. GENERIC (any run's samples, not only
 * requirements ones). Moved VERBATIM 2026-11-28 out of score-requirements.ts, which was deleted with the retired requirements
 * Author (parcel A; cline_docs/reviews/author-sunset-2026-11-27/PARCEL-A-PLAN.md, REVIEW-execution-facts C4). Behaviour unchanged.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/** Arm-blind copies of every sample's final Author text for the hand read. The KEY is written into the run dir (never
 *  the blind dir); the reader gets only `<out>/<code>/author.md`. Pre-correction drafts and correction messages are NOT
 *  copied — they would reveal the loop arm; the diff read of adopted corrections is a separate, unblinded read. */
export function blindCopies(runDir: string, outDir: string) {
  const key: Record<string, string> = {};
  fs.mkdirSync(outDir, { recursive: true });
  const entries: string[] = [];
  for (const node of fs.readdirSync(runDir).filter((d) => fs.statSync(path.join(runDir, d)).isDirectory())) {
    for (const v of fs.readdirSync(path.join(runDir, node)).filter((d) => fs.statSync(path.join(runDir, node, d)).isDirectory())) {
      for (const sd of fs.readdirSync(path.join(runDir, node, v)).filter((d) => d.startsWith('sample-'))) {
        const ap = path.join(runDir, node, v, sd, 'author.md');
        if (fs.existsSync(ap)) entries.push(ap);
      }
    }
  }
  // Shuffle so directory order reveals nothing either.
  for (const ap of entries.map((e) => ({ e, r: crypto.randomBytes(8).toString('hex') })).sort((a, b) => a.r.localeCompare(b.r)).map((x) => x.e)) {
    const code = crypto.randomBytes(4).toString('hex');
    const rel = path.relative(runDir, path.dirname(ap));
    key[code] = rel;
    fs.mkdirSync(path.join(outDir, code), { recursive: true });
    // Node id stays visible on purpose: the reader scores against that node's objective (A6 reads per node).
    fs.writeFileSync(path.join(outDir, code, 'node.txt'), rel.split(path.sep)[0] + '\n');
    fs.copyFileSync(ap, path.join(outDir, code, 'author.md'));
  }
  fs.writeFileSync(path.join(runDir, 'blind-key.json'), JSON.stringify(key, null, 2));
  return Object.keys(key).length;
}
