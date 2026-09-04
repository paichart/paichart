/**
 * Execution System-Prompt Injections — the shared INJECTION TAIL (convergence Phase 5a)
 *
 * Both agent execution paths assemble a system prompt in two parts:
 *
 *   HEAD (per-adapter, POLICY — deliberately NOT unified here): the resolution
 *   chain that produces the base prompt. The heads diverge on six policy axes
 *   (phase-5-prompt-construction-signoff.md 2a): resolution order, stored-prompt
 *   source, context builder, role value, caps/constraints placement, tool
 *   guidance. Engine: template → (structurally-dead userSystemPrompt) → fail-loud
 *   throw. Stream: storedSystemPrompt (useSystemPrompt gate) → template →
 *   role-fallback (LIVE — reachable via stored+toggle-off+no-template; PC-I3).
 *   Converging any axis is a 5b+ flagged behavior change — do NOT fold heads in.
 *
 *   TAIL (byte-identical across paths — THIS module): harness-context injection,
 *   protocol injection (loadProtocols:true all-tagged cap-10 · loadProtocols:'composed'
 *   base+stamped-delta, WS1 Phase C 2026-08-17 · protocol:<name> named-single), and the
 *   P10 Scope Self-Check append. Formerly inline-mirrored in
 *   agentExecutionEngine.ts buildSystemPrompt and stream/route.ts (:503-574
 *   region); prompt CONTENT was byte-identical, only pino log lines differed —
 *   unified engine-canonical here (cap-hit warn, named-protocol not-found warn,
 *   metadata-null tripwire — the stream gains these; log-only deltas, same
 *   absorption precedent as Phases 1/3).
 *
 * Final prompt layout (prepends stack): protocols → harness context → HEAD → scope self-check.
 *
 * Gate: scripts/test-system-prompt-injections.ts — golden bytes harvested from the
 * inline code BEFORE the swap (B1), per-adapter equivalence, ordering pins, and the
 * PC-I1 dead-branch guard (the engine call site must keep reading the structurally
 * dead `task.modelParameters?.systemPrompt` — "fixing" it to the metadata path would
 * resurrect a dead Priority-2 branch and change engine output).
 */

import type { ResolvedHarnessContext } from './harnessModeResolver';
import { UNIVERSAL_AGENT_RULES } from '../agents/universal-agent-rules';
import { isProgramProtocol, type TaskProtocolResolution } from '../agents/harness/program-protocol';


export interface SystemPromptInjectionLogger {
  info(data: Record<string, unknown>, msg: string): void;
  warn(data: Record<string, unknown>, msg: string): void;
}

/**
 * Minimal structural slice of PrismaClient the injections need (test-mockable).
 * Args are deliberately loose: PrismaClient's generic method signatures are not
 * assignable to narrowly-typed function members (contravariance), so we type the
 * RESULTS and let the call sites own the query shapes.
 */
export interface SystemPromptInjectionDb {
  agentPromptLibrary: {
    // description is schema-nullable; a null renders as "null" in the section header —
    // pre-existing inline behavior, preserved (byte gate). version/status are optional on the
    // row types so pre-Phase-C test mocks stay valid; the real selects request them.
    findMany(args: any): Promise<Array<{ name: string; description: string | null; promptText: string; version?: string | null }>>;
    findFirst(args: any): Promise<{ promptText: string; status?: string; version?: string | null } | null>;
  };
}

export interface SystemPromptInjectionContext {
  /** Platform-resolved harness mode (PIPELINE tasks) — null for non-pipeline. */
  harnessContext: ResolvedHarnessContext | null;
  /** The resolved template row (for the metadata-null tripwire) — null when running templateless. */
  template: { id: string; name: string } | null;
  /** template.metadata — drives protocol injection (loadProtocols: true|'composed' | protocol: 'name'). */
  templateMetadata: Record<string, unknown> | null;
  /** template.constraints (Json — array or key→desc object). Durable system-prompt guardrails (Axis 5). */
  constraints?: unknown;
  /**
   * PRE-RESOLVED task protocol identity (WS1 Phase C) — the output of
   * `resolveTaskProtocol(task)`, computed by the CALLER from ITS task object, never the task row
   * itself (object discipline FC6). Consumed only in `composed` mode. `undefined` means the call
   * site was not updated — composed mode tripwire-warns and behaves base-only rather than
   * silently mis-binding. The resolver, not this module, owns stamp-vs-title precedence, which is
   * what makes the stream's stale route-edge task snapshot CONVERGE with the DB stamp (F1): a
   * pre-stamp snapshot has no `metadata.protocol` key, so the resolver re-runs the same pure
   * title function the stamp writer ran.
   */
  taskProtocol?: TaskProtocolResolution | null;
}

/** The four injection modes. Parsed EXPLICITLY — an unrecognised truthy `loadProtocols` THROWS. */
export type ProtocolInjectionMode = 'all' | 'composed' | 'named' | 'none';

