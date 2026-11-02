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
 *  - NETWORK FAMILIES (R10 v7, 2026-10-23, R10-V7-BRIEF; held-network precondition N-1): SNMPv3 `auth <alg> <k> priv … <k>`,
 *    `snmp-server host … <community>`, IS-IS interface/process keys, NTP, VRRP/HSRP, `server-private … key`, IOS-XE
 *    `algorithm-type`, the IOS keyring / `crypto isakmp key 6`, Junos `"$9$…"` under any key, `encrypted-password` crypt hashes,
 *    and the Junos SNMP community (set form; brace form inside `snmp {`) are now caught; the `pre-shared-key ascii-text "$9$…"`
 *    PARTIAL redaction (the type word replaced, the reversible value in clear) is fixed. Priced residuals, measured: a bare
 *    ` key <letters>` with no `tacacs|radius server` parent (ambiguous — a keychain's `key 1` and crypto clauses share it); a
 *    typeless IS-IS `authentication key <k>` (a device always prints the type); a letters-only value after an explicit type digit
 *    outside the families above (`password 0 cisco` — honestly count 0 since v7, where v6 redacted the DIGIT and claimed count 1);
 *    an unquoted `$9$`; a quoted `$9$` shorter than 4 alphabet characters or longer than 512; ASA `snmp-server host <if> <ip>
 *    community <c>` and `ikev1|ikev2 … pre-shared-key` (ASA masks them in `show run`); `wpa-psk`; a PSK literally `local`/`remote`/
 *    `password` (refused as a token). From the sec-ops R10v7 review, priced and filed (register R10-V7-RESIDUALS): NX-OS FHRP sub-mode
 *    (`hsrp N` / `vrrp N` then ` authentication …` on its own line) and `key-octet-string`; `server-private … retransmit|non-standard`,
 *    an IPv6 `server-private`, `pac key`, `key-wrap`; prose starting `snmp-server host …` / `authentication key 7 …` / `set the
 *    pre-shared-key to …` loses one word (over-redaction); `no …` / `delete …` rollback forms (every rule, pre-existing); a plain-text
 *    quoted value containing `\` or `\"` keeps its tail (count 1 — the arm-2 aliasing residual, here on `pre-shared-key` and the Junos
 *    community); arm 2 words separated by an ENCODED tab; a quoted SNMP community name with a space keeps its tail; in arm 2 an escape
 *    between `set` and the keyword (a quoted description first) hides `pre-shared-key` / `encrypted-password` (the SF-1 linearity price). PRE-EXISTING, not v7's: an older rule whose directive ends a line can take the next line's first word (`\s+`
 *    crosses the newline) — over-redaction only; every v7 rule is line-bound (`[ \t]`).
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

// ── REFERENCE EXEMPTION (R10 v3, PLATFORM-HELD-BYTES Stage B P1-3, 2026-10-14; sec-ops v3 NB-1, v4 SF-D) ─────────────
// A token that is WHOLLY a configuration reference -- `${NAME}`, `${env:NAME}` (OTel's documented form) or a Go/Helm
// template `{{ .Values.x }}`, optionally quoted -- is not a secret and is NOT redacted. Before v3 the k8s family redacted
// these (`$` made them "secret-shaped"), which under held bytes would make every well-written exporter block
// un-editable. The exemption is a NEGATIVE LOOKAHEAD at the token start, and it is:
//  - WHOLE-TOKEN and PER-FAMILY: the reference must be followed by THAT family's own value terminator (plain/k8s:
//    whitespace or end of line; JSON-quoted: `"`; URL userinfo: `@`; arm 2 additionally an escaped `\n` `\r` `\t` `\"`).
//    `password: ${X};Synth3ticPw9` is therefore redacted -- the token does not END at the reference. Never `,` `;` `#`
//    (a YAML comment needs whitespace before it).
//  - NO BARE `$NAME`: `password: $PG_PASS` stays redacted (a false positive kept, not a leak), because `$Synth3tic…`
//    is a literal-secret shape. Only `proxy_set_header` keeps its `(?!\$)`, which is real nginx variable syntax.
//  - BOUNDED (`{0,127}` / `{1,256}`): the URL family below is not line-anchored, so every quantifier it reaches is
//    bounded. A reference with a name over 128 characters is redacted (a false positive, the safe direction).
// `${env:A:default}` / `${env:A:-default}` / Spring-Quarkus `${DB_PASS:literal}` are NOT references here (the default is a
// literal) -- redacted. The only prefix the shape admits is `env:` (code review sec-ops B-1: an open `${A:B}` exempted
// `${DB_PASS:Synth3tic…}` in every family). Residuals of the NEW coverage, named (sec-ops CR N-1..N-3): the new header keys
// reach plain YAML/env lines only (JSON-quoted `"access_token"`, `DD_API_KEY:` env form, k8s name/value pairs are not
// matched); URL passwords containing `/` `"` `'` `\`, a JSON-escaped `\/\/` in an arm-2 leaf, and schemes over 32 chars
// are not matched; `"${X}" tail` / `${X} tail` now count 0 (the tail was already in clear under v2).
// Spaced template LITERALS (`{{ "lit" }}`, `{{ .X | default "lit" }}`) are a named pre-existing residual: the token
// ends at the first space, so they are untouched both before and after v3.
const REF = String.raw`(?:\$\{(?:env:)?[A-Za-z_]\w{0,127}\}|\{\{[ \t]{0,8}\.[\w.]{1,256}[ \t]{0,8}\}\})`;
const REF_QUOTED = `(?:"${REF}"|'${REF}'|${REF})`;
/** The plain/k8s family's terminator. toSerializedVariant rewrites EXACTLY this string for arm 2 (pinned). */
const TERM_PLAIN = String.raw`(?=\s|$)`;
/** Arm 2's version of TERM_PLAIN: an escaped `\n` `\r` `\t` `\"` also ends a token in a serialized leaf (sec-ops NOTE-3). */
const TERM_SERIALIZED = String.raw`(?=\s|$|\\[nrt"])`;
/** Exempt a token that is wholly a reference followed by `term`. */
const refExempt = (term: string, ref: string = REF_QUOTED): string => `(?!${ref}${term})`;
// R10 v5 (R10-EXPR-RHS): an unquoted expression right-hand side names where a secret LIVES, never the secret itself.
// sec-ops R10v5 review B-1/B-2 (folded before ship): the prefixes are CASE-SENSITIVE (rule 23 is no longer /i -- its key
// names are spelled case-insensitively by `ci`), and the WHOLE token must be the expression (then an optional `,`/`;`, then
// TERM_PLAIN, which arm 2 rewrites), so a literal glued after a reference (`process.env.X||Lit9`, `var.x;S3cret`,
// `os.environ.get("K","Lit9")`) is still redacted. Named residual: a lowercase literal that IS a complete expression
// (`data.Synth3tic9`) is exempt -- closing it needs path awareness (filed with R10-MAKEFILE-SPACED).
const EXPR_ID = String.raw`[A-Za-z_][\w-]*`;
const EXPR_Q = String.raw`(?:\\?"[\w.\/-]+\\?"|'[\w.\/-]+')`;
const EXPR_IDX = String.raw`\[(?:\d+|${EXPR_Q})\]`;
const EXPR_CALLARG = String.raw`\(${EXPR_Q}\)`;
const EXPR_FULL = String.raw`(?:(?:var|local|module|data|each|count|self|path|terraform)\.${EXPR_ID}(?:\.${EXPR_ID}|${EXPR_IDX})*(?:\(\))?|os\.environ(?:${EXPR_IDX}|\.get${EXPR_CALLARG})|os\.(?:getenv|Getenv)${EXPR_CALLARG}|process\.env(?:\.${EXPR_ID}|${EXPR_IDX}))`;
// R10 v6 (2026-10-21, R10-V6-TERRAFORM; held-terraform T-12 measured it: `password = random_password.this.result`): a Terraform
// RESOURCE ATTRIBUTE reference is an expression too. Narrow on purpose (sec-ops step-1 review): only after an HCL ` = ` (a space each
// side — YAML's `:` and dotenv's `KEY=x` are never exempted), a case-SENSITIVE resource-type first segment carrying an underscore
// (every provider type is `<provider>_<kind>`: `random_password`, `aws_db_instance`), then the name and AT LEAST ONE more part, and
// the WHOLE token (TERM_PLAIN). Residual, priced: a literal of exactly that shape after ` = ` is exempt (`p = my_pw.abc.def`).
// The same HCL ` = ` gate admits two more CODE shapes (measured on the 1,027-file public module corpus once v6's wider key set reached the
// FLAG keys a module names `*_password` — `manage_master_user_password`, `create_random_password`, `password_wo` — whose RHS is code):
//   a call of a TERRAFORM BUILT-IN function `try(…)`, `coalesce(…)`, `nonsensitive(…)` — a CLOSED list (sec-ops R10v6 B-1: an open
//   `name(` exempted INI/my.cnf/.properties literals after a spaced ` = `, e.g. `password = s3cr3t(9xQ`, in clear with count 0), and
//   a reference, optionally NEGATED (`!local.is_replica`), followed by `&&` / `||` / `?` / `==` / `!=` (a boolean or conditional expression).
// my.cnf / INI `password = s3cr3t9` stays redacted (a bare token is none of these shapes).
const HCL_EQ = String.raw`(?<=[ \t]=[ \t]{1,8})`;
const EXPR_RESOURCE_REF_BODY = String.raw`[a-z][a-z0-9]*_[a-z0-9_]*\.${EXPR_ID}(?:\.${EXPR_ID}|${EXPR_IDX})+`;
const EXPR_RESOURCE_REF = `${HCL_EQ}${EXPR_RESOURCE_REF_BODY}[,;]?`;
const EXPR_HCL_CODE = `${HCL_EQ}(?:(?:abs|abspath|alltrue|anytrue|base64decode|base64encode|base64gzip|base64sha256|base64sha512|basename|bcrypt|can|ceil|chomp|chunklist|cidrhost|cidrnetmask|cidrsubnet|cidrsubnets|coalesce|coalescelist|compact|concat|contains|csvdecode|dirname|distinct|element|endswith|ephemeralasnull|file|filebase64|filebase64sha256|filebase64sha512|fileexists|filemd5|fileset|filesha1|filesha256|filesha512|flatten|floor|format|formatdate|formatlist|indent|index|issensitive|join|jsondecode|jsonencode|keys|length|log|lookup|lower|matchkeys|max|md5|merge|min|nonsensitive|one|parseint|pathexpand|plantimestamp|pow|range|regex|regexall|replace|reverse|rsadecrypt|sensitive|setintersection|setproduct|setsubtract|setunion|sha1|sha256|sha512|signum|slice|sort|split|startswith|strcontains|strrev|substr|sum|templatefile|templatestring|textdecodebase64|textencodebase64|timeadd|timecmp|timestamp|title|tobool|tolist|tomap|tonumber|toset|tostring|transpose|trim|trimprefix|trimspace|trimsuffix|try|type|upper|urlencode|uuid|uuidv5|values|yamldecode|yamlencode|zipmap)\\(|!?(?:${EXPR_FULL}|${EXPR_RESOURCE_REF_BODY})(?:` + String.raw`[ \t]+(?:&&|\|\||\?|==|!=)(?=\s)` + `|[,;]?` + TERM_PLAIN + `))`;
const EXPR_RHS_EXEMPT = `(?!${EXPR_FULL}[,;]?` + TERM_PLAIN + `|${EXPR_RESOURCE_REF}` + TERM_PLAIN + `|${EXPR_HCL_CODE}` + String.raw`|\$\{\{[ \t]*(?:secrets|vars|env|inputs|steps|needs|github)\.[\w.-]+[ \t]*\}\}[,;]?` + TERM_PLAIN + `)`;
// R10 v6 (2026-10-21, R10-V6-TERRAFORM + R10-PREFIXED-PASSWORD-KEYS; sec-ops step-1 review FALSE NEGATIVES): a PREFIXED password key
// (`master_password`, `db_password`, `admin_password`, `DB_PASSWORD`, `db-password`) and the Terraform 1.11 WRITE-ONLY suffix (`password_wo`,
// `secret_key_wo`) left a literal in clear. Password family only for the prefix: a prefixed `token` / `secret` / `key` collides with counts
// and names (`max_token: 4000`, `kms_secret_name`). The suffix is exactly `_wo` / `-wo`, so `password_length` / `password_hash` stay out.
// Spelled through `ci` (rule 23 is case-sensitive since v5), so the prefix class lists both cases itself.
const PREFIXED_PASSWORD = String.raw`(?:[A-Za-z0-9]+[_-])+(?:password|passwd|passphrase)`;
const WRITE_ONLY_SUFFIX = String.raw`(?:[_-]wo)?`;
/** Spell a regex source's literal letters case-insensitively (outside character classes and escapes), so a rule can
 *  drop the /i flag while its key names stay case-blind -- Node 20 has no inline (?i:…) group. */
function ci(src: string): string {
  let out = ''; let inClass = false;
  for (let k = 0; k < src.length; k++) {
    const c = src[k];
    if (c === '\\') { out += c + src[++k]; continue; }
    if (c === '[') inClass = true; else if (c === ']') inClass = false;
    out += !inClass && /[a-z]/.test(c) ? `[${c}${c.toUpperCase()}]` : c;
  }
  return out;
}

