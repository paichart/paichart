/**
 * PLATFORM-HELD-BYTES — the G3 operator base check (GO-MINIMAL determination §2a, 2026-10-16). PRIVATE: not exported (an
 * explicit `-` rule in scripts/export/public-allowlist.rules), not published. The public operator tool is O14's PROMOTION
 * deliverable, deferred with its trigger; G3 needs only this CHECK, and importing the platform's own canonical decode + R10
 * plain arm is parity by construction.
 *
 * Inputs (operator-run): the LIVE file path; the BASE ref's `held.get` metadata block saved as JSON; optionally the CANDIDATE
 * ref's metadata JSON + its verbatim text block saved as a file.
 * Order (§2a): (1) refuse a `redactorVersion` ≠ this tree's R10_VERSION; (2) decode the live raw bytes per `paichart.text/1`
 * — lone-CR, NUL, invalid UTF-8 refused BY NAME; (3) R10's PLAIN-TEXT arm only — never the deep walker (P3-B3); (4) sha256
 * must equal the BASE `blobSha256` — MATCH proceeds, MISMATCH is STOP; (5) with a CANDIDATE, count placeholder spellings —
 * > 0 is "not applicable as-is" (B5); print ONE run-sheet result line.
 * `--write` only on MATCH with a candidate carrying 0 placeholders: snapshot the live raw bytes first (the rollback), then
 * write the candidate restoring the LIVE BOM / newline convention and the LIVE final newline (P3 §9.2 — warn-not-block on a
 * facts mismatch, §9.5). A `mixed`-newline live file is refused for --write by name (P3 §9.3's per-line rule is O14 work).
 *
 * Run:  npx ts-node -r tsconfig-paths/register scripts/held-base-check.ts --live <path> --base <base-meta.json>
 *         [--candidate <cand-meta.json> --candidate-text <cand.txt>] [--label H1] [--write]
 * Exit: 0 MATCH (and written, with --write) · 2 STOP · 1 usage. Test: npx ts-node scripts/test-held-base-check.ts
 *
 * ── GIT MODE (held-k8s 1h, K-8 refined: EF B-1, sec-ops S4, DB §5, AE N-4) ──────────────────────────────────────────────────
 * For a held base read from a Git FILE SOURCE (github-service). The live file is a blob in the repo, not a file on a host, so
 * the check asks Git — with the OPERATOR's OWN `gh` auth, never github-service or its token (S4 independence: one misbehaving
 * server or mis-pinned call must not produce a consistent lie on both sides; GitHub stays the shared root of trust).
 *   (0) NOT-APPLICABLE (never MISMATCH) unless the held base IS the committed bytes: `redactedCount = 0` (R10 placed nothing)
 *       AND the canonical decode was the identity (no BOM, newline lf/none — a CRLF or BOM file is canonicalised away from its
 *       committed form, so a blob-id compare would be a guaranteed false MISMATCH). v1 is LF-only by construction.
 *   (1) the held text's sha256 must equal the base meta's blobSha256 (the file you saved IS the held base);
 *   (2) its Git blob id (`git hash-object`, computed here) must equal the blob at the recorded `sourceRevision` — else the base
 *       did not come from that commit (STOP base-not-from-recorded-revision);
 *   (3) `sourceRevision` must be the branch head or its ancestor (STOP revision-not-on-branch);
 *   (4) the blob at the branch HEAD must equal the held base — else the file moved since capture (STOP DRIFTED);
 *   (5) with --pr: the PR's base commit must carry the same blob (STOP pr-base-differs). RE-RUN IMMEDIATELY BEFORE MERGE —
 *       never merge on a stale MATCH (TOCTOU, S4).
 * Run:  npx ts-node -r tsconfig-paths/register scripts/held-base-check.ts --git --base <base-meta.json> --held-text <base.txt>
 *         [--repo <owner/repo>] [--path <repo path>] [--branch main] [--pr <n>] [--label H1]
 *       held-k8s step 3 (SF-5): repo + path DEFAULT from the held ref (held.get emits `target`/`path` on a Git ref); a typed one must
 *       agree (STOP repo-not-held-target / path-not-held-path); a set GH_TOKEN warns (use your own credential).
 * --base is held.get's metadata block (it carries sourceRevision on a Git ref); --held-text is held.get's text block, verbatim.
 *
 * ── DEVICE MODE (held-network step 3 batch 2b, P10, 2026-10-26) ─────────────────────────────────────────────────────────────
 * For a held base captured from a device's structured config getter (the device-read lane: target `device:<name>`, path
 * `/running-config`). The "live file" is the device's running configuration NOW, read by the OPERATOR through the operator's own
 * access (their own session on the device, saved to a file) — never through the platform's device service or its credential (the
 * S4 independence rule of Git mode: one misbehaving service must not produce a consistent lie on both sides). REDACTION-AWARE by
 * construction: every device base carries a secret, so the check is R10_plain(canonical(live)) == held base, at this tree's R10.
 *   (0) the base's redactorVersion must be this tree's; (1) the saved held text must hash to the base's blobSha256; (2) a base meta
 *       that names its target/path must be `device:<--device>` / `/running-config`;
 *   (3) the live bytes decode per paichart.text/1 (CRLF from a terminal folds; NUL / invalid UTF-8 / lone CR refused BY NAME), then
 *       R10's PLAIN arm; equal sha ⇒ MATCH. A final-newline-only difference ⇒ MATCH with a WARN (the getter's string and a saved
 *       terminal capture often end differently);
 *   (4) otherwise named STOPs, counts only (never a line): `differs-in-comment-lines-only` (e.g. a timestamp header) or `DRIFTED`
 *       (held-only and device-only line counts, by the same (parent block, line) comparison as the platform's Git-vs-device fact).
 *   Limits (sec-ops batch-2b N-4): held.get emits target/path on a Git ref only, so for a device ref the --device name is the
 *   OPERATOR's assertion (cross-checked only when the meta carries a target); the live side runs R10's plain arm without the capture's
 *   echo tokens, so a base carrying an echo redaction reads DRIFTED (a safe STOP). Delete the saved plaintext running config after use.
 * Run:  npx ts-node -r tsconfig-paths/register scripts/held-base-check.ts --device <name> --base <base-meta.json> --held-text <base.txt>
 *         --live-config <saved running config> [--label H1]
 */
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { decodeCanonicalBytes, countPlaceholders } from '../lib/agents/harness/held-bytes/canonical-text';
import { R10_VERSION, redactArtifactSecrets } from '../lib/agents/harness/redact-artifact-secrets';
import { HELD_FILE_CAP } from '../lib/agents/harness/held-bytes/caps';
import { DEVICE_READ_TARGET_PREFIX, DEVICE_READ_PATH } from '../lib/agents/harness/held-bytes/descriptors';
import { compareGitWithDevice } from '../lib/agents/harness/git-device-comparison';

