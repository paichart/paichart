/**
 * The Git FILE-SOURCE PIN — ONE function, used at BOTH gates so they can never disagree (held-k8s SYNTHESIS v3, sec-ops B1/S3):
 *   - CALL time: `validateServiceCall` (service-call-policy.js) refuses a call that breaks the pin (PINNED_ARGUMENT, CRITICAL);
 *   - CAPTURE time: the held-bytes extractor (held-bytes/extract.ts) refuses to HOLD a file that breaks it (`source-not-pinned`).
 *
 * Why: the read-only fine-grained token reads ANY public repo, and the GitHub MCP server does NOT enforce an `Mcp-Param-*`
 * pin (measured 2026-10-18). Without a platform pin a prompt-injected Harvester could make an attacker's file the held base.
 *
 * Plain CommonJS on purpose: service-call-policy.js is loaded by the bare-node MCP process; TypeScript imports it (allowJs).
 * The functions are pure and never throw; module LOAD reads GIT_FILE_SOURCE_PIN once and throws on a malformed value. Returns FIELD names only (never the offending value: it is attacker-chosen).
 *
 * v1 rules (owner decisions G-7, K-5 refined):
 *   owner/repo  ASCII [A-Za-z0-9._-] only (no trimming, no Unicode folding), compared LOWER-CASED (GitHub folds case);
 *   path        REQUIRED (an omitted path lists the repo root); ONE leading '/' stripped; then no '..'/'.'/empty segment,
 *               no '%', '\\', control, line-separator or bidi character, ≤ 1024 chars, and EVERY segment ∈ [A-Za-z0-9._@+-]
 *               (an allow-list since the step-1 sec-ops review SF-2);
 *   ref         'main' or 'refs/heads/main' (the platform pin), or a WI-B10 row's one declared ref; ABSENT is read as 'main' explicitly
 *               and forwarded as such (Config-sources push 0, 2026-11-04 — never "the repo's default branch"); `sha` refused;
 *   served URI  repo://<owner>/<repo>/sha/<40 lowercase hex>/contents/<path> — owner/repo must equal the pin (lower-cased) and
 *               the path must equal the argument path. The server builds the URI from the REQUEST (probed 2026-10-18: it
 *               echoes the caller's spelling), so this is a CONSISTENCY check, not proof of what GitHub served — the independent
 *               check is the operator's Git base check (K-8).
 * Record: cline_docs/reviews/held-k8s-2026-10-18/SYNTHESIS.md §6.
 */
'use strict';

const NAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * LAB-CONFIGS Build 1 (owner D3, 2026-11-03): the PLATFORM pin is read ONCE, at module load, from the host environment —
 *   GIT_FILE_SOURCE_PIN=<owner>/<repo>     (always the repo's `main` branch)
 * Branch is NOT configurable on purpose: every domain protocol teaches the Harvester to pass `ref:'main'` verbatim
 * (git-read-call.ts), so another branch here would refuse every agent read. Protect `main` in the repo instead.
 * Unset or empty ⇒ the default below, byte-identical to the literal this replaced, so every stored held ref and every gate keeps
 * its bytes. A malformed value THROWS here: paichart-mcp loads this module at startup, so a bad pin stops it before it serves;
 * paichart-web loads it on the first route that needs it, and that route fails — never a boundary nobody chose (sec-ops L-3).
 * Unset ⇒ the public `paichart/paichart-configs` (owner 2026-11-12, option A — reverses sec-ops Build 1 L-5 "never default to a
 * public repo" on purpose: the self-host `.env.example` sets the same repo, and the retired private lab repo is not readable by a
 * self-host). A self-hoster who keeps the default reads files paichart controls; the seed prints the pinned repo, and the
 * README / install guide say to change it to their own. Only host access sets it — never a task, a spec or an agent. Both processes must see
 * the SAME value, or the call gate and capture disagree (the install guide sets it in the one hub `.env`).
 * Owner/repo are lower-cased (GitHub folds case; the gates compare lower-cased).
 */
const DEFAULT_GIT_FILE_SOURCE_PIN = Object.freeze({ owner: 'paichart', repo: 'paichart-configs' });
const PIN_ENV_RE = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/;

/** GIT_FILE_SOURCE_PIN value → { owner, repo, refs:['main','refs/heads/main'] }. Unset/empty ⇒ the default. Malformed ⇒ throws. */
function parseGitFileSourcePinEnv(raw) {
  const d = DEFAULT_GIT_FILE_SOURCE_PIN;
  const v = raw === undefined || raw === null ? '' : String(raw).trim();
  const m = v === '' ? [null, d.owner, d.repo] : PIN_ENV_RE.exec(v);
  if (!m || m[1] === '.' || m[1] === '..' || m[2] === '.' || m[2] === '..') {
    throw new Error('GIT_FILE_SOURCE_PIN is malformed: expected <owner>/<repo> '
      + '(letters, digits, . _ - only). Refusing to start with an unchosen Git file-source pin.');
  }
  return Object.freeze({ owner: m[1].toLowerCase(), repo: m[2].toLowerCase(), refs: Object.freeze(['main', 'refs/heads/main']) });
}

/** service name -> pin. A service listed here is a Git file source; every call to it is pinned. */
const GIT_FILE_SOURCE_PINS = Object.freeze({
  'github-service': parseGitFileSourcePinEnv(process.env.GIT_FILE_SOURCE_PIN),
});

/** The held-ref TARGET for a file the platform row serves (`github:<owner>:<repo>`) — derived, never a second literal. */
const PLATFORM_GIT_TARGET = `github:${GIT_FILE_SOURCE_PINS['github-service'].owner}:${GIT_FILE_SOURCE_PINS['github-service'].repo}`;
const URI_RE = /^repo:\/\/([^/]+)\/([^/]+)\/sha\/([0-9a-f]{40})\/contents\/(.+)$/;
const MAX_PATH = 1024;
const SEGMENT_RE = /^[A-Za-z0-9._@+-]+$/;

/** The pin for a resolved service NAME, or null when the service is not a Git file source. */
function gitPinFor(serviceName) {
  return typeof serviceName === 'string' && Object.prototype.hasOwnProperty.call(GIT_FILE_SOURCE_PINS, serviceName)
    ? GIT_FILE_SOURCE_PINS[serviceName]
    : null;
}

/**
 * WI-B10 (2026-10-23, design §9.1 G; owner WB-1): a registrant may declare a `gitPin` for ITS OWN repo. A declared pin as a
 * runtime pin: the declared single `ref` (plus its `refs/heads/` form), or the default branch forms. Null when malformed.
 */
const DEFAULT_REFS = Object.freeze(['main', 'refs/heads/main']);
function pinFromDeclaration(gp) {
  if (!gp || typeof gp !== 'object' || !NAME_RE.test(String(gp.owner || '')) || !NAME_RE.test(String(gp.repo || ''))) return null;
  let refs = DEFAULT_REFS;
  if (typeof gp.ref === 'string' && gp.ref) {
    const bare = gp.ref.startsWith('refs/heads/') ? gp.ref.slice('refs/heads/'.length) : gp.ref;
    refs = Object.freeze([bare, `refs/heads/${bare}`]);
  }
  // sec-ops held-network push-2 SF-2 (2026-10-26): lower-cased, because nameMatches compares the CALL's value lower-cased against the
  // pin as-is — a declared `Acme/NetCfg` pin never matched any spelling, so every call to a mixed-case registrant gitPin row was refused
  // PINNED_ARGUMENT (WI-B10) and a mixed-case declared line never held its file (push-2 P8). GitHub folds owner/repo case.
  return Object.freeze({ owner: String(gp.owner).toLowerCase(), repo: String(gp.repo).toLowerCase(), refs, declared: true });
}

/**
 * WI-B10 — the pin of a resolved service ROW (every pin consumer: call gate, workflow refusal ×2, token strip, capture, persist
 * elision): the PLATFORM pin binds ONLY to the ownerless platform row of that name (sec-ops SF-4(b)); any other row's pin is its
 * own declared `gitPin` (the first declared one). Null when the row is not a Git file source.
 */
function gitPinForRow(row) {
  if (!row || typeof row !== 'object') return null;
  const cfg = row.configuration && typeof row.configuration === 'object' ? row.configuration : null;
  const owned = !!(cfg && typeof cfg.ownerId === 'string' && cfg.ownerId);
  if (!owned && typeof row.name === 'string' && gitPinFor(row.name)) return gitPinFor(row.name);
  const files = row.heldFiles && typeof row.heldFiles === 'object' && Array.isArray(row.heldFiles.files) ? row.heldFiles.files : [];
  const declared = files.find((f) => f && typeof f === 'object' && f.gitPin);
  return declared ? pinFromDeclaration(declared.gitPin) : null;
}

/** A service NAME (the platform map), a resolved ROW, or an already-resolved pin → the pin, or null. */
function resolvePin(x) {
  if (typeof x === 'string') return gitPinFor(x);
  if (!x || typeof x !== 'object') return null;
  if (typeof x.owner === 'string' && typeof x.repo === 'string' && Array.isArray(x.refs)) return x;
  return gitPinForRow(x);
}

/** The repo-relative path (one leading '/' stripped), or null when it is unsafe. */
function normaliseRepoPath(p) {
  if (typeof p !== 'string') return null;
  const rel = p.startsWith('/') ? p.slice(1) : p;
  if (rel.length === 0 || rel.length > MAX_PATH) return null;
  if (/[\u0000-\u001f\u007f-\u009f]/.test(rel)) return null;
  if (/[\u2028\u2029\u202a-\u202e\u2066-\u2069\u200e\u200f]/.test(rel)) return null;
  if (/[%\\]/.test(rel)) return null;
  if (typeof rel.isWellFormed === 'function' && !rel.isWellFormed()) return null;
  const segs = rel.split('/');
  if (segs.some((s) => s === '' || s === '.' || s === '..')) return null;
  // sec-ops step-1 review SF-2 (2026-10-18): an ALLOW-list per segment. The deny rules above let `?`, `#`, soft hyphen and
  // fullwidth dots through — GitHub still served the pinned file, but it was held under a path that does not exist.
  if (!segs.every((s) => SEGMENT_RE.test(s))) return null;
  return rel;
}

/**
 * held-terraform T-3 / T-4 (TERRAFORM-PHASE0-INVENTORY §3) + sec-ops step-1 SF-1/SF-2 (REVIEW-sec-ops-STEP1.md): a path that names
 * Terraform STATE, a PLAN or a VARIABLES file. ONE function, used at BOTH gates (the rule this module exists for): the call gate
 * refuses the read before any byte is delivered (checkGitArguments → PINNED_ARGUMENT `path`), and capture refuses to hold it
 * (held-bytes-capture.ts, every descriptor, any domain — defence in depth). Case-insensitive; matches ANYWHERE in the file name so a
 * suffixed copy (`terraform.tfstate-old`, `prod.tfvars.example`, `secrets.tfvars.bak`) is refused too:
 *   `state-file`   a `.terraform` or `terraform.tfstate.d` segment (the working directory: plugins, module copies, the backend's
 *                  cached state; workspace states), or a name containing `.tfstate` or `.tfplan` (a plan file carries the state).
 *   `tfvars-file`  a name containing `.tfvars` — where literal secrets live; specs name `.tf` files.
 *   TF-PATH-RULE-GAPS (sec-ops step-2 F-2, 2026-10-22) adds two CLOSED lists (a closed list, never an open grammar — LL-T-05):
 *   `state-file`   also the suffix-less plan names `tfplan`, `tfplan.out`, `plan.out` (the documented `terraform plan -out=tfplan`
 *                  form; a binary plan is a zip the capture's JSON content check cannot see), and `tfplan.binary` / `tfplan.json` — the
 *                  CI / policy-pipeline pair (`terraform show -json` prints sensitive values in clear; sec-ops SF-1: the content check runs
 *                  after delivery, the call gate before it). Generic names (`plan.json`, `plan.bin`) stay off: other domains carry them.
 *   `credentials-file`  the Terraform CLI credentials: `.terraformrc`, `terraform.rc`, `credentials.tfrc.json`, and anything under a
 *                  `.terraform.d` segment (where `terraform login` writes its token).
 * A name WITHOUT the leading dot (`tfstate-notes.md`) is holdable. Pure, never throws.
 * @returns {'state-file' | 'tfvars-file' | 'credentials-file' | null}
 */
const PLAN_FILE_NAMES = Object.freeze(['tfplan', 'tfplan.out', 'plan.out', 'tfplan.json', 'tfplan.binary']);
const CLI_CREDENTIALS_FILE_NAMES = Object.freeze(['.terraformrc', 'terraform.rc', 'credentials.tfrc.json']);
/** held-network S1-H (2026-10-23): a Nornir inventory (hosts / groups / defaults) carries device credentials — `credentials-file`.
 *  NARROWED from "by name anywhere" (the TF-PATH-RULE-GAPS precedent: generic names stay off, other domains carry them —
 *  `defaults.yaml` / `hosts.yaml` are ordinary k8s / Helm file names): refused only under a `nornir` or `inventory` segment.
 *  A CLOSED list (LL-T-05). */
const NORNIR_INVENTORY_FILE_NAMES = Object.freeze(['hosts.yaml', 'hosts.yml', 'groups.yaml', 'groups.yml', 'defaults.yaml', 'defaults.yml']);
const NORNIR_INVENTORY_DIRS = Object.freeze(['nornir', 'inventory']);

function isNornirInventoryPath(filePath) {
  const segs = String(filePath || '').toLowerCase().split('/').filter((x) => x.length > 0);
  return segs.length > 0 && NORNIR_INVENTORY_FILE_NAMES.includes(segs[segs.length - 1]) && segs.slice(0, -1).some((x) => NORNIR_INVENTORY_DIRS.includes(x));
}

function heldPathRefusal(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  const segs = filePath.toLowerCase().split('/').filter((x) => x.length > 0);
  if (segs.length === 0) return null;
  const name = segs[segs.length - 1];
  if (segs.some((x) => x === '.terraform' || x === 'terraform.tfstate.d') || name.includes('.tfstate') || name.includes('.tfplan')
    || PLAN_FILE_NAMES.includes(name)) return 'state-file';
  if (name.includes('.tfvars')) return 'tfvars-file';
  if (segs.includes('.terraform.d') || CLI_CREDENTIALS_FILE_NAMES.includes(name)) return 'credentials-file';
  if (isNornirInventoryPath(filePath)) return 'credentials-file';
  return null;
}

function nameMatches(v, want) {
  return typeof v === 'string' && NAME_RE.test(v) && v.toLowerCase() === want;
}

/**
 * Config-sources push 0 (DESIGN v2 §2, owner D3 + G1-b, sec-ops B-1, 2026-11-04): the ref an absent or null `ref` MEANS. GitHub serves
 * a call with no `ref` from the repository's DEFAULT branch, which is `main` only by convention. So an absent ref is read as `main`
 * EXPLICITLY — never as "whatever the default branch is" — and is checked against the pin AS `main`. Before this, an absent ref passed
 * EVERY pin: a WI-B10 row whose declared `gitPin.ref` is `release` served the default branch (an existing bypass, register
 * PIN-ABSENT-REF-DEFAULT-BRANCH). Now that row refuses an absent ref (field `ref`), at both gates.
 */
const DEFAULT_REF = 'main';

/**
 * The agent-facing Git file-read tool of the descriptor table (`descriptors.ts` GITHUB_FILE_SOURCE entry; closed world — the server
 * runs `--tools get_file_contents`). Config-sources push 0 (sec-ops B-3): the never-held path predicate runs on EVERY call of this tool
 * at the call gate, pinned or not. Pinned equal to the descriptor table's tool by test-security-invariants §R.
 */
const GIT_FILE_READ_TOOL = 'get_file_contents';

/**
 * Check a call's ARGUMENTS against the pin.
 * On a pinned pass the result carries `args` — the arguments the call must FORWARD, CHECK-AS and ECHO (one object; push 0, sec-ops B-1):
 * the caller's own object when it named a ref, else a copy with `ref: 'main'` and `refDefaulted: true`. Capture calls this function on the
 * hub's echoed arguments, so the two gates see the same ref.
 * @returns {{ ok: true, pinned: false } | { ok: true, pinned: true, path: string, args: object, refDefaulted: boolean } | { ok: false, field: string, pathRefusal?: 'state-file' | 'tfvars-file' | 'credentials-file' }}
 */
function checkGitArguments(serviceName, args) {
  const pin = resolvePin(serviceName); // WI-B10: a name (platform map), a resolved row, or a declared pin
  if (!pin) return { ok: true, pinned: false };
  const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  if (!nameMatches(a.owner, pin.owner)) return { ok: false, field: 'owner' };
  if (!nameMatches(a.repo, pin.repo)) return { ok: false, field: 'repo' };
  if (a.sha !== undefined) return { ok: false, field: 'sha' };
  const refDefaulted = a.ref === undefined || a.ref === null;
  if (!pin.refs.includes(refDefaulted ? DEFAULT_REF : a.ref)) return { ok: false, field: 'ref' };
  const path = normaliseRepoPath(a.path);
  if (path === null) return { ok: false, field: 'path' };
  // sec-ops step-1 SF-1: a state / plan / variables path is refused BEFORE the read — capture refusing to hold it is too late.
  // `pathRefusal` names WHY, so capture records `state-file` / `tfvars-file` / `credentials-file` (never-holdable by design) and not `source-not-pinned`
  // (which forces a held-capable leg, G-4: that force is for a read that LOST a base, and these files never have one).
  const pathRefusal = heldPathRefusal(path);
  // held-network S1-H: say WHICH credentials file it was, so the call gate's message fits the domain (a device inventory is not a
  // Terraform file). Capture still records `credentials-file` either way.
  if (pathRefusal) return { ok: false, field: 'path', pathRefusal, ...(pathRefusal === 'credentials-file' && isNornirInventoryPath(path) ? { deviceInventory: true } : {}) };
  return { ok: true, pinned: true, path, args: refDefaulted ? { ...a, ref: DEFAULT_REF } : a, refDefaulted };
}

/**
 * Config-sources push 0 (sec-ops B-3): the never-held path predicate for an UNPINNED call of the Git file-read tool. Inside
 * `checkGitArguments` the predicate runs only once a pin resolves, so a GitHub-shaped service with no pin read `terraform.tfstate`
 * into the reasoner and capture refused it afterwards (too late: the bytes were already in-loop). Same predicate, same refusal
 * names; the path is the caller's, normalised only for the check (never forwarded).
 * @returns {{ pathRefusal: 'state-file' | 'tfvars-file' | 'credentials-file', deviceInventory?: true } | null}
 */
function unpinnedFileReadPathRefusal(tool, args) {
  if (tool !== GIT_FILE_READ_TOOL) return null;
  const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const raw = typeof a.path === 'string' ? a.path : '';
  // sec-ops PUSH0 S-1: the pinned gate refuses any '%'; this gate has no pin to refuse with, so it checks the raw path AND up to two
  // rounds of percent-decoding (`terraform%2Etfstate`, double-encoded `%252E`). Bounded; a malformed escape stops the decoding there.
  const forms = [raw];
  let cur = raw;
  for (let i = 0; i < 2 && cur.includes('%'); i++) {
    try { const next = decodeURIComponent(cur); if (next === cur) break; forms.push(next); cur = next; } catch { break; }
  }
  for (const f of forms) {
    const rel = f.replace(/^\/+/, '').replace(/^(\.\/)+/, '');
    const pathRefusal = heldPathRefusal(rel);
    if (pathRefusal) return { pathRefusal, ...(pathRefusal === 'credentials-file' && isNornirInventoryPath(rel) ? { deviceInventory: true } : {}) };
  }
  return null;
}

/**
 * Check the SERVED resource URI against the pin and the (already argument-checked) path.
 * @returns {{ ok: true, revision: string, path: string } | { ok: false, field: string }}  path is absolute ('/'+rel).
 */
function checkGitServedUri(serviceName, uri, argPath) {
  const pin = resolvePin(serviceName); // WI-B10
  if (!pin) return { ok: false, field: 'uri' };
  const m = typeof uri === 'string' ? URI_RE.exec(uri) : null;
  if (!m) return { ok: false, field: 'uri' };
  if (!nameMatches(m[1], pin.owner)) return { ok: false, field: 'owner' };
  if (!nameMatches(m[2], pin.repo)) return { ok: false, field: 'repo' };
  const served = normaliseRepoPath(m[4]);
  if (served === null || served !== argPath) return { ok: false, field: 'path' };
  return { ok: true, revision: m[3], path: '/' + served };
}

/**
 * sec-ops step-1 review SF-1 (2026-10-18): a Git file source is read with `services(action:'call')` ONLY, never as a WORKFLOW
 * step. A workflow envelope has no `data.targetService`, so the status-line elision (git-status-elision.ts) cannot see it, and
 * `mcp_workflow_executions.output/steps` stores step payloads (file text included) with XSS sanitising only — R10 never touches
 * that table. Both workflow step callers (workflow-tools-handler.js, service-caller.ts) refuse through this ONE function, on the
 * RESOLVED service name (a step addressed by registry id is refused too), before any trust, token or network work.
 * @returns {string | null} the refusal message, or null when the service is not a Git file source.
 */
const GIT_FILE_SOURCE_WORKFLOW_REFUSAL = 'Git file sources are read with services.call only, never as a workflow step';
function gitFileSourceWorkflowRefusal(serviceName) {
  return resolvePin(serviceName) ? GIT_FILE_SOURCE_WORKFLOW_REFUSAL : null; // WI-B10: a declared Git source is refused too
}

/**
 * held-k8s step 2, F2 (L-K1-FIXTURE.md, owner 2026-10-18 "fix in step 2") + sec-ops step-2 SF-7 (REVIEW-sec-ops-STEP2.md): a DIRECTORY
 * read of a PRIVATE repo returns, for every entry, a `download_url` on raw.githubusercontent.com carrying a short-lived `?token=` — a
 * credential that reads that file with no pin and no G-5 check (any URL-fetching tool could follow it, the redaction-bait Secret
 * included). The G-1 elision is persist-only, so the reasoner held it in-loop. This rewrites it at the hub's success path, before the
 * response reaches ANY caller (agent loop, SSE card, external MCP client):
 *   1. a `*.githubusercontent.com` URL's WHOLE query string becomes `?token=PLATFORM-STRIPPED` (the live listing shape already is
 *      exactly that after one pass, so a stored listing stays a fixed point);
 *   2. elsewhere, every `token` parameter VALUE — case-insensitive, after `?` `&` `;` `#`, a JSON-escaped `\u0026` or an HTML `&amp;`,
 *      with `=`, `%3D` or a JSON-escaped `\u003d` — becomes `PLATFORM-STRIPPED`;
 *   3. FAIL-CLOSED residual tripwire: a string that STILL carries a credential-shaped token value after 1-2 is WITHHELD whole
 *      (replaced by GIT_WITHHELD_TEXT) and counted, so the caller logs a securityEvent — a shape this code never saw cannot pass silently.
 * - Scope: the RESOLVED service is a Git file source; every string in `content` items, item `_meta`, the response `_meta` and
 *   `structuredContent`, EXCEPT a resource item's `text` / `blob` — the FILE, the held base, which may legitimately contain `token=`.
 * - Pure, never throws, never mutates its input; returns the input itself when nothing changed.
 * @returns {{ response: unknown, stripped: number, withheld: number }}
 */
const GIT_URL_TOKEN_PLACEHOLDER = 'PLATFORM-STRIPPED';
const GIT_WITHHELD_TEXT = '[platform: a Git file-source result item was withheld — it still carried a credential-shaped token after stripping]';
// The query runs to the first whitespace / quote / bracket / fragment, and a JSON-escaped \u00XX (`\u0026`, `\u003d`) is PART of it.
const GHUC_URL_RE = /(https?:\/\/[A-Za-z0-9.-]*githubusercontent\.com\/[^\s"'\\<>?#]*)\?((?:[^\s"'\\<>#]|\\u00[0-9a-fA-F]{2})*)/gi;
const TOKEN_PARAM_RE = /((?:[?&;#]|\\u0026|&amp;)token(?:=|%3d|\\u003d))([^&;#\s"'\\<>]+)/gi;
const RESIDUAL_TOKEN_RE = /token(?:=|%3d|\\u003d)(?!PLATFORM-STRIPPED(?![A-Za-z0-9]))[A-Za-z0-9_\-.~%+]{8,}/i;
const GHUC_QUERY = 'token=' + GIT_URL_TOKEN_PLACEHOLDER;

function stripTokensInString(s) {
  let n = 0;
  let out = s.replace(GHUC_URL_RE, (m, head, query) => {
    if (query === GHUC_QUERY) return m;
    n += 1;
    return head + '?' + GHUC_QUERY;
  });
  out = out.replace(TOKEN_PARAM_RE, (m, head, value) => {
    if (value === GIT_URL_TOKEN_PLACEHOLDER) return m;
    n += 1;
    return head + GIT_URL_TOKEN_PLACEHOLDER;
  });
  if (RESIDUAL_TOKEN_RE.test(out)) return { out: GIT_WITHHELD_TEXT, n, withheld: 1 };
  return { out, n, withheld: 0 };
}

/** Deep walk; `skip(key, parentIsResource)` names the keys whose strings are left untouched (a resource's file text). */
function stripTokensDeep(v, inResource) {
  if (typeof v === 'string') { const r = stripTokensInString(v); const changed = r.n || r.withheld; return { value: changed ? r.out : v, n: r.n, w: r.withheld }; }
  if (Array.isArray(v)) {
    let n = 0, w = 0; const arr = v.map((x) => { const r = stripTokensDeep(x, false); n += r.n; w += r.w; return r.value; });
    return { value: n || w ? arr : v, n, w };
  }
  if (v && typeof v === 'object') {
    let n = 0, w = 0; const obj = {};
    for (const k of Object.keys(v)) {
      if (inResource && (k === 'text' || k === 'blob')) { obj[k] = v[k]; continue; }
      const r = stripTokensDeep(v[k], k === 'resource');
      n += r.n; w += r.w; obj[k] = r.value;
    }
    return { value: n || w ? obj : v, n, w };
  }
  return { value: v, n: 0, w: 0 };
}

function stripGitFileSourceUrlTokens(serviceName, response) {
  if (!resolvePin(serviceName) || !response || typeof response !== 'object' || Array.isArray(response)) return { response, stripped: 0, withheld: 0 };
  const r = stripTokensDeep(response, false);
  if (!r.n && !r.w) return { response, stripped: 0, withheld: 0 };
  return { response: r.value, stripped: r.n, withheld: r.w };
}

/**
 * held-terraform step 1, T-2 (TERRAFORM-PHASE0-INVENTORY §3, owner 2026-10-19): ONE ROUTE to pinned bytes. A pinned repository read
 * through any OTHER service (a browser scrape of a raw URL, a generic fetch, a second GitHub MCP) is an unpinned, uncaptured, unheld
 * second route to the same file — any ref, no G-5 / state / tfvars refusal, no `sourceRevision`. So the call gate refuses it.
 *
 * ⚠️ A TRIPWIRE FOR THE HONEST PATH, NOT A BOUNDARY (sec-ops step-1 review, REVIEW-sec-ops-STEP1.md §1): `run_script` string
 * building, redirects, mirrors/CDNs and encodings evade any text match. The boundary is the PRIVATE repo plus no other service
 * holding its credential; and edits apply only against the HELD base, which only the Git file source captures. Do not grade it as
 * containment.
 *
 * Two arms, both over the call's arguments:
 *   URL     a pinned owner/repo as a path into raw.githubusercontent.com / media.githubusercontent.com, any github.com host
 *           (www., raw.github.com, …), codeload.github.com or api.github.com/repos — `/` or `%2F` separators, scheme optional,
 *           case-insensitive; the serialized text is first normalised (a JSON-escaped backslash reads as `/`, escaped tab /
 *           newline / CR are dropped — WHATWG does both in http(s) URLs).
 *   FIELDS  top-level `owner` + `repo` equal to a pin (the shape every GitHub MCP takes).
 * Measured before building (prod, 2026-10-21): 0 calls on any protocol had ever read the pinned repo by another route (URL or
 * fields); terraform Harvesters' 91 scrapes all fetched descriptor JSON from another repo. Pure, never throws.
 */
const SEP = '(?:\\/|%2f)';
const PINNED_REPO_URL_RES = Object.freeze(Object.values(GIT_FILE_SOURCE_PINS).map((pin) => {
  const esc = (x) => x.replace(/[.]/g, '\\.');
  return new RegExp(
    `(?:raw\\.githubusercontent\\.com|media\\.githubusercontent\\.com${SEP}media|api\\.github\\.com${SEP}repos|(?<![A-Za-z0-9-])(?:[a-z0-9-]+\\.)*github\\.com)`
    + `${SEP}${esc(pin.owner)}${SEP}${esc(pin.repo)}(?![A-Za-z0-9_-])`, 'i');
}));
/** @returns {boolean} the text names a pinned repository by URL (after normalising escaped backslash / whitespace). */
function namesPinnedRepoUrl(text) {
  if (typeof text !== 'string') return false;
  const t = text.replace(/\\\\/g, '/').replace(/\\[tnr]/g, '').replace(/[\t\n\r]/g, '');
  return PINNED_REPO_URL_RES.some((re) => re.test(t));
}
/** @returns {boolean} top-level `owner` + `repo` arguments equal a pin (case-folded, ASCII names only). */
function namesPinnedRepoFields(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false;
  return Object.values(GIT_FILE_SOURCE_PINS).some((pin) => nameMatches(args.owner, pin.owner) && nameMatches(args.repo, pin.repo));
}

module.exports = {
  GIT_FILE_SOURCE_PINS, gitPinFor, DEFAULT_GIT_FILE_SOURCE_PIN, parseGitFileSourcePinEnv, PLATFORM_GIT_TARGET, normaliseRepoPath, checkGitArguments, checkGitServedUri,
  pinFromDeclaration, gitPinForRow, resolvePin,
  GIT_FILE_SOURCE_WORKFLOW_REFUSAL, gitFileSourceWorkflowRefusal,
  GIT_URL_TOKEN_PLACEHOLDER, GIT_WITHHELD_TEXT, stripGitFileSourceUrlTokens,
  namesPinnedRepoUrl, namesPinnedRepoFields, heldPathRefusal,
  DEFAULT_REF, GIT_FILE_READ_TOOL, unpinnedFileReadPathRefusal,
};