// Each regex: group 1 = preserved prefix (line indent + directive), group 2 = secret token.
// Lowercase + line-anchored (/gm) so prose/headings don't collide. Token `\S+` redacts to the next
// whitespace (no `"`/`\` exclusion needed: these run on PARSED string values / markdown text, never
// on a serialized-JSON blob, so there is no delimiter to over-grab — and excluding `"`/`\` would
// leak the tail of a secret that legitimately contains them).
// R10 v10 (O-3) — the two LOGIN-NAME rules (their use in PATTERNS below says why). A name is an identifier, not a secret: its token is
// never an ECHO source (sec-ops push-2 SF-5 option (a) — echoing `netops01` would redact the account on every non-credential line of
// the execution and refuse a held edit that touches it). NOT_ECHO_SOURCE (below) carries these and their arm-2 variants.
const LOGIN_NAME_RULE = /^([ \t]*username[ \t]+)(?!<<REDACTED-SECRET>>)(\S+)(?=(?:[ \t]+(?:privilege[ \t]+\d+|role[ \t]+\S+|nopassword|algorithm-type[ \t]+\S+))*[ \t]+(?:secret|password)(?:[ \t]+(?:\d+|sha512|sha256|md5))?[ \t]+\S)/gm;
const JUNOS_LOGIN_NAME_RULE = /^([ \t]*set[ \t]+system[ \t]+login[ \t]+user[ \t]+)(?!<<REDACTED-SECRET>>)(\S+)(?=[ \t]+authentication[ \t]+(?:encrypted-password|plain-text-password)[ \t]+\S)/gm;

