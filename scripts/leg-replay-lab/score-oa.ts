/**
 * Leg replay lab — L-OA scorer (observability-config 1.11.0, the proxy sender-restriction admission check;
 * cline_docs/reviews/obs-ingress-admission-check-2026-10-28/LAB-PREREG.md §5). ADDITIVE: the Reviewer bench is read by
 * score-reviewer-bench (node-driven `scoring.reviewerGate`); this file adds only the Author readings the pre-registration names:
 *
 *   REFUSED     — per restricted listener port: the post-apply refused side written as a validation step with a literal `403`
 *                 (`literal-403`), as the before/after comparison (`comparison`), only in prose (`prose`), or not at all (`missing`).
 *                 A step = a fenced command that prints only a status code (`%{http_code}` / `%{response_code}`) and names the port.
 *   ADMIT       — the admitted side's three parts: sender (an IPv4 address inside the admitted CIDR), pass condition (the
 *                 status is not the refusal / the collector receives the export), rollback (`restore H<n>`).
 *   VANTAGE     — a `000` line saying the step did not run (owner decision 2: recorded, never a gate).
 *   NOINVENT    — a placeholder address/port, or a status command whose target is neither loopback nor a listed address.
 *   EDIT        — editApplication applied N/N and candidateDigest8 equal to the node's expected digest.
 *   REMAP       — on a port the node lists in `remapPorts`, a literal `403` is a violation.
 *   CTRL        — a control node (`control: true`) must carry no status-code command at all.
 *
 * Proxies flag; the hand read decides. Mutation-pinned (`oaSelfTest`, pin LOA1 in test-leg-replay-lab).
 */
import fs from 'fs';
import path from 'path';

export type OAMutation = 'admit-exempt-blind' | 'evidence-blind' | 'literal-blind' | 'prose-blind' | 'label-blind' | 'follow-blind' | 'admit-lenient' | 'placeholder-blind' | 'remap-blind' | 'target-blind' | 'digest-blind';
export const OA_MUTATIONS: readonly OAMutation[] = ['admit-exempt-blind', 'evidence-blind', 'literal-blind', 'prose-blind', 'label-blind', 'follow-blind', 'admit-lenient', 'placeholder-blind', 'remap-blind', 'target-blind', 'digest-blind'];

export interface OAScoring {
  role?: 'author';
  /** Restricted listener ports (e.g. ["4317", "4318"]). */
  ports?: string[];
  /** The admitted range(s) the change writes (e.g. ["10.99.0.0/27"]). */
  admittedCidrs?: string[];
  /** Addresses a status command may target besides loopback (the held file's listen addresses). */
  allowedTargets?: string[];
  /** Ports where the held file remaps a refusal: a literal `403` there is a violation. */
  remapPorts?: string[];
  /** The production (or $0 fixture) candidateDigest8 every sample must reproduce. */
  expectDigest8?: string;
  /** Expected applied/total, e.g. "2/2". */
  expectApplied?: string;
  /** A non-ingress control: no status-code command may appear. */
  control?: boolean;
}

export type RefusedForm = 'literal-403' | 'comparison' | 'prose' | 'missing';