/**
 * The per-execution protocol-injection FACT (Protocol 10: verifiable truths only — what was
 * injected, from which rows, chosen how). Emitted as a structured log line at injection time and
 * persisted on result.json (before finalResponse, per the field-order contract).
 */
export interface ProtocolInjectionFact {
  mode: ProtocolInjectionMode;
  /** The protocol-base row (composed mode only). */
  base: { name: string; version: string | null } | null;
  /** The task-bound delta row actually injected (composed mode only). */
  delta: { name: string; version: string | null } | null;
  /** Names of all protocol bodies injected (all/named: the legacy lists; composed: base+delta). */
  protocolNames: string[];
  /** How the composed delta was chosen. 'none' outside composed mode / when nothing bound. */
  stampSource: 'stamp' | 'title-fallback' | 'template-metadata' | 'none';
  /** Chars of injected protocol preamble (rules + protocol bodies) — the attention observable. */
  preambleChars: number;
  /** Set when injection degraded below the configured mode (transient DB blip / leg-tier non-ACTIVE row). */
  degraded?: string;
}

/**
 * One rendered system-prompt segment. The internal composition of applySystemPromptInjections,
 * exported (Phase B amendment, 2026-08-17): the deferred cache-breakpoint split consumes this
 * list instead of re-parsing the joined string. Join of `text` in array order IS the prompt —
 * byte-identical to the legacy return (goldens pin it).
 */
export interface InjectionBlock {
  kind: 'rules' | 'protocols' | 'base' | 'delta' | 'harness' | 'basePrompt' | 'constraints' | 'scopeSelfCheck';
  text: string;
}

// P10 (task #82): TEMPLATE_MISMATCH escape hatch — appended to EVERY agent
// system prompt regardless of template/protocol. Lets an agent self-identify
// when assigned a task outside its role's scope. Pre-LLM detection (#90 P9)
// catches obvious verb-pattern mismatches; this LLM-side instruction catches
// the subtler cases the agent itself recognizes.
//
// Detection: the terminal-persist cascade scans finalResponse for the structured
// marker and sets errorCategory='TEMPLATE_MISMATCH_SELF_REPORTED' (distinct from
// P9's TEMPLATE_SCOPE_MISMATCH so the reactor can tell them apart — defense in
// depth per template-system-specialist 2026-04-16 design review).
// Exported (2026-07-07) so the Agent Builder preview can render the REAL scope self-check tail
// (pure static string) instead of describing it — keeps the preview in lockstep with the run-time prompt.
export const SCOPE_SELF_CHECK = `\n\n---\n\n## Scope Self-Check (escape hatch)\n\n` +
  `Before generating substantive content, evaluate whether this task is genuinely within your role's scope. Use these criteria:\n\n` +
  `- The task description aligns with the kind of work your role/template is designed for\n` +
  `- You have the required information, tools, or context to produce a useful result\n` +
  `- A different specialist role would NOT be a better fit for this task\n\n` +
  `**If this task is outside your scope, do NOT fabricate content.** Instead, return ONLY a structured marker and stop:\n\n` +
  `\`\`\`\n` +
  `[TEMPLATE_MISMATCH] This task does not match my role's scope.\n` +
  `Reason: <one-sentence explanation of why this is wrong-template, e.g. "Task asks for code implementation but my role is security review">\n` +
  `Suggested role: <which template type would be appropriate, e.g. "BUILDER">\n` +
  `\`\`\`\n\n` +
  `Use this escape hatch ONLY when you are confident the assignment is wrong — partial scope coverage is normal and you should proceed with what you CAN do, noting the rest in your output. The escape hatch is for the case where producing any content would be misleading.`;

// Axis 5: object-aware `## Constraints` block for durable, system-authority guardrail reinforcement.
// Mirrors §8's shape handling (build-agent-prompt-body.ts:263-269) but placed in the SYSTEM prompt
// (kept ALSO in §8 — DOUBLE: redundancy-for-recall is the mechanism). TWO DELIBERATE §8-vs-tail
// divergences — do NOT "fix" to byte-match §8: (1) the tail SANITIZES (BC61 <>-strip + 500-cap),
// §8 renders raw → the double is same-SEMANTIC, not byte-identical; (2) the tail suppresses an empty
// `## Constraints` header, §8 always emits it. The empty-return guard is LOAD-BEARING — it keeps the
// 13 injection goldens byte-stable when constraints are absent (test:system-prompt-injections).
export function renderConstraintsBlock(constraints: unknown): string {
  if (!constraints) return '';
  const sanitize = (s: unknown) => String(s ?? '').replace(/[<>]/g, '').slice(0, 500);
  const lines: string[] = [];
  if (Array.isArray(constraints)) {
    for (const c of constraints) lines.push(`• ${sanitize(c)}`);
  } else if (typeof constraints === 'object') {
    for (const [k, v] of Object.entries(constraints as Record<string, unknown>)) {
      lines.push(`• **${sanitize(k)}:** ${sanitize(v)}`);
    }
  }
  if (lines.length === 0) return '';
  return `\n\n---\n\n## Constraints\n\n${lines.join('\n')}`;
}

