/**
 * Leg replay lab — OBJECTIVE OF RECORD: serve a requirements Reviewer's objective fetch from its own stored answer.
 *
 * WHY (owner, 2026-11-10; REQ-PROMPT-TOOL-CALL-CLASH): requirements_reviewer guidance check 8.2 (since 1.7.1, 2026-09-29)
 * tells the Reviewer to fetch the objective of record with `project(action:"task.context", taskId:<pipeline task id>)`
 * and, if the fetch fails, to raise ONE blocking issue "citations unverifiable: no objective of record". Production
 * served that fetch on 31 of 31 runs (0 refused as unverifiable). The lab answered it with the stub (live.ts
 * `TOOL_STUB_RESULT`), so live lab Reviewer samples could refuse "citations unverifiable" — a lab-made false refusal
 * (seen in the 2026-11-09 Phase B lab: RS-NONNET step b and its R1 re-measure, RS-REFUSE-DROP s03).
 *
 * WHAT IS SERVED. The Reviewer execution's OWN stored `toolCalls[i].result` for its `project task.context` call — the
 * raw object production's `executeToolOnServer` returned — handed back through the same seam the recorded-tools tier
 * uses, so the SHIPPING loop applies R9, the Tier-1 LLM cap and the read_more pager to it exactly as in production.
 * Nothing is composed: no text is invented, no formatter is re-run.
 *
 * WHEN IT IS SERVED (all must hold, else today's behaviour — the stub — and the reason is recorded BY NAME in the node's
 * manifest entry `objectiveOfRecord` and in every sample's `reviewerTools`):
 *   - the node's Reviewer is a requirements_reviewer;
 *   - its stored execution made a successful `project task.context` call on the LEG (the pipeline task the snapshot
 *     carries as `leg`), not truncated at persist;
 *   - the stored answer contains the snapshot leg's description byte for byte (`served`), OR the node's `inputEdits` changed
 *     the objective of record and the stored answer carries the PRE-EDIT description exactly once, inside one content block:
 *     then that one span is replaced by the edited description (`served-input-edited`) — every byte is the stored answer
 *     or the node's own declared input edit, the same edit the lab already writes into the leg and the child briefs (the
 *     harness is not replayed). Anything else — `objective-edited` — keeps the stub (the stored answer would carry the
 *     OLD objective).
 * Only a call with `action: "task.context"` and `taskId` = that leg id is served (repeats get the same bytes). Every other
 * Reviewer call gets the stub, as before, logged `unserved`.
 *
 * LAB SERIES CUT (LAB-EXPERIMENT-LEDGER): from this commit a LIVE requirements Reviewer cell sees the objective of record
 * where it saw the stub. Prompts are unchanged (a tool answer, not prompt text); `--fake-llm persisted` replays the
 * Reviewer's stored calls through this tier and reproduces every stored verdict.
 */
import type { Snapshot } from './snapshot';
import { parsedResult } from './rebuild';
import { storedCallsOf, type RecordedToolServer, type ServeLogEntry, type StoredCall } from './recorded-tools';

export type ObjectiveState = 'served' | 'served-input-edited'
  | 'not-requirements-reviewer' | 'no-stored-fetch' | 'fetch-failed' | 'truncated-at-persist' | 'other-task' | 'objective-edited' | 'no-leg';
export interface ObjectiveSource {
  state: ObjectiveState;
  /** Why (for every state but `served`, the reason today's stub is kept). */
  reason: string;
  legId: string | null;
  stored: StoredCall | null;
  /** The answer served (the stored raw result, or its input-edited copy); null unless served*. */
  answer: unknown;
  /** The stored answer's text chars (served only). */
  answerChars: number | null;
}

