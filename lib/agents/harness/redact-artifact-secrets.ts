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
 *  - An inline mid-sentence secret mention in prose (not at a line start) is not redacted.
 *  - Non-plain objects (e.g. Date) flatten to `{}` via the object branch in redactSecretsDeep
 *    (harmless: result.json is JSON-serialized anyway).
 */

export interface RedactArtifactResult {
  redacted: string;
  redactedCount: number;
}

const PLACEHOLDER = '<<REDACTED-SECRET>>';
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
  /^([ \t]*(?:password|passwd|passphrase|token|api[_-]?token|api[_-]?key|apikey|client[_-]?secret|secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?key|private[_-]?key|privatekey|bearer|auth[_-]?token|connection[_-]?string|connectionstring|dsn|secret)[ \t]*[:=][ \t]*)((?=\S*[\d$.\/=+])"?\S+)/gim,
  // terraform/IaC (2026-06-29, WP-C): JSON-quoted-key form `"key": "value"`. terraform `show -json` /
  // state is JSON, so the bare-key family above (line-anchored on an UNQUOTED key) slips past it — the
  // leading `"` breaks the `^[ \t]*key` anchor. Same secret-key set + secret-shaped gate. The token is
  // `[^"]+` (stops BEFORE the closing `"`) so the JSON object survives: a greedy `\S+` would eat the
  // closing quote and break structure (sec-ops IMP-2). PROSE backstop only — K1 is the state defense.
  /^([ \t]*"(?:password|passwd|passphrase|token|api[_-]?token|api[_-]?key|apikey|client[_-]?secret|secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?key|private[_-]?key|privatekey|bearer|auth[_-]?token|connection[_-]?string|connectionstring|dsn|secret)"[ \t]*:[ \t]*")((?=[^"]*[\d$.\/=+])[^"]+)/gim,
  // AWS access key id — distinctive (AKIA + 16 upper/digit), redact inline wherever it appears.
  /()(AKIA[0-9A-Z]{16})/g,
  // FAIL-SAFE generic: lowercase directive at line start + a SECRET-SHAPED token. Bare `:` REMOVED
  // 2026-06-27 (WP-C1) to stop prose FPs like `password requirements:` / `key findings:`; YAML `key:
  // value` is now handled by the k8s family above. A digit or one of $ . / = still qualifies.
  /^([ \t]*(?:password|secret|key)(?:\s+\d+)?\s+)((?=\S*[\d$.\/=])\S+)/gm,
];

export function redactArtifactSecrets(text: string): RedactArtifactResult {
  if (!text || typeof text !== 'string') {
    return { redacted: typeof text === 'string' ? text : '', redactedCount: 0 };
  }
  let redactedCount = 0;
  let out = text;
  for (const re of PATTERNS) {
    out = out.replace(re, (whole: string, prefix: string, token: string) => {
      if (token === PLACEHOLDER) return whole; // already redacted by an earlier pattern (idempotent)
      redactedCount += 1;
      return prefix + PLACEHOLDER;
    });
  }
  return { redacted: out, redactedCount };
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
  let redactedCount = 0;
  let out = text;
  for (const re of SERIALIZED_PATTERNS) {
    out = out.replace(re, (whole: string, prefix: string, token: string) => {
      if (token === PLACEHOLDER) return whole;
      redactedCount += 1;
      return prefix + PLACEHOLDER;
    });
  }
  return { redacted: out, redactedCount };
}

/** A string leaf that ARRIVED serialized: long enough to matter and carrying encoded newlines. */
function looksSerialized(s: string): boolean {
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
  if (process.env.ARTIFACT_SECRET_REDACT_ENABLED === 'false') {
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