/**
 * Build the shared system-prompt injection tail as an ORDERED BLOCK LIST + the injection FACT.
 *
 * THROW vs DEGRADE — two orthogonal axes, both deliberate:
 *
 *   TRANSIENT vs DETERMINISTIC (2026-08-08, WS4 panel): a DB blip on any load path DEGRADES to a
 *   protocol-less prompt (retry may help); a config state retrying cannot fix THROWS. Throwing
 *   conditions: a named binding that doesn't resolve to an ACTIVE row (`NAMED_PROTOCOL_NOT_FOUND`),
 *   an unrecognised truthy `loadProtocols` value (`UNKNOWN_PROTOCOL_MODE`), composed mode with
 *   zero or multiple ACTIVE `protocol-base` rows (`PROTOCOL_BASE_NOT_FOUND` / `_AMBIGUOUS`), and a
 *   PROGRAM-tier stamped protocol whose row exists but is not ACTIVE (`PROTOCOL_ROW_NOT_ACTIVE`).
 *
 *   OPERATOR-BOUND vs TASK-AUTHORED (2026-08-17, WS1 Phase C — ae's authorship axis): the throws
 *   above all trace to OPERATOR configuration (template metadata, library rows, the seed) — loud
 *   failure reaches someone who can fix it. A LEG task stamped to a non-ACTIVE row is (post-stamp)
 *   task-authored state; it DEGRADES to base-only with a warn + a degradation fact + the misroute
 *   guard as the agent-side observable, because failing the run punishes the wrong author. The
 *   PROGRAM tier does NOT get that grace: the base carries ZERO PLAN-SPAWN content, so a program
 *   harness on base-only doesn't flail — it plausibly synthesizes a one-child "program" (the
 *   Kind-B catastrophe). Program-tier non-ACTIVE → hard-fail, by name.
 *
 * Position-neutral: callers invoke this post-claim on both paths
 * (agent-execution AE-I1 — do not move the call across the claim boundary).
 */