const textOf = (r: unknown): string => {
  if (typeof r === 'string') return r;
  const c = (r as any)?.content;
  return Array.isArray(c) ? c.map((x: any) => (typeof x?.text === 'string' ? x.text : '')).join('') : JSON.stringify(r ?? null);
};
const argsObj = (a: unknown): Record<string, any> => {
  if (a && typeof a === 'object') return a as Record<string, any>;
  if (typeof a === 'string') { try { const p = JSON.parse(a); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }
  return {};
};
export const isObjectiveFetch = (tool: string, args: unknown, legId: string | null): boolean => {
  const a = argsObj(args);
  return tool === 'project' && a.action === 'task.context' && legId !== null && a.taskId === legId;
};

/** The node's objective-of-record source, from the (possibly input-edited) snapshot. Pure; reads no DB. */
export function objectiveOfRecordSource(snap: Snapshot, preEditLegDescription: string | null = null): ObjectiveSource {
  const none = (state: ObjectiveState, reason: string, legId: string | null = null, stored: StoredCall | null = null): ObjectiveSource => ({ state, reason, legId, stored, answer: null, answerChars: null });
  const role = snap.reviewer?.task?.agentRole ?? parsedResult(snap.reviewer)?.agentRole ?? null;
  if (!snap.reviewer || role !== 'requirements_reviewer') return none('not-requirements-reviewer', `reviewer role ${role ?? 'none'}`);
  const legId = typeof snap.leg?.id === 'string' ? snap.leg.id : null;
  const desc = typeof snap.leg?.description === 'string' ? snap.leg.description : null;
  if (!legId || !desc) return none('no-leg', 'the snapshot carries no leg (pipeline task) with a description');
  const fetches = storedCallsOf(snap.reviewer).filter((s) => s.tool === 'project' && argsObj(s.args).action === 'task.context');
  if (!fetches.length) return none('no-stored-fetch', 'the stored Reviewer execution made no project task.context call', legId);
  const onLeg = fetches.filter((s) => argsObj(s.args).taskId === legId);
  if (!onLeg.length) return none('other-task', `stored task.context call(s) name ${fetches.map((s) => argsObj(s.args).taskId).join(', ')}, not the leg ${legId}`, legId);
  const ok = onLeg.find((s) => s.success && !s.truncatedAtPersist);
  if (!ok) {
    const s = onLeg[0];
    return s.success ? none('truncated-at-persist', `stored call ${s.index} was truncated at persist`, legId, s) : none('fetch-failed', `stored call ${s.index} failed: ${s.error ?? 'no error text'}`, legId, s);
  }
  const text = textOf(ok.result);
  if (text.includes(desc)) return { state: 'served', reason: `Reviewer's stored task.context answer (call ${ok.index}, ${text.length} chars) on leg ${legId}`, legId, stored: ok, answer: ok.result, answerChars: text.length };
  const pre = preEditLegDescription;
  const blocks = Array.isArray((ok.result as any)?.content) ? (ok.result as any).content as Array<Record<string, any>> : null;
  const once = (t: string, x: string) => t.split(x).length === 2;
  const hit = pre && pre !== desc && blocks ? blocks.findIndex((b) => typeof b?.text === 'string' && once(b.text, pre)) : -1;
  if (pre && blocks && hit >= 0 && once(text, pre)) {
    const answer = JSON.parse(JSON.stringify(ok.result));
    const t: string = answer.content[hit].text; const at = t.indexOf(pre);
    answer.content[hit].text = t.slice(0, at) + desc + t.slice(at + pre.length);
    const chars = textOf(answer).length;
    return { state: 'served-input-edited', reason: `Reviewer's stored task.context answer (call ${ok.index}) with its one copy of the pre-edit objective replaced by the node's input-edited objective (${text.length} → ${chars} chars) on leg ${legId}`, legId, stored: ok, answer, answerChars: chars };
  }
  return none('objective-edited', `stored answer (call ${ok.index}) carries neither the snapshot leg description nor exactly one copy of the pre-edit one`, legId, ok);
}

/**
 * One server per Reviewer SAMPLE. Serves the objective fetch from `src` when it is `served`; every other call → `stub`.
 * `LAB_TEST_OBJECTIVE_MUTATION=unserve` (test only) returns the stub for the fetch too — the RED mutation.
 */
export function createObjectiveToolServer(src: ObjectiveSource, stub: unknown): RecordedToolServer {
  const log: ServeLogEntry[] = [];
  return {
    log,
    async getToolDefinition(name: string) { return { serverName: (name === 'project' && src.stored?.server) || 'leg-replay-lab-stub', tool: { name } }; },
    async executeToolOnServer(_server: string, tool: string, args: unknown) {
      const a = argsObj(args);
      const entry: ServeLogEntry = { tool, action: typeof a.action === 'string' ? a.action : null, innerTool: null, fileTool: false, tier: 'unserved', storedIndex: null };
      log.push(entry);
      if (!src.state.startsWith('served') || !src.stored || !isObjectiveFetch(tool, args, src.legId)) return stub;
      if (process.env.LAB_TEST_OBJECTIVE_MUTATION === 'unserve') return stub;
      entry.tier = 'objective-of-record'; entry.storedIndex = src.stored.index;
      return src.answer;
    },
  };
}

/** The manifest/sample summary (no stored bytes). */
export const objectiveSummary = (s: ObjectiveSource) => ({ state: s.state, reason: s.reason, legId: s.legId, storedIndex: s.stored?.index ?? null, answerChars: s.answerChars });