const PATTERNS: RegExp[] = [
  // R10 v7 (2026-10-23): IOS-XE `enable algorithm-type scrypt secret X` / `username u algorithm-type sha256 secret X` (the modern
  // form) — the algorithm clause sat between the keywords and neither rule matched.
  /^([ \t]*enable[ \t]+(?:algorithm-type[ \t]+\S+[ \t]+)?(?:secret|password)(?:[ \t]+level[ \t]+\d+)?(?:[ \t]+(?:\d+|sha512|sha256|md5))?[ \t]+)(\S+)/gm,
  // username: allow EOS/NX-OS middle keywords (privilege/role/nopassword) between the name and
  // secret, and an algorithm-named type (sha512/sha256/md5) not just a numeric type — e.g.
  // `username admin privilege 15 role network-admin secret sha512 $6$...`. Additive over the IOS form.
  /^([ \t]*username[ \t]+\S+(?:[ \t]+(?:privilege[ \t]+\d+|role[ \t]+\S+|nopassword|algorithm-type[ \t]+\S+))*[ \t]+(?:secret|password)(?:[ \t]+(?:\d+|sha512|sha256|md5))?[ \t]+)(\S+)/gm,
  // R10 v10 (2026-10-26, held-network push 2, owner O-3 — sec-ops batch-2b N-6): the USERNAME of a login credential line is part of
  // the login, so it is redacted too — only on a line that carries the credential (the lookahead: the same middle keywords, then
  // `secret|password` and a value). `username admin privilege 15 role network-admin secret sha512 <h>` ⇒ both the name and the hash are
  // placeholders (count 2). A name-only line (`username ops nopassword`, `username ops ssh-key …` — a PUBLIC key) is not a credential
  // line and keeps its name. Line-bound (`[ \t]`). The Junos set form is the next rule; the brace form (`user ops { authentication {
  // encrypted-password … } }`) carries the name on a PARENT line and is a priced residual.
  LOGIN_NAME_RULE,
  // R10 v10 (O-3): Junos set form — `set system login user <name> authentication encrypted-password|plain-text-password <v>`.
  JUNOS_LOGIN_NAME_RULE,
  /^([ \t]*snmp-server\s+community\s+)(\S+)/gm,
  // R10 v7 (sec-ops R10v7 SF-2, SF-4a): EOS prints `[vrf V] [port N] [timeout N] [single-connection]` between the host and `key`
  // (v6 matched only `host X key`, count 0); NX-OS QUOTES the key (`key 7 "K"`) — the opening `"?` sits INSIDE the token so arm 2's
  // escaped-quote rewrite applies (v6 redacted the type DIGIT in a leaf, the key in clear); the token refuses a lone type digit.
  /^([ \t]*(?:tacacs|radius)-server[ \t]+(?:host[ \t]+\S+(?:[ \t]+(?:vrf[ \t]+\S+|port[ \t]+\d+|timeout[ \t]+\d+|single-connection))*[ \t]+)?key(?:[ \t]+\d+)?[ \t]+)((?!\d+[ \t]+\S)"?\S+)/gm,
  // R10 v7 (SF-4b): EOS `aaa root secret [0|5|sha512] <k>` — a dictionary oracle like `username … secret sha512 $6$…`.
  /^([ \t]*aaa[ \t]+root[ \t]+secret(?:[ \t]+(?:\d+|sha512|sha256|md5))?[ \t]+)((?!(?:\d+|sha512|sha256|md5)[ \t]+\S)\S+)/gm,
  // R10 v7: the IOS key TYPE (`crypto isakmp key 6 <k> address …`) — v6 took the `6` as the secret and left the key in clear with
  // count 1 (the self-masking class). A type digit is read only when another token follows that is not the `address`/`hostname`
  // keyword, so a one-character key `6` is still redacted.
  /^([ \t]*crypto[ \t]+isakmp[ \t]+key(?:[ \t]+[06](?=[ \t]+(?!address\b|hostname\b)\S))?[ \t]+)(\S+)/gm,
  // R10 v7 — THE PARTIAL-REDACTION LEAK (R10-V7-BRIEF item 12): `pre-shared-key ascii-text "$9$…";` redacted the TYPE WORD and left
  // the reversible `$9$` value in clear, count 1. The rule now skips a type word (Junos `ascii-text`/`hexadecimal`, an IOS `0`/`6`
  // digit when a value follows), the IOS keyring `address <ip> [<mask>] key` / `hostname <h> key` clause (v6 took the `key` keyword
  // as the secret — the same fault), and a Junos `set …` prefix; a quoted value keeps its quotes and `;` (token stops before the
  // closing `"`, and at `\` so a raw quote in a truncated serialized leaf can never run across encoded newlines), an unquoted one is
  // `\S+` as before. ARM 2: the prefix also takes an ESCAPED quote (`\"`), and the token REFUSES the type words — without both, a serialized
  // leaf's `\"…\"` value could not start the token, the engine backtracked past the optional type group and took `ascii-text` as the secret
  // (item 12's fault, re-created in arm 2; caught by its pin). Every v7 rule with an OPTIONAL type digit refuses it as a token for the same reason.
  // sec-ops R10v7 B-1 (SELF-MASKING, standard syntax — pre-existing in v6 on the rule v7 rewrote to remove the class): IOS-XE IKEv2
  // keyrings `pre-shared-key local|remote [0|6] <k>` (the FlexVPN default), the IOS IPv6 keyring `address ipv6 <addr> key <k>`, IOS-XR
  // `pre-shared-key password [0] <k>` — each replaced a KEYWORD/address and left the key in clear, count 1; those words are now consumed
  // by the prefix and refused as the token. N-5: a Junos MACsec `pre-shared-key {` keeps its brace. A PSK literally `local`/`remote`/
  // `password` is priced (refused).
  // Junos MACsec: `pre-shared-key cak <k>` (the secret — `cak` is a type word like `ascii-text`; the draft took it as the
  // key, found on the public corpus) and `pre-shared-key ckn <hex>` (the key NAME, not a secret — refused, the line is kept).
  /^([ \t]*(?:set[ \t]+[^\n]+[ \t])?pre-shared-key(?:[ \t]+(?:local|remote))?(?:[ \t]+password)?(?:[ \t]+(?:address|hostname)[ \t]+(?:ipv6[ \t]+)?\S+(?:[ \t]+\d{1,3}(?:\.\d{1,3}){3})?)?(?:[ \t]+key)?(?:[ \t]+(?:ascii-text|hexadecimal|cak|[06](?=[ \t]+\S)))?[ \t]+(?:\\?")?)((?!(?:ckn|ascii-text|hexadecimal|cak|local|remote|password|address|hostname|ipv6)\b)(?![06][ \t]+\S)(?!\{)(?:(?<=")[^"\n\\]+|(?<!")\S+))/gm,
  // R10 v7 (sec-ops SF-6): IOS-XE IKEv2 profile inline PSK — ` authentication local|remote pre-share key [0|6] <k>`.
  /^([ \t]*authentication[ \t]+(?:local|remote)[ \t]+pre-share[ \t]+key(?:[ \t]+[06](?=[ \t]+\S))?[ \t]+)((?![06][ \t]+\S)\S+)/gm,
  // R10 v7 (sec-ops N-12): EOS IPsec IKE `shared-key <0|7> <k>`. The TYPE is REQUIRED: a typeless form matched wrapped markdown prose
  // starting a line with "shared-key …" (5 lines in the repo corpus); a device always prints the type.
  /^([ \t]*shared-key[ \t]+[07][ \t]+)(\S+)/gm,
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
  /^([ \t]*(?:ip\s+ospf\s+|area\s+\S+\s+virtual-link\s+\S+\s+)message-digest-key\s+\d+\s+(?:md5|sha1|sha256|sha384|sha512)(?:\s+\d+)?\s+)(\S+)/gm, // R10 v7 (sec-ops N-12): EOS `sha256` etc.
  /^([ \t]*ip\s+ospf\s+authentication-key(?:\s+\d+)?\s+)(\S+)/gm,
  // ISIS: `isis password 7 … [level-2]` — token-in-place, a trailing level keyword survives.
  /^([ \t]*isis\s+password(?:\s+\d+)?\s+)(\S+)/gm,
  // SNMPv3 (EOS-style): `snmp-server user bob v3 auth md5 auth-password X … priv-password Y` —
  // two separate patterns so BOTH tokens on one line are redacted. `[^\n]*?` keeps it one line.
  /^([ \t]*snmp-server\s+user\s+[^\n]*?\bauth-password\s+)(\S+)/gm,
  /^([ \t]*snmp-server\s+user\s+[^\n]*?\bpriv-password\s+)(\S+)/gm,
  // ── R10 v7 network families (2026-10-23, R10-V7-BRIEF; held-network precondition N-1) ─────────────────────────────────────────
  // Each is directive-anchored and line-anchored, like its siblings above; the type/algorithm words a device prints between the
  // keyword and the value are consumed by the PREFIX, never by the token (the item-12 lesson: a value-position error reports
  // count 1 while the secret stays in clear).
  // SNMPv3, IOS / NX-OS / EOS spelling: `snmp-server user u g v3 [localized <id>] auth sha <k> priv aes 128 <k>` (also `sha256`,
  // `md5`, NX-OS `priv <k>` with no algorithm, `aes-128`; sec-ops SF-5: NX-OS 10 hyphenates `sha-256` — both spellings). Two rules so BOTH keys go. The token never takes an `auth-password` /
  // `priv-password` / `localizedkey` keyword (the EOS form above, and NX-OS's trailing flag) or an algorithm word.
  /^([ \t]*snmp-server[ \t]+user[ \t]+[^\n]*?\bauth[ \t]+(?:md5|sha(?:-?(?:224|256|384|512))?)[ \t]+)((?!auth-password\b|priv-password\b|localizedkey\b)\S+)/gm,
  /^([ \t]*snmp-server[ \t]+user[ \t]+[^\n]*?\bpriv[ \t]+(?:(?:des|3des|aes(?:-?(?:128|192|256))?)(?:[ \t]+(?:128|192|256))?[ \t]+)?)((?!priv-password\b|localizedkey\b|des\b|3des\b|aes(?:-?(?:128|192|256))?\b)\S+)/gm,
  // SNMP trap/inform host community: `snmp-server host <ip> [vrf X] [informs|traps] [version 1|2c] <community> [udp-port …]`. Never
  // after `version 3` (that word is a USER name, not a secret) — the token refuses the keywords, so a v3 line does not match. It also refuses
  // `source-interface` / `use-vrf` / `filter-vrf` / `poll` and an IPv4 address (NX-OS `snmp-server host <ip> source-interface lo0`, ASA
  // `snmp-server host <ifname> <ip> poll …` — both measured on the public corpus as draft over-redactions).
  /^([ \t]*snmp-server[ \t]+host[ \t]+\S+(?:[ \t]+vrf[ \t]+\S+)?(?:[ \t]+(?:informs|traps))?(?:[ \t]+version[ \t]+(?:1|2c))?[ \t]+)((?!(?:version|informs|traps|vrf|use-vrf|filter-vrf|source-interface|poll|udp-port)\b)(?!(?:\d{1,3}\.){3}\d{1,3}\b)\S+)/gm,
  // IS-IS interface key: `isis authentication key [0|7|8a] <k> [level-N]` (EOS). `key-chain NAME` is a name — `key\s` excludes it.
  /^([ \t]*isis[ \t]+authentication[ \t]+key(?:[ \t]+(?:\d|8a))?[ \t]+)((?!(?:\d|8a)[ \t]+\S)\S+)/gm,
  // IS-IS process key (EOS `router isis` block): `authentication key 7 <k> [level-N]`. A bare `authentication key …` line is too
  // generic for prose, so the TYPE is required — a device's running-config always prints it. A typeless hand-written form is priced.
  /^([ \t]*authentication[ \t]+key[ \t]+(?:0|7|8a)[ \t]+)(\S+)/gm,
  // R10 v7 (sec-ops N-2): IOS/NX-OS `router isis` ` area-password|domain-password [type] <k>`; IOS-XR ` lsp-password|hello-password
  // [hmac-md5|text] [encrypted|clear] <k>`. A `keychain NAME` form names a keychain and is refused.
  /^([ \t]*(?:area|domain|lsp|hello)-password(?:[ \t]+(?:hmac-md5|text))?(?:[ \t]+(?:encrypted|clear))?(?:[ \t]+\d(?=[ \t]+\S))?[ \t]+)((?!(?:keychain|hmac-md5|text|encrypted|clear)\b)(?!\d[ \t]+\S)\S+)/gm,
  // NTP: `ntp authentication-key <id> <alg> [type] <k> [type]` — EOS prints the type BEFORE the key (`md5 7 <k>`), IOS/NX-OS after
  // (`md5 <k> 7`); the optional type before the token covers both. A one-character key equal to a type digit is priced.
  /^([ \t]*ntp[ \t]+authentication-key[ \t]+\d+[ \t]+(?:md5|sha1|sha256|sha512|cmac-aes-128|hmac-sha1|hmac-sha2-256)(?:[ \t]+(?:0|7|8a)(?=[ \t]+\S))?[ \t]+)((?!(?:0|7|8a)[ \t]+\S)\S+)/gm,
  // VRRP (IOS / EOS `vrrp N [peer] authentication text|ietf-md5 key-string [type] <k>`) and HSRP (`standby N authentication [text]
  // <k>` / `md5 key-string [type] <k>`). `key-chain NAME` is a name and is refused, as are the mode words.
  /^([ \t]*(?:vrrp|standby)[ \t]+\d+[ \t]+(?:peer[ \t]+)?authentication[ \t]+(?:text[ \t]+|(?:md5|ietf-md5)[ \t]+key-string(?:[ \t]+\d)?[ \t]+)?)((?!text\b|md5\b|ietf-md5\b|key-chain\b|key-string\b)(?!\d[ \t]+\S)\S+)/gm,
  // IOS AAA group: ` server-private 10.0.0.1 [port N] [timeout N] key [7] <k>`.
  /^([ \t]*server-private[ \t]+\S+(?:[ \t]+(?:port|timeout|auth-port|acct-port)[ \t]+\d+)*[ \t]+key(?:[ \t]+\d)?[ \t]+)((?!\d[ \t]+\S)\S+)/gm,
  // Junos set-form SNMP community: `set snmp community <c> authorization read-only` (the brace form is a block-context rule below).
  // sec-ops R10v7 B-2: the prefix takes an ESCAPED quote and the token stops at `\` — in a leaf, `"?` could not take `\"`, the token
  // started at the BACKSLASH (redacted alone, the community in clear, count 1, the escape corrupted).
  /^([ \t]*set[ \t]+snmp[ \t]+community[ \t]+(?:\\?")?)([^"\s\\]+)/gm,
  // Junos: `encrypted-password "$9$…";` (brace style, line-anchored) or `set system root-authentication
  // encrypted-password "$9$…"` (set style). Opening quote preserved in the prefix; token stops before
  // the closing quote/semicolon so structure survives. Value-anchored on the distinctive $9$ marker.
  // R10 v7: also the `$1$` / `$5$` / `$6$` crypt hashes (a dictionary oracle — redacted like `secret sha512 $6$…` already is).
  // sec-ops R10v7 SF-3(b): Junos always QUOTES it, so in a serialized leaf the prefix must take `\"` (and `\\\"` at level 2) — the
  // `$1$`/`$5$`/`$6$` extension was plain-text only; line-bound, and the token stops at `\`.
  /^([ \t]*(?:set[ \t]+[^\n]+[ \t])?encrypted-password[ \t]+(?:\\*")?)(\$[1569]\$[^"\s\\]+)/gm,
  // R10 v7: a QUOTED Junos `$9$` value under ANY key (`authentication-key`, `hello-authentication-key`, `secret`, `pre-shared-key
  // ascii-text`, `authentication-password` …). `$9$` is a REVERSIBLE obfuscation, not a hash, so a quoted `"$9$…"` is never config
  // data. Not line-anchored (brace, set and prose spellings all quote it), so BOUNDED: the opening quote by lookbehind, 4-512 characters
  // of the `$9$` ALPHABET only (A-Z a-z 0-9 . / -), and the token must END at a quote (`\"` in a serialized leaf). The alphabet and the
  // floor keep documentation that quotes the PLACEHOLDER form (`"$9$…"`, `"$9$..."`) — measured on the repo corpus as a draft
  // over-redaction; every real value on the public corpus is longer. The quotes and a trailing `;` survive. Before the
  // generic fail-safe below, so `secret "$9$…";` keeps its closing `";` (v6 ate it with the value).
  /()((?<=")\$9\$[A-Za-z0-9.\/-]{4,512}(?=\\*"))/g, // sec-ops SF-3(a): any escape level
  // k8s / cloud families (2026-06-27, WP-C1): YAML `key: value` or env `KEY=value` for the common
  // secret-VALUE keys, case-insensitive. The value MUST be SECRET-SHAPED (a digit or one of $ . / = +)
  // so a prose line like `Password: required` is NOT redacted. Exact-key match (bare `secret`, not
  // `secretName`; `secret_key`, not `secretKeyRef`) leaves k8s *references* (names) intact — only values.
  // R10 v3 (P1-3): + `access[_-]?token`, `x-honeycomb-team`, `x-sf-token`, `dd-api-key`, `x-api-key` (observability
  // exporter keys/headers; `api-key` was already covered by `api[_-]?key`), and the whole-token reference exemption.
  // R10 v5 (2026-10-19, HELD-K8S-R10-GITOPS-SHAPES + R10-EXPR-RHS): (1) an optional YAML list marker after the indent, so a
  // kustomize `secretGenerator.literals` entry (`- password=S3cret`) or a list-item `- token: x` is read like the bare key;
  // (2) an EXPRESSION right-hand side is a reference, never a secret: HCL `var.` / `local.` / `module.` / `data.` / `each.` /
  // `count.` / `self.` / `path.` / `terraform.`, Python `os.environ` / `os.getenv`, JS `process.env.`, GitHub Actions
  // `${{ secrets.|vars.|env.|inputs.|steps.|needs.|github. }}`. Exempt only UNQUOTED (a quoted `"var.x"` is a literal string)
  // and only when the WHOLE token is the expression (sec-ops R10v5 B-2). Rule 23 is case-SENSITIVE from v5 (B-1): `ci` spells its keys.
  new RegExp(String.raw`^([ \t]*(?:-[ \t]+)?` + ci(String.raw`(?:${PREFIXED_PASSWORD}|password|passwd|passphrase|token|api[_-]?token|api[_-]?key|apikey|client[_-]?secret|(?:aws[_-]?)?secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?key|access[_-]?token|private[_-]?key|privatekey|bearer(?:[_-]?token)?|auth[_-]?token|x-honeycomb-team|x-sf-token|dd-api-key|x-api-key|connection[_-]?string|connectionstring|dsn|secret)${WRITE_ONLY_SUFFIX}`) + String.raw`[ \t]*[:=](?!:?=(?:\s|$))[ \t]*)(` + refExempt(TERM_PLAIN) + EXPR_RHS_EXEMPT + String.raw`(?=\S*[\d$.\/=+])"?\S+)`, 'gm'),
  // R10 v4 (R10-CODE-ASSIGN, 2026-10-19): `:=` is a CODE assignment (Go, Rego), never YAML `:` + a value — the rule above no longer
  // matches it (`[:=](?!=)`), because it ate the `=` as the 'secret' and corrupted every Rego/Go line whose LHS is credential-named
  // (`key := sprintf(...)`, `api_key := input.x`). A code assignment's secret is a hard-coded QUOTED literal, so this rule redacts only
  // that: same name set + secret-shaped gate, quotes kept, an expression RHS (a call, a reference, a variable) never touched.
  // sec-ops R10v4 review SF-1: any of " ' ` (Go/Rego raw strings), the arm-2 escaped `\"` form, and the whole-token reference exemption;
  // the token stops at `\\` (an escaped quote inside the literal leaks its tail — the JSON-quoted family's residual).
  new RegExp(String.raw`^([ \t]*(?:password|passwd|passphrase|token|api[_-]?token|api[_-]?key|apikey|client[_-]?secret|(?:aws[_-]?)?secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?key|access[_-]?token|private[_-]?key|privatekey|bearer(?:[_-]?token)?|auth[_-]?token|x-honeycomb-team|x-sf-token|dd-api-key|x-api-key|connection[_-]?string|connectionstring|dsn|secret)[ \t]*:=[ \t]*\\?(["'\x60]))(` + refExempt('(?=\\\\?\\2)', REF) + String.raw`(?=(?:(?!\2)[^\n\\])*[\d$.\/=+])(?:(?!\2)[^\n\\])+)`, 'gim'),
  // terraform/IaC (2026-06-29, WP-C): JSON-quoted-key form `"key": "value"`. terraform `show -json` /
  // state is JSON, so the bare-key family above (line-anchored on an UNQUOTED key) slips past it — the
  // leading `"` breaks the `^[ \t]*key` anchor. Same secret-key set + secret-shaped gate. The token is
  // `[^"]+` (stops BEFORE the closing `"`) so the JSON object survives: a greedy `\S+` would eat the
  // closing quote and break structure (sec-ops IMP-2). PROSE backstop only — K1 is the state defense.
  // R10 v3: the whole-token reference exemption, terminated by the closing `"` (the opening quote is in the prefix).
  new RegExp(String.raw`^([ \t]*"(?:password|passwd|passphrase|token|api[_-]?token|api[_-]?key|apikey|client[_-]?secret|(?:aws[_-]?)?secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?key|private[_-]?key|privatekey|bearer(?:[_-]?token)?|auth[_-]?token|connection[_-]?string|connectionstring|dsn|secret)"[ \t]*:[ \t]*")(` + refExempt('(?=")', REF) + String.raw`(?=[^"\n]*[\d$.\/=+])[^"\n]+)`, 'gim'),
  // R10 v6 (2026-10-21, R10-V6-TERRAFORM — the cited false negative): `password_wo = "UberSecretPassword"` (4 lines in the public RDS
  // module examples) is LETTERS-ONLY, so rule 23's secret-shape gate kept it. Narrow waiver: an HCL ` = ` (spaces) and a QUOTED value,
  // on a PASSWORD-family key only (the key names a credential; a quoted password is a literal by definition), 12+ non-space characters
  // (`"true"`, `"required"`, `"changeme"` stay — a short letters-only value is the priced residual R10-QUOTED-LETTERS-TOKEN keeps open).
  // A value rule 23 already redacted carries no quote any more, so the two never double-count.
  new RegExp(String.raw`^([ \t]*(?:-[ \t]+)?` + ci(String.raw`(?:${PREFIXED_PASSWORD}|password|passwd|passphrase)${WRITE_ONLY_SUFFIX}`) + String.raw`[ \t]+=[ \t]+\\?")([^"\s\\]{12,})(?=\\?")`, 'gm'),
  // R10 v6 (2026-10-21, sec-ops step-1 review): a credential key INSIDE a one-line HCL object — `jsonencode({ password = "x" })`, a map
  // literal `{ user = "a", password = "x" }` — is mid-line, so the line-anchored family above never sees it. Anchored on `{` or `,` then
  // the key and an HCL `=` and a QUOTED literal (the serialized `\"` form too); same key set and secret-shape gate as rule 23; the token
  // stops before the closing quote (structure survives). An unquoted RHS is an expression and is never matched.
  new RegExp(String.raw`([{,][ \t]*` + ci(String.raw`(?:${PREFIXED_PASSWORD}|password|passwd|passphrase|token|api[_-]?token|api[_-]?key|apikey|client[_-]?secret|(?:aws[_-]?)?secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?key|access[_-]?token|private[_-]?key|privatekey|auth[_-]?token|secret)${WRITE_ONLY_SUFFIX}`) + String.raw`[ \t]*=[ \t]*\\?")((?=[^"\n\\]*[\d$.\/=+])[^"\n\\]+)`, 'g'),
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
  // R10 v5 (SF-6, 2026-10-19): GitHub tokens -- distinctive prefixes, redact inline wherever they appear (a Helm
  // `githubToken: "ghp_…"`, a Makefile `GH := ghp_…`, a URL). Classic `gh[pousr]_` + 36+ base62; fine-grained
  // `github_pat_` + 22+ word characters. Unbounded on the left like AKIA (a boundary lookbehind would miss `\nghp_…` in a
  // serialized leaf, where the byte before is the `n` of an escape); a run past 255 redacts the first 255 (the safe direction).
  /()((?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255}))/g,
  // URL userinfo password (R10 v3, P1-3): `scheme://user:PASSWORD@host` -- `redis://:pw@`, `mongodb+srv://u:pw@`,
  // `postgres://u:pw@db`. NOT line-anchored, so BOUNDED by rule: a left lookbehind (no scheme glued to a word), a
  // 32-char scheme, 256-char user, 512-char token, and the token must END at `@`. `ssh://git@`, `git@host:`,
  // `https://user@host`, `https://host:8080/p`, `http://[::1]:9090` are untouched (no `:`…`@` userinfo). A `${NAME}`
  // password is a reference (exempt, terminator `@`); `$3cr3t` is not. Residuals, priced (new coverage, not
  // regressions -- sec-ops v4 N-2): a password containing `@` (the tail after the first `@` stays), one over 512
  // characters, and `u:${X}@h:${Y}Lit@db` (only the first userinfo is seen).
  new RegExp(String.raw`(?<![a-z0-9+.-])([a-z][a-z0-9+.-]{0,31}:\/\/[^\s:@\/]{0,256}:)(` + refExempt('(?=@)', REF) + String.raw`[^\s@\/"'\\]{1,512}(?=@))`, 'gi'),
  // FAIL-SAFE generic: lowercase directive at line start + a SECRET-SHAPED token. Bare `:` REMOVED
  // 2026-06-27 (WP-C1) to stop prose FPs like `password requirements:` / `key findings:`; YAML `key:
  // value` is now handled by the k8s family above. A digit or one of $ . / = still qualifies.
  // R10 v7: the token REFUSES a lone type digit that has a value after it. Before v7, `key 7 LettersOnly` / `password 0 cisco` (a type-0
  // PLAINTEXT value) backtracked past the optional type, failed the shape gate on the letters-only value, and redacted the DIGIT — count 1, the
  // secret in clear (the self-masking class, item 12's fault; found by the v7 radius-block pin). Now such a line is honestly NOT redacted
  // (count 0); inside a `tacacs|radius server` block the v7 block rule catches it. sec-ops SF-4(c): it also refuses a token FOLLOWED by a
  // type digit and a value — EOS MACsec ` key <ckn> 7 <cak>` redacted the CKN (count 1, the CAK in clear); the `mac security` block rule
  // below redacts the CAK.
  /^([ \t]*(?:password|secret|key)(?:\s+\d+)?\s+)((?!:?=(?:\s|$))(?!\d+[ \t]+\S)(?!\S+[ \t]+[07][ \t]+\S)(?=\S*[\d$.\/=])\S+)/gm, // R10 v4: a bare `=`/`:=` OPERATOR is never the value (`key := …` is code); `key 7 =X` is redacted whole
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
// R10 v3 (sec-ops v4 SF-D): the block patterns' `(?!\$)` is GONE -- Prometheus never expands environment variables in
// `authorization.credentials`, and OTel's reference form is `${env:X}`, so a bare `$…` value here is a literal secret
// (`credentials: $Synth3ticPw9` persisted with 0 redactions before v3). They take the shared whole-token reference
// exemption instead, terminated by whitespace, a quote, a backslash or end of line.
const TERM_BLOCK = String.raw`(?=[\s"'\\]|$)`;
const BLOCK_CONTEXT_PATTERNS: RegExp[] = [
  // Prometheus `authorization:` block — `type: Bearer` + `credentials: <token>` (scrape configs, remote_write).
  // `\r?\n` on the parent (review S-2): CRLF text from Windows hosts and some APIs; intervening lines already admit `\r`.
  // The parent pins the meaning, so no secret-shape gate. Lowercase: Prometheus keys are lowercase.
  new RegExp(String.raw`^(([ \t]*)(?:-[ \t]+)?authorization:[ \t]*\r?\n(?:\2[ \t][^\n]*\n){0,32}?\2[ \t]+credentials:[ \t]*(?:\\?["'])?)(` + refExempt(TERM_BLOCK) + String.raw`[^\s"'\\]+)`, 'gm'),
  // YAML `headers:` map (OTel exporters, Prometheus remote_write) — `Authorization: "Bearer x"` / `Basic x`.
  // Scheme required (the brief's shape; a scheme-less header value is a residual). A `${env:X}` value is a reference
  // and survives; a bare `$…` value is redacted since v3. Case-insensitive for the header name and scheme.
  new RegExp(String.raw`^(([ \t]*)(?:-[ \t]+)?headers:[ \t]*\r?\n(?:\2[ \t][^\n]*\n){0,32}?\2[ \t]+["']?authorization["']?[ \t]*:[ \t]*["']?(?:bearer|basic)[ \t]+)(` + refExempt(TERM_BLOCK) + String.raw`[^\s"'\\]+)`, 'gim'),
  // Datadog exporter `api:` block -- `key: <api key>` (R10 v3, P1-3; sec-ops v2 S-3(b)). BLOCK-context only: a bare
  // `key:` is k8s `secretKeyRef.key`, a reference. Lowercase (Datadog keys are). Secret-shape gate as the k8s family
  // (a Datadog key is 32 hex characters). A `key:` outside an `api:` parent is a named residual.
  new RegExp(String.raw`^(([ \t]*)(?:-[ \t]+)?api:[ \t]*\r?\n(?:\2[ \t][^\n]*\n){0,32}?\2[ \t]+key:[ \t]*(?:\\?["'])?)(` + refExempt(TERM_BLOCK) + String.raw`(?=[^\s"'\\]*[\d$.\/=+])[^\s"'\\]+)`, 'gm'),
  // R10 v7 (R10-V7-BRIEF item 5): IOS named AAA server block — `tacacs server T1` / `radius server R1`, then ` key [type] <k>`. A bare
  // ` key <k>` line is ambiguous on its own (it is a keychain's `key 1`, a crypto `key` clause …), so the PARENT pins the meaning — the
  // brief's decision "by block context". No secret-shape gate inside the block (an AAA key is often letters only).
  new RegExp(String.raw`^(([ \t]*)(?:tacacs|radius)[ \t]+server[ \t]+\S+[ \t]*\r?\n(?:\2[ \t][^\n]*\n){0,32}?\2[ \t]+key(?:[ \t]+[067])?[ \t]+)(\S+)`, 'gm'),
  // R10 v7 (sec-ops SF-4c): EOS MACsec — `mac security` … ` key <ckn> [0|7] <cak>`: the CKN is a key NAME (prefix), the CAK the secret.
  new RegExp(String.raw`^(([ \t]*)mac[ \t]+security[ \t]*\r?\n(?:\2[ \t][^\n]*\n){0,32}?\2[ \t]+key[ \t]+\S+[ \t]+(?:[07][ \t]+)?)(\S+)`, 'gm'),
];