export interface RefMeta { kind?: string; blobSha256?: string; redactorVersion?: string; newline?: string | null; bom?: boolean | null; finalNewline?: boolean | null;
  /** held-k8s: Git mode reads these two */ redactedCount?: number | null; sourceRevision?: string | null;
  /** held-k8s step 3 (SF-5): held.get emits these on a Git ref */ target?: string | null; path?: string | null }
export interface CheckInput { liveRaw: Uint8Array; base: RefMeta; candidate?: { meta: RefMeta; text: string } }
export type CheckResult =
  | { verdict: 'STOP'; reason: string; detail?: string }
  | { verdict: 'MATCH'; liveSha: string; warnings: string[]; live: { bom: boolean; newline: string; finalNewline: boolean };
      candidate?: { sha: string; placeholders: number; applicable: boolean; text: string } };

const sha = (t: string) => createHash('sha256').update(Buffer.from(t, 'utf8')).digest('hex');
const nl = (t: string) => t.split('\n').length - 1;

export function checkBase(input: CheckInput): CheckResult {
  const { base, candidate } = input;
  if (base.redactorVersion !== R10_VERSION) return { verdict: 'STOP', reason: 'redactor-version-mismatch', detail: `base ${base.redactorVersion} ≠ tree ${R10_VERSION}` };
  if (candidate && candidate.meta.redactorVersion !== R10_VERSION) return { verdict: 'STOP', reason: 'redactor-version-mismatch', detail: `candidate ${candidate.meta.redactorVersion} ≠ tree ${R10_VERSION}` };
  if (!/^[0-9a-f]{64}$/.test(base.blobSha256 ?? '')) return { verdict: 'STOP', reason: 'base-meta-invalid', detail: 'blobSha256 missing or not 64 hex' };
  const dec = decodeCanonicalBytes(input.liveRaw, HELD_FILE_CAP);
  if (!dec.ok) return { verdict: 'STOP', reason: dec.refusal, detail: dec.offset !== undefined ? `offset ${dec.offset}` : undefined };
  const B = redactArtifactSecrets(dec.text).redacted; // PLAIN arm only (P3-B3)
  if (nl(B) !== nl(dec.text)) return { verdict: 'STOP', reason: 'line-map-broken' };
  const liveSha = sha(B);
  if (liveSha !== base.blobSha256) return { verdict: 'STOP', reason: 'MISMATCH', detail: `live ${liveSha.slice(0, 12)} ≠ base ${base.blobSha256!.slice(0, 12)}` };
  const f = dec.facts;
  const warnings: string[] = [];
  if (base.bom != null && base.bom !== f.bom) warnings.push(`bom live=${f.bom} base=${base.bom}`);
  if (base.newline != null && base.newline !== f.newline) warnings.push(`newline live=${f.newline} base=${base.newline}`);
  if (base.finalNewline != null && base.finalNewline !== f.finalNewline) warnings.push(`finalNewline live=${f.finalNewline} base=${base.finalNewline}`);
  const out: CheckResult = { verdict: 'MATCH', liveSha, warnings, live: { bom: f.bom, newline: f.newline, finalNewline: f.finalNewline } };
  if (candidate) {
    const cSha = sha(candidate.text);
    if (cSha !== candidate.meta.blobSha256) return { verdict: 'STOP', reason: 'candidate-integrity', detail: `text ${cSha.slice(0, 12)} ≠ meta ${String(candidate.meta.blobSha256).slice(0, 12)}` };
    const placeholders = countPlaceholders(candidate.text);
    out.candidate = { sha: cSha, placeholders, applicable: placeholders === 0, text: candidate.text };
  }
  return out;
}

