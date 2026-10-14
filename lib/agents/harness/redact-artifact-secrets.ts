/**
 * R10 BACKSTOP -- coarse secret redaction for the PERSISTED pAIchart artifacts (report.md +
 * result.json) before they are written. Pure + zero-DB; no module-level state.
 *
 * POSTURE: THIS IS THE CONTROL, DEFAULT-ON (Steve, 2026-08-28). Corrected -- the previous header
 * asserted a property that was false for two months, and a security review quoted it back as fact.
 *
 * It said the real redaction was the customer device service's and that "WS3's conformance allowlist
 * makes only attested-self-redacting services reachable". WS3 was designed and DROPPED the same
 * evening, 2026-06-24, with ZERO code written -- this header shipped at 21:02 and the drop landed at
 * 21:59. There is no allowlist, no attestation field, and nothing in the call path asks what a
 * service does with data. Reachability is `status ACTIVE` + owner/public/admin access. So this was
 * never a backstop behind a real control.
 *
 * We deliberately do NOT enforce service-side redaction (Steve, 2026-08-28): anyone can register an
 * MCP service, so requiring it is a paper guarantee. Customer services SHOULD still redact at their
 * own boundary -- that is the shared-responsibility half, and it survives -- but nothing verifies it.
 * Therefore R10 is the only pAIchart-side redaction of persisted artifacts, and it defaults ON: a
 * control that defaults to off is a control you have to remember to have.
 *
 * THE BIAS STAYS LOW-FALSE-POSITIVE ANYWAY, by explicit decision -- "if it means we get a false
 * negative from time to time, that's OK" (Steve, 2026-08-28). That is a considered trade, not an
 * artefact of the old backstop framing: the residuals below are PRICED and stay accepted; do not
 * "fix" them with value-shape-only matching, which this module refuses by design.
 *
 * SCOPE: PERSISTED artifacts only (the broad-audience copy: MCP fetch / artifact viewer / team).
 * The live SSE stream and the in-flight finalResponse return are NARROWER-audience (only the
 * triggering user) and are intentionally OUT OF SCOPE -- "R10 backstop" != "no secret anywhere".
 *
 * PROPAGATION: redaction fires at every persist site, so a downstream stage that chains a
 * predecessor's persisted result.json sees <<REDACTED-SECRET>> -- intended (secrets don't propagate
 * down the pipeline). A future "verify-the-applied-config" stage must not assume it can read the
 * literal upstream secret from a persisted artifact.
 *
 * TOKEN-IN-PLACE: replace only the secret TOKEN with `<<REDACTED-SECRET>>`, preserving the
 * directive/keyword/type prefix so config byte-structure survives for diff/rollback.
 *
 * FALSE-POSITIVE DISCIPLINE (review 2026-06-24): report.md is LLM-authored markdown prose, so every
 * pattern is LINE-ANCHORED + LOWERCASE (config directives are lowercase + line-oriented; prose
 * sentences/headings are not all-lowercase-at-line-start with a secret-shaped token). The generic
 * fail-safe additionally requires a SECRET-SHAPED token (contains a digit or one of $ : . / =) so a
 * line like `key findings indicate ...` (token = a dictionary word) is NOT redacted.
 *
 * KNOWN, ACCEPTED RESIDUALS -- priced and deliberately kept (see POSTURE: low-FP bias retained):
 *  - MID-DIRECTIVE CUT (2026-08-28, WS1): a serialized leaf cut by a cap between a directive and its
 *    token orphans the secret from its prefix. Both serialized arms are directive-anchored, so it is
 *    invisible to each. Only value-shape-only matching would catch it, which is refused. Accepted.
 *  - COVERAGE: `wpa-psk` remains uncaught. (The rest of the former sec-ops I-2 residual list --
 *    Junos `$9$`/`encrypted-password`, BGP `neighbor ... password`, OSPF
 *    `message-digest-key`/`authentication-key`, ISIS `password`, SNMPv3 `auth-password`/
 *    `priv-password` -- was ported into PATTERNS on 2026-08-16 (cross-port review item ③a): the
 *    routing-auth family lives in exactly the `show run | section router bgp|ospf` output the
 *    network protocol's harvest discipline commands, so the uncaught set and the commanded-read
 *    set overlapped on their highest-value members. Pinned in test-security-invariants.ts §J.)
 *  - k8s/cloud (2026-06-27, WP-C1): YAML `key: value` / env `KEY=value` for the common secret-VALUE
 *    keys + AWS `AKIA...` are now caught (value must be SECRET-SHAPED, so `Password: required` is not).
 *    STILL a residual: base64 `Secret.data:` VALUES (arbitrary keys, only catchable by value-shape =
 *    too FP-prone) -- K1 (harvest secret metadata, not values) keeps these out of the artifact by
 *    construction, so this backstop deliberately does not chase them.
 *  - terraform/IaC (2026-06-29, WP-C terraform-iac): a JSON-quoted-key variant catches `"key": "value"`
 *    (terraform `show -json`/state machine output is JSON, so the bare-key `^[ \t]*key` anchor above
 *    misses it; the leading `"` breaks it). This is a report.md-PROSE backstop ONLY -- R10 CANNOT catch
 *    an arbitrary `.tfstate` secret VALUE (a JSON leaf that has lost its key directive), so for Terraform
 *    state K1 default-deny at the read-only service (harvest by `state pull` + redact by the state's own
 *    `sensitive_attributes`, never raw state) is the SOLE state defense; this family only backstops
 *    secret-shaped values that survive into the LLM-authored prose of report.md.
 *  - observability/cloud (2026-10-13, P1 of PLATFORM-HELD-BYTES): `bearer_token:`, `credentials:` under an
 *    `authorization:` block, `Authorization: Bearer|Basic` under a YAML `headers:` map, nginx
 *    `proxy_set_header Authorization "Bearer|Basic …"`, prefixed `aws_secret_access_key`, and PEM
 *    `-----BEGIN … PRIVATE KEY-----` blocks are now caught. Still residual, priced: a scheme-less header value
 *    (`x-api-key: …`, `Authorization: <token>` with no scheme), a flow-style map (`headers: {Authorization: …}`),
 *    a credential after a blank line or more than 32 lines inside its block, the block-context forms on a
 *    TRUNCATED serialized leaf (arm 2 has no `\n` to anchor them), `aws_session_token`, and the last body line
 *    of a cut (END-less) PEM key when it is shorter than 16 characters. From the pattern-attack review
 *    (REVIEW-P1-P2-PATTERNS.md, 2026-10-13), probed and NOT caught, priced: `export AWS_SECRET_ACCESS_KEY=…` and inline
 *    `-e KEY=…` flags (the line anchor; pre-existing for every key); k8s `- name: X` / `value: …` pairs incl. probe
 *    `httpHeaders`; a list-item `- bearer_token: …`; schemes other than Bearer/Basic (`ApiKey`, `Token`);
 *    `grpc_set_header`, a commented-out `# proxy_set_header …`, or one not at line start; an `authorization:` parent
 *    with a trailing comment, capitalised, holding a list, or a folded scalar; PGP private key blocks and k8s
 *    `tls.key:` base64-of-PEM; a quoted credential with a space (only its first word goes); letters-only bearer
 *    tokens (the shape gate, deliberate).
 *  - PEM IS SHAPE-ANCHORED, not directive-anchored (review B1/S-1): a span between markers is redacted only when it
 *    looks like a key body, so a report/script that MENTIONS the markers is untouched. Cost, priced: a key whose BEGIN
 *    line carries trailing non-base64 text, or whose body is broken by a non-base64 line, is not redacted.
 *  - THE ONE NARROWING AGAINST THE PRE-P1 MODULE (review N-8): `"password": "hunter\n2"` (a raw newline inside the
 *    quotes) was redacted by the old `[^"]+` and is not by `[^"\n]+`. Valid JSON cannot hold a raw newline in a
 *    string, so only broken JSON or prose loses that accidental coverage. Accepted.
 *  - LINE PRESERVATION IS ABOUT REAL NEWLINES (review N-12). An ENCODED `\n` inside a JSON-quoted token is consumed
 *    up to the next `"` (over-redacts, never leaks; pre-existing for `password`). A consumer that counts lines of a
 *    serialized leaf must not rely on R10 preserving encoded ones.
 *  - KEY NAMES IN PARSED JSON ARE NOT SEEN (review N-11, pre-existing, filed separately): the deep walk redacts string
 *    VALUES without their keys, so `{"aws_secret_access_key": "…"}` as a parsed object (or a valid-JSON leaf, via
 *    arm 1) is not redacted; the JSON-quoted family fires only on prose and on leaves that do not parse.
 *  - LINE-PRESERVING (P1): no pattern's TOKEN spans a newline (the JSON-quoted token was `[^"]+` and could;
 *    now `[^"\n]+`), and PEM bodies keep one placeholder per line. A redacted text has exactly the line count of
 *    its input — the held-bytes design depends on it; pinned in test-security-invariants.ts §J.
 *  - An inline mid-sentence secret mention in prose (not at a line start) is not redacted.
 *  - Non-plain objects (e.g. Date) flatten to `{}` via the object branch in redactSecretsDeep
 *    (harmless: result.json is JSON-serialized anyway).
 */

