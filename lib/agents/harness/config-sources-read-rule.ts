/**
 * Config sources read rule (2026-11-25, register OBS-MULTILEG-HARVESTER-READS-OWN-FILE-ONLY; owner decision: fix it where it lands,
 * whatever writes the brief) — the ONE gate for the platform-rendered read-rule block in a Harvester's SYSTEM prompt
 * (`CONFIG_SOURCES_READ_RULE_BLOCK`, execution-system-prompt.ts).
 *
 * WHY: on a multi-leg program sharing one `## Config sources` block, a leg orchestrator wrote a Harvester brief that copied the
 * block and then narrowed it to the leg's own file. The Harvester obeyed the brief over the protocol (lab L-OBS-MLH stage H: the
 * stored brief ⇒ 4/4 samples hold 1 of 3 declared Git files, forced `git-file-not-held`; the narrowing sentence removed ⇒ 4/4 hold
 * 3/3). The protocol texts make the brief the authority over reads ("the Harvester reads only the sources its own brief names"),
 * so a narrowing brief is followed. The platform therefore states, beside the brief, that the brief may scope the EDIT and never
 * the declared reads.
 *
 * WHO GETS IT — every condition must hold (the decision is pure; the resolver below makes the two reads it needs):
 *   1. the task is not a PIPELINE row (a leaf of a leg);
 *   2. its resolved role is a harvest leaf (`HARVEST_LEAF_ROLE_RE`, the role test the execution core's Config-sources facts use);
 *   3. its owning leg declares Config sources today (`OwningLegResolution.configSourceProtocol`);
 *   4. that protocol is on `CONFIG_SOURCES_READ_RULE_PROTOCOLS` (observability-config since 2026-11-25; kubernetes-gitops and
 *      terraform-iac since the widening controls passed 3/3 each, 2026-11-26 — LAB-PREREG-L-OBS-MLH widening controls; the golden set
 *      holds no Harvester cell, so a further domain needs its own Harvester control first);
 *   5. the leg's GOVERNING declaration (the snapshot rule, `readLegConfigSources`) is `parsed`.
 * Architect, Author, Reviewer, Node C, a no-block leg, a leg whose declaration could not be checked, and every network or artifact
 * Harvester get nothing (0 bytes).
 *
 * NEVER THROWS. A failure answers OFF (`gate-threw`): the line is an addition, and the post-run `git-file-not-held` force still
 * stands behind it, so failing toward "no line" restores exactly today's prompt.
 *
 * WHERE IT RENDERS (owner option A, 2026-11-25, after lab ADDENDUM B): DIRECTLY AFTER the `## Config sources` block of the brief —
 * the task description — via `withConfigSourcesReadRule`, applied by each caller to the task object it hands BOTH builders: the
 * user §3 Description (`buildAgentPromptBody`) and the system HEAD "Your Context" Description (`buildContextSummary`). Both copies,
 * because the narrowing sentence the rule answers sits right after the block in both; a copy that kept the narrowing beside the block
 * without the rule is the configuration the lab measured failing (a system-tail block, far from the block: 3 misses in 5, every miss
 * citing "this task's own Config sources narrowing" and never the rule). The brief's own bytes never change: the rule is inserted
 * after the block's last line only (no heading — a `##` heading there would capture the brief's next sentence as part of the rule).
 * The caller also passes `configSourcesReadRule: true` to the injection tail, which stamps the fact (series-cut key).
 */
import { HARVEST_LEAF_ROLE_RE } from './mechanical-nets';
import { resolveOwningLegProtocol, type OwningLegResolution } from './held-bytes/variant';
import { readLegConfigSources, type LegConfigSourcesResolution } from './config-sources-read';
import { canonicalProtocolName } from './program-protocol';

/** The protocols whose declared Harvesters receive the read rule: observability-config (owner option A, 2026-11-25) and, after the
 *  registered widening controls passed (K8S-R3 and TF-R3 Harvesters + the rule, 3/3 each, 2026-11-26), kubernetes-gitops and
 *  terraform-iac. Pinned by scripts/test-config-sources-read-rule.ts. */
export const CONFIG_SOURCES_READ_RULE_PROTOCOLS: readonly string[] = Object.freeze([
  'observability-config-protocol', 'kubernetes-gitops-protocol', 'terraform-iac-protocol',
]);

export type ConfigSourcesReadRuleReason =
  | 'on'
  | 'pipeline-task'
  | 'not-a-harvester'
  | 'no-config-source-leg'
  | 'protocol-not-on-allow-list'
  | 'declaration-not-parsed'
  | 'gate-threw';

export interface ConfigSourcesReadRuleDecision {
  on: boolean;
  reason: ConfigSourcesReadRuleReason;
  /** The governing declaration's state when it was read (absent when the gate stopped before the read). */
  sourcesState?: string;
}

/** The pure decision. `owningLeg` / `sources` may be null when an earlier condition already answers. */
export function configSourcesReadRuleDecision(i: {
  taskType: string | null | undefined;
  agentRole: string | null | undefined;
  owningLeg: OwningLegResolution | null;
  sources: LegConfigSourcesResolution | null;
}): ConfigSourcesReadRuleDecision {
  if (i.taskType === 'PIPELINE') return { on: false, reason: 'pipeline-task' };
  if (!HARVEST_LEAF_ROLE_RE.test(i.agentRole ?? '')) return { on: false, reason: 'not-a-harvester' };
  const leg = i.owningLeg;
  if (!leg || (leg.kind !== 'leg' && leg.kind !== 'self') || !leg.configSourceProtocol) return { on: false, reason: 'no-config-source-leg' };
  if (!CONFIG_SOURCES_READ_RULE_PROTOCOLS.includes(canonicalProtocolName(leg.configSourceProtocol))) return { on: false, reason: 'protocol-not-on-allow-list' };
  if (!i.sources) return { on: false, reason: 'declaration-not-parsed' };
  if (i.sources.state !== 'parsed') return { on: false, reason: 'declaration-not-parsed', sourcesState: i.sources.state };
  return { on: true, reason: 'on', sourcesState: 'parsed' };
}

