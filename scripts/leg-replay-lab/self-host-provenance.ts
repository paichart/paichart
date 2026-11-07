/**
 * Leg replay lab — L-CS-N self-host PROVENANCE CHECK (ME-B3, audit F14; 2026-11-04). $0, no model call, no production read.
 *
 * A node snapshotted from a self-host install (snapshot.ts `provenance: self-host`) measures the platform's instrument only if that
 * install ran the instrument the lab pins. Before any cell runs on such a node, this check compares, per self-host snapshot:
 *   P1 protocol — the install's protocol row (read from the LOCAL restored dump) for the stamped `protocolInjection.delta`
 *      name@version: its sha256 = the lab's pinned text of that version (the golden pin, or the experiment baseline pin);
 *   P2 templates — each execution's frozen template `promptTemplate` sha256 = the pinned template of the same NAME and role
 *      (template ids differ per install; the text is what the agent read);
 *   P3 models — each execution's `modelUsed` = the production tier for its role (`AGENT_MODELS`: infraAuthor for
 *      `config_change_author`, infra for every other network role);
 *   P4 persisted verdict — the shipping parser on the persisted Reviewer text reproduces the stored verdict, and
 *      `parseConfidenceScore` reproduces the stored confidence (R-FWA3: approved / 92). The `--fake-llm persisted` run then
 *      reproduces it through the live path (a dry-run step, recorded in the pre-registration).
 * Any ✗ ⇒ the node is VOID (it measures a different instrument), never "close enough".
 */
import * as crypto from 'crypto';
import { AGENT_MODELS } from '../../lib/agents/model-tiers';
import { parseReviewerVerdict } from '../../lib/agents/harness/parse-verdict';
import { parseConfidenceScore } from '../../lib/agents/harness/parse-confidence';
import type { Snapshot } from './snapshot';

const sha = (t: string) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

export interface ProvenancePins {
  protocols: Record<string, { version: string; sha256: string }>;
  /** by template NAME (ids differ per install) */
  templates: Record<string, { role: string; sha256: string }>;
}
export interface ProtocolRow { name: string; version: string; sha256: string }
export interface ProvenanceCheck { name: string; ok: boolean; detail: string }

export function tierForRole(role: string): string {
  return role === 'config_change_author' ? AGENT_MODELS.infraAuthor : AGENT_MODELS.infra;
}

function parsed(b: { resultJson: string | null } | null): Record<string, any> | null {
  if (!b?.resultJson) return null;
  try { return JSON.parse(b.resultJson); } catch { return null; }
}

export function selfHostProvenanceChecks(snap: Snapshot, rows: ProtocolRow[], pins: ProvenancePins, expect?: { approved: boolean; confidence: number }): ProvenanceCheck[] {
  const out: ProvenanceCheck[] = [];
  out.push({ name: 'P0 provenance', ok: snap.provenance?.kind === 'self-host', detail: snap.provenance ? `${snap.provenance.source} dump ${snap.provenance.dumpSha256?.slice(0, 12) ?? '—'}` : 'not a self-host snapshot' });
  for (const which of ['author', 'reviewer'] as const) {
    const b = snap[which];
    if (!b) continue;
    const r = parsed(b);
    const role = String(r?.agentRole ?? b.task?.agentRole ?? '?');
    const delta = r?.protocolInjection?.delta as { name?: string; version?: string } | undefined;
    if (delta?.name) {
      const row = rows.find((x) => x.name === delta.name && x.version === delta.version);
      const pin = pins.protocols[delta.name];
      const ok = !!row && !!pin && pin.version === delta.version && row.sha256 === pin.sha256;
      out.push({ name: `P1 protocol (${which})`, ok, detail: `${delta.name}@${delta.version}: install ${row?.sha256.slice(0, 12) ?? 'no row'} · pin ${pin ? `${pin.version} ${pin.sha256.slice(0, 12)}` : 'none'}` });
    } else out.push({ name: `P1 protocol (${which})`, ok: false, detail: 'no stamped protocolInjection.delta' });
    const tpl = b.template as { name?: string; defaultRole?: string; promptTemplate?: string } | null;
    const tpin = tpl?.name ? pins.templates[tpl.name] : undefined;
    const tsha = tpl?.promptTemplate ? sha(tpl.promptTemplate) : null;
    out.push({ name: `P2 template (${which})`, ok: !!tpin && tsha === tpin.sha256 && tpin.role === role, detail: `${tpl?.name ?? '?'} (${role}): install ${tsha?.slice(0, 12) ?? '—'} · pin ${tpin ? tpin.sha256.slice(0, 12) : 'none'}` });
    const want = tierForRole(role);
    out.push({ name: `P3 model (${which})`, ok: b.exec.modelUsed === want, detail: `${role}: ran ${b.exec.modelUsed} · tier ${want}` });
  }
  if (snap.reviewer) {
    const rr = parsed(snap.reviewer);
    const v = parseReviewerVerdict(String(rr?.finalResponse ?? ''));
    const stored = rr?.reviewerVerdict ?? null;
    const conf = parseConfidenceScore(String(rr?.finalResponse ?? ''));
    const verdictOk = !!v && !!stored && v.approved === stored.approved && JSON.stringify(v.blocking) === JSON.stringify(stored.blocking);
    const expOk = !expect || (v?.approved === expect.approved && conf === expect.confidence);
    out.push({ name: 'P4 persisted verdict', ok: verdictOk && conf === (rr?.confidenceScore ?? null) && expOk,
      detail: `parser ${v ? (v.approved ? 'approved' : 'refused') : 'none'} / stored ${stored ? (stored.approved ? 'approved' : 'refused') : 'none'} · confidence parsed ${conf} / stored ${rr?.confidenceScore ?? null}${expect ? ` · expected ${expect.approved ? 'approved' : 'refused'}/${expect.confidence}` : ''}` });
  }
  return out;
}
