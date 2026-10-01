/**
 * Cross-trust injection screen for FORWARDED service-call arguments.
 *
 * Tested against `JSON.stringify(args)` by the `services(action:'call').arguments`
 * refine in lib/mcp/server/config/tool-schemas.js. It protects EXTERNAL services
 * that receive forwarded args, not pAIchart (sec-ops Finding A, Phase 3).
 *
 * Extracted to this prisma-free module (2026-09-28, register X25) so the
 * shipped regex can be exercised directly by scripts/test-service-call-args-coercion.ts
 * — tool-schemas.js transitively reaches prisma and cannot be imported under CI.
 *
 * EVENT-HANDLER ARM — `(?:\b|\\[nrtf])on\w+\s*=`
 *   Was `on\w+\s*=` with no left boundary, so it matched INSIDE ordinary words:
 *   `comp|onent=`, `c|onnection=`, `z|one=`, `pers|ona=`, `c|ondition=`. That refused
 *   every standard Kubernetes recommended-label selector
 *   (`app.kubernetes.io/component=…`) at the hub boundary (X25, Rev 19).
 *
 *   The left edge must be where an HTML attribute can start. In the STRINGIFIED
 *   JSON that is either a non-word char (space, `/`, `"` → `\"`, `'`, start of a
 *   string value) — which `\b` covers — or one of the HTML attribute-separator
 *   whitespace chars, which JSON.stringify renders as a two-char escape ending in a
 *   LETTER (`\n`, `\t`, `\r`, `\f`) and so have NO word boundary before `on`.
 *   Without the `\\[nrtf]` alternative, `<img src=x\nonerror=alert(1)>` would pass —
 *   a live HTML vector the old regex caught. `\u000b`/`\u0000` are deliberately not
 *   listed: neither is an HTML attribute separator (VT is not HTML whitespace; NUL
 *   becomes U+FFFD inside the attribute name), so neither yields an `on*` attribute.
 *
 *   Pre-existing gaps, UNCHANGED by the boundary (neither old nor new catches them):
 *   whitespace escaped between name and `=` (`onload\n=`), and a bare JSON key
 *   `{"onload": "…"}` (no `=`). Residual false positives, also unchanged: words that
 *   START with `on` (`one=`, `online=`, `onboarding=`).
 *
 * THREAT MODEL: this screen is a speed bump, not a control. It sees the canonical
 * stringified args; a receiver that DECODES a value (percent, entity, \x escapes)
 * before rendering it is outside the model — `%6Fnerror=` and `javascript&colon;`
 * pass old and new alike (sec-ops review 2026-09-28, SHIP 92%).
 *
 * Do not add arms here without a panel: this is a cross-trust guard.
 */
const FORWARDED_ARGS_INJECTION_PATTERN =
  /(?:<script\b|(?:\b|\\[nrtf])on\w+\s*=|javascript:|vbscript:|data:[^,]*[bB]ase64|file:|exec\s*\(|eval\s*\(|import\s*\()/i;

module.exports = { FORWARDED_ARGS_INJECTION_PATTERN };
