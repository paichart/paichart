/**
 * Leg replay lab — DESCRIPTOR FETCH tier (2026-11-26, read-rule widening controls, owner option (c) after W-4 #2 / W-5).
 *
 * WHY. A Harvester may fetch a declared live-read line's descriptor URL with the browser service (`services call
 * browser-automation-service scrape_page { url, selectors: { <key>: 'pre' } }`) before it registers by that URL. A stored run that
 * never made that call leaves the recorded tier nothing to serve, so the sample read the lab stub — invalid by the owner's ruling
 * (W-4 #2, W-5). This tier answers that ONE call truthfully: the descriptor's real published bytes at a pinned commit, inside the
 * envelope the browser service actually returned for such a call in another stored execution.
 *
 * SCOPE (narrow, every condition required; anything else falls through, and stays unserved):
 *   - the node names the URL in `descriptorFetch.files`, and the URL is the `service` of a DECLARED live-read line of this node's
 *     governing Config-sources declaration (checked at load);
 *   - the URL is a raw.githubusercontent.com paichart/paichart `descriptors/*.json` path;
 *   - the bytes are pinned: `commit` (40 hex) + the file's git blob sha-1, recomputed from the committed copy at load;
 *   - the call is `services` → `browser-automation-service` → `scrape_page` with inner arguments exactly `{ url, selectors }`, and
 *     `selectors` has exactly ONE entry whose value is `'pre'` (a raw JSON page renders as one <pre>; the service returns its text
 *     under that key — the envelope source shows exactly this). Any other selector form is not modelled: unserved.
 *   - the node's own record is served FIRST (recorded tiers); this tier only answers a call the record does not hold.
 *
 * THE ENVELOPE comes from `envelopeFrom` (a cached stored execution, read at load, never committed — it carries account fields): its
 * one successful `scrape_page` call with a one-key `'pre'` selector. The answer is a deep copy with exactly two things replaced: the
 * echoed `arguments` (the sample's own) and `data[0]` (`{ <key>: <pinned bytes> }`) inside the inner text, which is re-serialised
 * compactly — refused at load unless that serialisation reproduces the source text byte for byte. Its timing / `_meta` fields are the
 * source call's (stale timestamps; never a scored fact).
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { StoredCall } from './recorded-tools';

export interface DescriptorFetchSpec {
  /** The stored execution whose browser-service answer gives the envelope (must be in the lab cache). */
  envelopeFrom: string;
  /** The paichart/paichart commit the bytes were taken at. */
  commit: string;
  /** URL → the committed copy (relative to the experiment) and its git blob sha-1. */
  files: Record<string, { file: string; blobSha1: string }>;
}

export interface LoadedDescriptorFetch { spec: DescriptorFetchSpec; answers: Map<string, string>; envelope: Record<string, any>; envelopeIndex: number }

const URL_RE = /^https:\/\/raw\.githubusercontent\.com\/paichart\/paichart\/[A-Za-z0-9._-]+\/descriptors\/[A-Za-z0-9._-]+\.json$/;
export const gitBlobSha1 = (bytes: Buffer): string => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');

const parse = (v: unknown): any => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
const preKey = (sel: unknown): string | null => {
  if (!sel || typeof sel !== 'object' || Array.isArray(sel)) return null;
  const e = Object.entries(sel as Record<string, unknown>);
  return e.length === 1 && e[0][1] === 'pre' ? e[0][0] : null;
};
/** The inner `scrape_page` arguments of a browser-service call, or null when the call is not one. */
export function scrapeArgsOf(tool: string, args: unknown): { url: unknown; selectors: unknown; keys: string[] } | null {
  const a = parse(args);
  if (tool !== 'services' || !a || a.action !== 'call' || a.targetService !== 'browser-automation-service' || a.tool !== 'scrape_page') return null;
  const inner = parse(a.arguments ?? {});
  if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return null;
  return { url: inner.url, selectors: inner.selectors, keys: Object.keys(inner).sort() };
}