// ── Junos `snmp {` COMMUNITIES (R10 v7, item 14 brace form; sec-ops R10v7 B-3) — a block-pattern kind, implemented as a LINEAR LINE SCAN.
// A BLOCK_CONTEXT regex stops after its FIRST match (the match runs from `snmp {` to the first community, and `String.replace` resumes after
// it, so it can never re-anchor on `snmp {`): a device with a RO and a RW community kept the RW one — usually second, the dangerous one —
// in clear behind a count of 1. The scan redacts EVERY ` community <name>` inside the block. `community` alone is BGP-community vocabulary
// everywhere else in Junos, so only inside `snmp {`. The block runs while lines are indented deeper than the `snmp {` line (a blank line
// or a line back at its indent ends it). Plain arm only (arm 2 has no real newlines). A name is `[^\s"{;\\]+`: quoted, braced or
// `;`-terminated forms keep their punctuation; a quoted name with a space keeps its tail (priced).
const SNMP_BLOCK_OPEN = /^([ \t]*)snmp[ \t]*\{[ \t]*\r?$/;
const SNMP_COMMUNITY_LINE = /^([ \t]+community[ \t]+"?)([^\s"{;\\]+)/;
function redactJunosSnmpCommunities(text: string, sink?: Set<string>): RedactArtifactResult {
  if (!text.includes('snmp')) return { redacted: text, redactedCount: 0 };
  const lines = text.split('\n');
  let redactedCount = 0;
  let indent: string | null = null;
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    if (indent !== null) {
      if (l.length > indent.length && l.startsWith(indent) && (l[indent.length] === ' ' || l[indent.length] === '\t')) {
        const m = SNMP_COMMUNITY_LINE.exec(l);
        if (m && m[2] !== PLACEHOLDER) { sink?.add(m[2]); lines[k] = m[1] + PLACEHOLDER + l.slice(m[0].length); redactedCount++; }
        continue;
      }
      indent = null;
    }
    const open = SNMP_BLOCK_OPEN.exec(l);
    if (open) indent = open[1];
  }
  return redactedCount ? { redacted: lines.join('\n'), redactedCount } : { redacted: text, redactedCount: 0 };
}

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
function applyPatterns(text: string, patterns: RegExp[], sink?: Set<string>): RedactArtifactResult {
  let redactedCount = 0;
  let out = text;
  for (const re of patterns) {
    out = out.replace(re, (whole: string, prefix: string) => {
      const token = whole.slice(prefix.length);
      if (token === PLACEHOLDER) return whole; // already redacted by an earlier pattern (idempotent)
      // R10 v8: the redacted token feeds the echo pass (redactArtifactsForPersist) — never logged, never persisted. NOT when the
      // match CROSSED a line (the token is the first thing on the line after its directive: an older `\s+` prefix took the next
      // line's first word — the header's named over-redaction residual). Echoing such a token amplified one over-redaction into a
      // whole public-key / certificate body (Batfish cisco_crypto `key-string` + `56789ABC`: 1 → 256 placeholders, measured).
      // A block-context prefix spans lines BY DESIGN, but its last line carries the key (`credentials: `), so it still feeds.
      if (sink && !NOT_ECHO_SOURCE.has(re) && !(prefix.includes('\n') && /^[ \t\r]*$/.test(prefix.slice(prefix.lastIndexOf('\n') + 1)))) sink.add(token);
      redactedCount += 1;
      return prefix + PLACEHOLDER;
    });
  }
  return { redacted: out, redactedCount };
}

