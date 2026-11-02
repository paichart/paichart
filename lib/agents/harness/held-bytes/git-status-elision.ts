/**
 * held-k8s G-1 (owner decision 2026-10-18, option c; EF B-1): the PERSISTED `toolCalls` never carry a Git file source's
 * blob ids.
 *
 * WHY. GitHub's `get_file_contents` answers a FILE read with `content[0] = {type:'text', text:'successfully downloaded text file
 * (SHA: <blob sha>)'}` beside the resource item, and a DIRECTORY read with `content[0].text` = a JSON listing whose every entry
 * carries the blob `sha`. A blob sha is the git hash of the RAW bytes. For a file R10 redacts, persisting it beside the redacted
 * text leaves a dictionary oracle on exactly the files that held a secret (P3 §4.3 rule 2 forbids git blob ids in a result; the
 * digest scan sees KEYS, so it cannot see one inside a text item). The platform never needs it: K-8 hashes the held base itself,
 * operator-side; `sourceRevision` (a COMMIT, a tree digest — ruled out of K1 by name) comes from the resource URI, not from here.
 *
 * WHAT. On a SUCCESSFUL call whose RESOLVED service (the envelope's `data.targetService`, never the caller's spelling) is a Git
 * file source (git-file-source-pin.js), `data.result.content[0]` — when it is a text item — is REPLACED with a placeholder that
 * names what was elided. Replaced, never removed: the held selector is POSITIONAL (`/content/1/resource/text`) and MI-13 🔴 12
 * resolves it on the stored record, so deleting the item would shift every index and leave every github ref unresolved.
 *   - beside a resource item          ⇒ GIT_STATUS_ELIDED_TEXT   (a file read's status line);
 *   - a JSON-array text, no resource  ⇒ GIT_LISTING_ELIDED_TEXT  (a directory listing — capture's R4 rule accepts it, so a
 *                                                                 replay over a STORED record still reads `notAFileRead`);
 *   - anything else (an error text, an unexpected shape) is left as returned — it carries no blob id we know of, and an
 *     operator needs it.
 * The model saw the original in-loop; this is persist-only. Pure, never throws, never mutates its input.
 */
import { gitPinFor } from '@/lib/mcp/server/config/git-file-source-pin';
import * as heldEligibility from '@/lib/mcp/server/config/held-eligibility';

export const GIT_STATUS_ELIDED_TEXT = '[platform: the file source status line was elided at persist (it carries a blob id)]';
export const GIT_LISTING_ELIDED_TEXT = '[platform: the file source directory listing was elided at persist (it carries blob ids)]';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

function isJsonArrayText(t: string): boolean {
  const s = t.trimStart();
  if (!s.startsWith('[')) return false;
  try { return Array.isArray(JSON.parse(s)); } catch { return false; }
}

/** The elided copy of ONE tool-call record, or the record itself when nothing applies. */
export function elideGitFileSourceStatus<T>(entry: T): T {
  if (!isObj(entry) || entry.success === false || !isObj(entry.result)) return entry;
  const result = entry.result;
  if (result.isError === true || !Array.isArray(result.content)) return entry;
  const env = result.content[0];
  if (!isObj(env) || env.type !== 'data' || !isObj(env.data)) return entry;
  const data = env.data;
  // WI-B10: a DECLARED Git file source (a customer's own GitHub service) is elided too — known from the record's server-only
  // eligibility fact (the persisted envelope names the service, not its pin).
  const declaredGit = heldEligibility.fromRecord(entry)?.gitSource === true;
  if (typeof data.targetService !== 'string' || (!gitPinFor(data.targetService) && !declaredGit)) return entry;
  if (!isObj(data.result) || !Array.isArray(data.result.content)) return entry;
  const inner = data.result.content as unknown[];
  const first = inner[0];
  if (!isObj(first) || first.type !== 'text' || typeof first.text !== 'string') return entry;
  if (first.text === GIT_STATUS_ELIDED_TEXT || first.text === GIT_LISTING_ELIDED_TEXT) return entry;
  const hasResource = inner.slice(1).some((c) => isObj(c) && c.type === 'resource');
  const text = hasResource ? GIT_STATUS_ELIDED_TEXT : isJsonArrayText(first.text) ? GIT_LISTING_ELIDED_TEXT : null;
  if (text === null) return entry;
  const newInner = [{ ...first, text }, ...inner.slice(1)];
  const newData = { ...data, result: { ...data.result, content: newInner } };
  const newEnv = { ...env, data: newData };
  return { ...entry, result: { ...result, content: [newEnv, ...(result.content as unknown[]).slice(1)] } } as T;
}
