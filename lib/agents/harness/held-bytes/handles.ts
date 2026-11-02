/**
 * PLATFORM-HELD-BYTES Stage B V-4 — handle assignment (plan STAGE-B-PLAN.md v4.1 §3 V-4). PURE and env-free.
 *
 * One handle per held FILE, i.e. per `(target, path)`, over the Harvester's held objects in `(toolCallIndex, selector)`
 * order (held before refused at a tie — the manifest's order). The handle's number is `H<handleIndex + 1>` where
 * handleIndex is the position of the pair's FIRST object in that order, so a file read twice keeps one number and a REFUSED
 * object keeps its number (the numbering never shifts because a capture failed). The handle is BOUND to the LAST held capture
 * of the pair; two held captures of one pair with DIFFERENT bytes ⇒ `handle-ambiguous` (PLATFORM_STATE: the platform cannot
 * say which version the Author is editing). A pair with no held capture is `unheld`. An object with no identity (a refusal
 * decided before target/path were known) is its own handle, `unheld`.
 * One Harvester entry per Author chain may carry handles; more than one is the chainer's `handle-namespace-ambiguous` (V-6).
 */
export interface HandleObject {
  toolCallIndex: number;
  selector: string | null;
  target: string | null;
  path: string | null;
  held: boolean;
  /** Held objects only — in memory (never in a manifest or a stamp). */
  blobSha256?: string;
  /** Held objects only — the CAPTURE ref id, read from held_file_refs at chain time (the manifest carries none). */
  refId?: string;
}

export interface AssignedHandle {
  handle: string;
  handleIndex: number;
  target: string | null;
  path: string | null;
  state: 'bound' | 'handle-ambiguous' | 'unheld';
  /** state 'bound': the last held capture. */
  refId?: string;
  blobSha256?: string;
  /** How many objects (held or refused) the pair has. */
  objects: number;
}

export const handleName = (handleIndex: number) => `H${handleIndex + 1}`;

export function orderHeldObjects<T extends HandleObject>(objs: readonly T[]): T[] {
  return [...objs].sort((a, b) =>
    a.toolCallIndex - b.toolCallIndex
    || (a.selector ?? '').localeCompare(b.selector ?? '')
    || Number(b.held) - Number(a.held));
}

export function assignHandles(objs: readonly HandleObject[]): AssignedHandle[] {
  const ordered = orderHeldObjects(objs);
  const byPair = new Map<string, AssignedHandle & { blobs: Set<string> }>();
  const out: Array<AssignedHandle & { blobs: Set<string> }> = [];
  ordered.forEach((o, i) => {
    const key = o.target !== null && o.path !== null ? JSON.stringify([o.target, o.path]) : null;
    let h = key ? byPair.get(key) : undefined;
    if (!h) {
      h = { handle: handleName(i), handleIndex: i, target: o.target, path: o.path, state: 'unheld', objects: 0, blobs: new Set() };
      out.push(h);
      if (key) byPair.set(key, h);
    }
    h.objects++;
    if (o.held && o.blobSha256) { h.blobs.add(o.blobSha256); h.refId = o.refId; h.blobSha256 = o.blobSha256; h.state = 'bound'; }
  });
  return out.map(({ blobs, ...h }) => (blobs.size > 1 ? { ...h, state: 'handle-ambiguous', refId: undefined, blobSha256: undefined } : h));
}
