/**
 * validationToolCalls — the IMPURE half (see `validation-tool-calls.ts` for the why and the three sources).
 *
 * Reads, in order, all bounded:
 *   1. the Author's own stage → `metadata.harnessTaskId` → the LEG → its protocol (`resolveTaskProtocol`, the same two PK reads
 *      `rollbackContainment` makes for its lane). NOT a network-provisioning leg ⇒ `NOT_STAMPED` (a population answer): every
 *      other domain's result.json stays byte-identical. Network legs only — the measured class.
 *   2. the leg's Harvester sibling (`STAGE_CHILD_SCAN_CAP` search, the quoteFidelity Author-point precedent) → its authoritative
 *      `toolCalls`. From them: the services it CALLED (name → resolved serviceId from the success envelope's
 *      `data.metadata.targetServiceId`), the services it REGISTERED (`registry register` arguments → tool input schemas, when the
 *      registration carried them), and the SUCCESSFUL calls of each tool on each service (service-side validation errors excluded
 *      — the gateway records those as `success: true`).
 *   3. each resolved service ROW (`mcp_tools`, by id) → `capabilities.tools[].inputSchema`. A deleted row (self-provisioned
 *      services are deleted after the run) simply contributes nothing; the next source answers.
 * Keyed on the RESOLVED serviceId wherever the harvest resolved one (network-held-1, 2026-10-23), never on the name alone.
 */
import type { Prisma } from '@prisma/client';
import { readAuthoritativeResultField } from './authoritative-result-read';
import { canonicalProtocolName, resolveTaskProtocol } from './program-protocol';
import { NOT_STAMPED } from './net-registry';
import {
  computeValidationToolCalls, VALIDATION_TOOL_CALLS_SCOPE,
  type Resolution, type ToolKnowledge, type ValidationToolCall, type ValidationToolCallsIndex,
} from './validation-tool-calls';

export type ValidationToolCallsPrisma = Pick<Prisma.TransactionClient, 'task' | 'stage' | 'agentExecution' | 'agentArtifact' | '$queryRaw' | 'mCPTool'>;

const STAGE_CHILD_SCAN_CAP = 50;
/** A service-side argument rejection the gateway reports inside a `success: true` envelope (measured wordings). */
const SERVICE_VALIDATION_ERROR = /validation error|required parameter|invalid arguments|must have required/i;

type Schema = { required: string[]; properties: string[]; additionalProperties: boolean };

function schemaOf(t: unknown): Schema | null {
  if (!t || typeof t !== 'object') return null;
  const s = (t as { inputSchema?: unknown }).inputSchema as { required?: unknown; properties?: unknown; additionalProperties?: unknown } | undefined;
  if (!s || typeof s !== 'object') return null;
  const props = s.properties && typeof s.properties === 'object' ? Object.keys(s.properties as object) : [];
  const req = Array.isArray(s.required) ? (s.required as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  return { required: req, properties: props, additionalProperties: s.additionalProperties !== false };
}

function toolsWithSchemas(capabilities: unknown): Map<string, Schema | null> {
  const out = new Map<string, Schema | null>();
  let caps = capabilities;
  if (typeof caps === 'string') { try { caps = JSON.parse(caps); } catch { return out; } }
  const tools = caps && typeof caps === 'object' ? (caps as { tools?: unknown }).tools : null;
  if (!Array.isArray(tools)) return out;
  for (const t of tools) {
    if (typeof t === 'string') { if (!out.has(t)) out.set(t, null); continue; }
    const name = t && typeof t === 'object' ? (t as { name?: unknown }).name : null;
    if (typeof name === 'string') out.set(name, schemaOf(t) ?? out.get(name) ?? null);
  }
  return out;
}

function parseArgs(raw: unknown): Record<string, unknown> | null {
  let a = raw;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { return null; } }
  return a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, unknown>) : null;
}