export interface RedactArtifactResult {
  redacted: string;
  redactedCount: number;
}

export const PLACEHOLDER = '<<REDACTED-SECRET>>';
const MAX_REDACT_DEPTH = 200; // fail-open ceiling: a backstop must never throw on the write path

// Each regex: group 1 = preserved prefix (line indent + directive), group 2 = secret token.
// Lowercase + line-anchored (/gm) so prose/headings don't collide. Token `\S+` redacts to the next
// whitespace (no `"`/`\` exclusion needed: these run on PARSED string values / markdown text, never
// on a serialized-JSON blob, so there is no delimiter to over-grab — and excluding `"`/`\` would
// leak the tail of a secret that legitimately contains them).
const PATTERNS: RegExp[] = [
  /^([ \t]*enable\s+(?:secret|password)(?:\s+level\s+\d+)?(?:\s+(?:\d+|sha512|sha256|md5))?\s+)(\S+)/gm,
  // username: allow EOS/NX-OS middle keywords (privilege/role/nopassword) between the name and
  // secret, and an algorithm-named type (sha512/sha256/md5) not just a numeric type — e.g.
  // `username admin privilege 15 role network-admin secret sha512 $6$...`. Additive over the IOS form.
  /^([ \t]*username\s+\S+(?:\s+(?:privilege\s+\d+|role\s+\S+|nopassword))*\s+(?:secret|password)(?:\s+(?:\d+|sha512|sha256|md5))?\s+)(\S+)/gm,
  /^([ \t]*snmp-server\s+community\s+)(\S+)/gm,
  /^([ \t]*(?:tacacs|radius)-server\s+(?:host\s+\S+\s+)?key(?:\s+\d+)?\s+)(\S+)/gm,
  /^([ \t]*crypto\s+isakmp\s+key\s+)(\S+)/gm,
  /^([ \t]*pre-shared-key(?:\s+address\s+\S+)?\s+)(\S+)/gm,
  // key-string: allow the encryption-type digit — `key-string 7 060506324F41` (the form a real
  // device emits under `service password-encryption`). Without `(?:\s+\d+)?` the pattern consumed
  // the `7` as the secret and LEAKED the hash while reporting redactedCount 1 (sec-ops 2026-08-16,
  // self-masking defect — the one gap class that reports success). Mirrors the tacacs/radius shape.
  /^([ \t]*key-string(?:\s+\d+)?\s+)(\S+)/gm,
  /^([ \t]*ppp\s+(?:chap|pap)\s+password(?:\s+\d+)?\s+)(\S+)/gm,
  // ── Routing-auth family (2026-08-16, cross-port ③a — formerly accepted residuals) ─────────────
  // These directives live in `show run | section router bgp|ospf` / `show run interface <if>` —
  // the exact reads the network protocol's harvest discipline commands. Line-anchored + lowercase
  // per the FP discipline; directive-specific (no secret-shape gate), matching the sibling families.
  // BGP neighbor auth: `neighbor 10.0.0.1 password 7 070C285F4D06` (peer token between the keywords).
  /^([ \t]*neighbor\s+\S+\s+password(?:\s+\d+)?\s+)(\S+)/gm,
  // OSPF MD5: interface `ip ospf message-digest-key 1 md5 7 …` + `area N virtual-link X message-digest-key …`.
  /^([ \t]*(?:ip\s+ospf\s+|area\s+\S+\s+virtual-link\s+\S+\s+)message-digest-key\s+\d+\s+md5(?:\s+\d+)?\s+)(\S+)/gm,
  /^([ \t]*ip\s+ospf\s+authentication-key(?:\s+\d+)?\s+)(\S+)/gm,
  // ISIS: `isis password 7 … [level-2]` — token-in-place, a trailing level keyword survives.
  /^([ \t]*isis\s+password(?:\s+\d+)?\s+)(\S+)/gm,
  // SNMPv3 (EOS-style): `snmp-server user bob v3 auth md5 auth-password X … priv-password Y` —
  // two separate patterns so BOTH tokens on one line are redacted. `[^\n]*?` keeps it one line.
  /^([ \t]*snmp-server\s+user\s+[^\n]*?\bauth-password\s+)(\S+)/gm,
  /^([ \t]*snmp-server\s+user\s+[^\n]*?\bpriv-password\s+)(\S+)/gm,
  // Junos: `encrypted-password "$9$…";` (brace style, line-anchored) or `set system root-authentication
  // encrypted-password "$9$…"` (set style). Opening quote preserved in the prefix; token stops before
  // the closing quote/semicolon so structure survives. Value-anchored on the distinctive $9$ marker.
  /^([ \t]*(?:set\s+[^\n]+\s)?encrypted-password\s+"?)(\$9\$[^"\s]+)/gm,
  // k8s / cloud families (2026-06-27, WP-C1): YAML `key: value` or env `KEY=value` for the common
  // secret-VALUE keys, case-insensitive. The value MUST be SECRET-SHAPED (a digit or one of $ . / = +)
  // so a prose line like `Password: required` is NOT redacted. Exact-key match (bare `secret`, not
  // `secretName`; `secret_key`, not `secretKeyRef`) leaves k8s *references* (names) intact — only values.
  /^([ \t]*(?:password|passwd|passphrase|token|api[_-]?token|api[_-]?key|apikey|client[_-]?secret|(?:aws[_-]?)?secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?key|private[_-]?key|privatekey|bearer(?:[_-]?token)?|auth[_-]?token|connection[_-]?string|connectionstring|dsn|secret)[ \t]*[:=][ \t]*)((?=\S*[\d$.\/=+])"?\S+)/gim,
  // terraform/IaC (2026-06-29, WP-C): JSON-quoted-key form `"key": "value"`. terraform `show -json` /
  // state is JSON, so the bare-key family above (line-anchored on an UNQUOTED key) slips past it — the
  // leading `"` breaks the `^[ \t]*key` anchor. Same secret-key set + secret-shaped gate. The token is
  // `[^"]+` (stops BEFORE the closing `"`) so the JSON object survives: a greedy `\S+` would eat the
  // closing quote and break structure (sec-ops IMP-2). PROSE backstop only — K1 is the state defense.
  /^([ \t]*"(?:password|passwd|passphrase|token|api[_-]?token|api[_-]?key|apikey|client[_-]?secret|(?:aws[_-]?)?secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?key|private[_-]?key|privatekey|bearer(?:[_-]?token)?|auth[_-]?token|connection[_-]?string|connectionstring|dsn|secret)"[ \t]*:[ \t]*")((?=[^"\n]*[\d$.\/=+])[^"\n]+)/gim,
  // nginx `proxy_set_header Authorization "Bearer abc123";` / `'Basic dXNlcjpwYXNz';` (P1, 2026-10-13; single quotes
  // since review S-3 -- nginx accepts both, and a JSON escape never applies to `'`). The
  // directive + header name + scheme are the anchor, so no secret-shape gate (a Basic credential is often
  // letters only). The scheme and the closing `";` survive. A `$variable` value is a reference, not a secret:
  // `(?!\$)` leaves `$http_authorization` / `"Bearer $token"` intact. `\\?"?` and the `\\`-free token let the
  // derived serialized variant match `\"Bearer x\";` without eating the escape. Case-insensitive: header
  // names and schemes are case-insensitive in HTTP; the directive keeps the line anchored.
  /^([ \t]*proxy_set_header[ \t]+authorization[ \t]+(?:\\?["'])?(?:bearer|basic)[ \t]+)((?!\$)[^\s"'\\;]+)/gim,
  // AWS access key id — distinctive (AKIA + 16 upper/digit), redact inline wherever it appears.
  /()(AKIA[0-9A-Z]{16})/g,
  // FAIL-SAFE generic: lowercase directive at line start + a SECRET-SHAPED token. Bare `:` REMOVED
  // 2026-06-27 (WP-C1) to stop prose FPs like `password requirements:` / `key findings:`; YAML `key:
  // value` is now handled by the k8s family above. A digit or one of $ . / = still qualifies.
  /^([ \t]*(?:password|secret|key)(?:\s+\d+)?\s+)((?=\S*[\d$.\/=])\S+)/gm,
];

// ── BLOCK-CONTEXT patterns (P1, 2026-10-13): a YAML key that is a secret only INSIDE a named parent block.
// The parent line is the anchor (`credentials:` alone is too generic; `Authorization:` alone collides with
// prose and HTTP-header explanations). Group 1 = preserved prefix (parent line + the intervening lines +
// the key); group 2 = the parent's indent, back-referenced so the child must be indented deeper and every
// intervening line too (the block ends where indentation returns). The token is always the END of the match,
// so the replacer reads it as `whole.slice(prefix.length)` rather than by group number.
// LINEAR BY CONSTRUCTION: each intervening line is `\2[ \t][^\n]*\n` (one way to match a line, no
// whitespace ambiguity — `[ \t]+[^\n]*` would be exponential on failure), and the window is capped at 32
// lines so a deeply nested hostile block costs at most 32 lines per start. A credential more than 32 lines
// below its parent, or after a blank line inside the block, is a priced false negative.
// NOT applied on the serialized-leaf arm (arm 2): its `\\n` line separators are not `\n`, and arm 1 parses
// every leaf that is valid JSON. A TRUNCATED serialized leaf carrying one of these blocks is a residual.
const BLOCK_CONTEXT_PATTERNS: RegExp[] = [
  // Prometheus `authorization:` block — `type: Bearer` + `credentials: <token>` (scrape configs, remote_write).
  // `\r?\n` on the parent (review S-2): CRLF text from Windows hosts and some APIs; intervening lines already admit `\r`.
  // The parent pins the meaning, so no secret-shape gate. Lowercase: Prometheus keys are lowercase.
  /^(([ \t]*)(?:-[ \t]+)?authorization:[ \t]*\r?\n(?:\2[ \t][^\n]*\n){0,32}?\2[ \t]+credentials:[ \t]*(?:\\?["'])?)((?!\$)[^\s"'\\]+)/gm,
  // YAML `headers:` map (OTel exporters, Prometheus remote_write) — `Authorization: "Bearer x"` / `Basic x`.
  // Scheme required (the brief's shape; a scheme-less header value is a residual). `$` / `${env:X}` values
  // are references and survive. Case-insensitive for the header name and scheme.
  /^(([ \t]*)(?:-[ \t]+)?headers:[ \t]*\r?\n(?:\2[ \t][^\n]*\n){0,32}?\2[ \t]+["']?authorization["']?[ \t]*:[ \t]*["']?(?:bearer|basic)[ \t]+)((?!\$)[^\s"'\\]+)/gim,
];

// ── PEM PRIVATE KEY BLOCKS (P1, 2026-10-13) — a block-pattern kind, implemented as a linear scan, not a regex
// with a lazy `[\s\S]*?` body (that is quadratic on many BEGIN markers with no END — the F9-s2 class).
// The BEGIN and END lines survive; every body segment's non-whitespace CORE becomes one placeholder, so the
// segment (= line) count, indentation and separators are unchanged — R10 IS LINE-PRESERVING and the
// held-bytes design depends on it (pinned in test-security-invariants.ts §J). One block counts once.
// `-----BEGIN CERTIFICATE-----` / `PUBLIC KEY` are not matched: only `… PRIVATE KEY-----` labels.
// ANCHOR (review B1 / S-1, 2026-10-13): a marker is not a directive -- reports, scripts and runbooks MENTION it
// (`head -1 key.pem` expecting a BEGIN line, a `sed` range, "paste the key that starts with …"). So a span is
// a key only when it LOOKS like one: every segment between the markers is blank, a `Proc-Type:`/`DEK-Info:` header,
// or whitespace-separated base64 runs, with at least one run of 16+ chars and every run but the last 16+ (a key's
// lines are 64 chars, its final line short). Otherwise that BEGIN is tried as UNTERMINATED instead.
// UNTERMINATED (a capped leaf cut mid-key): only when the BEGIN line's remainder is blank or key-shaped by the same
// rule; then that remainder plus following body-shaped lines (base64 runs of 16+ chars, headers, one blank line
// after a header) are redacted, stopping at the first other line. A short final line (<16 chars) of a cut key is a
// priced residual; so is a key whose BEGIN line carries trailing non-base64 text (not valid PEM).
// Whitespace includes the ESCAPED forms (`\t`, `\r` behind ANY run of backslashes: a key inside JSON, or JSON inside
// JSON -- review N-13); a base64 body never contains `\`, so a backslash run is always an escape.
// Sticky: tried only AT an `indexOf` candidate (a global-regex search per block measured ~10x slower on 35k blocks).
const PEM_BEGIN = /-----BEGIN (?:[A-Z0-9]+ ){0,3}PRIVATE KEY-----/y;
const PEM_END = /-----END (?:[A-Z0-9]+ ){0,3}PRIVATE KEY-----/y;
const PEM_WS = String.raw`(?:[ \t\r]|\\+[tr])`;
const PEM_BODY_LINE = new RegExp(String.raw`^${PEM_WS}*(?:[A-Za-z0-9+/=]{16,}|(?:Proc-Type|DEK-Info):[^\n]*)${PEM_WS}*$`);
const PEM_HEADER_LINE = new RegExp(String.raw`^${PEM_WS}*(?:Proc-Type|DEK-Info):`);
const PEM_BLANK = new RegExp(String.raw`^${PEM_WS}*$`);
const PEM_RUNS_SEGMENT = new RegExp(String.raw`^${PEM_WS}*(?:[A-Za-z0-9+/=]+(?:${PEM_WS}+[A-Za-z0-9+/=]+)*)?${PEM_WS}*$`);

/** Base64 run lengths of a body segment; 'header' for a Proc-Type/DEK-Info line; null if the segment is not key-shaped. */
function pemSegmentRuns(seg: string): number[] | 'header' | null {
  if (PEM_HEADER_LINE.test(seg)) return 'header';
  if (!PEM_RUNS_SEGMENT.test(seg)) return null;
  // Escaped whitespace first: its `t`/`r` are base64 letters and would otherwise glue onto the next run.
  return (seg.replace(/\\+[tr]/g, ' ').match(/[A-Za-z0-9+/=]+/g) || []).map((r) => r.length);
}

/** The key-shape rule over a span's runs: at least one 16+ run, and every run but the last 16+. */
function pemRunsLookLikeKey(runs: number[]): boolean {
  return runs.some((n) => n >= 16) && runs.slice(0, -1).every((n) => n >= 16);
}

/** True when every segment (even indexes of a PEM_SEP split) is key-shaped and the runs pass the key rule. */
function pemSpanIsKey(parts: string[]): boolean {
  const runs: number[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const r = pemSegmentRuns(parts[i]);
    if (r === null) return false;
    if (r !== 'header') runs.push(...r);
  }
  return pemRunsLookLikeKey(runs);
}

/** Replace a segment's non-whitespace core with the placeholder; whitespace (incl. escaped `\t`/`\r`) kept. */
// A loop, not a `^(ws*)(.*?)(ws*)$` regex: that lazy middle is quadratic on one long whitespace run.
function redactSegment(seg: string): { out: string; changed: boolean } {
  let i = 0;
  let j = seg.length;
  for (;;) {
    if (seg[i] === ' ' || seg[i] === '\t' || seg[i] === '\r') { i += 1; continue; }
    if (seg[i] === '\\') {
      let k = i;
      while (seg[k] === '\\') k += 1;
      if (seg[k] === 't' || seg[k] === 'r') { i = k + 1; continue; }
    }
    break;
  }
  for (;;) {
    if (j > i && (seg[j - 1] === ' ' || seg[j - 1] === '\t' || seg[j - 1] === '\r')) { j -= 1; continue; }
    if (j - 1 > i && (seg[j - 1] === 'r' || seg[j - 1] === 't') && seg[j - 2] === '\\') {
      let k = j - 2;
      while (k - 1 >= i && seg[k - 1] === '\\') k -= 1;
      j = k;
      continue;
    }
    break;
  }
  const core = seg.slice(i, j);
  if (core.length === 0 || core === PLACEHOLDER) return { out: seg, changed: false };
  return { out: seg.slice(0, i) + PLACEHOLDER + seg.slice(j), changed: true };
}

// Body segments split on BOTH separators: a real newline, and an ESCAPED one (`\n` behind any run of backslashes:
// a serialized leaf, or JSON inside JSON -- review N-13). R10's plain pass runs before arm 2 on a serialized leaf,
// so a `\n`-only split there would fold an encoded body into ONE placeholder and eat its encoded newlines.
const PEM_SEP = /(\n|\\+n)/;

/** The next `literal…PRIVATE KEY-----` marker at or after `from`: [index, length], or null. */
function findPemMarker(text: string, from: number, literal: string, re: RegExp): [number, number] | null {
  for (let i = text.indexOf(literal, from); i !== -1; i = text.indexOf(literal, i + 1)) {
    re.lastIndex = i;
    const m = re.exec(text);
    if (m) return [i, m[0].length];
  }
  return null;
}

function redactPemBlocks(text: string): RedactArtifactResult {
  if (!text.includes('PRIVATE KEY-----')) return { redacted: text, redactedCount: 0 };
  let redactedCount = 0;
  let out = '';
  let cursor = 0;
  // The next END, cached: a run of END-less BEGINs looks it up once (null = none left), not once per BEGIN.
  let nextEnd: [number, number] | null | undefined;
  let b = findPemMarker(text, 0, '-----BEGIN ', PEM_BEGIN);
  while (b) {
    const bodyStart = b[0] + b[1];
    if (nextEnd === undefined || (nextEnd !== null && nextEnd[0] < bodyStart)) nextEnd = findPemMarker(text, bodyStart, '-----END ', PEM_END);
    const following = findPemMarker(text, bodyStart, '-----BEGIN ', PEM_BEGIN);
    let changed = false;
    const redactParts = (parts: string[]): string => parts.map((seg, i) => {
      if (i % 2 === 1) return seg; // a separator
      const r = redactSegment(seg);
      if (r.changed) changed = true;
      return r.out;
    }).join('');
    let body = '';
    let bodyEnd = bodyStart;
    const terminatedParts = nextEnd && (!following || nextEnd[0] < following[0])
      ? text.slice(bodyStart, nextEnd[0]).split(PEM_SEP) : null;
    if (nextEnd && terminatedParts && pemSpanIsKey(terminatedParts)) {
      // TERMINATED, and the span looks like a key: every segment between the markers.
      bodyEnd = nextEnd[0];
      body = redactParts(terminatedParts);
    } else {
      // UNTERMINATED (or a span that is not key-shaped): only if the BEGIN line's remainder is blank or key-shaped.
      const parts = text.slice(bodyStart, following ? following[0] : text.length).split(PEM_SEP); // [seg, sep, seg, ...]
      const head = pemSegmentRuns(parts[0]);
      if (Array.isArray(head) && (head.length === 0 || pemRunsLookLikeKey(head))) {
        let keep = 1; // parts kept: the BEGIN line's remainder
        let prevHeader = false;
        for (let i = 2; i < parts.length; i += 2) {
          if (PEM_BODY_LINE.test(parts[i]) || (PEM_BLANK.test(parts[i]) && prevHeader)) { keep = i + 1; prevHeader = PEM_HEADER_LINE.test(parts[i]); continue; }
          break;
        }
        const kept = parts.slice(0, keep);
        body = redactParts(kept);
        bodyEnd = bodyStart + kept.join('').length;
      }
    }
    if (changed) redactedCount += 1;
    out += text.slice(cursor, bodyStart) + body;
    cursor = bodyEnd;
    b = following; // always at or after bodyEnd: a body never extends past the next BEGIN
  }
  out += text.slice(cursor);
  return { redacted: out, redactedCount };
}

/** Apply a prefix/token pattern list. The token is the tail of the match after group 1 (true of every
 *  pattern here), so a pattern may carry extra groups (BLOCK_CONTEXT_PATTERNS back-reference an indent). */
function applyPatterns(text: string, patterns: RegExp[]): RedactArtifactResult {
  let redactedCount = 0;
  let out = text;
  for (const re of patterns) {
    out = out.replace(re, (whole: string, prefix: string) => {
      const token = whole.slice(prefix.length);
      if (token === PLACEHOLDER) return whole; // already redacted by an earlier pattern (idempotent)
      redactedCount += 1;
      return prefix + PLACEHOLDER;
    });
  }
  return { redacted: out, redactedCount };
}

/**
 * R10's VERSION (P1 / PLATFORM-HELD-BYTES P3-B4, 2026-10-13). Part of a held file's base identity
 * (`redactorVersion` beside `baseHash`): a held base is `sha256(redactArtifactSecrets(text))`, so ANY change to what
 * the plain-text arm emits changes every affected hash. A version change between harvest and check reads "base
 * changed" -- the safe direction. BUMP IT whenever `redactArtifactSecrets`' output can change: a PATTERNS /
 * BLOCK_CONTEXT_PATTERNS / PEM rule, the placeholder, or the PEM/segment logic. test-security-invariants.ts §J pins
 * a fingerprint (rule sources + outputs over a golden corpus) per version and fails when they move without a bump.
 * History: paichart.r10/1 = everything before 2026-10-13 (never stamped); paichart.r10/2 = P1.
 * Self-host with R10 switched off stamps `redactorVersion: "none"` (the P3 contract), never this constant.
 */
export const R10_VERSION = 'paichart.r10/2';

/** The plain-text arm's rule sources, in application order -- input to the §J version fingerprint (read-only copy:
 *  the RegExp objects stay private, since global regexes carry `lastIndex` state). */
export const R10_RULE_SOURCES: readonly string[] = Object.freeze([
  `placeholder:${PLACEHOLDER}`,
  ...[PEM_BEGIN, PEM_END, PEM_BODY_LINE, PEM_HEADER_LINE, PEM_BLANK, PEM_RUNS_SEGMENT, PEM_SEP].map((re) => `pem:/${re.source}/${re.flags}`),
  ...PATTERNS.map((re) => `line:/${re.source}/${re.flags}`),
  ...BLOCK_CONTEXT_PATTERNS.map((re) => `block:/${re.source}/${re.flags}`),
]);

/** R10's PLAIN-TEXT arm -- the only arm a held-file base may use (P3-B3): no JSON re-serialisation, no escaped-newline
 *  variants. Line-preserving (pinned §J). */
export function redactArtifactSecrets(text: string): RedactArtifactResult {
  if (!text || typeof text !== 'string') {
    return { redacted: typeof text === 'string' ? text : '', redactedCount: 0 };
  }
  const pem = redactPemBlocks(text);
  const line = applyPatterns(pem.redacted, PATTERNS);
  const block = applyPatterns(line.redacted, BLOCK_CONTEXT_PATTERNS);
  return { redacted: block.redacted, redactedCount: pem.redactedCount + line.redactedCount + block.redactedCount };
}

/**
 * Redact secrets in every STRING leaf of an object tree, returning a redacted COPY (the original is
 * not mutated, so the live return value is unaffected — only the persisted artifact copy).
 *
 * Fail-open past MAX_REDACT_DEPTH (a deeply-nested adversarial leaf must SKIP redaction, never throw
 * a stack overflow on the persist write path).
 *
 * This is the correct path for result.json: redacting the serialized, pretty-printed JSON string is
 * broken because a config directive after a newline becomes `\nenable...`, where the escape's `n`
 * glues to the directive and defeats the line/`\b` anchor. Operating on live string fields sidesteps it.
 */
/**
 * SERIALIZED-LEAF ARMS (WS1, 2026-08-28) — the blind spot this module documented and believed
 * deep-walk had sidestepped.
 *
 * Deep-walk fixes OUR serialization: it redacts live string fields instead of the pretty-printed
 * JSON. It cannot help a leaf that ARRIVES pre-serialized — an MCP structured-output tool emits its
 * payload twice, once parsed and once as a JSON string, and in that string every newline is the two
 * characters `\` `n`. PATTERNS are `^`-anchored under /m, so there are no line starts to anchor to
 * and every pattern misses. The guard then reports success because it genuinely redacted the parsed
 * copy. Live consequence (IGP-T1 R16): an admin sha512 hash and plaintext SNMP community strings
 * persisted in `agent_artifacts` with the control switched ON.
 *
 * Measured across 250 artifacts / 1363 tool calls: 670 blind-shaped leaves — 339 valid JSON,
 * 179 truncated-or-malformed JSON (cut by a cap, so they will never parse), 2 plain text.
 *
 * ARM 1 (PRIMARY) — parse → deep-redact → re-stringify. For a leaf that parses, its inner strings
 * become live fields again and the EXISTING patterns apply unchanged: zero aliasing, zero
 * token-boundary compromise. This is the arm that should carry the traffic.
 *
 * ARM 2 (FALLBACK) — escaped-anchor variants applied IN PLACE, for leaves that do not parse. This
 * covers the 179 truncated ones, which are the majority of what arm 1 cannot reach.
 *
 * REJECTED (sec-ops, and worth keeping rejected): normalize-then-map — build a copy with real
 * newlines, match on it, map hits back by offset. Three defects. (a) ALIASING: inside serialized
 * JSON you cannot distinguish an encoded newline from the tail of an encoded backslash without the
 * full string decode you just failed at, so a naive normalize decodes the wrong one and the offset
 * map is built on a misread. (b) OFFSET DRIFT: every two-char→one-char replacement shifts all
 * downstream offsets, and an off-by-N redaction on a secret is a PARTIAL LEAK that logs success.
 * (c) RESTRINGIFY DRIFT: any round-trip through decoded form risks re-encoding escapes differently,
 * breaking the byte-identical-except-tokens promise. Adapting the ANCHORS avoids all three: no copy,
 * no offset map, no re-encoding, and the placeholder is JSON-safe so the leaf stays valid.
 *
 * BOUNDED, PRICED RESIDUALS (owner ruling: the low-false-positive bias is RETAINED even though this
 * is now the sole control — "if it means we get a false negative from time to time, that's OK"):
 *  - Arm 2's `\\n` aliasing can create a FALSE line boundary. Worst case is a false-POSITIVE
 *    redaction, not a leak, and the secret-shaped-token + directive-prefix discipline bounds it.
 *  - A leaf cut MID-DIRECTIVE can orphan a secret token from its prefix. Both arms are
 *    directive-anchored, so it is invisible to each. Unfixable without value-shape-only matching,
 *    which this module refuses by design. Accepted, alongside `wpa-psk`.
 *  - Arm 2 is scoped to STRING LEAVES ONLY and never runs on the markdown/report.md path, where
 *    R10 walks LLM-authored prose and false positives are likeliest. HARD constraint, not advisory.
 */
const ESCAPED_NL = '\\\\n'; // the two characters backslash-n, as they appear inside a JSON string

/** Derive an escaped-anchor variant of a line-anchored pattern, for in-place use on a serialized leaf. */
function toSerializedVariant(re: RegExp): RegExp {
  const src = re.source
    // `^` (line start under /m) also matches an ENCODED newline. The alternation is folded INSIDE
    // the prefix capture group, NOT placed before it: the replacement emits `prefix + PLACEHOLDER`,
    // so an anchor outside group 1 is silently DELETED on every match at a newline. Caught in test:
    // `...sha512 $6$AAAA$BBBB\nsnmp-server...` came back as `...<<REDACTED-SECRET>>snmp-server...`
    // with the encoded newline eaten — no leak, correct count, and a corrupted string. That is
    // exactly the byte-identity break this design rejected normalize-then-map to avoid.
    .replace(/^\^\(/, `((?:^|${ESCAPED_NL})`)
    // the indent class additionally accepts the encoded tab
    .replace(/\[ \\t\]\*/g, `(?:[ \\t]|\\\\\\\\t)*`)
    // token class must stop at `\` and `"`: in serialized form `\S+` would run through an encoded
    // newline and swallow the next directive, over-redacting far past the secret.
    .replace(/\(\\S\+\)/g, '([^\\s\\\\"]+)')
    .replace(/\\S\+\)/g, '[^\\s\\\\"]+)');
  return new RegExp(src, re.flags);
}

const SERIALIZED_PATTERNS: RegExp[] = PATTERNS.map(toSerializedVariant);

/** ARM 2 — redact a pre-serialized string leaf in place. Never used on the markdown path. */
export function redactSerializedLeaf(text: string): RedactArtifactResult {
  // PEM (P1): idempotent here when the plain pass already ran (redactSecretsDeep); kept for direct callers.
  const pem = redactPemBlocks(text);
  const line = applyPatterns(pem.redacted, SERIALIZED_PATTERNS);
  return { redacted: line.redacted, redactedCount: pem.redactedCount + line.redactedCount };
}

/** A string leaf that ARRIVED serialized: long enough to matter and carrying encoded newlines. */
export function looksSerialized(s: string): boolean {
  return s.length > 40 && s.includes('\\n');
}

export function redactSecretsDeep(value: unknown): { value: unknown; redactedCount: number } {
  let redactedCount = 0;
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > MAX_REDACT_DEPTH) return v; // fail-open
    if (typeof v === 'string') {
      // ARM 1 — a leaf that parses as JSON becomes live fields again; existing patterns apply.
      if (looksSerialized(v) && /^\s*[{[]/.test(v)) {
        try {
          const parsed = JSON.parse(v);
          const inner = walk(parsed, depth + 1);
          if (redactedCount > 0 || inner !== parsed) return JSON.stringify(inner);
        } catch {
          // falls through to arm 2 — a truncated/malformed leaf never parses
        }
      }
      const r = redactArtifactSecrets(v);
      redactedCount += r.redactedCount;
      // ARM 2 — in place, only for leaves that arrived serialized.
      if (looksSerialized(v)) {
        const s = redactSerializedLeaf(r.redacted);
        redactedCount += s.redactedCount;
        return s.redacted;
      }
      return r.redacted;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>)) {
        out[k] = walk((v as Record<string, unknown>)[k], depth + 1);
      }
      return out;
    }
    return v;
  };
  return { value: walk(value, 0), redactedCount };
}

/**
 * The ONE R10-off predicate (PLATFORM-HELD-BYTES Stage A, 2026-10-14, panel D6 / sec-ops N-3). Every site that honours
 * the R10 switch calls this, so the switch cannot drift between the persist path and the held-bytes capture. Only an
 * explicit 'false' disables R10 (default-ON since 2026-08-28 — see redactArtifactsForPersist).
 */
export function isR10Disabled(): boolean {
  return process.env.ARTIFACT_SECRET_REDACT_ENABLED === 'false';
}

/**
 * SHARED persist-site helper — used by BOTH the engine and the stream route so the two artifact
 * persist paths cannot drift (WS2 parity). Reads the flag itself (single source of the gate), deep-
 * redacts result.json + redacts report.md text, returns the redacted copies + the total token count.
 * Flag OFF → returns the inputs unchanged, count 0.
 */
export function redactArtifactsForPersist(
  resultJsonObject: unknown,
  reportMdContent: string | null,
): { resultJson: unknown; reportMd: string | null; redactedCount: number } {
  // DEFAULT-ON since 2026-08-28 (Steve's ruling). This was `!== 'true'` — opt-IN, default OFF —
  // and the reason no longer exists. That default was calibrated to a posture in which the REAL
  // redaction happened service-side and this was a narrow backstop for a "conformant-but-buggy"
  // service, reachability being guaranteed by the WS3 conformance allowlist. The allowlist was
  // designed and dropped the same evening, 2026-06-24, with zero code written (this module's own
  // header asserted it 57 minutes before the drop and was never swept). There is no attestation
  // anywhere in the call path — so this is not a backstop behind a control, it IS the control, and
  // a control that defaults to off is a control you have to remember to have.
  //
  // The risk model also moved: opt-in assumed sensitive structured payloads arrived only in
  // deliberate high-assurance engagements. purple-ai (33/33 tools) and google-secops (68/~78) are
  // registered NOW — a casual services.call pulls SIEM/threat-intel through the same pipeline.
  //
  // Explicit `'false'` still disables it (byte-exact persist pins need that). Prod sets `'true'`
  // explicitly, so this changes nothing there; it changes dev, test and fresh deployments.
  if (isR10Disabled()) {
    return { resultJson: resultJsonObject, reportMd: reportMdContent, redactedCount: 0 };
  }
  const deep = redactSecretsDeep(resultJsonObject);
  let redactedCount = deep.redactedCount;
  let reportMd = reportMdContent;
  if (reportMdContent !== null) {
    const r = redactArtifactSecrets(reportMdContent);
    reportMd = r.redacted;
    redactedCount += r.redactedCount;
  }
  return { resultJson: deep.value, reportMd, redactedCount };
}

/** The same R10 control for a further text artifact persisted beside result.json/report.md (G1 B: the requirements
 *  pre-correction draft). Same switch: only an explicit 'false' disables it. */
export function redactExtraArtifactForPersist(text: string): { text: string; redactedCount: number } {
  if (isR10Disabled()) return { text, redactedCount: 0 };
  const r = redactArtifactSecrets(text);
  return { text: r.redacted, redactedCount: r.redactedCount };
}
