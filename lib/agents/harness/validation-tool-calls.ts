/**
 * validationToolCalls — does each hub TOOL CALL written in a network Author package's VALIDATION steps match what the tool
 * accepts? (NETWORK-VALIDATION-RELEASE-RATE §4, 2026-10-23; owner go + amended design, Steve.) PURE: text + an index in, a
 * fact out. The enrichment (`validation-tool-calls-enrichment.ts`) builds the index from the leg's Harvester and the
 * service rows.
 *
 * WHY: measured 2026-10-23 on prod (`cline_docs/reviews/held-network-2026-10-22/VALIDATION-WITNESS-MEASURE.md` §4) — 7 network
 * legs in 12 days wrote validation calls the live tool REJECTS (`getter`/`target`/`resource`/`dataset`/`query` for `getters`,
 * `command` for `commands`); 4 were APPROVED, and the one catch came from a reviewer EXECUTING the call. The schema is not in
 * the Reviewer's context (Invariant 6). A FORM slip with a mechanical oracle — a fact, rendered to the leg Reviewer (§6), NOT a
 * gate.
 *
 * THREE SOURCES, strongest first, each finding naming its own (the fact never asserts more than its source shows):
 *   1. `service-row`          — the resolved service row's registered `inputSchema` (`required` + `properties`);
 *   2. `harvest-registration` — the leg Harvester's own `registry register` arguments, where the row has none;
 *   3. `harvest-observed`     — the SUCCESSFUL calls of the same tool, on the same service, in the leg's own harvest. WEAKER and
 *      worded so: "every successful harvest call carried X; this one does not" — NEVER "requires", because an argument present in
 *      every observed call can still be optional (`filter_name`). The Reviewer judges; the fact does not (network-held-1, 2026-10-23).
 * Amended at build start because sources 1–2 covered 1 of the 7 measured legs: 6 registered tool NAMES only.
 * No source ⇒ a NAMED unchecked reason, never "invalid" (a fact must not assert a defect it cannot see).
 *
 * SCOPE OF THE EXTRACTOR (named limits): calls inside FENCED blocks under a validation / verification / check / pre- / post-change
 * heading, or in a block dialect-lint kinds `command`; rollback sections excluded; `"source":` provenance lines excluded (a first
 * measure counted that shorthand as calls). Two notations: `services(… tool:'X' … arguments:{…})` / `"tool":"X","arguments":{…}`, and
 * a bare `X(…)` for a tool the index knows. dialect-lint kinds these blocks `harvested-state`/`candidate-config` (its operator-verb
 * list knows `show`/`grep`, not a hub call), so the section heading, not the kind, decides scope. Prose (unfenced) calls are out of scope.
 */
import { fencedBlockLines } from './dialect-lint';

export const VALIDATION_TOOL_CALLS_VERSION = 1;
/** The measured class is network-provisioning only; the fact says so (network-held-1). */
export const VALIDATION_TOOL_CALLS_SCOPE = 'network-provisioning';

export type SchemaSource = 'service-row' | 'harvest-registration' | 'harvest-observed';

export interface ValidationToolCall {
  tool: string;
  /** The service the TEXT names (`targetService:'x'`), when it names one. */
  namedService: string | null;
  keys: string[];
  /** Bare positional arguments (`fetch_data(interfaces_ip, …)`) — not a key at all. */
  positional: number;
  /** 1-indexed document line of the call. */
  line: number;
}

/** What the index knows about ONE tool on ONE service. */
export type ToolKnowledge =
  | { source: 'service-row' | 'harvest-registration'; serviceId: string | null; required: string[]; properties: string[]; additionalProperties: boolean }
  | { source: 'harvest-observed'; serviceId: string | null; carriedByAll: string[]; usedByAny: string[]; calls: number };

export type Resolution = { ok: true; knowledge: ToolKnowledge } | { ok: false; reason: UncheckedReason };

export type UncheckedReason =
  /** The service could not be identified (the text names one the harvest never resolved, or a bare tool on several services). */
  | 'service-not-resolved'
  /** The service is known, but neither its row nor its registration carries an inputSchema, and the harvest has no successful call of this tool. */
  | 'schema-not-registered';

export interface ValidationToolCallFinding {
  tool: string;
  line: number;
  serviceId: string | null;
  source: SchemaSource;
  /** schema sources: required arguments absent. */
  missingRequired?: string[];
  /** schema sources: keys not among the schema's properties (asserted as a rejection only when `additionalProperties` is false). */
  notInSchema?: string[];
  /** observed source: arguments EVERY successful harvest call of this tool carried, absent here. Observation only — may be optional. */
  notCarriedObserved?: string[];
  /** observed source: keys no successful harvest call of this tool used. */
  neverObserved?: string[];
  positional?: number;
}

const VALIDATION_SECTION = /validat|verif|\bcheck|post[- ]?change|pre[- ]?change/i;
const PROVENANCE_LINE = /"source"\s*:/;
const SAFE_TOOL = /^[A-Za-z_][\w-]{0,63}$/;