export async function buildSystemPromptInjectionBlocks(
  basePrompt: string,
  ctx: SystemPromptInjectionContext,
  db: SystemPromptInjectionDb,
  logger: SystemPromptInjectionLogger,
): Promise<{ blocks: InjectionBlock[]; fact: ProtocolInjectionFact }> {
  // ORDERED COMPOSITION (2026-08-04). This function used to build the prompt by successive
  // PREPENDS, which made code order and RENDERED order the reverse of each other. That is not a
  // style preference — it produced a live defect: the comment below once justified the Harness
  // Context position as "BEFORE protocol injection", describing the execution order while the
  // rendered order put it AFTER ~30 KB of protocol prose (inventory finding I-1). A reader cannot
  // hold a reversed order in their head while editing, and the pattern doc that recorded the wrong
  // one carried 98% confidence.
  //
  // Blocks are now appended in the order they RENDER, and joined once. Order is data, not a
  // consequence of statement sequence, so it can be read off the list and asserted directly.
  // Each block carries its own trailing separator so the output stays byte-identical to the
  // prepend form — the goldens in test-system-prompt-injections.ts pin that.
  const { harnessContext, template, templateMetadata, constraints, taskProtocol } = ctx;

  // Silent-failure tripwire: if we have a template but no metadata, log it loudly.
  // This catches the class of bugs where Prisma select omits metadata or the
  // execution record doesn't link to the template (both happened Apr 2026).
  if (template && !templateMetadata) {
    logger.warn({ templateName: template.name, templateId: template.id },
      'Agent template present but metadata is null — protocol injection will be skipped. Check Prisma select includes metadata field.');
  }

  // ── MODE PARSE (WS1 Phase C, 2026-08-17) — explicit and TOTAL over truthy values ─────────────
  // The old shape (`=== true` else-if `protocol`) silently landed any unrecognised value on
  // named/none — under it, `loadProtocols: 'composed'` would have run delta-only/no-protocol with
  // no signal (the fall-through trap, B4). Unrecognised TRUTHY values now throw (deterministic
  // config error — same class as the base-cardinality throws); falsy stays falsy (legacy shape).
  const lp = templateMetadata?.loadProtocols;
  let mode: ProtocolInjectionMode;
  if (lp === true) {
    mode = 'all';
  } else if (lp === 'composed') {
    mode = 'composed';
  } else if (!lp) {
    mode = templateMetadata?.protocol && typeof templateMetadata.protocol === 'string' ? 'named' : 'none';
  } else {
    logger.warn({ loadProtocols: lp, templateId: template?.id, errorCode: 'UNKNOWN_PROTOCOL_MODE' },
      'Template metadata.loadProtocols carries an unrecognised truthy value — refusing to guess an injection mode');
    throw new Error(
      `UNKNOWN_PROTOCOL_MODE: template metadata.loadProtocols is ${JSON.stringify(lp)} — ` +
      `recognised values are true (all), 'composed', and falsy (named/none). ` +
      `An unrecognised value silently landing on a different mode is exactly the failure this throw prevents.`
    );
  }

  const fact: ProtocolInjectionFact = {
    mode, base: null, delta: null, protocolNames: [], stampSource: 'none', preambleChars: 0,
  };

  let preambleBlocks: InjectionBlock[] = [];
  // Protocol injection (protocol-as-prompt architecture, Apr 2026; composed added 2026-08-17)
  // Injects orchestration protocol content from agent_prompt_library into the
  // system prompt based on template metadata flags. Three modes:
  //   loadProtocols: true        → PIPELINE tasks get ALL protocol-tagged prompts (legacy)
  //   loadProtocols: 'composed'  → base (protocol-base tag) + the task's ONE stamped protocol
  //   protocol: 'name'           → Specialist tasks get ONE named protocol
  // Design: TODO-PROTOCOL-EXPOSURE-v2.md | Plan: protocol-as-prompt-2026-04-10/ |
  //         cline_docs/reviews/ws1-phase-c-2026-08-17/SYNTHESIS.md
  // Pattern: prompt-library-gold-standard-pattern.md (Pattern #45)
  if (mode === 'all') {
    // ⚠️ BOTH-SET GUARD (2026-08-10, RE-SCOPED 2026-08-17). `loadProtocols: true` WINS and the
    // named protocol is discarded — correct precedence (pinned by the mode-parse golden), but
    // silent skipping is this codebase's most-repeated root cause, so it warns. SCOPE: this warn
    // is `true`-only — in 'composed' mode `protocol:<name>` is a legitimate FALLBACK rung
    // (template-metadata source), not a conflict, and does NOT warn.
    if (templateMetadata?.protocol) {
      logger.warn(
        { loadProtocols: true, ignoredProtocol: templateMetadata.protocol, templateId: template?.id },
        'Template sets BOTH loadProtocols and protocol — loadProtocols wins and the named protocol is IGNORED. ' +
        'Remove one: loadProtocols:true is the harness/PIPELINE shape, protocol:<name> is the specialist shape.'
      );
    }
    // NEW lattice cell (2026-08-17): a task STAMP under loadProtocols:true is quietly unused —
    // by design (the rollback path: un-flipping the template to `true` must be quiet-usable while
    // stamps keep being written). Info, not warn: nothing is wrong, the fact line records it.
    if (taskProtocol?.protocol) {
      logger.info(
        { ignoredTaskProtocol: taskProtocol.protocol, stampSource: taskProtocol.source },
        'loadProtocols:true injects ALL protocols — the task protocol stamp is not consulted in this mode'
      );
    }
    // PIPELINE tasks: inject ALL protocol-tagged prompts
    try {
      const protocols = await db.agentPromptLibrary.findMany({
        where: { tags: { has: 'protocol' }, status: 'ACTIVE' },
        select: { name: true, description: true, promptText: true, version: true },
        orderBy: { name: 'asc' },
        // NOTE: this 10-cap is mirrored in the Skills Builder guide
        // (components/prompt-library/PromptEditor.tsx "Tags & injection") — update both together.
        // Name-ordered ⇒ alphabetically-late ACTIVE protocol skills fall off the cap first, silently.
        take: 10, // Safety cap (prompt-construction-specialist Q7)
      });
      logger.info(
        { protocolCount: protocols.length, names: protocols.map((p) => p.name) },
        'Protocol injection for PIPELINE task'
      );
      // Cap-hit guard: findMany returning exactly the cap means an 11th+ ACTIVE protocol skill
      // may exist and was silently excluded. Surface it (silent drops otherwise read as "covered").
      if (protocols.length === 10) {
        logger.warn(
          { loadedProtocols: protocols.map((p) => p.name) },
          'Protocol injection hit the 10-skill cap — later (name-ordered) ACTIVE protocol skills are silently excluded from PIPELINE tasks'
        );
      }
      if (protocols.length > 0) {
        const protocolSection = protocols
          .map((p) => `### Protocol: ${p.name}\n${p.description}\n\n${p.promptText}`)
          .join('\n\n---\n\n');
        // UNIVERSAL_AGENT_RULES ONCE, ahead of all of them (2026-08-04, template-system rec #9).
        // It used to be concatenated into every protocol's promptText at seed time, so a PIPELINE
        // task loading six protocols received SIX copies — ~27 KB, 15% of the protocol block, every
        // turn. One copy, at the top, where a preamble belongs. Split into TWO blocks (rules |
        // protocols) whose join is byte-identical to the old single preambleBlock (goldens pin it).
        preambleBlocks = [
          { kind: 'rules', text: `${UNIVERSAL_AGENT_RULES}\n\n---\n\n` },
          { kind: 'protocols', text: `## Available Orchestration Protocols\n\n${protocolSection}\n\n---\n\n` },
        ];
        fact.protocolNames = protocols.map((p) => p.name);
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to load protocols — harness will use fallback planning');
      fact.degraded = 'PROTOCOL_LOAD_DB_ERROR';
    }
  } else if (mode === 'composed') {
    // ── COMPOSED: base + the task's ONE stamped protocol (WS1 Phase C, 2026-08-17) ──────────────
    // The task, not the template, names the delta — the template flip is one shared key on one
    // shared harness template; per-task identity rides the Phase A stamp via the caller's
    // pre-resolved `taskProtocol` (see the ctx field comment for the F1 convergence argument).
    let baseRow: { name: string; promptText: string; version?: string | null } | null = null;
    let baseRowCount = -1; // -1 = query did not complete (transient)
    try {
      const bases = await db.agentPromptLibrary.findMany({
        where: { tags: { has: 'protocol-base' }, status: 'ACTIVE' },
        select: { name: true, description: true, promptText: true, version: true },
        take: 2, // take:2 so AMBIGUITY is visible — findFirst would silently pick one (ae, D1.3)
      });
      baseRowCount = bases.length;
      baseRow = bases[0] ?? null;
    } catch (err) {
      // TRANSIENT — degrade protocol-less, as the module contract requires for DB blips.
      logger.warn({ err }, 'Failed to load protocol base — degrading to protocol-less prompt');
      fact.degraded = 'PROTOCOL_LOAD_DB_ERROR';
    }
    if (baseRowCount === 0) {
      // DETERMINISTIC: composed mode with no ACTIVE protocol-base row is operator config error —
      // every execution fails identically until the seed/tag is fixed. Outside the catch above.
      logger.warn({ errorCode: 'PROTOCOL_BASE_NOT_FOUND' },
        'loadProtocols:"composed" but no ACTIVE agent_prompt_library row carries the protocol-base tag');
      throw new Error(
        'PROTOCOL_BASE_NOT_FOUND: composed protocol injection requires exactly one ACTIVE ' +
        'prompt-library row tagged protocol-base; found none. Seed/tag the base or revert the template flip.'
      );
    }
    if (baseRowCount >= 2) {
      logger.warn({ errorCode: 'PROTOCOL_BASE_AMBIGUOUS' },
        'Multiple ACTIVE protocol-base rows — refusing to pick one silently');
      throw new Error(
        'PROTOCOL_BASE_AMBIGUOUS: more than one ACTIVE prompt-library row carries the protocol-base tag. ' +
        'Exactly one is the contract (the health-run reconciliation check pins it); retire the extras.'
      );
    }

    if (baseRow) {
      fact.base = { name: baseRow.name, version: baseRow.version ?? null };

      // Delta identity ladder (D2): stamp → title-fallback (resolver-internal) → template
      // metadata.protocol → base-only. `undefined` = call site not updated → tripwire.
      let deltaName: string | null = null;
      if (taskProtocol == null) {
        logger.warn({ errorCode: 'PROTOCOL_RESOLUTION_MISSING', templateId: template?.id },
          'composed mode but the call site supplied no taskProtocol resolution — behaving base-only. ' +
          'Pass resolveTaskProtocol(task) from the adapter.');
      } else if (taskProtocol.protocol) {
        deltaName = taskProtocol.protocol;
        fact.stampSource = taskProtocol.source === 'stamp' ? 'stamp' : 'title-fallback';
      } else if (taskProtocol.source === 'stamp') {
        // Stamped NULL: resolution ran at the chokepoint and found no token. Base-only is the
        // DOCUMENTED default for un-tokened pipelines (20/152 prod tasks at backfill) — info, no warn.
        fact.stampSource = 'stamp';
        logger.info({}, 'Task protocol stamp is null — base-only composition (the documented default)');
      } else if (templateMetadata?.protocol && typeof templateMetadata.protocol === 'string') {
        // Fallback rung: the template's own named binding (NOT a conflict in this mode — see the
        // both-set re-scope above). Canonicalization is the stamp writer's suffix rule.
        deltaName = templateMetadata.protocol.endsWith('-protocol')
          ? templateMetadata.protocol : `${templateMetadata.protocol}-protocol`;
        fact.stampSource = 'template-metadata';
      } else {
        logger.warn({ errorCode: 'PROTOCOL_STAMP_ABSENT', templateId: template?.id },
          'composed mode: task carries no protocol stamp, no title token, and the template binds none — base-only');
      }

      let deltaRow: { promptText: string; status?: string; version?: string | null } | null = null;
      let deltaLoadFailed = false;
      if (deltaName) {
        try {
          // NO status filter — deliberately unlike the named branch: nonexistent vs non-ACTIVE
          // are DIFFERENT failures here (the tier-split below needs to tell them apart).
          deltaRow = await db.agentPromptLibrary.findFirst({
            where: { name: deltaName },
            select: { promptText: true, status: true, version: true },
          });
        } catch (err) {
          logger.warn({ err, protocol: deltaName }, 'Failed to load stamped protocol — degrading to base-only');
          fact.degraded = 'PROTOCOL_LOAD_DB_ERROR';
          deltaLoadFailed = true;
        }
        if (!deltaLoadFailed) {
          if (!deltaRow) {
            // DETERMINISTIC (keeps a947df55's throw): a stamp naming a nonexistent row cannot be
            // fixed by retry. Canonical stamps (FC2) make this unreachable for correctly-stamped
            // tasks — reaching it means a protocol was RENAMED/deleted after stamping (recovery:
            // scripts/backfill-protocol-stamps.ts --rename) or a template binds a bad name.
            logger.warn({ protocol: deltaName, errorCode: 'NAMED_PROTOCOL_NOT_FOUND' },
              'Stamped/bound protocol name does not resolve to any prompt-library row — refusing to run mis-bound');
            throw new Error(
              `NAMED_PROTOCOL_NOT_FOUND: composed injection resolved protocol "${deltaName}" ` +
              `(source: ${fact.stampSource}) but no agent_prompt_library row has that name. ` +
              `Fix the stamp (backfill --rename) or the template binding.`
            );
          } else if (deltaRow.status !== 'ACTIVE') {
            // ── FC9 TIER-SPLIT (D2 — the panel's resolved 2-2) ────────────────────────────────
            if (isProgramProtocol(deltaName)) {
              // PROGRAM tier: the base has ZERO PLAN-SPAWN content — base-only would plausibly
              // synthesize a one-child "program" (Kind-B). Hard-fail, by name. Note: under
              // composed mode DRAFT's remaining meaning IS "not yet runnable" — non-injection
              // elsewhere is automatic (a stamp must name it), so this throw is the lifecycle.
              logger.warn({ protocol: deltaName, status: deltaRow.status, errorCode: 'PROTOCOL_ROW_NOT_ACTIVE' },
                'PROGRAM-tier protocol row exists but is not ACTIVE — hard-failing rather than base-only synthesis');
              throw new Error(
                `PROTOCOL_ROW_NOT_ACTIVE: program-tier protocol "${deltaName}" is ${deltaRow.status}, not ACTIVE. ` +
                `A program harness composed on the base alone would silently synthesize a malformed program ` +
                `(the base carries no PLAN-SPAWN mechanics). Activate the protocol or re-route the task.`
              );
            }
            // LEG tier: task-authored state — degrade to base-only, loudly, with the fact +
            // the misroute guard (## Active Protocol absence) as the agent-side observable.
            logger.warn({ protocol: deltaName, status: deltaRow.status, errorCode: 'PROTOCOL_ROW_NOT_ACTIVE' },
              'Leg-tier protocol row exists but is not ACTIVE — composing base-only (degradation fact recorded)');
            fact.degraded = 'PROTOCOL_ROW_NOT_ACTIVE_LEG_BASE_ONLY';
            deltaRow = null;
          }
        }
      }

      preambleBlocks = [
        { kind: 'rules', text: `${UNIVERSAL_AGENT_RULES}\n\n---\n\n` },
        // Headings are pc-owned (R5) and PINNED — the misroute guard and the protocol fences
        // key off these exact strings. One decision site; change them nowhere else.
        { kind: 'base', text: `## Harness Operating Base\n\n${baseRow.promptText}\n\n---\n\n` },
      ];
      fact.protocolNames = [baseRow.name];
      if (deltaRow && deltaName) {
        preambleBlocks.push({
          kind: 'delta',
          text: `## Active Protocol: ${deltaName} (governs; overrides the base where they differ)\n\n${deltaRow.promptText}\n\n---\n\n`,
        });
        fact.delta = { name: deltaName, version: deltaRow.version ?? null };
        fact.protocolNames.push(deltaName);
      }
    }
  } else if (mode === 'named') {
    const namedProtocol = templateMetadata?.protocol as string; // mode parse guarantees non-empty string
    // Specialist tasks: inject ONE named protocol
    //
    // TWO FAILURE KINDS, DELIBERATELY TREATED DIFFERENTLY (2026-08-08, WS4 panel).
    // This module's stated contract is that protocol-loading problems DEGRADE rather than fail
    // (see the header: a DB blip must not fail a run). That contract is right for TRANSIENT
    // faults and wrong for DETERMINISTIC ones, and the old code could not tell them apart —
    // both landed on a logger.warn and the agent ran with NO PROTOCOL AT ALL.
    //
    //   - NAME DOES NOT RESOLVE  → deterministic config error. Retrying cannot help; every
    //     future execution of this template fails identically. THROW.
    //   - QUERY THREW            → transient (DB blip). Retrying can help. WARN + degrade, as before.
    //
    // Why the throw matters more than it looks: on a LEAF this is survivable (the specialist
    // improvises and produces something plausible-but-unguided). On a HARNESS bound to a single
    // protocol it is silent catastrophic degradation — zero orchestration mechanics, no mode
    // procedures, no tool-call syntax — and the run still reports SUCCESS. architectural-review
    // graded it BLOCKING for any future `base + one` design, which would put this branch on the
    // harness path. Pre-checked against prod before flipping: all 5 distinct bound protocol
    // names on live agent_templates resolve, so nothing in production changes behaviour today.
    // The two states are carried by SEPARATE variables, not by a sentinel value smuggled into
    // the string. A magic-string sentinel was tried first and was a mistake in two ways: it made
    // `null` mean two different things depending on a second convention, and the NUL-prefixed
    // form I reached for put a literal 0x00 byte in this source file — which makes `grep` skip
    // the whole file silently, so every grep-based check on it returns a false zero. A boolean
    // says the same thing, in the type system, with no byte tricks.
    let namedProtocolText: string | null = null;
    let namedProtocolVersion: string | null = null;
    let protocolLoadDegraded = false;
    try {
      const protocol = await db.agentPromptLibrary.findFirst({
        where: { name: namedProtocol, status: 'ACTIVE' },
        select: { promptText: true, version: true },
      });
      namedProtocolText = protocol?.promptText ?? null;
      namedProtocolVersion = protocol?.version ?? null;
    } catch (err) {
      // TRANSIENT only. Deliberately NOT rethrown — preserves the degrade-don't-fail contract.
      logger.warn({ err, protocol: namedProtocol }, 'Failed to load named protocol');
      protocolLoadDegraded = true;
    }

    if (protocolLoadDegraded) {
      // fall through with no protocol — transient, degrade as before
      fact.degraded = 'PROTOCOL_LOAD_DB_ERROR';
    } else if (namedProtocolText === null) {
      // DETERMINISTIC. Loud, outside the catch above so it cannot be swallowed.
      // `warn` not `error`: the injectable logger interface is deliberately minimal (info/warn)
      // so test stubs stay light, and widening it to carry one call would ripple through every
      // stub. The THROW is the loud signal here; this line only carries the grep key.
      logger.warn(
        { protocol: namedProtocol, errorCode: 'NAMED_PROTOCOL_NOT_FOUND' },
        'Bound protocol name does not resolve to an ACTIVE prompt-library row — refusing to run the agent with no protocol'
      );
      throw new Error(
        `NAMED_PROTOCOL_NOT_FOUND: template metadata binds protocol "${namedProtocol}", ` +
        `which is not an ACTIVE row in agent_prompt_library. Running the agent with no protocol at all ` +
        `would silently produce unguided output. Fix the binding or activate the protocol.`
      );
    } else {
      // Same single injection for the specialist path — one protocol, one preamble. Split into
      // rules|protocols blocks whose join is byte-identical to the old single string (goldens).
      preambleBlocks = [
        { kind: 'rules', text: `${UNIVERSAL_AGENT_RULES}\n\n---\n\n` },
        { kind: 'protocols', text: `## Protocol\n\n${namedProtocolText}\n\n---\n\n` },
      ];
      fact.protocolNames = [namedProtocol];
      fact.delta = { name: namedProtocol, version: namedProtocolVersion };
      logger.info({ protocol: namedProtocol }, 'Injected named protocol into specialist system prompt');
    }
  }

  // Axis 5: durable guardrail constraints, just before the scope self-check — both sit in the
  // hard-boundary tail (above tool outputs, re-attended every turn with system authority). Kept
  // ALSO in USER §8 (double). Empty/absent → '' (no-op), preserving the injection goldens.
  // THE RENDERED ORDER, as data. Read this list to know what an agent sees, top to bottom.
  // Changing the order means moving a line here — not reasoning about prepend sequence.
  // ── DECIDED 2026-08-04: THIS ORDER STAYS. Do not "fix" it by moving harnessBlock up. ──────────────
  // Inventory finding I-1 observed that protocol prose is written as branches ("in CREATE mode do X, in
  // ORCHESTRATE do Y…") and the agent reads up to ~30 KB of those branches BEFORE the mode block tells it
  // which one applies. prompt-construction called it the strongest primacy-slot claim in the file, and
  // moving it is one line — which is exactly why it needs a recorded decision rather than a drive-by edit.
  //
  // Weighed and REJECTED, on these grounds:
  //   • It cannot cause a wrong outcome. Mode is resolved SERVER-SIDE (harnessModeResolver) and the agent
  //     is TOLD its mode; it never infers one. The cost is attention spent on branches that do not apply,
  //     not a mode error.
  //   • Nothing in any run has been traced to this ordering. There is no defect to point at.
  //   • The improvement would be diffuse prompt quality across every PIPELINE agent — unmeasurable at our
  //     run volume, so a subtly WORSE outcome would be equally undetectable.
  //   • The current position is not a dumping ground: the mode block sits immediately before the role
  //     guidance and task context, which is also a high-attention region.
  //
  // The genuinely bad half of I-1 is already fixed and is NOT this: a comment here used to assert the mode
  // was injected "BEFORE protocol injection" (citing a pattern doc at 98% confidence) while the opposite
  // rendered, because assembly was a prepend chain. That misdescription is gone and the ordered-composition
  // form makes it unrepresentable. What remained was a preference with no evidence either way.
  //
  // Reopen only with a run that shows a mode-conditional instruction being misapplied.
  // Full reasoning: cline_docs/reviews/prose-architecture-2026-08-04/LAYER-INVENTORY-PASS-2.md

  // Phase 4 mode-resolver (2026-04-26): the Harness Context block. Built AFTER the protocol
  // branches in CODE (composed mode's binding line needs the resolved delta) but rendered in the
  // same position as always — order is the block list below, not statement sequence.
  let harnessBlock = '';
  if (harnessContext) {
    // Sanitize Handlebars-like literals in reason string (per prompt-construction 4.4)
    const safeReason = harnessContext.reason.replace(/\{\{/g, '\\{\\{');
    // B5 (composed only — legacy-mode bytes unchanged): the agent must be able to READ its
    // binding. Static prose in the base states WHAT a binding is; this line states THIS task's.
    const bindingLine = mode === 'composed'
      ? `Protocol binding: ${fact.delta ? fact.delta.name : 'base only'}\n`
      : '';
    harnessBlock = `## Harness Context (Platform-Resolved)\n\n` +
      `**Your mode is: ${harnessContext.mode}**\n\n` +
      `Reason: ${safeReason}\n` +
      `Resolved at: ${harnessContext.resolvedAt}\n` +
      (harnessContext.pipelineStageId ? `Pipeline stage ID: \`${harnessContext.pipelineStageId}\`\n` : '') +
      (harnessContext.childStageTaskCount !== undefined
        ? `Child stage tasks: ${harnessContext.childStageTerminalCount}/${harnessContext.childStageTaskCount} terminal\n` : '') +
      bindingLine +
      `\nThis is platform ground truth — proceed accordingly.\n\n---\n\n`;
  }

  const blocks: InjectionBlock[] = [
    ...preambleBlocks,                                                  // universal rules + protocol section(s)
    { kind: 'harness', text: harnessBlock },                            // platform-resolved mode (+ composed binding)
    { kind: 'basePrompt', text: basePrompt },                           // the agent's own template
    { kind: 'constraints', text: renderConstraintsBlock(constraints) }, // Axis 5 durable guardrails
    { kind: 'scopeSelfCheck', text: SCOPE_SELF_CHECK },                 // P10 escape hatch
  ];

  fact.preambleChars = preambleBlocks.reduce((n, b) => n + b.text.length, 0);
  // The per-execution observability line (B2) — fires in ALL FOUR modes, one line, structured.
  // Call sites bind execution identity via logger.child({executionId, taskId, templateId}).
  logger.info({ protocolInjection: fact as unknown as Record<string, unknown> }, 'Protocol injection resolved');

  return { blocks, fact };
}

/**
 * Joining façade + fact — the shape both adapters consume (the fact threads into
 * ExecutionCoreInput → result.json `protocolInjection`, emitted before finalResponse).
 */
export async function applySystemPromptInjectionsWithFact(
  basePrompt: string,
  ctx: SystemPromptInjectionContext,
  db: SystemPromptInjectionDb,
  logger: SystemPromptInjectionLogger,
): Promise<{ prompt: string; protocolInjection: ProtocolInjectionFact }> {
  const { blocks, fact } = await buildSystemPromptInjectionBlocks(basePrompt, ctx, db, logger);
  return { prompt: blocks.map((b) => b.text).join(''), protocolInjection: fact };
}

/**
 * Legacy string façade (goldens + non-fact callers). Byte-identical to the pre-Phase-C return —
 * the block list is an internal decomposition whose join IS the old string.
 */
export async function applySystemPromptInjections(
  basePrompt: string,
  ctx: SystemPromptInjectionContext,
  db: SystemPromptInjectionDb,
  logger: SystemPromptInjectionLogger,
): Promise<string> {
  return (await applySystemPromptInjectionsWithFact(basePrompt, ctx, db, logger)).prompt;
}