/** The index the pure half resolves against, built from the Harvester's tool calls and the service rows. PURE given its inputs. */
export function buildValidationToolCallsIndex(
  harvestToolCalls: unknown,
  rows: ReadonlyMap<string, unknown>,
): ValidationToolCallsIndex & { serviceIds: string[] } {
  const nameToId = new Map<string, string>();
  const idToName = new Map<string, string>();
  const registered = new Map<string, Map<string, Schema | null>>(); // service NAME → tools
  const observed = new Map<string, string[][]>();                  // `${serviceId}\u0000${tool}` → successful key sets
  const toolServices = new Map<string, Set<string>>();             // tool → service ids it was called on
  const knownTools = new Set<string>();
  for (const c of Array.isArray(harvestToolCalls) ? harvestToolCalls : []) {
    const tc = c as Record<string, unknown>;
    const a = parseArgs(tc.arguments);
    if (!a) continue;
    if (tc.tool === 'registry' && a.action === 'register' && typeof a.name === 'string') {
      const tools = toolsWithSchemas(a.capabilities);
      const prev = registered.get(a.name) ?? new Map<string, Schema | null>();
      for (const [n, s] of tools) { prev.set(n, s ?? prev.get(n) ?? null); knownTools.add(n); }
      registered.set(a.name, prev);
      continue;
    }
    if (tc.tool !== 'services' || a.action !== 'call' || typeof a.tool !== 'string') continue;
    const result = tc.result as { content?: Array<{ data?: Record<string, unknown> }> } | undefined;
    const data = result?.content?.[0]?.data;
    const name = typeof data?.targetService === 'string' ? data.targetService : (typeof a.targetService === 'string' ? a.targetService : null);
    const meta = data?.metadata as { targetServiceId?: unknown } | undefined;
    const id = typeof meta?.targetServiceId === 'string' ? meta.targetServiceId : null;
    knownTools.add(a.tool);
    if (!id) continue;
    if (name) { nameToId.set(name, id); idToName.set(id, name); }
    (toolServices.get(a.tool) ?? toolServices.set(a.tool, new Set()).get(a.tool)!).add(id);
    const ok = tc.success !== false && data?.success !== false
      && !SERVICE_VALIDATION_ERROR.test(JSON.stringify(tc.result ?? '').slice(0, 4000));
    const args = parseArgs(a.arguments);
    if (ok && args) {
      const k = `${id}\u0000${a.tool}`;
      (observed.get(k) ?? observed.set(k, []).get(k)!).push(Object.keys(args));
    }
  }
  const rowTools = new Map<string, Map<string, Schema | null>>();
  for (const [id, caps] of rows) { const t = toolsWithSchemas(caps); rowTools.set(id, t); for (const n of t.keys()) knownTools.add(n); }

  const resolve = (call: ValidationToolCall): Resolution => {
    let id: string | null = null;
    let name: string | null = null;
    if (call.namedService) {
      if (idToName.has(call.namedService)) { id = call.namedService; name = idToName.get(id)!; }
      else if (nameToId.has(call.namedService)) { name = call.namedService; id = nameToId.get(name)!; }
      else if (registered.has(call.namedService)) name = call.namedService;
      else return { ok: false, reason: 'service-not-resolved' };
    } else {
      const ids = toolServices.get(call.tool);
      if (ids && ids.size === 1) { id = [...ids][0]; name = idToName.get(id) ?? null; }
      else if (ids && ids.size > 1) return { ok: false, reason: 'service-not-resolved' };
      else {
        const regs = [...registered].filter(([, t]) => t.has(call.tool));
        if (regs.length !== 1) return { ok: false, reason: 'service-not-resolved' };
        name = regs[0][0]; id = nameToId.get(name) ?? null;
      }
    }
    const rowSchema = id ? rowTools.get(id)?.get(call.tool) : null;
    if (rowSchema) return { ok: true, knowledge: { source: 'service-row', serviceId: id, ...rowSchema } };
    const regSchema = name ? registered.get(name)?.get(call.tool) : null;
    if (regSchema) return { ok: true, knowledge: { source: 'harvest-registration', serviceId: id, ...regSchema } };
    const sets = id ? observed.get(`${id}\u0000${call.tool}`) : undefined;
    if (sets && sets.length) {
      const carriedByAll = sets[0].filter((k) => sets.every((s) => s.includes(k)));
      const usedByAny = [...new Set(sets.flat())];
      const k: ToolKnowledge = { source: 'harvest-observed', serviceId: id, carriedByAll, usedByAny, calls: sets.length };
      return { ok: true, knowledge: k };
    }
    return { ok: false, reason: 'schema-not-registered' };
  };
  return { knownTools, resolve, serviceIds: [...idToName.keys()] };
}

/** The fact for one `config_change_author` persist, or NOT_STAMPED off network-provisioning legs. */
export async function computeValidationToolCallsFact(
  prisma: ValidationToolCallsPrisma,
  { taskId, deliverable }: { taskId: string; deliverable: string | null | undefined },
): Promise<Record<string, unknown>> {
  const self = await prisma.task.findUnique({ where: { id: taskId }, select: { stageId: true } });
  if (!self?.stageId) return NOT_STAMPED;
  const stage = await prisma.stage.findUnique({ where: { id: self.stageId }, select: { metadata: true } });
  const legId = (stage?.metadata as Record<string, unknown> | null)?.harnessTaskId;
  if (typeof legId !== 'string' || !legId) return NOT_STAMPED;
  const leg = await prisma.task.findUnique({ where: { id: legId }, select: { title: true, metadata: true } });
  const protocol = leg ? resolveTaskProtocol(leg).protocol : null;
  if (!protocol || canonicalProtocolName(protocol) !== canonicalProtocolName(VALIDATION_TOOL_CALLS_SCOPE)) return NOT_STAMPED;

  const siblings = await prisma.task.findMany({
    where: { stageId: self.stageId },
    select: { id: true, title: true, agentRole: true },
    orderBy: { createdAt: 'asc' },
    take: STAGE_CHILD_SCAN_CAP,
  });
  const harvestChild = siblings.find((c) =>
    (c.agentRole ?? '').toLowerCase().includes('harvest') || c.title.toLowerCase().startsWith('harvest'));
  let harvestToolCalls: unknown = [];
  if (harvestChild) {
    const raw = (await readAuthoritativeResultField(prisma, harvestChild.id, 'toolCalls')).value;
    if (raw) { try { harvestToolCalls = JSON.parse(raw); } catch { harvestToolCalls = []; } }
  }
  const pre = buildValidationToolCallsIndex(harvestToolCalls, new Map());
  const rows = new Map<string, unknown>();
  for (const id of pre.serviceIds.slice(0, 8)) {
    const row = await prisma.mCPTool.findUnique({ where: { id }, select: { capabilities: true } });
    if (row) rows.set(id, row.capabilities);
  }
  const index = rows.size ? buildValidationToolCallsIndex(harvestToolCalls, rows) : pre;
  return {
    ...computeValidationToolCalls(deliverable, index),
    ...(harvestChild ? { harvestSource: harvestChild.id } : { harvestSource: null }),
  };
}