/** The bytes --write puts on disk: the candidate in the LIVE file's conventions (BOM, lf/crlf, final newline as found). */
export function renderForWrite(candidateText: string, live: { bom: boolean; newline: string; finalNewline: boolean }): Buffer | { refusal: string } {
  if (live.newline === 'mixed') return { refusal: 'mixed-newline-write' };
  let t = candidateText.endsWith('\n') ? candidateText.slice(0, -1) : candidateText;
  if (live.finalNewline && t !== '') t += '\n';
  if (live.newline === 'crlf') t = t.split('\n').join('\r\n');
  const body = Buffer.from(t, 'utf8');
  return live.bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body;
}

export function resultLine(label: string, path: string, r: CheckResult): string {
  if (r.verdict === 'STOP') return `held-base-check ${label} ${path} · STOP ${r.reason}${r.detail ? ` (${r.detail})` : ''} · r10 ${R10_VERSION}`;
  const c = r.candidate ? ` · candidate ${r.candidate.sha.slice(0, 12)} placeholders ${r.candidate.placeholders} ${r.candidate.applicable ? 'applicable' : 'NOT APPLICABLE AS-IS'}` : '';
  const w = r.warnings.length ? ` · WARN facts differ (${r.warnings.join('; ')}) — proceeding with live conventions` : '';
  return `held-base-check ${label} ${path} · MATCH base ${r.liveSha.slice(0, 12)}${c}${w} · r10 ${R10_VERSION}`;
}

// ── GIT MODE (see the header) ────────────────────────────────────────────────────────────────────────────────────────────