export function loadDescriptorFetch(spec: DescriptorFetchSpec, dir: string, declaredLiveServices: readonly string[], envelopeCalls: readonly StoredCall[], where: string): LoadedDescriptorFetch {
  if (!spec || typeof spec !== 'object') throw new Error(`${where}: descriptorFetch is { envelopeFrom, commit, files }`);
  const extra = Object.keys(spec).filter((k) => !['envelopeFrom', 'commit', 'files'].includes(k));
  if (extra.length) throw new Error(`${where}: descriptorFetch field(s) ${extra.join(', ')} refused`);
  if (!/^[0-9a-f]{40}$/.test(spec.commit ?? '')) throw new Error(`${where}: descriptorFetch.commit must be a full 40-hex commit sha`);
  const answers = new Map<string, string>();
  for (const [url, f] of Object.entries(spec.files ?? {})) {
    if (!URL_RE.test(url)) throw new Error(`${where}: descriptorFetch URL ${url} is not a paichart/paichart descriptors/*.json raw URL`);
    if (!declaredLiveServices.includes(url)) throw new Error(`${where}: descriptorFetch URL ${url} is not the service of a declared live-read line of this node (declared: ${declaredLiveServices.join(', ') || 'none'})`);
    const bytes = fs.readFileSync(path.resolve(dir, f.file));
    const got = gitBlobSha1(bytes);
    if (got !== f.blobSha1) throw new Error(`${where}: descriptorFetch ${f.file} blob ${got} ≠ the pinned ${f.blobSha1}`);
    answers.set(url, bytes.toString('utf8'));
  }
  if (!answers.size) throw new Error(`${where}: descriptorFetch names no file`);
  const src = envelopeCalls.filter((c) => c.success && !c.truncatedAtPersist && (() => { const s = scrapeArgsOf(c.tool, c.args); return !!s && preKey(s.selectors) !== null; })());
  if (src.length !== 1) throw new Error(`${where}: descriptorFetch.envelopeFrom ${spec.envelopeFrom} must hold exactly ONE successful scrape_page call with a one-key 'pre' selector (found ${src.length})`);
  const env = JSON.parse(JSON.stringify(src[0].result)) as Record<string, any>;
  const data = env?.content?.[0]?.data;
  const text = data?.result?.content?.[0]?.text;
  if (env?.content?.[0]?.type !== 'data' || typeof text !== 'string') throw new Error(`${where}: descriptorFetch envelope is not the browser service's { content: [{ type: 'data', data: { result: { content: [{ text }] } } }] } shape`);
  const inner = JSON.parse(text);
  if (JSON.stringify(inner) !== text) throw new Error(`${where}: descriptorFetch envelope's inner text does not re-serialise byte for byte (compact JSON) — refused`);
  if (!Array.isArray(inner.data) || inner.data.length !== 1 || Object.keys(inner.data[0]).length !== 1) throw new Error(`${where}: descriptorFetch envelope's inner data is not one one-key object`);
  return { spec, answers, envelope: env, envelopeIndex: src[0].index };
}

/** The answer for a call, or null when this tier does not serve it (the caller then returns its stub). */
export function descriptorFetchAnswer(d: LoadedDescriptorFetch, tool: string, args: unknown): unknown | null {
  const s = scrapeArgsOf(tool, args);
  if (!s || s.keys.join(',') !== 'selectors,url' || typeof s.url !== 'string' || !d.answers.has(s.url)) return null;
  const key = preKey(s.selectors);
  if (key === null) return null;
  const env = JSON.parse(JSON.stringify(d.envelope)) as Record<string, any>;
  const data = env.content[0].data;
  data.arguments = { url: s.url, selectors: s.selectors };
  const inner = JSON.parse(data.result.content[0].text);
  inner.data = [{ [key]: d.answers.get(s.url) }];
  data.result.content[0].text = JSON.stringify(inner);
  return env;
}