type Db = Parameters<typeof resolveOwningLegProtocol>[0] & Parameters<typeof readLegConfigSources>[0];

/**
 * The impure half, called by both execution adapters before the system prompt is built. Reads nothing unless conditions 1-2 hold,
 * and reads the leg row only when conditions 3-4 hold.
 */
export async function resolveConfigSourcesReadRule(
  db: Db,
  task: { id: string; type?: string | null; title?: string | null; metadata?: unknown },
  agentRole: string | null | undefined,
): Promise<ConfigSourcesReadRuleDecision> {
  try {
    const early = configSourcesReadRuleDecision({ taskType: task.type, agentRole, owningLeg: null, sources: null });
    if (early.reason === 'pipeline-task' || early.reason === 'not-a-harvester') return early;
    const owningLeg = await resolveOwningLegProtocol(db, task);
    const beforeRead = configSourcesReadRuleDecision({ taskType: task.type, agentRole, owningLeg, sources: null });
    if (beforeRead.reason !== 'declaration-not-parsed') return beforeRead;
    const sources = await readLegConfigSources(db, owningLeg);
    return configSourcesReadRuleDecision({ taskType: task.type, agentRole, owningLeg, sources });
  } catch {
    return { on: false, reason: 'gate-threw' };
  }
}

/**
 * The rule text (owner-approved design, 682 chars), PINNED byte for byte by scripts/test-config-sources-read-rule.ts.
 * Protocol-neutral: it names no observability-only wording, so widening the allow-list moves no text.
 */
export const CONFIG_SOURCES_READ_RULE_LINE =
  "Every line of the `## Config sources` block in your brief is a declared source of this leg, whatever else your brief says, " +
  "including a line whose file this leg's objective does not change: handle each line as your protocol says for its kind. " +
  "Your brief may limit what this leg changes; it never removes a declared line from what you read. " +
  "Never treat a declared line as another leg's, as outside this leg's scope, or as a file the block does not declare: " +
  "the rules for an undeclared file (read only as context, or named and not quoted) never apply to it. " +
  "The platform checks your reads against every declared line, and a declared Git file you did not read stops this leg's approval.";

/** The paragraph inserted into the brief: a platform label, then the rule. One paragraph, no heading. */
export const CONFIG_SOURCES_READ_RULE_PARAGRAPH = `**Config Sources Read Rule (Platform-Resolved):** ${CONFIG_SOURCES_READ_RULE_LINE}`;

/** The block's heading line, matched as a WHOLE line (trailing spaces / a CR allowed). The first such line is the block. */
const CONFIG_SOURCES_HEADING_LINE = /^## Config sources[ \t]*\r?$/;

export type ReadRuleAnchor = 'after-block' | 'end-of-description';

/**
 * Insert the rule into a brief. PURE. With a `## Config sources` heading line: after the block's LAST line — the block being the
 * heading and every following non-blank line — as `\n\n<paragraph>`, so the brief's next bytes follow unchanged. Without one (an
 * orchestrator that dropped the block): after the description, as `\n\n<paragraph>` (the paragraph alone for an empty one).
 * Removing the inserted `\n\n<paragraph>` always gives the brief back byte for byte.
 */
export function insertConfigSourcesReadRule(description: string | null | undefined): { text: string; anchor: ReadRuleAnchor; at: number } {
  const desc = typeof description === 'string' ? description : '';
  const insert = `\n\n${CONFIG_SOURCES_READ_RULE_PARAGRAPH}`;
  let offset = 0;
  let inBlock = false;
  let end = -1;
  for (const line of desc.split('\n')) {
    const lineEnd = offset + line.length; // index of this line's '\n' (or the end of the text)
    if (!inBlock) {
      if (CONFIG_SOURCES_HEADING_LINE.test(line)) { inBlock = true; end = lineEnd; }
    } else if (line.trim() === '') {
      break;
    } else {
      end = lineEnd;
    }
    offset = lineEnd + 1;
  }
  if (end >= 0) {
    // a CR ending the last block line stays with that line
    return { text: desc.slice(0, end) + insert + desc.slice(end), anchor: 'after-block', at: end };
  }
  if (!desc) return { text: CONFIG_SOURCES_READ_RULE_PARAGRAPH, anchor: 'end-of-description', at: 0 };
  return { text: desc + insert, anchor: 'end-of-description', at: desc.length };
}

/** A COPY of the task with the rule inserted into its description (the stored row is never touched). */
export function withConfigSourcesReadRule<T extends { description?: string | null }>(task: T): T {
  return { ...task, description: insertConfigSourcesReadRule(task.description).text };
}

/** THE one switch every caller uses (engine, stream route, lab rebuild): the gate's answer ⇒ the task BOTH builders render. OFF (any
 *  reason) ⇒ the SAME object back, so no byte of any other prompt moves. */
export function briefTaskFor<T extends { description?: string | null }>(task: T, decision: { on: boolean }): T {
  return decision.on === true ? withConfigSourcesReadRule(task) : task;
}