// ── ECHO REDACTION (R10 v8, 2026-10-24, register R10-ECHO-REDACTION) ─────────────────────────────────────────────────────────
// Every rule above is DIRECTIVE-anchored: it sees a secret only beside its key (`snmp-server community <v>`). A model that READ the
// keyed line in a tool result and then RESTATED the bare value in prose ("community values were visible (`<v>`) but are not
// restated") persisted it in clear — L-N1 rev 9 G-NAMED sample-02, 4 survivors (finalResponse 2 + report.md 2) with R10 ON.
// The fix keeps the directive discipline: a value is echo-redacted ONLY IF a directive-anchored rule redacted that exact value
// somewhere in the SAME persist (the same execution's result.json, tool results included, and report.md). Matching is LITERAL —
// never value-shape matching, which this module refuses by design. Guarded against over-redaction (echoEligible, corpus-measured):
//  - LENGTH: at least ECHO_MIN_LENGTH characters (and at most ECHO_MAX_LENGTH).
//  - NEVER A NUMBER: digits and number punctuation only (an IP, a CIDR, a port, an ASN, a date, a version) is never echoed.
//  - NEVER A WORD: letters only (or letters joined by `-` `_` `.`) is echoed only when MIXED case and at least
//    ECHO_MIN_LETTERS_ONLY long — a single-case one is a word, a phrase or a constant name (`public`, `configuration`, `CHANGEME`,
//    `x-oauth-basic`) and is never echoed.
//  - NEVER CODE: a literal carrying code syntax (`( ) [ ] { } || && => ...`), a member access with at most one digit
//    (`user.token`, `aws_s3_bucket.x`; a JWT `eyJ…` excepted), an UPPER_SNAKE constant or `$ENV_VAR`, or an ARN is never echoed.
//  - never a single repeated character, a reference shape (`${…}`, `{{…}}`, `$(…`), a placeholder (incl. `<SCRUBBED>` / `<value>`),
//    an absolute or relative file path (`/Common/dtdi.key` — a key FILE name, not a key), or a known placeholder word.
//  - SOURCE: a token a rule took ACROSS a line break (the first word of the line after its directive) is never a source.
//  - BOUNDED BY EDGES: a value whose edge is alphanumeric matches only when the neighbouring character is not alphanumeric
//    (`s3cr3tLabComm1` does not match inside `s3cr3tLabComm10`; `_` IS an edge); an escaped `\n` `\r` `\t` or `\uXXXX` before it
//    counts as an edge. Object KEYS are echo-redacted too.
// VARIANTS: a token from arm 2 carries JSON escapes (`S3c&ret9`), so its decoded form is a literal too; and every literal's
// JSON-escaped forms (level 1 and 2) are literals, so an echo inside a serialized leaf is found (a value with no escapable
// character has identical forms — the common case), and the R9-normalised form (NFKC; zero-width/bidi/control removed) — what the
// model was shown. Quotes and a trailing `;` `,` around a token are stripped (`"$9$…";`), a closing quote with `}` `]` `)` as one.
// LINEAR: PREFIX TRIES (at most ECHO_MAX_LITERALS literals of at most ECHO_MAX_LENGTH characters each, at most ECHO_MAX_TRIES),
// each applied once per leaf: O(text x ECHO_MAX_LENGTH x tries), never O(text x literals) (buildEchoMatcher). Past the last trie
// the overflow is counted and logged, never silent (sec-ops R10v8 B-1). Pinned by 1 MB timing pins incl. the shared-prefix case.
// THIS IS AN ACCIDENT CONTROL, NOT AN EXFILTRATION DEFENCE (sec-ops R10v8 Q4): a model that restates a secret it saw is caught when
// it writes it verbatim; an injected model that writes it spaced, split or encoded is not — a literal match never sees that.
// SCOPE: persist only (redactArtifactsForPersist and the extra artifacts beside it). The PLAIN arm (redactArtifactSecrets) is
// UNCHANGED, so a held base (canonicalBase) is unchanged: a bare echo inside a held file is NOT echo-redacted there (priced,
// measured — the build record). The collected values are held in memory for one persist and are never logged or persisted.
export const ECHO_MIN_LENGTH = 8;
export const ECHO_MIN_LETTERS_ONLY = 10;
export const ECHO_MAX_LENGTH = 256;
export const ECHO_MAX_LITERALS = 512; // literals per TRIE (sec-ops R10v8 SF-1: more literals ⇒ more tries, each linear)
export const ECHO_MAX_TRIES = 16;     // ⇒ at most 8,192 literals per persist; past it the overflow is COUNTED and logged (B-1)
const ECHO_NUMBER_LIKE = /^[\d.:\/,+\-]+$/;
const ECHO_LETTERS_ONLY = /^[A-Za-z]+$/;
const ECHO_REFERENCE = /^(?:\$\{|\{\{|\$\()/;
const ECHO_ANGLE_PLACEHOLDER = /^<[^<>]*>$/;
const ECHO_PATH = /^(?:~|\.{1,2})?\/[\w.\/-]+$/;
// Code, not a value (measured on the repo corpus, where R10's KEYED rule took `token: z.string()` / `apiKey: this.apiKey` / an HCL
// `aws_s3_bucket.x` reference as a token — a priced over-redaction of one token that the echo would have spread to every zod field
// and every reference of the file: 59 × `z.string()` in one schema file). Each is a low-false-positive refusal: a real secret of
// that shape stays in clear (a false negative the owner's bias accepts) — e.g. a symbol-rich generated password `Xk9{mP2]qL`
// (code syntax). A dotted value with 2+ digits (`Local.Admin2024`) is NOT a member access and IS echoed.
const ECHO_CODE_SYNTAX = /[()[\]{}]|\|\||&&|=>|\.\.\.|\u2026/;
// A member access has at most ONE digit (`aws_s3_bucket.app_logs`); a dotted SECRET carries several (`tYrysT4iT0.CRw…`, a Junos `$9$…`,
// a bcrypt `$2y$10$…` — the Batfish corpus), so the digit count is the discriminator and a `$`-led token is never a member access.
const ECHO_MEMBER_ACCESS = /^(?!eyJ)[A-Za-z_]\w*(?:\??\.[A-Za-z_]\w*)+$/;
const ECHO_MEMBER_ACCESS_MAX_DIGITS = 1;
const ECHO_CONSTANT_NAME = /^(?:\$[A-Z][A-Z0-9_]*|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)$/;
const ECHO_ARN = /^arn:/;
const ECHO_R9_STRIP = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const ECHO_REPEATED = /^(.)\1*$/s;
const ECHO_STOPWORDS = new Set(['changeme', 'password', 'passw0rd', 'placeholder', 'redacted', 'example', 'secretvalue', 'yoursecret']);
// The EDGE class is alphanumeric only (sec-ops R10v8 SF-3): `_` is an edge, so `_<v>_` (markdown emphasis) and `community_<v>`
// echo; `<v>` inside a longer alphanumeric run still does not.
const ECHO_WORD_CHAR = /[A-Za-z0-9]/;

/** True when a literal may be echo-redacted (the over-redaction guard). */
export function echoEligible(v: string): boolean {
  if (typeof v !== 'string' || v.length < ECHO_MIN_LENGTH || v.length > ECHO_MAX_LENGTH) return false;
  if (/\s/.test(v) || v.includes(PLACEHOLDER) || v.includes('<<') || v.includes('>>')) return false;
  if (ECHO_NUMBER_LIKE.test(v) || ECHO_REPEATED.test(v) || ECHO_REFERENCE.test(v)) return false;
  if (ECHO_ANGLE_PLACEHOLDER.test(v) || ECHO_PATH.test(v)) return false;
  if (ECHO_CODE_SYNTAX.test(v) || ECHO_CONSTANT_NAME.test(v) || ECHO_ARN.test(v)) return false;
  if (ECHO_MEMBER_ACCESS.test(v) && (v.match(/\d/g) ?? []).length <= ECHO_MEMBER_ACCESS_MAX_DIGITS) return false;
  // letters only — or letters joined by `-` `_` `.` (`x-oauth-basic`, `your_secure_password`): a word or a phrase unless MIXED case.
  const letters = v.replace(/[-_.]/g, '');
  if (ECHO_LETTERS_ONLY.test(letters) && (letters.length < ECHO_MIN_LETTERS_ONLY || !/[a-z]/.test(letters) || !/[A-Z]/.test(letters))) return false;
  if (ECHO_STOPWORDS.has(v.toLowerCase())) return false;
  return true;
}

/** The literal(s) a redacted token contributes: quotes / trailing `;` `,` stripped, its JSON-decoded form, and the JSON-escaped
 *  forms (levels 1 and 2) of each — every one through echoEligible. */
export function echoLiteralsFor(token: string): string[] {
  let t = String(token);
  for (let k = 0; k < 4; k++) {
    const before = t;
    // sec-ops R10v8 SF-4: a closing quote followed by `}` `]` `)` (a JSON/HCL object on one line) is stripped as ONE unit, so
    // `"Xk9mP2qLz7"}` yields `Xk9mP2qLz7` — the code-syntax guard would otherwise refuse the whole token.
    t = t.replace(/^\\*["'`]/, '').replace(/(?:\\*["'`][}\])]*|[;,])$/, '');
    if (t === before) break;
  }
  const forms = new Set<string>([t]);
  if (t.includes('\\')) {
    try { const d = JSON.parse(`"${t}"`); if (typeof d === 'string') forms.add(d); } catch { /* not a JSON escape run — the raw form stands */ }
  }
  // sec-ops R10v8 SF-2: the R9-NORMALISED form — persisted toolCalls hold the raw (pre-R9) result, but the model restates what it
  // was SHOWN after R9 (NFKC, zero-width / bidi / control characters removed).
  for (const f of [...forms]) {
    const n = f.normalize('NFKC').replace(ECHO_R9_STRIP, '');
    if (n !== f) forms.add(n);
  }
  for (const f of [...forms]) {
    const e1 = JSON.stringify(f).slice(1, -1);
    forms.add(e1);
    forms.add(JSON.stringify(e1).slice(1, -1));
  }
  return [...forms].filter(echoEligible);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');

export interface EchoMatcher { res: RegExp[]; literals: number; overflow: number }

/** The eligible literals of `tokens`, longest first, compiled into PREFIX TRIES of at most ECHO_MAX_LITERALS each (null when none).
 *  Past ECHO_MAX_TRIES tries the remaining (shortest) literals are not matched and their number is reported as `overflow` —
 *  never dropped silently (sec-ops R10v8 B-1: the persist logs it). */
export function buildEchoMatcher(tokens: Iterable<string>): EchoMatcher | null {
  const lits = new Set<string>();
  for (const t of tokens) for (const l of echoLiteralsFor(t)) lits.add(l);
  if (lits.size === 0) return null;
  const sorted = [...lits].sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
  const kept = sorted.slice(0, ECHO_MAX_LITERALS * ECHO_MAX_TRIES);
  const res: RegExp[] = [];
  for (let i = 0; i < kept.length; i += ECHO_MAX_LITERALS) res.push(compileEchoTrie(kept.slice(i, i + ECHO_MAX_LITERALS)));
  return { res, literals: kept.length, overflow: sorted.length - kept.length };
}

/** A PREFIX TRIE compiled to one regex (not a flat alternation): at each text position the engine follows ONE path, since the
 *  branches of a node differ in their first character, so a position costs at most ECHO_MAX_LENGTH steps whatever the literal
 *  count — O(text x ECHO_MAX_LENGTH), linear in the text. Children are emitted before a node's end, so the LONGEST literal at a
 *  position wins; the end alternative carries the edge lookahead when the literal ends in an alphanumeric (so `...Comm1` does not
 *  match the head of `...Comm10`). The head accepts a non-alphanumeric, an escaped `\n` `\r` `\t`, or a `\uXXXX` escape before it. */
function compileEchoTrie(lits: readonly string[]): RegExp {
  type Node = { kids: Map<string, Node>; end: boolean };
  const root: Node = { kids: new Map(), end: false };
  for (const l of lits) {
    let n = root;
    for (const ch of l) { let k = n.kids.get(ch); if (!k) { k = { kids: new Map(), end: false }; n.kids.set(ch, k); } n = k; }
    n.end = true;
  }
  const emit = (n: Node, last: string): string => {
    const alts: string[] = [];
    for (const ch of [...n.kids.keys()].sort()) alts.push(escapeRe(ch) + emit(n.kids.get(ch) as Node, ch));
    if (n.end) alts.push(ECHO_WORD_CHAR.test(last) ? '(?![A-Za-z0-9])' : '');
    return alts.length === 1 ? alts[0] : `(?:${alts.join('|')})`;
  };
  const heads: string[] = [];
  for (const ch of [...root.kids.keys()].sort()) {
    const head = ECHO_WORD_CHAR.test(ch) ? String.raw`(?:(?<![A-Za-z0-9])|(?<=\\[nrt])|(?<=\\u[0-9A-Fa-f]{4}))` : '';
    heads.push(head + escapeRe(ch) + emit(root.kids.get(ch) as Node, ch));
  }
  return new RegExp(heads.join('|'), 'gu');
}

/** Both placeholder spellings in ONE non-overlapping pattern: `<REDACTED-SECRET>` is a substring of PLACEHOLDER, so two separate
 *  counts would double-count (panel BC-N3). ONE definition: canonical-text.ts counts with it and redactEchoes never matches inside
 *  it (R10 v11). A fixed literal set — nothing variable can sit inside a span. */
export const PLACEHOLDER_ANY = /<<?REDACTED-SECRET>>?/g;

/** R10 v11 (CEOS2-ECHO-SECRET-RESIDUAL, 2026-11-02): `re` applied to the WHOLE text, but a match lying ENTIRELY inside a
 *  placeholder span is returned unchanged — a placeholder is platform text and never an echo. A model mask such as an unclosed
 *  `<REDACTED` (taken by a `\S+` rule after a directive, and echo-eligible) matched inside the platform's own `<<REDACTED-SECRET>>`:
 *  the persist stored every placeholder garbled (`<<<REDACTED-SECRET>>-SECRET>>`) and canonicalBase refused a clean held file
 *  `echo-secret-residual`. Only CONTAINED matches are suppressed (sec-ops v11 review finding 1): splitting the text on the spans
 *  instead let a span swallow a literal's own edge character (`<REDACTED-SECRET>` + `>Xk9…`, `Xk9…<` + `<REDACTED-SECRET>>` were
 *  kept in clear). Every match v10 made outside a span is made identically — same regex, same left-to-right consumption; a match
 *  STRADDLING a span edge is still replaced (it garbles the span: over-redaction, the safe direction, and canonicalBase refuses).
 *  Spans are recomputed per trie, so a placeholder one trie inserted is a span for the next. */
function replaceOutsidePlaceholders(text: string, re: RegExp, onHit: () => void): string {
  const spans: Array<[number, number]> = [];
  const sp = new RegExp(PLACEHOLDER_ANY.source, 'g');
  for (let m = sp.exec(text); m; m = sp.exec(text)) spans.push([m.index, m.index + m[0].length]);
  re.lastIndex = 0;
  if (spans.length === 0) return text.replace(re, () => { onHit(); return PLACEHOLDER; });
  return text.replace(re, (w: string, ...rest: unknown[]) => {
    // the trie has no capture groups: rest = [offset, string] (a trailing groups object only with named groups — none here)
    const off = rest.find((x) => typeof x === 'number') as number;
    const end = off + w.length;
    // spans are sorted and disjoint: the first span ending at or after `end` is the only one that can contain the match
    for (const [p, q] of spans) { if (q < end) continue; if (p <= off) return w; break; }
    onHit();
    return PLACEHOLDER;
  });
}

/** Replace every echo of a matcher's literals in `text` with the placeholder — never a match contained in a placeholder span (R10 v11). */
export function redactEchoes(text: string, matcher: EchoMatcher | null): RedactArtifactResult {
  if (!matcher || typeof text !== 'string' || text.length < ECHO_MIN_LENGTH) return { redacted: text, redactedCount: 0 };
  let redactedCount = 0;
  let redacted = text;
  for (const re of matcher.res) redacted = replaceOutsidePlaceholders(redacted, re, () => { redactedCount += 1; });
  return redactedCount ? { redacted, redactedCount } : { redacted: text, redactedCount: 0 };
}

/** redactEchoes over every STRING leaf AND every object KEY of a tree (a copy; the input is not mutated). Same depth ceiling as
 *  redactSecretsDeep. sec-ops R10v8 SF-5: a value used as a KEY (a structured result keyed by community name) is redacted too; two
 *  keys redacting to the same text keep both entries (` #2`, ` #3` … suffixes), never one overwriting the other. */
export function redactEchoesDeep(value: unknown, matcher: EchoMatcher | null): { value: unknown; redactedCount: number } {
  if (!matcher) return { value, redactedCount: 0 };
  let redactedCount = 0;
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > MAX_REDACT_DEPTH) return v;
    if (typeof v === 'string') { const r = redactEchoes(v, matcher); redactedCount += r.redactedCount; return r.redacted; }
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>)) {
        const rk = redactEchoes(k, matcher);
        let key = rk.redacted;
        if (rk.redactedCount) { redactedCount += rk.redactedCount; for (let n = 2; Object.prototype.hasOwnProperty.call(out, key); n++) key = `${rk.redacted} #${n}`; }
        out[key] = walk((v as Record<string, unknown>)[k], depth + 1);
      }
      return out;
    }
    return v;
  };
  return { value: walk(value, 0), redactedCount };
}

/** The echo rule's constants and guard sources -- part of the §J fingerprint input (R10_RULE_SOURCES), so an echo-rule change
 *  moves the fingerprint and must bump R10_VERSION. */
const R10_ECHO_RULE_SOURCES: readonly string[] = [
  `echo:min=${ECHO_MIN_LENGTH};lettersOnlyMin=${ECHO_MIN_LETTERS_ONLY};max=${ECHO_MAX_LENGTH};maxLiterals=${ECHO_MAX_LITERALS};maxTries=${ECHO_MAX_TRIES}`,
  `echo:r9-form:/${ECHO_R9_STRIP.source}/${ECHO_R9_STRIP.flags}+NFKC`, 'echo:edge:alnum+escaped-nrt+uXXXX', 'echo:strip:quote+closers', 'echo:keys',
  ...[ECHO_NUMBER_LIKE, ECHO_LETTERS_ONLY, ECHO_REFERENCE, ECHO_ANGLE_PLACEHOLDER, ECHO_PATH, ECHO_CODE_SYNTAX, ECHO_MEMBER_ACCESS,
    ECHO_CONSTANT_NAME, ECHO_ARN, ECHO_REPEATED, ECHO_WORD_CHAR].map((re) => `echo:/${re.source}/${re.flags}`),
  'echo:letters-or-separators:mixed-case-only',
  `echo:member-access-max-digits=${ECHO_MEMBER_ACCESS_MAX_DIGITS}`,
  'echo:source:not-a-line-crossing-token',
  'echo:source:not-a-login-name',
  `echo:not-contained-in-placeholder-span:/${PLACEHOLDER_ANY.source}/`, // R10 v11 (sec-ops finding 1: contained matches only)
  `echo:stop:${[...ECHO_STOPWORDS].sort().join(',')}`,
];

/**
 * R10's VERSION (P1 / PLATFORM-HELD-BYTES P3-B4, 2026-10-13). Part of a held file's base identity
 * (`redactorVersion` beside `baseHash`): a held base is `sha256(redactArtifactSecrets(text))`, so ANY change to what
 * the plain-text arm emits changes every affected hash. A version change between harvest and check reads "base
 * changed" -- the safe direction. BUMP IT whenever `redactArtifactSecrets`' output can change: a PATTERNS /
 * BLOCK_CONTEXT_PATTERNS / PEM rule, the placeholder, or the PEM/segment logic. test-security-invariants.ts §J pins
 * a fingerprint (rule sources + outputs over a golden corpus) per version and fails when they move without a bump.
 * History: paichart.r10/1 = everything before 2026-10-13 (never stamped); paichart.r10/2 = P1; paichart.r10/3 = Stage B
 * P1-3 (2026-10-14): arm-2 escaped-tab indent at any level, the observability key shapes, URL userinfo, Datadog `api:`
 * block, and the whole-token per-family reference exemption (block patterns lose their bare-`$` exemption).
 * paichart.r10/4 = R10-CODE-ASSIGN (2026-10-19, held-k8s shadow window A-K3): a credential-named `:=` CODE assignment (Go, Rego) is no
 * longer read as YAML `:` + a value `=…` (rule 23 `[:=](?!=)`) nor as a device `key <value>` (rule 28 `(?![:=])`); a new rule redacts a
 * `:=` assigned a quoted (" ' `) secret-shaped literal, quotes kept, incl. the arm-2 `\"` form and the reference exemption (sec-ops R10v4
 * review B-1/B-2/SF-1). Output changes on CONFIG lines too (SF-2): `password = v` → `password = <<R>>` (count 2 → 1, the `=` survives);
 * `key = sprintf(…)` and `token == x` are no longer corrupted; `api_key ::= x` is no longer self-masked. Every other config form is unchanged.
 * paichart.r10/5 = 2026-10-19 (held-k8s phase A triage): GitHub token shapes `gh[pousr]_…` / `github_pat_…` inline (SF-6); an optional YAML list
 * marker before a secret key (kustomize `secretGenerator.literals`, HELD-K8S-R10-GITOPS-SHAPES); an unquoted expression RHS (`var.x`,
 * `os.environ[…]`, `process.env.X`, `${{ secrets.X }}`) is no longer redacted (R10-EXPR-RHS).
 * paichart.r10/6 = 2026-10-21 (R10-V6-TERRAFORM, before the terraform held join; held-terraform T-12 + sec-ops step-1 review). FALSE NEGATIVES
 * closed: a PREFIXED password key (`master_password`, `db_password`, `DB_PASSWORD`, `admin-password`) and the Terraform 1.11 write-only `_wo`
 * suffix in rule 23; a credential key inside a ONE-LINE HCL object (`jsonencode({ password = "x" })`, a map literal) — a new mid-line rule;
 * arm 2 now starts a rule-23 token at an ESCAPED quote (`password: \"x\"` in an unparseable serialized leaf was kept). OVER-REDACTION
 * narrowed: a Terraform resource attribute reference after an HCL ` = ` (`password = random_password.this.result`) is an expression, and so
 * is a call of a Terraform BUILT-IN function (closed list, sec-ops B-1) or a (negated) reference before `&&`/`||`/`?`/`==`/`!=`. The
 * secret-shape gate is WAIVED for a QUOTED 12+ char value of a password-family key after an HCL ` = ` (`password_wo = "UberSecretPassword"`).
 * Arm 2's token consumes JSON escapes inside a value (`\\u0026`), so an escaped value is redacted whole (sec-ops SF-2).
 * paichart.r10/7 = 2026-10-23 (R10-V7 network families, before the network held join; R10-V7-BRIEF + sec-ops R10v7 review). THE
 * PARTIAL-REDACTION LEAK fixed: `pre-shared-key ascii-text "$9$…"` replaced the TYPE WORD and kept the reversible value — and the same
 * self-masking class on the IOS keyring `… key`, `crypto isakmp key 6`, IKEv2 `pre-shared-key local|remote`, the IPv6 keyring, XR `password`,
 * MACsec `cak`/`ckn`, NX-OS quoted AAA keys in a leaf, EOS MACsec `key <ckn> 7 <cak>`, and the generic rule's `key 7 <letters>` /
 * `password 0 <plaintext>` (the DIGIT was redacted; now honestly count 0). FALSE NEGATIVES closed: SNMPv3 `auth`/`priv` keys (incl.
 * `sha-256`), the SNMP host community, IS-IS interface/process keys and `area-|domain-|lsp-|hello-password`, NTP, VRRP/HSRP, AAA
 * `tacacs|radius server` blocks + `server-private` + EOS `host … vrf|port|timeout … key` + `aaa root secret`, IKEv2 profile `pre-share key`,
 * EOS `shared-key`, OSPF `sha*` digests, IOS-XE `algorithm-type`, Junos `"$9$…"` under any key (its alphabet, 4+ chars, any escape level),
 * `encrypted-password` crypt hashes (plain and arm 2), the Junos SNMP community (set form; EVERY community in a `snmp {` block — a scan).
 * Every v7 rule is LINE-BOUND (`[ \t]`). Arm 2 is LINEAR: `[^\n]` stops at an escape (the v7 draft took 95 s on 1 MB).
 * paichart.r10/8 = 2026-10-24 (R10-ECHO-REDACTION, held-network step-2 blocker): ECHO redaction at persist. Every token a
 * directive-anchored rule redacts anywhere in one persist (result.json incl. toolCalls, report.md) is also redacted where it
 * reappears BARE in those artifacts (literal match, word-edged, guarded by echoEligible). The plain arm's OUTPUT is unchanged
 * (redactArtifactSecrets / canonicalBase / held bases move nothing); the version moves because the persist output does and the
 * echo rule's sources ride the §J fingerprint (R10_ECHO_RULE_SOURCES). A held ref keys on redactorVersion, so a capture straddling
 * the deploy reads base-changed (the safe direction) although its bytes are identical.
 * paichart.r10/9 = 2026-10-26 (R10 v9, held-network step 3 batch 2a; sec-ops F-NB1 control review C-2 items R-1 and R-2). The plain
 * arm's OUTPUT is unchanged (redactArtifactSecrets / canonicalBase / held bases move nothing). Two persist-path gaps closed:
 * R-2 STRUCTURED results — redactSecretsDeep now applies the plain arm to object KEYS (an eAPI result keyed by command), redacts a
 * credential FIELD's string value (rule 23's key set through rule 23 itself, gate included, plus a narrow network field set:
 * community, key-string, pre-shared key, SNMPv3 auth/priv keys …), and the KEYS of a map under a `community` key whose values are
 * all objects (a NAPALM-style SNMP result keyed by community); R-1 the read_more window boundary — the persisted read_more record
 * carries the cut line back to its start (pagerPersistLead below, called by agentic-tool-loop pagerServe; R10_PAGER_LEAD_MAX). Both feed the echo sink. The
 * sources ride both §J fingerprints (R10_STRUCTURED_RULE_SOURCES). A held ref keys on redactorVersion, so a capture straddling the
 * deploy reads base-changed (the safe direction) although its bytes are identical.
 * paichart.r10/10 = 2026-10-26 (held-network step 3 push 2, owner O-3 — sec-ops batch-2b N-6: "the lab username is part of the
 * login"). Two PLAIN-arm rules (so held bases move): the USERNAME of a `username <name> … secret|password <v>` line, and of a Junos
 * `set system login user <name> authentication encrypted-password|plain-text-password <v>` line, is a placeholder too — only on a line
 * that carries the credential (a lookahead); a name-only line (`nopassword`, `ssh-key`) keeps its name. A held device base carrying
 * a login line hashes differently under v10; a ref keys on redactorVersion (a straddling capture reads base-changed, the safe direction).
 * paichart.r10/11 = 2026-11-02 (CEOS2-ECHO-SECRET-RESIDUAL): the ECHO pass never replaces a match lying ENTIRELY inside a placeholder
 * span (PLACEHOLDER_ANY) — a placeholder is platform text and never an echo. An echo-eligible model mask (an unclosed `<REDACTED` after a directive) matched
 * inside `<<REDACTED-SECRET>>`, so the persist stored garbled placeholders and canonicalBase refused a clean held file. The plain
 * arm's OUTPUT is unchanged (redactArtifactSecrets / B / held bases move nothing); persisted bytes move only where an echo overlapped
 * a placeholder, each back to a clean placeholder. A real secret echoed bare outside a placeholder is matched exactly as in v10.
 * Self-host with R10 switched off stamps `redactorVersion: "none"` (the P3 contract), never this constant.
 */
export const R10_VERSION = 'paichart.r10/11';

/** R10 v9 (R-1): the longest lead a persisted read_more record carries before its window, back to the previous line start. A line
 *  whose directive starts more than this many characters before the boundary keeps its head in the previous record only — priced. */
export const R10_PAGER_LEAD_MAX = 512;

/**
 * R10 v9 (R-1, sec-ops F-NB1 C-2): the characters of `full` before `offset` back to the previous LINE START — a raw `\n` or the
 * two-character escaped `\\n` of a JSON-serialized result — bounded to R10_PAGER_LEAD_MAX. Persist-only: a read_more window
 * boundary inside a directive line (`snmp-ser|ver community …`, or inside the value) left no persisted record holding a line R10's
 * directive-anchored rules can match, so the value persisted in clear in the next record (≈ 0.6% per paged secret). Prepending
 * this lead to the PERSISTED record puts the whole line in one string before the persist's R10 pass. Pure; '' when the window
 * already starts a line (or the result).
 */
export function pagerPersistLead(full: string, offset: number): string {
  if (offset <= 0 || offset > full.length) return '';
  const from = Math.max(0, offset - R10_PAGER_LEAD_MAX);
  const seg = full.slice(from, offset);
  const raw = seg.lastIndexOf('\n');
  // sec-ops batch-2a N-3: an escaped `\\n` is a line start only when an ODD run of backslashes precedes the `n` (an even run is
  // an escaped backslash followed by a literal n: `C:\\new`). A level-2 newline therefore reads as no line start, and the lead
  // simply runs further back (≤ R10_PAGER_LEAD_MAX) — longer, never shorter than the cut line.
  let esc = seg.lastIndexOf('\\n');
  while (esc >= 0) {
    let run = 0;
    for (let j = esc; j >= 0 && seg[j] === '\\'; j--) run++;
    if (run % 2 === 1) break;
    esc = esc > 0 ? seg.lastIndexOf('\\n', esc - 1) : -1;
  }
  const start = Math.max(raw >= 0 ? raw + 1 : -1, esc >= 0 ? esc + 2 : -1);
  // No line start within the bound: the whole bounded segment (a line longer than the bound keeps its own head in the previous
  // record — the bound is the priced residual, named in R10_PAGER_LEAD_MAX).
  return start < 0 ? seg : seg.slice(start);
}

// ── R10 v9 STRUCTURED ARM (R-2, sec-ops F-NB1 control review C-2) ─────────────────────────────────────────────────────────────
// Until v9 redactSecretsDeep ran the text rules over string VALUES only. Three structured shapes leaked with R10 ON (measured $0,
// REVIEW-sec-ops-FNB1-CONTROL §1c): an eAPI-style JSON result whose KEYS are the config lines (`{"snmp-server community <c> ro":
// null}`); a NAPALM-style SNMP getter keyed BY community (`{"community": {"<c>": {"mode": "ro"}}}`); a user getter's password FIELD
// (`{"password": "$6$…"}`) — a value with no directive in it. The arm stays KEY-NAME anchored (R10's directive discipline: never
// value-shape matching):
//  (i)   every object KEY goes through the plain arm (a key IS a line when the result is keyed by command);
//  (ii)  a string value under a key of rule 23's set is judged BY rule 23 on the synthesised line `<key>: <value>` — its
//        secret-shape gate, reference and expression exemptions included (`{"password": "required"}` stays, exactly as
//        `password: required` does in text);
//  (iii) a string value under a key of the NETWORK field set below (no gate: `public` is a community even though it is a word);
//  (iv)  the KEYS of a map under a `community` key whose values are ALL objects (a JSON Schema `community: {type: "string"}` has a
//        string child, so it never matches).
// A redacted key keeps every entry (` #2`, ` #3` suffixes — the echo pass's collision rule). Every value taken feeds the echo sink.
const STRUCTURED_RULE23_KEY_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const STRUCTURED_NETWORK_FIELD_RE =
  /^(?:snmp[-_]?)?communit(?:y|ies|y[-_]?string)$|^key[-_]?string$|^(?:pre[-_]?)?shared[-_]?(?:key|secret)$|^psk$|^(?:auth|priv|privacy|authentication|md5)[-_]?(?:password|passwd|key|secret)$|^(?:enable|tacacs|radius|bgp|ospf|isis|ntp)[-_]?(?:password|secret|key)$/i;
/** (ii) excludes a bare `token` FIELD: in structured data it names a lexer/lint token far more often than a credential — the
 *  platform's own facts carry `dialectLint.violations[].token` and the requirements publish-check lint's `hits[].token` (repo
 *  corpus: 6 false redactions of a lint fact before this exclusion). Text rule 23 still redacts `token: <v>` in a line; `access_token`, `api_token`,
 *  `auth_token`, `bearer_token` fields are still taken. */
const STRUCTURED_NOT_A_CREDENTIAL_FIELD_RE = /^token$/i;
const STRUCTURED_COMMUNITY_MAP_RE = /^(?:snmp[-_]?)?communit(?:y|ies)$/i;
/** sec-ops batch-2a SF-2: a BGP community under a community-named key is routing policy, never a credential — `65000:100`,
 *  `65000:100:200` (large), a well-known name, or an extended community (`target:65000:1`, `rt 65000:1`, `soo 1.1.1.1:5` — digits,
 *  dots and colons only after the type). Kept by the network field arm only, never under an SNMP-named key; a community-map KEY is always taken (post-fold item 6: the map's
 *  SNMP context sits a level up — `snmp_information.community.<c>` — and a BGP community-set is keyed by its NAME, not its value). */
const BGP_COMMUNITY_VALUE_RE =
  /^\d{1,10}:\d{1,10}(?::\d{1,10})?$|^(?:no-export|no-advertise|local-as|no-peer|internet|graceful-shutdown|blackhole|accept-own|llgr-stale|no-llgr)$|^(?:target|origin|rt|soo|color|bandwidth|link-bandwidth)[: ][\d.:]+$/i;
/** sec-ops batch-2a N-7: a map carrying a JSON-Schema keyword is a schema, never a community map. */
const JSON_SCHEMA_KEYWORDS: ReadonlySet<string> = new Set(['type', 'items', 'properties', 'patternProperties', 'additionalProperties',
  '$defs', 'definitions', 'not', 'if', 'then', 'else', 'allOf', 'anyOf', 'oneOf', 'enum', 'required', '$ref']);
/** sec-ops batch-2a SF-5: (ii) synthesises `<key>: <value>` only for a key containing one of these — a SUPERSET of every name the
 *  `key[:=]` line rules can take (rule 23's set, the observability header keys, the bearer/aws/dsn shapes). Output-preserving:
 *  proved by the repo, lab and production replays reading identical counts with and without it (STEP3-BATCH2A-BUILD §3). */
const STRUCTURED_RULE23_VOCAB_RE = /pass|token|key|secret|bearer|team|connection|dsn/i;
/** B-1 (sec-ops batch-2a): the longest JSON TEXT leaf the structured arm parses (a held file is capped at 5 MB). */
const STRUCTURED_JSON_TEXT_MAX = 8 * 1024 * 1024;
/** A value the network field arm never takes: empty, already a placeholder, a reference (`${X}`, `{{ .x }}`), a boolean word. */
const STRUCTURED_FIELD_KEEP_RE = /^\s*$|<<REDACTED|^\$\{[^}]*\}$|^\{\{[^}]*\}\}$|^(?:true|false|null|none|n\/a)$/i;
export const R10_STRUCTURED_RULE_SOURCES: readonly string[] = Object.freeze([
  'structured:key:plain-arm',
  `structured:field:rule23-synth:/${STRUCTURED_RULE23_KEY_RE.source}/:not:/${STRUCTURED_NOT_A_CREDENTIAL_FIELD_RE.source}/${STRUCTURED_NOT_A_CREDENTIAL_FIELD_RE.flags}`,
  `structured:field:network:/${STRUCTURED_NETWORK_FIELD_RE.source}/${STRUCTURED_NETWORK_FIELD_RE.flags}`,
  `structured:field:keep:/${STRUCTURED_FIELD_KEEP_RE.source}/${STRUCTURED_FIELD_KEEP_RE.flags}`,
  `structured:community-map:/${STRUCTURED_COMMUNITY_MAP_RE.source}/${STRUCTURED_COMMUNITY_MAP_RE.flags}:all-object-values:not-schema:${[...JSON_SCHEMA_KEYWORDS].join(',')}`,
  `structured:bgp-community-keep:/${BGP_COMMUNITY_VALUE_RE.source}/${BGP_COMMUNITY_VALUE_RE.flags}`,
  `structured:rule23-vocab:/${STRUCTURED_RULE23_VOCAB_RE.source}/${STRUCTURED_RULE23_VOCAB_RE.flags}`,
  'structured:string-array-under-network-field',
  `structured:json-text:max=${STRUCTURED_JSON_TEXT_MAX}:reserialize-only-on-redaction:keep-indent:text-rules-after`,
  'structured:key-collision:every-key',
  `pager:lead-to-line-start:max=${R10_PAGER_LEAD_MAX}`,
]);