/** The Git blob id of a text, byte for byte what `git hash-object --stdin` prints: sha1("blob <bytes>\0" + bytes). */
export function gitBlobSha(text: string): string {
  const body = Buffer.from(text, 'utf8');
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${body.length}\0`, 'utf8'), body])).digest('hex');
}

/** What the operator's own Git read returned. A null blob = the path does not exist at that commit. */
export interface GitRemote {
  headSha: string;
  blobAtHead: string | null;
  blobAtRevision: string | null;
  /** sourceRevision === head, or head is strictly ahead of it (GitHub compare: identical | ahead). */
  revisionIsAncestor: boolean;
  prBaseSha?: string;
  blobAtPrBase?: string | null;
  /** WI-B10 / HELD-BASE-CHECK-REDACTION-AWARE: the committed RAW bytes, read only for a REDACTED base (null = absent at that ref). */
  rawAtRevision?: Uint8Array | null;
  rawAtHead?: Uint8Array | null;
  rawAtPrBase?: Uint8Array | null;
}

export type GitCheckResult =
  | { verdict: 'NOT-APPLICABLE'; reason: 'redacted' | 'canonicalised'; detail: string }
  | { verdict: 'STOP'; reason: string; detail?: string }
  | { verdict: 'MATCH'; blob: string; headSha: string; revision: string; pr?: { baseSha: string }; redacted?: { redactorVersion: string } };

const HEX40 = /^[0-9a-f]{40}$/;

/** Steps (0)-(1): what is decidable from the held base alone. null ⇒ proceed to the remote read. */
export function gitPreflight(base: RefMeta, heldText: string): GitCheckResult | null {
  // HELD-BASE-CHECK-REDACTION-AWARE (WI-B10, network N-3 (a), 2026-10-23): a REDACTED base is no longer NOT-APPLICABLE — every
  // network base carries a secret. Its check is R10(committed bytes) == held base, through the SAME host-mode pipeline
  // (checkBase: canonical decode → R10 plain arm at this tree's version → sha), on the bytes at the recorded revision and at head.
  if (typeof base.redactedCount === 'number' && base.redactedCount > 0) {
    if (base.redactorVersion !== R10_VERSION) return { verdict: 'STOP', reason: 'redactor-version-mismatch', detail: `base ${base.redactorVersion} ≠ tree ${R10_VERSION}` };
    if (!HEX40.test(base.sourceRevision ?? '')) return { verdict: 'STOP', reason: 'base-meta-invalid', detail: 'sourceRevision missing or not 40 hex (not a Git-source ref?)' };
    if (!/^[0-9a-f]{64}$/.test(base.blobSha256 ?? '')) return { verdict: 'STOP', reason: 'base-meta-invalid', detail: 'blobSha256 missing or not 64 hex' };
    if (sha(heldText) !== base.blobSha256) return { verdict: 'STOP', reason: 'held-text-integrity', detail: 'the saved text is not the held base (sha256 differs)' };
    return null;
  }
  if (base.redactedCount == null) return { verdict: 'STOP', reason: 'base-meta-invalid', detail: 'redactedCount missing (needs held.get metadata)' };
  // Identity of the canonical decode. A BYTES-path ref stamps bom/newline: bom true or newline crlf/mixed ⇒ the held text was
  // folded away from the committed bytes. A LEGACY-path ref (a service that returned an already-decoded string — github-service)
  // stamps them NULL, and that path REFUSES any CR (`decode-violated`) or a BOM (`legacy-bom`) before holding, so its text is the
  // decoded file. The held TEXT is checked too (no CR, no leading U+FEFF), never the meta alone.
  const metaFolded = base.bom === true || (base.newline != null && !(base.newline === 'lf' || base.newline === 'none'));
  if (metaFolded || heldText.includes('\r') || heldText.charCodeAt(0) === 0xfeff) {
    return { verdict: 'NOT-APPLICABLE', reason: 'canonicalised', detail: `bom=${base.bom} newline=${base.newline}: canonical decode is not the identity (v1 is LF-only)` };
  }
  if (!HEX40.test(base.sourceRevision ?? '')) return { verdict: 'STOP', reason: 'base-meta-invalid', detail: 'sourceRevision missing or not 40 hex (not a Git-source ref?)' };
  if (!/^[0-9a-f]{64}$/.test(base.blobSha256 ?? '')) return { verdict: 'STOP', reason: 'base-meta-invalid', detail: 'blobSha256 missing or not 64 hex' };
  if (sha(heldText) !== base.blobSha256) return { verdict: 'STOP', reason: 'held-text-integrity', detail: 'the saved text is not the held base (sha256 differs)' };
  if (countPlaceholders(heldText) > 0) return { verdict: 'STOP', reason: 'held-text-integrity', detail: 'placeholders in a base meta says was not redacted' };
  return null;
}

/** Steps (2)-(5), given the remote read. Pure. */
export function checkGitBase(base: RefMeta, heldText: string, remote: GitRemote): GitCheckResult {
  const pre = gitPreflight(base, heldText);
  if (pre) return pre;
  if (typeof base.redactedCount === 'number' && base.redactedCount > 0) return checkGitBaseRedacted(base, remote);
  const blob = gitBlobSha(heldText);
  const rev = base.sourceRevision!;
  if (remote.blobAtRevision !== blob) {
    return { verdict: 'STOP', reason: 'base-not-from-recorded-revision', detail: `held ${blob.slice(0, 12)} ≠ ${rev.slice(0, 12)}:path ${String(remote.blobAtRevision).slice(0, 12)}` };
  }
  if (!remote.revisionIsAncestor) return { verdict: 'STOP', reason: 'revision-not-on-branch', detail: `${rev.slice(0, 12)} is not the head ${remote.headSha.slice(0, 12)} or its ancestor` };
  if (remote.blobAtHead !== blob) {
    return { verdict: 'STOP', reason: 'DRIFTED', detail: `the file changed on the branch since capture: head ${String(remote.blobAtHead).slice(0, 12)} ≠ held ${blob.slice(0, 12)}` };
  }
  if (remote.prBaseSha !== undefined) {
    if (remote.blobAtPrBase !== blob) return { verdict: 'STOP', reason: 'pr-base-differs', detail: `PR base ${remote.prBaseSha.slice(0, 12)} carries ${String(remote.blobAtPrBase).slice(0, 12)}` };
    return { verdict: 'MATCH', blob, headSha: remote.headSha, revision: rev, pr: { baseSha: remote.prBaseSha } };
  }
  return { verdict: 'MATCH', blob, headSha: remote.headSha, revision: rev };
}

/** HELD-BASE-CHECK-REDACTION-AWARE: the redacted-base path. Each committed version must REDACT to the held base (checkBase). */
export function checkGitBaseRedacted(base: RefMeta, remote: GitRemote): GitCheckResult {
  const rev = base.sourceRevision!;
  const at = (raw: Uint8Array | null | undefined) => (raw ? checkBase({ liveRaw: raw, base }) : ({ verdict: 'STOP', reason: 'absent' } as CheckResult));
  const r1 = at(remote.rawAtRevision);
  if (r1.verdict !== 'MATCH') return { verdict: 'STOP', reason: 'base-not-from-recorded-revision', detail: `R10(${rev.slice(0, 12)}:path) ≠ held base (${r1.reason})` };
  if (!remote.revisionIsAncestor) return { verdict: 'STOP', reason: 'revision-not-on-branch', detail: `${rev.slice(0, 12)} is not the head ${remote.headSha.slice(0, 12)} or its ancestor` };
  const r2 = at(remote.rawAtHead);
  if (r2.verdict !== 'MATCH') return { verdict: 'STOP', reason: 'DRIFTED', detail: `the file changed on the branch since capture (R10 of head ≠ held base: ${r2.reason})` };
  const blob = base.blobSha256!;
  if (remote.prBaseSha !== undefined) {
    const r3 = at(remote.rawAtPrBase);
    if (r3.verdict !== 'MATCH') return { verdict: 'STOP', reason: 'pr-base-differs', detail: `PR base ${remote.prBaseSha.slice(0, 12)} does not redact to the held base` };
    return { verdict: 'MATCH', blob, headSha: remote.headSha, revision: rev, pr: { baseSha: remote.prBaseSha }, redacted: { redactorVersion: R10_VERSION } };
  }
  return { verdict: 'MATCH', blob, headSha: remote.headSha, revision: rev, redacted: { redactorVersion: R10_VERSION } };
}

/** The operator's OWN `gh` (its keyring auth) — never github-service. */
function gh(args: string[]): string {
  return execFileSync('gh', ['api', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function blobAt(repo: string, path: string, ref: string): string | null {
  try {
    return gh([`repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${ref}`, '--jq', '.sha']) || null;
  } catch { return null; }
}
function rawAt(repo: string, path: string, ref: string): Uint8Array | null {
  try {
    const b64 = gh([`repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${ref}`, '--jq', '.content']);
    return b64 ? Buffer.from(b64.replace(/\s+/g, ''), 'base64') : null;
  } catch { return null; }
}
export function readGitRemote(repo: string, path: string, branch: string, revision: string, pr?: string, redacted = false): GitRemote {
  const headSha = gh([`repos/${repo}/commits/${encodeURIComponent(branch)}`, '--jq', '.sha']);
  const status = gh([`repos/${repo}/compare/${revision}...${headSha}`, '--jq', '.status']);
  const out: GitRemote = { headSha, blobAtHead: blobAt(repo, path, headSha), blobAtRevision: blobAt(repo, path, revision),
    revisionIsAncestor: status === 'identical' || status === 'ahead' };
  if (pr) { out.prBaseSha = gh([`repos/${repo}/pulls/${encodeURIComponent(pr)}`, '--jq', '.base.sha']); out.blobAtPrBase = blobAt(repo, path, out.prBaseSha); }
  if (redacted) {
    out.rawAtRevision = rawAt(repo, path, revision); out.rawAtHead = rawAt(repo, path, headSha);
    if (out.prBaseSha) out.rawAtPrBase = rawAt(repo, path, out.prBaseSha);
  }
  return out;
}

export function gitResultLine(label: string, repo: string, path: string, r: GitCheckResult): string {
  const at = `held-base-check --git ${label} ${repo}:${path}`;
  if (r.verdict === 'NOT-APPLICABLE') return `${at} · NOT-APPLICABLE ${r.reason} (${r.detail})`;
  if (r.verdict === 'STOP') return `${at} · STOP ${r.reason}${r.detail ? ` (${r.detail})` : ''}`;
  if (r.redacted) return `${at} · MATCH (redacted, ${r.redacted.redactorVersion}) R10 of ${r.revision.slice(0, 12)} = R10 of head ${r.headSha.slice(0, 12)} = held base ${r.blob.slice(0, 12)}${r.pr ? ` = PR base ${r.pr.baseSha.slice(0, 12)}` : ''} · re-run immediately before merge`;
  return `${at} · MATCH blob ${r.blob.slice(0, 12)} at ${r.revision.slice(0, 12)} = head ${r.headSha.slice(0, 12)}${r.pr ? ` = PR base ${r.pr.baseSha.slice(0, 12)}` : ''} · re-run immediately before merge`;
}

/** held-k8s step 3 (sec-ops step-1 SF-5): the held ref names its own repo + path; an operator-typed one must AGREE, never override.
 *  `github:<owner>:<repo>` (the descriptor's target form) → `owner/repo`. */
export function heldGitCoordinates(base: RefMeta, typedRepo?: string, typedPath?: string):
  { ok: true; repo: string; path: string } | { ok: false; reason: string; detail: string } {
  const m = typeof base.target === 'string' ? /^github:([A-Za-z0-9._-]+):([A-Za-z0-9._-]+)$/.exec(base.target) : null;
  const heldRepo = m ? `${m[1]}/${m[2]}` : undefined;
  const heldPath = typeof base.path === 'string' && base.path ? base.path.replace(/^\//, '') : undefined;
  if (heldRepo && typedRepo && heldRepo.toLowerCase() !== typedRepo.toLowerCase()) return { ok: false, reason: 'repo-not-held-target', detail: `held ${heldRepo}, typed ${typedRepo}` };
  if (heldPath && typedPath && heldPath !== typedPath.replace(/^\//, '')) return { ok: false, reason: 'path-not-held-path', detail: `held ${heldPath}, typed ${typedPath}` };
  const repo = heldRepo ?? typedRepo; const path = heldPath ?? typedPath?.replace(/^\//, '');
  if (!repo || !path) return { ok: false, reason: 'no-coordinates', detail: 'the base meta names no Git target/path; pass --repo and --path' };
  return { ok: true, repo, path };
}

function mainGit(argv: string[], arg: (k: string) => string | undefined): number {
  const baseFile = arg('--base'), heldFile = arg('--held-text');
  if (!baseFile || !heldFile) {
    console.error('usage: --git --base <base-meta.json> --held-text <base.txt> [--repo <owner/repo>] [--path <repo path>] [--branch main] [--pr <n>] [--label H1]\n  (repo and path default from the held ref; a typed one must agree)');
    return 1;
  }
  const base = JSON.parse(fs.readFileSync(baseFile, 'utf8')) as RefMeta;
  // SF-5 independence: the check must not lean on the PLATFORM's GitHub credential.
  if (process.env.GH_TOKEN) console.warn('⚠️  GH_TOKEN is set — use your own read credential for this check, never the platform\'s token');
  const co = heldGitCoordinates(base, arg('--repo'), arg('--path'));
  if (!co.ok) { console.log(`held-base-check --git ${arg('--label') ?? '-'} · STOP ${co.reason} (${co.detail})`); return 2; }
  const repo = co.repo, path = co.path;
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) { console.error(`bad repo ${repo}`); return 1; }
  const heldText = fs.readFileSync(heldFile, 'utf8');
  const label = arg('--label') ?? '-';
  const rel = path.replace(/^\//, '');
  const pre = gitPreflight(base, heldText);
  const redacted = typeof base.redactedCount === 'number' && base.redactedCount > 0;
  const r = pre ?? checkGitBase(base, heldText, readGitRemote(repo, rel, arg('--branch') ?? 'main', base.sourceRevision!, arg('--pr'), redacted));
  console.log(gitResultLine(label, repo, rel, r));
  return r.verdict === 'MATCH' ? 0 : 2;
}

// ── DEVICE MODE (see the header) ─────────────────────────────────────────────────────────────────────────────────────────────

export type DeviceCheckResult =
  | { verdict: 'MATCH'; sha: string; warnings: string[] }
  | { verdict: 'STOP'; reason: string; detail?: string };

const stripComments = (t: string) => t.split('\n').filter((l) => !/^\s*[!#]/.test(l)).join('\n');

/** Pure: steps (0)-(4). `liveRaw` is the operator's own saved read of the device's running configuration. */
export function checkDeviceBase(base: RefMeta, heldText: string, liveRaw: Uint8Array, device?: string): DeviceCheckResult {
  if (base.redactorVersion !== R10_VERSION) return { verdict: 'STOP', reason: 'redactor-version-mismatch', detail: `base ${base.redactorVersion} ≠ tree ${R10_VERSION}` };
  if (!/^[0-9a-f]{64}$/.test(base.blobSha256 ?? '')) return { verdict: 'STOP', reason: 'base-meta-invalid', detail: 'blobSha256 missing or not 64 hex' };
  if (sha(heldText) !== base.blobSha256) return { verdict: 'STOP', reason: 'held-text-integrity', detail: 'the saved text is not the held base (sha256 differs)' };
  if (typeof base.target === 'string' && device && base.target !== `${DEVICE_READ_TARGET_PREFIX}${device}`) {
    return { verdict: 'STOP', reason: 'device-not-held-target', detail: `held ${base.target}, typed ${device}` };
  }
  if (typeof base.path === 'string' && base.path !== DEVICE_READ_PATH) return { verdict: 'STOP', reason: 'not-a-device-base', detail: `held path ${base.path}` };
  const dec = decodeCanonicalBytes(liveRaw, HELD_FILE_CAP);
  if (!dec.ok) return { verdict: 'STOP', reason: dec.refusal, detail: dec.offset !== undefined ? `offset ${dec.offset}` : undefined };
  const B = redactArtifactSecrets(dec.text).redacted; // PLAIN arm only (P3-B3), as capture
  if (nl(B) !== nl(dec.text)) return { verdict: 'STOP', reason: 'line-map-broken' };
  const liveSha = sha(B);
  if (liveSha === base.blobSha256) return { verdict: 'MATCH', sha: liveSha, warnings: [] };
  const toggled = B.endsWith('\n') ? B.slice(0, -1) : `${B}\n`;
  if (sha(toggled) === base.blobSha256) return { verdict: 'MATCH', sha: base.blobSha256!, warnings: ['final-newline differs (the getter\'s string and the saved read end differently)'] };
  const norm = (t: string) => stripComments(t).replace(/\n+$/, '');
  if (norm(B) === norm(heldText)) {
    const cl = (t: string) => t.split('\n').filter((l) => /^\s*[!#]/.test(l)).length;
    return { verdict: 'STOP', reason: 'differs-in-comment-lines-only', detail: `comment lines: held ${cl(heldText)}, device ${cl(B)} (e.g. a timestamp header)` };
  }
  const r = compareGitWithDevice(heldText, B);
  const reverse = compareGitWithDevice(B, heldText);
  // push 2 (hierarchy-form audit): a pair the comparison cannot read line-by-parent is still DRIFTED (the hashes differ), with its
  // forms named instead of counts.
  if (r.state !== 'compared' || reverse.state !== 'compared') {
    return { verdict: 'STOP', reason: 'DRIFTED', detail: `not compared line-by-parent — ${r.state} (held form ${r.forms.git}, device form ${r.forms.device})` };
  }
  return { verdict: 'STOP', reason: 'DRIFTED', detail: `${r.differencesTotal} line(s) of the held base are not under the same parent block on the device now; ${reverse.differencesTotal} device line(s) are not in the held base` };
}

export function deviceResultLine(label: string, device: string, r: DeviceCheckResult): string {
  const at = `held-base-check --device ${label} ${device}`;
  if (r.verdict === 'STOP') return `${at} · STOP ${r.reason}${r.detail ? ` (${r.detail})` : ''} · r10 ${R10_VERSION}`;
  return `${at} · MATCH (redacted, ${R10_VERSION}) R10 of the device's running configuration = held base ${r.sha.slice(0, 12)}${r.warnings.length ? ` · WARN ${r.warnings.join('; ')}` : ''} · re-read immediately before apply`;
}