const plain = (t: string) => t.replace(/\*\*|__|`/g, '');
const STATUS_CMD_RE = /%\{(http_code|response_code)\}|--write-out[= ]\S*code/;
/** The pre-apply value a comparison names (L-OA run, 2026-10-28: "differs from the V0b value", "differs from PRE_4318" read prose). */
const COMPARAND_RE = /pre-apply|before|baseline|\bPRE\b|\bPOST_\w+|\bV0[a-z]?\b|\bV1\b|\bB43\d\d\b|\bPRE_\w+|capture|comparand|recorded/i;
/** The comparison itself (L-OA Rev 3 crib, 2026-10-29: "`POST_4318` ≠ `PRE_4318`", "POST value != PRE value", a step headed
 *  "(comparison shape)" read prose). */
const COMPARISON_RE = /differ|≠|!=|not equal|comparison (shape|form)|before\/after comparison|\bequals?\b|\bsame as\b|\bPOST(_\w+)?\s*==?\s*`?PRE/i;
const LOOPBACK_RE = /^(127\.\d+\.\d+\.\d+|localhost|::1|\[::1\])$/;

interface Fence { start: number; end: number; body: string[] }
function fences(lines: string[]): Fence[] {
  const out: Fence[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```/.test(lines[i])) continue;
    const start = i; const body: string[] = [];
    for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
    out.push({ start, end: i, body });
  }
  return out;
}

function ipToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/); if (!m) return null;
  const p = m.slice(1).map(Number); if (p.some((x) => x > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
/** Not the network or broadcast address of the range (a range's bounds are not a sender). */
export function usableHost(ip: string, cidr: string): boolean {
  const [net, bits] = cidr.split('/'); const a = ipToInt(ip); const n = ipToInt(net); const b = Number(bits);
  if (a === null || n === null) return false;
  if (b >= 31) return true;
  const size = 2 ** (32 - b); const base = (n - (n % size));
  return a !== base && a !== base + size - 1;
}
export function inCidr(ip: string, cidr: string): boolean {
  const [net, bits] = cidr.split('/'); const a = ipToInt(ip); const n = ipToInt(net); const b = Number(bits);
  if (a === null || n === null || !(b >= 0 && b <= 32)) return false;
  const mask = b === 0 ? 0 : (0xffffffff << (32 - b)) >>> 0;
  return ((a & mask) >>> 0) === ((n & mask) >>> 0);
}

/** REFUSED: per port. A status command for the port, followed (before the next status command) by a fenced block whose only
 *  non-empty line is `403` ⇒ literal-403; by text naming a before/pre-apply/baseline value and "differ" ⇒ comparison. */
export function refusedSide(text: string, ports: string[], mutate?: OAMutation): Record<string, RefusedForm> {
  const lines = text.split('\n'); const fs_ = fences(lines);
  const cmds = fs_.filter((f) => f.body.some((l) => STATUS_CMD_RE.test(l)));
  const out: Record<string, RefusedForm> = {};
  for (const port of ports) {
    let form: RefusedForm = 'missing';
    const mine = cmds.filter((f) => f.body.some((l) => STATUS_CMD_RE.test(l) && new RegExp(`:${port}\\b`).test(l)));
    for (const c of mine) {
      const next = cmds.find((f) => f.start > c.end && !mine.includes(f)) ?? null;
      const windowEnd = Math.min(next ? next.start : lines.length, c.end + 25);
      const after = fs_.filter((f) => f.start > c.end && f.start < windowEnd);
      const literal = after.some((f) => { const nonEmpty = f.body.map((l) => l.trim()).filter(Boolean); return nonEmpty.length >= 1 && nonEmpty.every((l) => l === '403'); });
      if (literal && mutate !== 'literal-blind') { form = 'literal-403'; break; }
      // the comparison's comparand text may follow a GROUP of commands (Run 1: both ports' commands, then the bullets) —
      // read to the next heading (or 25 lines), not to the next command.
      let cmpEnd = Math.min(lines.length, c.end + 25);
      for (let k = c.end + 1; k < cmpEnd; k++) if (/^#{1,4} /.test(lines[k])) { cmpEnd = k; break; }
      const prose = plain(lines.slice(c.end + 1, cmpEnd).join('\n'));
      if (COMPARISON_RE.test(prose) && COMPARAND_RE.test(prose)) { if (form === 'missing') form = 'comparison'; }
    }
    if (form === 'missing' && mutate !== 'label-blind') {
      // A post-apply step that RE-RUNS an earlier status command by its label (C-2's "re-run C1 and C2 exactly as written in V0",
      // found on the L-OA persisted before-run 2026-10-28): the label sits on the line(s) just above the command's fence.
      const labels = new Set<string>();
      for (const c of mine) {
        // the label sits on the lines just above the command, or on the heading of its section (up to 10 lines up; A-C2 Rev 4 s02)
        for (let k = c.start - 1; k >= Math.max(0, c.start - 10); k--) {
          for (const m of plain(lines[k]).matchAll(/\b([A-Z]{1,3}\d{1,4}[a-z]?|B\d{4})\b/g)) labels.add(m[1]);
          if (/^#{1,4} /.test(lines[k])) break;
        }
      }
      if (labels.size) {
        const sections: string[] = []; let cur: string[] = [];
        for (const l of lines) { if (/^#{1,4} /.test(l) && cur.length) { sections.push(cur.join('\n')); cur = []; } cur.push(l); }
        if (cur.length) sections.push(cur.join('\n'));
        for (const sec of sections.map(plain)) {
          if (!/re-?run|run again|repeat|\bagain\b/i.test(sec) || ![...labels].some((lb) => new RegExp(`\\b${lb}\\b`).test(sec))) continue;
          if (COMPARISON_RE.test(sec) && COMPARAND_RE.test(sec)) { form = 'comparison'; break; }
          if (/\b403\b/.test(sec)) { form = 'literal-403'; break; }
        }
      }
    }
    if (form === 'missing' && mutate !== 'prose-blind') {
      // prose: the refused side described for this port with no status command (a table row, a governance sentence).
      const refusedProse = lines.some((l) => /(refus|denied|deny|403|outside)/i.test(l) && (new RegExp(`\\b${port}\\b`).test(l) || /4317 and 4318|both ports|both listeners/i.test(l)) && /(sender|source|request|status)/i.test(l));
      if (refusedProse) form = 'prose';
    }
    out[port] = form;
  }
  return out;
}

/** ADMIT: the paragraphs (or table rows) about the admitted side; each part read separately. */
/** The raw text of the admitted-side blocks (the same selection admitSide reads), for NOINVENT's exemption. */
export function admitBlocksText(text: string): string { return admitSide(text, [], undefined).raw; }

export function admitSide(text: string, cidrs: string[], mutate?: OAMutation): { found: boolean; sender: boolean; pass: boolean; rollback: boolean; ok: boolean; raw: string } {
  const blocks = text.split(/\n\s*\n/).flatMap((b) => (/^\s*\|/.test(b) ? b.split('\n') : [b]));
  // The post-apply admitted-side CHECK only: an admit cue AND a check cue, never a chosen-value rationale row (calibrated on the
  // persisted demo + Run 1 packages: without this the "Admitted range … members 10.99.0.1, …" rationale row read as a named sender).
  const admit = blocks.filter((b) => /admit(ted)?[- ]side|admit side|\bB1\b|must be admitted|still gets through|is admitted|admitted sender|sender admitted|allowlisted sender/i.test(b)
    && /post-apply|after (the )?reload|after (the )?apply|run first|first post-apply|\bcheck\b/i.test(b)
    && !/Alternatives compared|consumed, not chosen|^#+\s*UNTESTED|^\s*\d\.\s+\*\*Wait/i.test(b) && !/^\|[^\n]*\(a\) [^\n]*\(b\) /m.test(b));
  // A-REMAP layout (L-OA crib, 2026-10-28): the cue sits in a table row or a lead-in, and the parts follow under "**What step 5
  // involves:**" as labelled bullets ("- **Sender:**", "- **Pass:**", "- **If it fails:**"). Follow an admit block with every
  // block after it, up to the next heading, that opens with a labelled bullet or a "What … involves" lead-in.
  const follow: string[] = [];
  if (mutate !== 'follow-blind') {
    for (const b of admit) {
      let i = blocks.indexOf(b) + 1;
      for (; i < blocks.length && !/^#{1,4} /.test(blocks[i]); i++) {
        if (/^\s*(- \*\*[A-Z][^*]{0,40}:?\*\*|\*\*What [^*]{0,60}\*\*|\| \*\*[A-Z][^*]{0,40}\*\* \||\| Item \||\| Part \||\| (Sender|What it sends|Pass|Rollback)\b|\|-)/.test(blocks[i])) follow.push(blocks[i]);
        else if (follow.length) break;
      }
    }
  }
  const t = plain([...admit, ...follow].join('\n'));
  const ips = [...t.matchAll(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?!\/)\b/g)].map((m) => m[1]);
  const sender = ips.some((ip) => cidrs.some((c) => inCidr(ip, c) && usableHost(ip, c)));
  const notRefusal = /not (the |a )?[\w -]{0,30}(refus|403|denied|denial)|is not `?403|other than `?403|\bno (HTTP |http )?`?403|no [\w -]{0,20}permission-denied|neither [^.\n]{0,40}(gets|receives|returns) the refusal|not the refusal|(receives|gets|returns) the status [^.\n]{0,60}refus|differs? from [^.\n]{0,60}(refused[- ]side|post-apply|\bPOST)|not the refused[- ]side'?s? (post-apply )?(value|status)/i.test(t);
  const received = /collector (receives|gets|got|accepts)|reaches the collector|received by the collector|export (arrives|lands|is received)|appears (on|in|at) the collector|arrives at the collector/i.test(t);
  const pass = mutate === 'admit-lenient' ? (notRefusal || received) : (notRefusal && received);
  const rollback = /restore H\d{1,3}/.test(t) || /(Rollback( if it fails)?|If it fails)\s*:?\s*\S/i.test(t.replace(/\bRollback by reference: .*/g, ''));
  return { found: admit.length > 0, sender, pass, rollback, ok: sender && pass && rollback, raw: [...admit, ...follow].join('\n') };
}

/** EVIDENCE (Rev 3, R-a): a port written as the literal `403` must QUOTE its listener's block — a fenced block carrying that
 *  port's `listen` line. A named held line range alone does NOT count (Rev 3 final dropped it: unverifiable from the Reviewer's seat). */
export function blockEvidence(text: string, port: string, mutate?: OAMutation): boolean {
  if (mutate === 'evidence-blind') return true;
  const lines = text.split('\n');
  return fences(lines).some((f) => f.body.some((l) => new RegExp(`^\\s*listen\\s+(\\S+:)?${port}\\b`).test(l)));
}

export function vantageNote(text: string): boolean {
  return text.split('\n').some((l) => /\b000\b/.test(l) && /(did not run|not run|never .*pass|no client|unreachable|vantage)/i.test(l));
}

export const PLACEHOLDER_RE = /<[^<>\n]{0,30}(ip|addr|address|host|sender|port)[^<>\n]{0,30}>|\bx\.x\.x\.x\b|\bIP_ADDRESS\b|\bSENDER_IP\b|\b10\.x\b/i;
export function noInvent(text: string, allowed: string[], mutate?: OAMutation): { placeholders: string[]; badTargets: string[] } {
  // Owner ruling 2026-10-28 (ADDENDUM m): a LABELLED operator-supplied unknown (e.g. `$INGRESS_HOST`, "not harvested") inside the
  // ADMITTED-side check is not invented. Commands in the admitted-side blocks are excluded; the refused side is still checked.
  const admitText = mutate === 'admit-exempt-blind' ? '' : admitBlocksText(text);
  // The SENDER is never exempt: a placeholder sender (`<exporter-ip>`, `--interface <…>`, a Sender line) is still invented (bench R5).
  const senderish = (l: string) => /\*\*Sender\b|--interface|<[^<>\n]{0,30}(sender|exporter|source)[^<>\n]{0,30}>/i.test(l);
  const lines = text.split('\n').map((l) => (admitText && l.trim().length > 8 && admitText.includes(l.trim()) && !senderish(l) ? '' : l));
  const runnable = new Set<number>(); for (const f of fences(lines)) for (let k = f.start + 1; k < f.end; k++) runnable.add(k);
  // A placeholder counts where an operator would RUN or SEND from it: a fenced command line or a Sender line. Prose describing a
  // pattern (`allow <addr>; deny all;` in a rationale table, L-OA run 2026-10-28) is not one.
  const placeholders = mutate === 'placeholder-blind' ? [] : lines.filter((l, k) => (runnable.has(k) || /\*\*Sender\b/i.test(l)) && PLACEHOLDER_RE.test(l) && !/^(<{7}|={7}|>{7})/.test(l)).map((l) => l.trim().slice(0, 120));
  const badTargets: string[] = [];
  if (mutate !== 'target-blind') {
    for (const f of fences(lines)) for (const l of f.body) {
      if (!STATUS_CMD_RE.test(l)) continue;
      for (const m of l.matchAll(/https?:\/\/(\[[^\]]+\]|[^/:\s'"]+)(:\d+)?/g)) {
        const host = m[1];
        if (!LOOPBACK_RE.test(host) && !allowed.includes(host)) badTargets.push(host);
      }
    }
  }
  return { placeholders, badTargets };
}

/** The sample's editApplication: the lab writes it to `editApplication.json` (`{ fact, refusals }`) beside sample.json, not into
 *  sample.json (found on the L-OA persisted before-run, 2026-10-28: every sample read "— —"). sample.json's own key wins if present. */
export function sampleWithEditApplication(sampleDir: string): Record<string, any> {
  const sample = JSON.parse(fs.readFileSync(path.join(sampleDir, 'sample.json'), 'utf8')) as Record<string, any>;
  if (sample.editApplication) return sample;
  const ef = path.join(sampleDir, 'editApplication.json');
  if (!fs.existsSync(ef)) return sample;
  const e = JSON.parse(fs.readFileSync(ef, 'utf8'));
  return { ...sample, editApplication: e?.fact ?? null };
}

export interface OAAuthorScore {
  applied: string; digest8: string | null; editOk: boolean | null; refused: Record<string, RefusedForm>;
  admit: ReturnType<typeof admitSide>; vantage: boolean; invent: ReturnType<typeof noInvent>;
  remapLiteral: string[]; controlStatusCmds: number; formOk: boolean; evidenceMissing: string[];
}

export function scoreOAAuthor(sample: Record<string, any>, text: string, sc: OAScoring, mutate?: OAMutation): OAAuthorScore {
  const fact = sample.editApplication ?? null;
  const applied = fact ? `${fact.applied}/${fact.total}` : '—';
  const digest8 = typeof fact?.candidateDigest8 === 'string' ? fact.candidateDigest8 : null;
  const appliedOk = !sc.expectApplied ? null : sc.expectApplied === 'all'
    ? fact?.state === 'applied' && fact.applied === fact.total && fact.total > 0 && !(fact.refusedTotal > 0) && !fact?.correction?.attempted
    : applied === sc.expectApplied && fact?.state === 'applied';
  const digestOk = sc.expectDigest8 ? (mutate === 'digest-blind' ? true : digest8 === sc.expectDigest8) : null;
  const editOk = appliedOk === null && digestOk === null ? null : (appliedOk ?? true) && (digestOk ?? true);
  const ports = sc.ports ?? [];
  const refused = refusedSide(text, ports, mutate);
  const remapLiteral = mutate === 'remap-blind' ? [] : (sc.remapPorts ?? []).filter((p) => refused[p] === 'literal-403');
  const controlStatusCmds = sc.control ? fences(text.split('\n')).filter((f) => f.body.some((l) => STATUS_CMD_RE.test(l))).length : 0;
  return {
    applied, digest8, editOk, refused,
    admit: admitSide(text, sc.admittedCidrs ?? [], mutate),
    vantage: vantageNote(text),
    invent: noInvent(text, sc.allowedTargets ?? [], mutate),
    remapLiteral, controlStatusCmds,
    formOk: ports.every((p) => refused[p] === 'literal-403' || refused[p] === 'comparison'),
    evidenceMissing: ports.filter((p) => refused[p] === 'literal-403' && !blockEvidence(text, p, mutate)),
  };
}

export function scoreOARuns(runs: string[], exp: { nodes: Array<{ id: string; variants: string[]; scoring?: OAScoring & { role?: string } }> }, mutate?: OAMutation): { md: string[]; author: Record<string, OAAuthorScore[]> } {
  const A: Record<string, OAAuthorScore[]> = {}; const rows: string[] = [];
  for (const node of exp.nodes) {
    const sc = node.scoring; if (!sc || sc.role !== 'author') continue;
    for (const v of node.variants) {
      const key = `${node.id}/${v}`;
      for (const run of runs) {
        const cell = path.join(run, node.id, v); if (!fs.existsSync(cell)) continue;
        for (const s of fs.readdirSync(cell).filter((d) => /^(sample-)?\d+$/.test(d)).sort()) {
          const sf = path.join(cell, s, 'sample.json'); const af = path.join(cell, s, 'author.md');
          if (!fs.existsSync(sf) || !fs.existsSync(af)) continue;
          const r = scoreOAAuthor(sampleWithEditApplication(path.join(cell, s)), fs.readFileSync(af, 'utf8'), sc, mutate);
          (A[key] ??= []).push(r);
          rows.push(`| ${key} | ${path.basename(run).slice(0, 19)}/${s} | ${r.applied} ${r.digest8 ?? '—'} ${r.editOk === null ? '' : r.editOk ? '✓' : '✗'} | ${Object.entries(r.refused).map(([p, f]) => `${p}:${f}`).join(' ') || '—'} | ${r.admit.found ? `${r.admit.sender ? 'S' : 's'}${r.admit.pass ? 'P' : 'p'}${r.admit.rollback ? 'R' : 'r'}` : 'none'} | ${r.vantage ? 'yes' : 'no'} | ${r.invent.placeholders.length}/${r.invent.badTargets.join(',') || '0'} | ${r.remapLiteral.join(',') || '0'} | ${sc.control ? r.controlStatusCmds : '—'} | ${r.evidenceMissing.join(',') || '0'} |`);
        }
      }
    }
  }
  const all = Object.entries(A);
  const targets = all.filter(([k]) => !exp.nodes.find((n) => n.id === k.split('/')[0])?.scoring?.control);
  const count = (f: (x: OAAuthorScore) => boolean) => targets.flatMap(([, xs]) => xs).filter(f).length;
  const total = targets.flatMap(([, xs]) => xs).length;
  const md = ['## L-OA Author readings (proxies — the hand read decides)', '',
    `- G-A-FORM proxy: refused side prose/missing on any port in ${count((x) => !x.formOk)}/${total} target samples (DO NOT SHIP if > 0 after the hand read)`,
    `- G-A-EDIT proxy: edit not as expected in ${count((x) => x.editOk === false)}/${total}`,
    `- G-A-NOINVENT proxy: placeholder or unlisted target in ${count((x) => x.invent.placeholders.length > 0 || x.invent.badTargets.length > 0)}/${total}`,
    `- G-A-REMAP proxy: literal 403 on a remap port in ${count((x) => x.remapLiteral.length > 0)}/${total}`,
    `- G-A-NOLITERAL proxy (Rev 4, DO NOT SHIP if > 0 after the hand read): a literal refused-side status on any port in ${count((x) => Object.values(x.refused).includes('literal-403'))}/${total}`,
    `- block quote (MEASURED only — option A dropped the quote obligation, ADDENDUM k): a literal 403 without a quoted listener block in ${count((x) => x.evidenceMissing.length > 0)}/${total}`,
    `- VANTAGE (measured): 000 note present in ${count((x) => x.vantage)}/${total}`, '',
    '| Cell | Sample | applied · digest8 | REFUSED per port | ADMIT (S/P/R; lower-case = missing) | 000 note | placeholders/bad targets | remap literal | control status cmds | literal without block evidence |',
    '|---|---|---|---|---|---|---|---|---|---|', ...rows];
  return { author: A, md };
}

/** Synthetic both-direction cases built from the stored package SHAPES (demo prose table, Run 1 comparison); each mutation RED. */
export function oaSelfTest(opts: { mutate?: OAMutation } = {}): { ok: boolean; failures: string[] } {
  const m = opts.mutate; const failures: string[] = [];
  const P = ['4317', '4318']; const C = ['10.99.0.0/27'];
  const cmd = (port: string) => '```\ndocker exec obs-ingress curl -s -o /dev/null -w \'%{http_code}\\n\' http://127.0.0.1:' + port + '/\n```\n';
  const literal = `### V5 post-apply, refused side\n${cmd('4317')}**Expected output (obs-ingress):**\n\`\`\`\n403\n\`\`\`\n${cmd('4318')}**Expected output (obs-ingress):**\n\`\`\`\n403\n\`\`\`\nA status of \`000\` means the step did not run, never that it passed.\n`;
  const comparison = `### V5 post-apply, deny side\n${cmd('4318')}${cmd('4317')}- Field compared: the http_code. Each post-apply value must differ from its V1 baseline (B4318, B4317) and not be a success (2xx).\n`;
  const proseTable = '| Check | What to observe | Property |\n|---|---|---|\n| **B2** | The status of the same request sent from a source outside `10.99.0.0/27` | The nginx access-module refusal is returned on both 4317 and 4318 |\n';
  const admitGood = 'Admit side (named post-apply check): from 10.99.0.4, inside the admitted range, send one OTLP export to 4317 and 4318. It passes when the status is not the refusal `403` and the collector receives the export. If it fails: restore H2 and reload.\n';
  const admitNoAddr = 'Admit side (named post-apply check): a sender inside the range must be admitted. The path itself is the UNTESTED principal-unseen premise. After the reload the operator confirms telemetry from a fabric exporter still reaches the collector. If it does not, run restore H2 and reload.\n';
  const admitGoodUntested = admitGood.replace('If it fails', 'The path is the UNTESTED principal-unseen premise. If it fails');

  const lit = refusedSide(literal, P, m);
  if (lit['4317'] !== 'literal-403' || lit['4318'] !== 'literal-403') failures.push(`REFUSED: a literal 403 step read ${JSON.stringify(lit)}`);
  const cmp = refusedSide(comparison, P, m);
  if (cmp['4317'] !== 'comparison' || cmp['4318'] !== 'comparison') failures.push(`REFUSED: the comparison form read ${JSON.stringify(cmp)}`);
  const pr = refusedSide(proseTable, P, m);
  if (pr['4317'] !== 'prose' || pr['4318'] !== 'prose') failures.push(`REFUSED: the demo prose table read ${JSON.stringify(pr)}`);
  if (refusedSide('Nothing about traffic here.\n', P, m)['4318'] !== 'missing') failures.push('REFUSED: an absent refused side did not read missing');
  // C-2's shape: the commands live in a pre-apply capture section under labels; the post-apply step re-runs them by label.
  const byLabel = '### V0: pre-apply captures\n**C1** (OTLP/HTTP):\n' + cmd('4318') + '**C2** (OTLP/gRPC):\n' + cmd('4317') +
    '### V5: non-allowlisted source is denied (after reload)\n- Commands: re-run C1 and C2 exactly as written in V0.\n- Pass: each equals 403 and differs from its own V0 capture.\n';
  const bl = refusedSide(byLabel, P, m);
  if (bl['4317'] !== 'comparison' || bl['4318'] !== 'comparison') failures.push(`REFUSED: a re-run-by-label post-apply step read ${JSON.stringify(bl)}`);

  const g = admitSide(admitGood, C, m);
  if (!g.ok) failures.push(`ADMIT: the full admitted side read ${JSON.stringify(g)}`);
  if (!admitSide(admitGoodUntested, C, m).ok) failures.push('ADMIT: an admit paragraph naming an UNTESTED premise was dropped');
  const remapLayout = '| 5 | **Admitted-side check (first post-apply check, named here, not a validation step):** see below | post-apply |\n\n**What step 5 involves:**\n- **Sender:** an address inside `10.99.0.0/27`, for example `10.99.0.1`.\n- **What it sends:** one OTLP export to 4317 and 4318.\n- **Pass:** two conditions:\n  1. The response status is not the refusal.\n  2. The collector receives the export.\n- **If it fails:** `restore H2`, run V1, reload.\n';
  if (!admitSide(remapLayout, C, m).ok) failures.push(`ADMIT: the A-REMAP labelled-bullet layout read ${JSON.stringify(admitSide(remapLayout, C, m))}`);
  const c2Layout = '**Admitted side: the first post-apply check.** It is not a validation step.\n- **Sender:** the host `10.20.31.17`, or any host in `10.20.30.0/24`.\n- **What counts as passing:**\n  - The response status is **not** `403`.\n  - The test metric appears on the collector\'s Prometheus exporter.\n- **If it fails:** `restore H2`, reload.\n';
  if (!admitSide(c2Layout, ['10.20.30.0/24', '10.20.31.17/32'], m).ok) failures.push(`ADMIT: the A-C2 layout read ${JSON.stringify(admitSide(c2Layout, ['10.20.30.0/24', '10.20.31.17/32'], m))}`);
  const oneBlock = scoreOAAuthor({ editApplication: { state: 'applied', applied: 1, total: 1, refusedTotal: 0, candidateDigest8: 'aaaa1111' } }, literal, { ports: P, expectApplied: 'all', expectDigest8: 'aaaa1111' }, m);
  if (oneBlock.editOk !== true) failures.push('EDIT: one block covering both changes with the expected digest read not ok under expectApplied "all"');
  const corrected = scoreOAAuthor({ editApplication: { state: 'applied', applied: 2, total: 2, refusedTotal: 0, candidateDigest8: 'aaaa1111', correction: { attempted: true } } }, literal, { ports: P, expectApplied: 'all', expectDigest8: 'aaaa1111' }, m);
  if (corrected.editOk !== false) failures.push('EDIT: a sample that needed the correction turn read ok');
  const demoS03 = '**(A) Admitted side — the first post-apply check.** It is named here rather than written as a validation step.\n- **Sender:** `10.99.0.1`, a member of the upstream Derived Values block.\n- **What it sends:** one OTLP export to 4317 and 4318.\n- **Pass:** on both ports the response status is not the refusal (`403`), and the collector receives the export.\n- **Rollback if it fails:** `restore H2`, V1, reload.\n';
  if (!admitSide(demoS03, C, m).ok) failures.push(`ADMIT: the "(A) Admitted side" opener read ${JSON.stringify(admitSide(demoS03, C, m))}`);
  const tableQ1 = '**Q1, admitted side (the first post-apply check):**\n\n| Item | Detail |\n|---|---|\n| **Sender** | `10.99.0.1` (ceos1 Loopback11). |\n| **Pass condition** | The response is not the refusal. **And** the collector receives the export. |\n| **Rollback if it fails** | `restore H2`, then reload. |\n';
  if (!admitSide(tableQ1, C, m).ok) failures.push(`ADMIT: the bold opener + table layout read ${JSON.stringify(admitSide(tableQ1, C, m))}`);
  const c2s01 = '- **Admitted side: the first post-apply check.** It is named here.\n  - **Sender:** the named host `10.20.31.17`.\n  - **What counts as passing:** on both listeners the exporter gets no `403`, **and** the collector receives the export.\n  - **Rollback if it fails:** R1–R3 below.\n';
  if (!admitSide(c2s01, ['10.20.31.17/32'], m).ok) failures.push(`ADMIT: the A-C2 s01 nested layout read ${JSON.stringify(admitSide(c2s01, ['10.20.31.17/32'], m))}`);
  const v0b = '**V0b: TCP 4318 status before the change**\n' + cmd('4318') + '**Expected output:** pre/post comparison form (see V4).\n### V4: refused side on TCP 4318 (post-apply, comparison form)\n' + cmd('4318') + '**Expected output (obs-ingress, listener 4318):** comparison form, not a literal.\n- **Pass condition:** the post-apply value differs from the V0b value, and it is not a 2xx.\n';
  if (refusedSide(v0b, ['4318'], m)['4318'] !== 'comparison') failures.push(`REFUSED: the V0b comparand read ${JSON.stringify(refusedSide(v0b, ['4318'], m))}`);
  const pre = '### Q2: refused side, after apply\n' + cmd('4318') + '**Pass, for each listener:**\n- the post-apply value differs from `PRE_4318`, and is not a success.\n';
  const neq = '### V1. Pre-apply capture\n' + cmd('4318') + '### V6. Post-apply: refused side\n' + cmd('4318') + '**Comparand:** the HTTP status code field. Passes only if `POST_4318` ≠ `PRE_4318` and the post value is not 2xx.\n';
  if (refusedSide(neq, ['4318'], m)['4318'] !== 'comparison') failures.push(`REFUSED: the "≠" comparison read ${JSON.stringify(refusedSide(neq, ['4318'], m))}`);
  const shape = '### V3: Refused side, before and after the reload (comparison shape)\n' + cmd('4318') + '**Expected output (comparison shape; the comparand is the single printed status-code field):**\n```\nlistener 4318: POST value != PRE value AND POST value not in 200-299\n```\n';
  if (refusedSide(shape, ['4318'], m)['4318'] !== 'comparison') failures.push(`REFUSED: the "comparison shape" step read ${JSON.stringify(refusedSide(shape, ['4318'], m))}`);
  // R4-S1 (Rev 4 audit fold): where the held file already refuses that sender, the post value must EQUAL the pre value and not be 2xx.
  const eqBranch = '### V5: refused side, before and after (comparison form)\n' + cmd('4318') + '**Comparand:** the printed status code. The held file already refuses this sender, so the post-apply value must equal the pre-apply value (`POST_4318` = `PRE_4318`) and not be a success (2xx).\n';
  if (refusedSide(eqBranch, ['4318'], m)['4318'] !== 'comparison') failures.push(`REFUSED: the equals-branch comparison read ${JSON.stringify(refusedSide(eqBranch, ['4318'], m))}`);
  // A-C2 Rev 4 s02: "Run the three V0b commands again" + bold "**differ from**" and bare `PRE`/`POST` (label with a letter suffix)
  const v0bAgain = '### V0b — pre-apply status capture\nBoth listen lines bind all addresses.\n\n' + cmd('4317') + '\n' + cmd('4318') + '### V3 — Refused side, post-apply (part 3; comparison form)\nRun the three V0b commands again, exactly as written, after the reload.\n- **Comparand:** the printed HTTP status field.\n- **:4318:** the `POST` value must **differ from** that listener\'s `PRE` value and must **not be 2xx**.\n';
  if (refusedSide(v0bAgain, ['4318'], m)['4318'] !== 'comparison') failures.push(`REFUSED: the "V0b commands again" layout read ${JSON.stringify(refusedSide(v0bAgain, ['4318'], m))}`);
  if (refusedSide(pre, ['4318'], m)['4318'] !== 'comparison') failures.push(`REFUSED: the PRE_ comparand read ${JSON.stringify(refusedSide(pre, ['4318'], m))}`);
  if (noInvent('| Terminator | the exporter range is the only permitted sender; H1 uses the same `allow <addr>; deny all;` pattern. |\n', [], m).placeholders.length !== 0) failures.push('NOINVENT: a rationale row describing a pattern was flagged');
  if (noInvent('- **Sender:** `<exporter-ip>` inside the range.\n', [], m).placeholders.length !== 1) failures.push('NOINVENT: a placeholder Sender was not flagged');
  const nested = '- **Blast radius:** limited to the two location blocks.\n- **First post-apply check: V5 admitted side:**\n  - **Sender:** `10.99.0.1`, inside `10.99.0.0/27`.\n  - **What it sends:** one OTLP export to 4317 and 4318.\n  - **Pass, both halves required:** (a) the sender gets a status that is not the refusal. (b) The collector receives the export.\n  - **If it fails:** run `restore H2`, reload.\n';
  if (!admitSide(nested, C, m).ok) failures.push(`ADMIT: the nested "(a) … (b)" pass bullet read ${JSON.stringify(admitSide(nested, C, m))}`);
  const a1 = '### A1: Admitted side (named post-apply check; not a validation step)\n\nA1 is not written as a validation step because it can only be run from a host inside the admitted range.\n\n- **Sender:** use `10.20.31.17`.\n- **Pass condition, both halves:**\n  1. Neither export gets the refusal: no HTTP `403`.\n  2. The collector receives the export.\n- **If it fails:** run `restore H2`, reload.\n';
  if (!admitSide(a1, ['10.20.31.17/32'], m).ok) failures.push(`ADMIT: the A1 heading + paragraph + bullets layout read ${JSON.stringify(admitSide(a1, ['10.20.31.17/32'], m))}`);
  const plainTable = '**First post-apply check — admitted side.** Named here, not a validation step.\n\n| Part | Detail |\n|---|---|\n| Sender | `10.99.0.1` (ceos1 Loopback11) |\n| Pass — first half | The response status is **not** the refusal recorded in `post-4318.status` |\n| Pass — second half | The **collector receives the export** |\n| Rollback if it fails | `restore H2`, then reload. |\n';
  if (!admitSide(plainTable, C, m).ok) failures.push(`ADMIT: the plain-label table read ${JSON.stringify(admitSide(plainTable, C, m))}`);
  const v3status = '**Admitted side (first post-apply check; not a validation step).**\n- **Sender:** `10.99.0.1`.\n- **Pass condition, which needs both halves:**\n  - (a) neither export receives the status V3 observed for refused requests; and\n  - (b) the collector receives the export.\n- **If it fails:** `restore H2`, reload.\n';
  if (!admitSide(v3status, C, m).ok) failures.push(`ADMIT: "receives the status V3 observed for refused requests" read ${JSON.stringify(admitSide(v3status, C, m))}`);
  const n2 = '**Admitted side (first post-apply check).**\n- **Sender:** `10.99.0.1`.\n- **Pass, both halves:** the status differs from the refused side\'s post-apply value, and the collector receives the export.\n- **If it fails:** `restore H2`.\n';
  if (!admitSide(n2, C, m).ok) failures.push(`ADMIT: the R4-N2 status half ("differs from the refused side's post-apply value") read ${JSON.stringify(admitSide(n2, C, m))}`);
  for (const [lbl, line] of [['A-C2 Rev 4 crib', '  1. The printed status differs from the post-apply V3b value.'], ['A-REMAP Rev 4 crib', '  1. On each listener, the response status differs from that listener\'s refused-side POST value in V5 (`POST_4317` / `POST_4318`).']]) {
    const t = '**Admitted side (first post-apply check).**\n- **Sender:** `10.99.0.1`.\n- **What counts as passing (both halves are required):**\n' + line + '\n  2. The collector receives the export.\n- **If it fails:** `restore H2`.\n';
    if (!admitSide(t, C, m).ok) failures.push(`ADMIT: the ${lbl} status half read ${JSON.stringify(admitSide(t, C, m))}`);
  }
  const n = admitSide(admitNoAddr, C, m);
  // the demo B1 row (calibration 2026-10-28): pass condition present, sender NOT an address.
  const demoB1 = '| **B1 (run first)** | The HTTP or gRPC status of an OTLP export sent from an exporter-marked fabric address to 4318 and to 4317 | It is not the nginx access-module refusal, and the collector receives the export |\n';
  const d = admitSide(demoB1, C, m);
  if (!d.pass || d.sender) failures.push(`ADMIT: the demo B1 row read ${JSON.stringify(d)}`);
  if (n.sender || n.pass) failures.push(`ADMIT: Run 1's shape (no address, receipt only) read sender/pass ${JSON.stringify(n)}`);

  if (!vantageNote(literal)) failures.push('VANTAGE: the 000 line was not read');
  if (vantageNote(comparison)) failures.push('VANTAGE: a package with no 000 line read present');

  const ph = noInvent('```\ncurl -s -o /dev/null -w \'%{http_code}\' --interface <exporter-ip> http://127.0.0.1:4318/\n```\n', [], m);
  if (ph.placeholders.length !== 1) failures.push('NOINVENT: a placeholder sender was not flagged');
  const bad = noInvent('```\ncurl -s -o /dev/null -w \'%{http_code}\' http://172.31.114.10:4318/\n```\n', [], m);
  if (bad.badTargets.length !== 1) failures.push('NOINVENT: a status command to an unlisted address was not flagged');
  if (noInvent(literal, [], m).badTargets.length !== 0 || noInvent(literal, [], m).placeholders.length !== 0) failures.push('NOINVENT: a loopback literal step was flagged');

  const remap = scoreOAAuthor({ editApplication: { state: 'applied', applied: 2, total: 2, candidateDigest8: 'aaaa1111' } }, literal, { ports: P, admittedCidrs: C, remapPorts: ['4318'], expectApplied: '2/2', expectDigest8: 'aaaa1111' }, m);
  if (remap.remapLiteral.join() !== '4318') failures.push('REMAP: a literal 403 on the remap port was not flagged');
  if (remap.editOk !== true) failures.push('EDIT: an applied 2/2 with the expected digest read not ok');
  const drift = scoreOAAuthor({ editApplication: { state: 'applied', applied: 2, total: 2, candidateDigest8: 'bbbb2222' } }, literal, { ports: P, expectApplied: '2/2', expectDigest8: 'aaaa1111' }, m);
  if (drift.editOk !== false) failures.push('EDIT: a drifted digest read ok');
  { // the lab's on-disk shape: the fact lives in editApplication.json, not sample.json
    const os = require('os') as typeof import('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-'));
    fs.writeFileSync(path.join(tmp, 'sample.json'), JSON.stringify({ costUsd: 0 }));
    fs.writeFileSync(path.join(tmp, 'editApplication.json'), JSON.stringify({ fact: { state: 'applied', applied: 2, total: 2, candidateDigest8: 'aaaa1111' }, refusals: [] }));
    const disk = scoreOAAuthor(m === 'digest-blind' ? JSON.parse(fs.readFileSync(path.join(tmp, 'sample.json'), 'utf8')) : sampleWithEditApplication(tmp), literal, { ports: P, expectApplied: '2/2', expectDigest8: 'aaaa1111' }, m);
    fs.rmSync(tmp, { recursive: true, force: true });
    if (disk.editOk !== true) failures.push(`EDIT: the on-disk editApplication.json fact was not read (${disk.applied} ${disk.digest8})`);
  }
  if (blockEvidence(literal, '4318', m)) failures.push('EVIDENCE: a literal with no listener block read as evidenced');
  const withBlock = literal + '4318, H2 lines 25–37:\n````nginx\nserver {\n    listen 4318;\n    location / {\n        allow all;\n    }\n}\n````\n';
  if (!blockEvidence(withBlock, '4318', m)) failures.push('EVIDENCE: a fenced listener block was not read');
  if (m !== 'evidence-blind' && blockEvidence(literal + 'The 4318 block is held H2 lines 25–37; none of its lines changes the refusal status.\n', '4318', m)) failures.push('EVIDENCE: a named line range alone read as evidence (Rev 3 requires the quote)');
  { // owner ruling: a labelled operator-supplied unknown in the admitted-side check is not invented; the same on the refused side is
    const admitUnknown = '**Admitted side: the first post-apply check.** Named here.\n- **Sender:** `10.20.31.17`.\n- **What it sends:** one export; `$INGRESS_HOST` is the address the operator uses; it was not harvested.\n  ```\n  curl -s -o /dev/null -w \'%{http_code}\\n\' http://$INGRESS_HOST:4318/v1/metrics\n  ```\n- **Pass, both halves:** not the refusal, and the collector receives the export.\n- **If it fails:** `restore H2`.\n';
    if (noInvent(admitUnknown, [], m).badTargets.length !== 0) failures.push('NOINVENT: a labelled unknown in the admitted-side check was flagged (owner ruling: not invented)');
    const refusedUnknown = '### V3: refused side\n```\ndocker exec obs-ingress curl -s -o /dev/null -w \'%{http_code}\' http://$INGRESS_HOST:4318/\n```\n';
    if (noInvent(refusedUnknown, [], m).badTargets.length !== 1) failures.push('NOINVENT: an unknown target on the refused side was not flagged');
    const admitPlaceholderSender = admitUnknown.replace('http://$INGRESS_HOST', '--interface <exporter-ip> http://$INGRESS_HOST');
    if (noInvent(admitPlaceholderSender, [], m).placeholders.length !== 1) failures.push('NOINVENT: a placeholder SENDER in the admitted-side command was exempted');
  }
  const ctrl = scoreOAAuthor({}, comparison, { control: true }, m);
  if (ctrl.controlStatusCmds !== 2) failures.push('CTRL: status commands in a control package were not counted');
  return { ok: failures.length === 0, failures };
}