/** A balanced `(…)` or `{…}` span starting at `i` (bounded; null if unbalanced). */
function span(t: string, i: number): string | null {
  const open = t[i];
  if (open !== '(' && open !== '{') return null;
  const close = open === '(' ? ')' : '}';
  let d = 0;
  for (let k = i; k < Math.min(t.length, i + 4000); k++) {
    if (t[k] === open) d++;
    else if (t[k] === close) { d--; if (d === 0) return t.slice(i, k + 1); }
  }
  return null;
}

/** Top-level argument keys (`k: v`, `"k": v`, `k=v`) and bare positionals of a `(…)`/`{…}` span. */
export function argumentShape(body: string): { keys: string[]; positional: number } {
  const inner = body.slice(1, -1);
  let flat = ''; let depth = 0; let quote: string | null = null;
  for (const ch of inner) {
    if (quote) { flat += depth === 0 ? ch : ' '; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; flat += depth === 0 ? ch : ' '; continue; }
    if (ch === '[' || ch === '{' || ch === '(') depth++;
    flat += depth === 0 ? ch : ' ';
    if (ch === ']' || ch === '}' || ch === ')') depth--;
  }
  const keys: string[] = []; let positional = 0;
  for (const part of flat.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const m = /^["']?([A-Za-z_]\w*)["']?\s*[:=](?!=)/.exec(p);
    if (m) { if (!keys.includes(m[1])) keys.push(m[1]); } else positional++;
  }
  return { keys, positional };
}

/**
 * Extract every validation-step tool call. `knownTools` is the set of tool names the index knows (from the leg's services), so a
 * bare `X(…)` is read only for a real tool — never `ping(…)` or a prose function name.
 */
export function extractValidationToolCalls(doc: string | null | undefined, knownTools: ReadonlySet<string>): ValidationToolCall[] {
  if (!doc) return [];
  const blocks: Array<{ start: number; lines: string[]; kind: string; ancestry: string; restore: boolean }> = [];
  for (const f of fencedBlockLines(doc)) {
    const b = blocks[blocks.length - 1];
    if (b && f.line === b.start + b.lines.length) b.lines.push(f.text);
    else blocks.push({ start: f.line, lines: [f.text], kind: f.kind, ancestry: f.ancestry, restore: f.restoreIntent });
  }
  const out: ValidationToolCall[] = [];
  for (const b of blocks) {
    if (b.restore) continue;
    if (!(b.kind === 'command' || VALIDATION_SECTION.test(b.ancestry))) continue;
    // Keep line identity: provenance lines are blanked, not removed, so offsets map back to document lines.
    const text = b.lines.map((l) => (PROVENANCE_LINE.test(l) ? '' : l)).join('\n');
    const lineAt = (idx: number) => b.start + (text.slice(0, idx).match(/\n/g)?.length ?? 0);
    const taken: Array<[number, number]> = [];
    // Form A: an explicit tool name + `arguments` object (JS or JSON spelling).
    const reA = /["']?tool["']?\s*[:=]\s*["']([A-Za-z_][\w-]*)["'][\s\S]{0,300}?["']?arguments["']?\s*[:=]\s*(?=\{)/g;
    let m: RegExpExecArray | null;
    while ((m = reA.exec(text))) {
      const at = m.index + m[0].length; const body = span(text, at);
      if (!body) continue;
      const head = text.slice(Math.max(0, m.index - 300), m.index + m[0].length);
      const svc = /["']?targetService["']?\s*[:=]\s*["']([^"'\s]{1,128})["']/.exec(head);
      const { keys, positional } = argumentShape(body);
      out.push({ tool: m[1], namedService: svc ? svc[1] : null, keys, positional, line: lineAt(m.index) });
      taken.push([m.index, at + body.length]);
    }
    // Form B: a bare call of a tool the index knows, outside every Form-A span.
    for (const tool of knownTools) {
      if (!SAFE_TOOL.test(tool)) continue;
      const reB = new RegExp(`\\b${tool.replace(/-/g, '\\-')}\\s*(?=\\()`, 'g');
      while ((m = reB.exec(text))) {
        const at = m.index + m[0].length;
        if (taken.some(([a, z]) => m!.index >= a && m!.index < z)) continue;
        const body = span(text, at);
        if (!body) continue;
        const { keys, positional } = argumentShape(body);
        out.push({ tool, namedService: null, keys, positional, line: lineAt(m.index) });
      }
    }
  }
  return out.sort((a, c) => a.line - c.line || a.tool.localeCompare(c.tool));
}

/** Check one call against what is known. `null` = the call matches its source. */
export function checkCall(call: ValidationToolCall, k: ToolKnowledge): ValidationToolCallFinding | null {
  const base = { tool: call.tool, line: call.line, serviceId: k.serviceId, source: k.source as SchemaSource,
    ...(call.positional ? { positional: call.positional } : {}) };
  if (k.source === 'harvest-observed') {
    const notCarried = k.carriedByAll.filter((a) => !call.keys.includes(a));
    const never = call.keys.filter((a) => !k.usedByAny.includes(a));
    // A FINDING needs positive evidence of an invented shape: a key NO successful call used, or positional arguments (every recorded
    // successful call names its arguments). OMISSION ALONE is never a finding here — an argument every observed call carried can be
    // optional (measured: 3 of the 6 valid control legs omit `filter_name` / call `list_devices()` bare and are correct). The omitted
    // list rides along as context on a finding that has positive evidence.
    if (!never.length && !call.positional) return null;
    return { ...base, ...(notCarried.length ? { notCarriedObserved: notCarried } : {}), ...(never.length ? { neverObserved: never } : {}) };
  }
  const missing = k.required.filter((a) => !call.keys.includes(a));
  const notIn = call.keys.filter((a) => !k.properties.includes(a));
  // A key outside `properties` is a REJECTION only when the schema forbids extras; otherwise it is reported, and only alongside a real gap.
  if (!missing.length && (!notIn.length || k.additionalProperties)) return null;
  return { ...base, ...(missing.length ? { missingRequired: missing } : {}), ...(notIn.length ? { notInSchema: notIn } : {}) };
}

export interface ValidationToolCallsIndex {
  /** Every tool name the leg's services expose or were called with — the bare-call vocabulary. */
  knownTools: ReadonlySet<string>;
  resolve(call: ValidationToolCall): Resolution;
}

/** The fact for one Author package. */
export function computeValidationToolCalls(doc: string | null | undefined, index: ValidationToolCallsIndex): Record<string, unknown> {
  const calls = extractValidationToolCalls(doc, index.knownTools);
  const findings: ValidationToolCallFinding[] = [];
  const unchecked: Array<{ tool: string; line: number; reason: UncheckedReason }> = [];
  const sources: Record<string, number> = {};
  let checkedCalls = 0;
  for (const c of calls) {
    const r = index.resolve(c);
    if (!r.ok) { unchecked.push({ tool: c.tool, line: c.line, reason: r.reason }); continue; }
    checkedCalls++;
    sources[r.knowledge.source] = (sources[r.knowledge.source] ?? 0) + 1;
    const f = checkCall(c, r.knowledge);
    if (f) findings.push(f);
  }
  return {
    version: VALIDATION_TOOL_CALLS_VERSION,
    scope: VALIDATION_TOOL_CALLS_SCOPE,
    checked: true,
    calls: calls.length,
    checkedCalls,
    ...(Object.keys(sources).length ? { sources } : {}),
    findings,
    ...(unchecked.length ? { unchecked } : {}),
  };
}

const list = (xs: readonly string[]) => xs.map((x) => `\`${x}\``).join(', ');

/**
 * The leg Reviewer's §6 lines — a PURE function of the fact. Renders only when the package wrote at least one validation tool call.
 * Wording is per source and states only what that source shows (Protocol 10): a schema source names what the registered schema
 * requires; the observed source names what every successful harvest call carried — never "requires".
 */
export function renderValidationToolCallsForPrompt(fact: Record<string, unknown> | null | undefined): string[] | null {
  if (!fact || typeof fact !== 'object') return null;
  if (fact.checked !== true) {
    return typeof fact.reason === 'string' ? [`- **Validation tool calls (platform fact)**: not checked — ${fact.reason}`] : null;
  }
  const calls = typeof fact.calls === 'number' ? fact.calls : 0;
  if (calls === 0) return null;
  const findings = Array.isArray(fact.findings) ? (fact.findings as ValidationToolCallFinding[]) : [];
  const unchecked = Array.isArray(fact.unchecked) ? (fact.unchecked as Array<{ tool: string; line: number; reason: string }>) : [];
  const checkedCalls = typeof fact.checkedCalls === 'number' ? fact.checkedCalls : 0;
  const head = `- **Validation tool calls (platform fact)**: ${calls} call(s) in the validation steps; ${checkedCalls} compared with what the tool accepts`
    + (findings.length ? `, ${findings.length} differ:` : ', none differ.');
  const out = [head];
  for (const f of findings) {
    const at = `  - line ${f.line}: \`${f.tool}\``;
    if (f.source === 'harvest-observed') {
      const parts: string[] = [];
      if (f.neverObserved?.length) parts.push(`no successful \`${f.tool}\` call in this leg's harvest used ${list(f.neverObserved)}`);
      if (f.positional) parts.push(`${f.positional} positional argument(s), where every successful harvest call named its arguments`);
      if (f.notCarriedObserved?.length) parts.push(`every successful call carried ${list(f.notCarriedObserved)}, omitted here (observation only — an argument can be optional)`);
      out.push(`${at} — ${parts.join('; ')}`);
      continue;
    } else {
      const parts: string[] = [];
      if (f.missingRequired?.length) parts.push(`the service's registered schema requires ${list(f.missingRequired)}, absent here`);
      if (f.notInSchema?.length) parts.push(`not among the schema's arguments: ${list(f.notInSchema)}`);
      out.push(`${at} — ${parts.join('; ')} (${f.source})`);
    }
    if (f.positional) out[out.length - 1] += `; ${f.positional} positional argument(s)`;
  }
  for (const u of unchecked) out.push(`  - line ${u.line}: \`${u.tool}\` — not compared (${u.reason})`);
  return out;
}