function mainDevice(arg: (k: string) => string | undefined): number {
  const device = arg('--device'), baseFile = arg('--base'), heldFile = arg('--held-text'), live = arg('--live-config');
  if (!device || !baseFile || !heldFile || !live) {
    console.error('usage: --device <name> --base <base-meta.json> --held-text <base.txt> --live-config <saved running config> [--label H1]\n  (read the running config with YOUR OWN access, never the platform\'s device service)');
    return 1;
  }
  const r = checkDeviceBase(JSON.parse(fs.readFileSync(baseFile, 'utf8')) as RefMeta, fs.readFileSync(heldFile, 'utf8'), fs.readFileSync(live), device);
  console.log(deviceResultLine(arg('--label') ?? '-', device, r));
  return r.verdict === 'MATCH' ? 0 : 2;
}

export function main(argv: string[]): number {
  const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes('--git')) return mainGit(argv, arg);
  if (argv.includes('--device')) return mainDevice(arg);
  const live = arg('--live'), baseFile = arg('--base'), candFile = arg('--candidate'), candText = arg('--candidate-text');
  if (!live || !baseFile || (!!candFile !== !!candText)) { console.error('usage: --live <path> --base <meta.json> [--candidate <meta.json> --candidate-text <file>] [--label H1] [--write]'); return 1; }
  const liveRaw = fs.readFileSync(live);
  const r = checkBase({ liveRaw, base: JSON.parse(fs.readFileSync(baseFile, 'utf8')),
    candidate: candFile ? { meta: JSON.parse(fs.readFileSync(candFile, 'utf8')), text: fs.readFileSync(candText!, 'utf8') } : undefined });
  console.log(resultLine(arg('--label') ?? '-', live, r));
  if (r.verdict === 'STOP') return 2;
  if (!argv.includes('--write')) return 0;
  if (!r.candidate || !r.candidate.applicable) { console.log('held-base-check · write REFUSED: needs a candidate with 0 placeholders'); return 2; }
  const bytes = renderForWrite(r.candidate.text, r.live);
  if (!Buffer.isBuffer(bytes)) { console.log(`held-base-check · write REFUSED: ${(bytes as { refusal: string }).refusal}`); return 2; }
  const snap = `${live}.held-base-check.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
  fs.writeFileSync(snap, liveRaw, { flag: 'wx' }); // the rollback; never overwrites
  fs.writeFileSync(live, bytes);
  console.log(`held-base-check · WROTE candidate ${r.candidate.sha.slice(0, 12)} → ${live} · snapshot ${snap}`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