/** (ii)/(iii): the redacted value of a credential FIELD, or null when neither arm takes it. Single-line values only. */
function redactStructuredField(key: string, value: string, sink?: Set<string>): string | null {
  if (!value || value.includes('\n') || value.includes(PLACEHOLDER)) return null;
  if (STRUCTURED_NETWORK_FIELD_RE.test(key)) {
    if (STRUCTURED_FIELD_KEEP_RE.test(value)) return null;
    // sec-ops post-fold item 6: never under an SNMP-named key (`snmp_community`, `community_string`) — an SNMP community spelled
    // like a BGP one is still a credential.
    if (/communit/i.test(key) && !/snmp|string/i.test(key) && BGP_COMMUNITY_VALUE_RE.test(value.trim())) return null;
    sink?.add(value);
    return PLACEHOLDER;
  }
  if (!STRUCTURED_RULE23_KEY_RE.test(key) || !STRUCTURED_RULE23_VOCAB_RE.test(key) || STRUCTURED_NOT_A_CREDENTIAL_FIELD_RE.test(key)) return null;
  const synth = `${key}: ${value}`;
  const local = new Set<string>();
  const r = redactArtifactSecrets(synth, local);
  if (!r.redactedCount || !r.redacted.startsWith(`${key}: `)) return null;
  if (sink) for (const t of local) sink.add(t);
  return r.redacted.slice(key.length + 2);
}

/** (iv): a map under a `community` key whose values are ALL non-null, non-array objects (≥ 1 entry). */
function isCommunityMap(parentKey: string | undefined, o: Record<string, unknown>): boolean {
  if (parentKey === undefined || !STRUCTURED_COMMUNITY_MAP_RE.test(parentKey)) return false;
  const keys = Object.keys(o);
  if (keys.some((k) => JSON_SCHEMA_KEYWORDS.has(k))) return false;
  const vals = Object.values(o);
  return vals.length > 0 && vals.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
}

/** The plain-text arm's rule sources, in application order -- input to the §J version fingerprint (read-only copy:
 *  the RegExp objects stay private, since global regexes carry `lastIndex` state). */
export const R10_RULE_SOURCES: readonly string[] = Object.freeze([
  `placeholder:${PLACEHOLDER}`,
  ...[PEM_BEGIN, PEM_END, PEM_BODY_LINE, PEM_HEADER_LINE, PEM_BLANK, PEM_RUNS_SEGMENT, PEM_SEP].map((re) => `pem:/${re.source}/${re.flags}`),
  ...PATTERNS.map((re) => `line:/${re.source}/${re.flags}`),
  ...BLOCK_CONTEXT_PATTERNS.map((re) => `block:/${re.source}/${re.flags}`),
  ...[SNMP_BLOCK_OPEN, SNMP_COMMUNITY_LINE].map((re) => `scan:junos-snmp:/${re.source}/${re.flags}`),
  ...R10_ECHO_RULE_SOURCES,
  ...R10_STRUCTURED_RULE_SOURCES, // R10 v9: the plain arm's outputs are unchanged; the persist's are not (R-1, R-2)
]);

/** R10's PLAIN-TEXT arm -- the only arm a held-file base may use (P3-B3): no JSON re-serialisation, no escaped-newline
 *  variants. Line-preserving (pinned §J). */
export function redactArtifactSecrets(text: string, sink?: Set<string>): RedactArtifactResult {
  if (!text || typeof text !== 'string') {
    return { redacted: typeof text === 'string' ? text : '', redactedCount: 0 };
  }
  // `sink` (R10 v8): when given, every token a line/block/scan rule replaces is added to it (the echo pass's input). It changes
  // nothing this function returns. PEM bodies are not collected: a body line is a base64 run whose echo in prose is a named residual.
  const pem = redactPemBlocks(text);
  const line = applyPatterns(pem.redacted, PATTERNS, sink);
  const block = applyPatterns(line.redacted, BLOCK_CONTEXT_PATTERNS, sink);
  const snmp = redactJunosSnmpCommunities(block.redacted, sink);
  return { redacted: snmp.redacted, redactedCount: pem.redactedCount + line.redactedCount + block.redactedCount + snmp.redactedCount };
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
    // R10 v7 (sec-ops R10v7 SF-1): `[^\n]` stops at an ESCAPE too — a leaf has no real newlines, so `(?:set …[^\n]+…)?pre-shared-key`,
    // `encrypted-password` and the `snmp-server user [^\n]*?` rules scanned to the END OF THE LEAF from every encoded `\nset` /
    // `\nsnmp-server user` (quadratic: 1 MB 95 s in the v7 draft, 5.3 s at 512 KB in v6). An escape between `set` and the keyword (a
    // quoted description first) is now missed in arm 2 — priced. Pinned by the arm-2 1 MB timing pins.
    .split('[^\\n]').join('[^\\n\\\\]')
    // the indent class additionally accepts the encoded tab at ANY escape level -- source `(?:[ \t]|\\+t)*`: one
    // or more backslashes then `t` (level 1, 2, 4, 8 = 1, 2, 4, 8 backslashes). R10 v3 (R10-ESCAPED-TAB-INDENT):
    // until v3 the class matched exactly TWO backslashes, so a level-1 `\n\tpassword X` leaf was missed. The
    // alternation is unambiguous (a space/tab vs a backslash run that must end in `t`), so it stays linear.
    .replace(/\[ \\t\]\*/g, String.raw`(?:[ \t]|\\+t)*`)
    // the plain/k8s reference exemption's terminator also accepts an escaped `\n` `\r` `\t` `\"` (sec-ops NOTE-3:
    // without it `password: ${env:X}\n…` in a serialized leaf would be over-redacted). Pinned THROUGH
    // SERIALIZED_PATTERNS: this is a source rewrite and could silently stop applying.
    .split(TERM_PLAIN).join(TERM_SERIALIZED)
    // token class must stop at `\` and `"`: in serialized form `\S+` would run through an encoded
    // newline and swallow the next directive, over-redacting far past the secret.
    // sec-ops R10v6 SF-2: the token also consumes a JSON escape INSIDE a value (`\\uXXXX`, `\\\\`, `\\/`) — a Go server writes `&` as
    // `\u0026`, and a token stopping at the first `\` redacted `S3c` and left `\u0026ret9` in clear while the count read 1 (the
    // self-masking class). It still stops at `\"`, `\n`, `\t` (the value's end / the next line).
    // An escaped BACKSLASH is consumed only when NOT followed by n t r " or another backslash, so a DOUBLE-encoded newline (`\\n`, level 2+)
    // is never swallowed (found by probe before ship: level 2 ate the next directive). sec-ops R10v6 SF-6: a `\uXXXX` escape of a CONTROL
    // character (`\u0000`-`\u001f`), a quote (`\u0022`) or a backslash (`\u005c`) is NOT consumed — another encoder may write a newline as
    // `\u000a`, and swallowing it ate the next directive's anchor (its secret kept, count 1). Priced residuals (count 1, a tail in clear): a
    // REAL backslash before n t r " (indistinguishable from a level-2 newline — the header's aliasing residual) and two real backslashes in a row.
    .replace(/\(\\S\+\)/g, '((?:[^\\s\\\\"]|\\\\u(?!00[01][0-9a-fA-F]|0022|005[cC])[0-9a-fA-F]{4}|\\\\\\\\(?![ntr"\\\\])|\\\\/)+)')
    .replace(/\\S\+\)/g, '(?:[^\\s\\\\"]|\\\\u(?!00[01][0-9a-fA-F]|0022|005[cC])[0-9a-fA-F]{4}|\\\\\\\\(?![ntr"\\\\])|\\\\/)+)')
    // R10 v6 (2026-10-21): a QUOTED value is ESCAPED in a serialized leaf (`password: \"S3cret\"`), so the optional opening `"` must
    // also accept the escape — before v6 the token class above refused to START at `\`, and every quoted credential value of rule 23
    // persisted in clear in a leaf arm 1 could not parse (measured on v5: `password: "x9"` kept). The closing `\"` survives (JSON-safe).
    .split('"?(?:[^\\s\\\\"]|').join('(?:\\\\?")?(?:[^\\s\\\\"]|');
  return new RegExp(src, re.flags);
}

const SERIALIZED_PATTERNS: RegExp[] = PATTERNS.map(toSerializedVariant);
/** R10 v10 (sec-ops push-2 SF-5): rules whose token never feeds the echo sink — the two login-name rules, plain and arm 2. */
const NOT_ECHO_SOURCE: ReadonlySet<RegExp> = new Set(PATTERNS.flatMap((re, i) => (re === LOGIN_NAME_RULE || re === JUNOS_LOGIN_NAME_RULE ? [re, SERIALIZED_PATTERNS[i]] : [])));

/** ARM 2 — redact a pre-serialized string leaf in place. Never used on the markdown path. */
export function redactSerializedLeaf(text: string, sink?: Set<string>): RedactArtifactResult {
  // PEM (P1): idempotent here when the plain pass already ran (redactSecretsDeep); kept for direct callers.
  const pem = redactPemBlocks(text);
  const line = applyPatterns(pem.redacted, SERIALIZED_PATTERNS, sink);
  return { redacted: line.redacted, redactedCount: pem.redactedCount + line.redactedCount };
}

/** A string leaf that ARRIVED serialized: long enough to matter and carrying encoded newlines. */
const LOOKS_SERIALIZED_MIN_LENGTH = 40;
export function looksSerialized(s: string): boolean {
  return s.length > LOOKS_SERIALIZED_MIN_LENGTH && s.includes('\\n');
}

/** Arm 2's rules -- the SECOND §J fingerprint (R10 v3, sec-ops v2 S-2): the derived SERIALIZED_PATTERNS sources and the
 *  looksSerialized rule. Golden leaves through redactSecretsDeep complete it in the test. An arm-2-only change moves
 *  this fingerprint and must bump R10_VERSION like any other. */
export const R10_SERIALIZED_RULE_SOURCES: readonly string[] = Object.freeze([
  `looksSerialized:length>${LOOKS_SERIALIZED_MIN_LENGTH}&&includes(\\n)`,
  ...SERIALIZED_PATTERNS.map((re) => `serialized:/${re.source}/${re.flags}`),
  ...R10_ECHO_RULE_SOURCES, // R10 v8: the echo pass runs over serialized leaves too (escaped variants)
  ...R10_STRUCTURED_RULE_SOURCES, // R10 v9: keys, credential fields, community maps (R-2) and the pager lead (R-1)
]);

/** B-1: the indentation a JSON text leaf was written with, so a re-serialized leaf keeps its layout (pretty stays pretty). */
function jsonIndentOf(v: string): string | number | undefined {
  const m = /\n([ \t]+)["{[\]}\d-]/.exec(v);
  if (!m) return undefined;
  return m[1].includes('\t') ? '\t' : m[1].length;
}

export function redactSecretsDeep(value: unknown, sink?: Set<string>): { value: unknown; redactedCount: number } {
  let redactedCount = 0;
  // sec-ops batch-2a SF-5: one plain-arm pass per DISTINCT key (structured results repeat the same field names thousands of times).
  const keyMemo = new Map<string, { redacted: string; count: number; tokens: string[] }>();
  const redactKey = (k: string): { redacted: string; count: number } => {
    let m = keyMemo.get(k);
    if (!m) {
      const local = new Set<string>();
      const r = redactArtifactSecrets(k, local);
      m = { redacted: r.redacted, count: r.redactedCount, tokens: [...local] };
      keyMemo.set(k, m);
    }
    if (sink) for (const t of m.tokens) sink.add(t);
    return m;
  };
  const walk = (v: unknown, depth: number, parentKey?: string): unknown => {
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
      } else if (v.length <= STRUCTURED_JSON_TEXT_MAX) {
        // R10 v9 (sec-ops batch-2a B-1): a structured result that arrived as JSON TEXT — compact (no escaped newline) or pretty
        // (real newlines) — is not `looksSerialized`, so arm 1 never parsed it and the structured arm never saw its keys/fields.
        // Parsed here; RE-SERIALIZED (with its own indentation) ONLY when the walk redacted something inside it, so a secret-free
        // JSON text stays byte-identical. Otherwise it falls through to the plain arm exactly as before.
        const t = v.trim();
        if (t.length > 2 && ((t[0] === '{' && t[t.length - 1] === '}') || (t[0] === '[' && t[t.length - 1] === ']'))) {
          try {
            const parsed = JSON.parse(t);
            const before = redactedCount;
            const inner = walk(parsed, depth + 1);
            if (redactedCount > before) {
              // The TEXT rules still run over the re-serialized form, so every token the plain arm would have taken from the original
              // text is taken here too (prod replay, k8s configmap lists: a JSON-quoted `"token": "…"` line the structured arm leaves —
              // the bare-token exclusion — read as a NEW-MISS until this pass). v9 ⊇ v8 on a JSON text leaf.
              const re = JSON.stringify(inner, null, jsonIndentOf(v));
              const r2 = redactArtifactSecrets(re, sink);
              redactedCount += r2.redactedCount;
              if (!looksSerialized(re)) return r2.redacted;
              const s2 = redactSerializedLeaf(r2.redacted, sink);
              redactedCount += s2.redactedCount;
              return s2.redacted;
            }
          } catch {
            // not JSON — the plain arm below
          }
        }
      }
      const r = redactArtifactSecrets(v, sink);
      redactedCount += r.redactedCount;
      // ARM 2 — in place, only for leaves that arrived serialized.
      if (looksSerialized(v)) {
        const s = redactSerializedLeaf(r.redacted, sink);
        redactedCount += s.redactedCount;
        return s.redacted;
      }
      return r.redacted;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v && typeof v === 'object') {
      const src = v as Record<string, unknown>;
      const communityMap = isCommunityMap(parentKey, src);
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src)) {
        // R10 v9 (R-2 (i) / (iv)): the KEY. A community-map key is the community itself; any other key goes through the plain arm.
        let key = k;
        if (communityMap) {
          if (!STRUCTURED_FIELD_KEEP_RE.test(k)) { sink?.add(k); redactedCount += 1; key = PLACEHOLDER; }
        } else {
          const rk = redactKey(k);
          if (rk.count) { redactedCount += rk.count; key = rk.redacted; }
        }
        // sec-ops batch-2a SF-4: EVERY key is checked, so a later unchanged key equal to an earlier redacted one never overwrites it
        // (whichever arrives second takes the ` #n` suffix).
        if (Object.prototype.hasOwnProperty.call(out, key)) { const base = key; for (let n = 2; Object.prototype.hasOwnProperty.call(out, key); n++) key = `${base} #${n}`; }
        const child = src[k];
        // sec-ops batch-2a SF-3: a LIST of strings under a network credential key (YANG / OpenConfig render lists).
        if (Array.isArray(child) && STRUCTURED_NETWORK_FIELD_RE.test(k)) {
          out[key] = child.map((x) => {
            if (typeof x !== 'string') return walk(x, depth + 2);
            const w = walk(x, depth + 2);
            if (w !== x) return w;
            const f = redactStructuredField(k, x, sink);
            if (f === null) return x;
            redactedCount += 1;
            return f;
          });
          continue;
        }
        const walked = walk(child, depth + 1, k);
        // R10 v9 (R-2 (ii) / (iii)): a credential FIELD's string value the text rules left whole (no directive in it).
        if (typeof child === 'string' && walked === child) {
          const f = redactStructuredField(k, child, sink);
          if (f !== null) { redactedCount += 1; out[key] = f; continue; }
        }
        out[key] = walked;
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
): PersistRedaction {
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
    return { resultJson: resultJsonObject, reportMd: reportMdContent, redactedCount: 0, echoRedactedCount: 0, echoLiterals: 0, echoOverflow: 0 };
  }
  // Pass 1 — the directive-anchored rules, collecting every token they replace (result.json incl. toolCalls, and report.md).
  const sink = new Set<string>();
  const deep = redactSecretsDeep(resultJsonObject, sink);
  let reportMd = reportMdContent;
  let keyedCount = deep.redactedCount;
  if (reportMdContent !== null) {
    const r = redactArtifactSecrets(reportMdContent, sink);
    reportMd = r.redacted;
    keyedCount += r.redactedCount;
  }
  // Pass 2 — R10 v8 echo: every bare reappearance of a collected value, by literal match, in the same two artifacts.
  const echo = buildEchoMatcher(sink);
  const e1 = redactEchoesDeep(deep.value, echo);
  let echoRedactedCount = e1.redactedCount;
  if (reportMd !== null) {
    const e2 = redactEchoes(reportMd, echo);
    reportMd = e2.redacted;
    echoRedactedCount += e2.redactedCount;
  }
  return { resultJson: e1.value, reportMd, redactedCount: keyedCount + echoRedactedCount, echoRedactedCount, echoLiterals: echo?.literals ?? 0, echoOverflow: echo?.overflow ?? 0 };
}

/**
 * R10 v8: the tokens the directive-anchored rules would take from `value` (a result.json-shaped tree or a string) — the persist's
 * ECHO SOURCE, without the persist. For a caller that must judge, BEFORE the persist, whether a text it keeps will be echo-redacted
 * there (held capture's echo parity, the held-edit applier's persisted-form mirror — R10-V8-RESIDUALS (a)/(b)). The returned values
 * ARE secrets: in memory only, never logged, stamped or persisted. Empty when R10 is off (the persist echoes nothing then).
 */
export function collectR10EchoSources(...values: unknown[]): Set<string> {
  const sink = new Set<string>();
  if (isR10Disabled()) return sink;
  for (const v of values) {
    if (typeof v === 'string') redactArtifactSecrets(v, sink);
    else if (v !== null && v !== undefined) redactSecretsDeep(v, sink);
  }
  return sink;
}

/**
 * The persist redaction's result. `redactedCount` = EVERY placeholder this pass wrote: directive-anchored tokens PLUS echoes
 * (unchanged meaning for readers of the securityEvent line: "N tokens were replaced"). `echoRedactedCount` is the echo share of
 * it (R10 v8). The collected values never leave this function (they ARE the secrets): the extra artifacts persisted beside
 * result.json get their OWN echo pass (redactExtraArtifactForPersist), and the held manifests carry no text (ids, paths, counts).
 */
export interface PersistRedaction {
  resultJson: unknown;
  reportMd: string | null;
  redactedCount: number;
  echoRedactedCount: number;
  /** Literals the echo matched against (counts only — never the values). */
  echoLiterals: number;
  /** Literals past ECHO_MAX_TRIES x ECHO_MAX_LITERALS that were NOT matched (sec-ops R10v8 B-1) — logged by the persist. */
  echoOverflow: number;
}

/** The same R10 control for a further text artifact persisted beside result.json/report.md (G1 B: the requirements
 *  pre-correction draft). Same switch: only an explicit 'false' disables it. R10 v8: the echo pass over the text's OWN collected
 *  tokens (self-contained, so the in-run hash in requirements-form-correction.ts still equals the stored bytes); the result.json
 *  values are not carried here (a requirements draft never reads a secret-bearing tool result — a named residual). */
export function redactExtraArtifactForPersist(text: string): { text: string; redactedCount: number } {
  if (isR10Disabled()) return { text, redactedCount: 0 };
  const sink = new Set<string>();
  const r = redactArtifactSecrets(text, sink);
  const e = redactEchoes(r.redacted, buildEchoMatcher(sink));
  return { text: e.redacted, redactedCount: r.redactedCount + e.redactedCount };
}
