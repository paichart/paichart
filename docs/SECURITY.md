# Security

What protects a run on your install, the two settings you control, and the security properties that are specific to agents
handing work to each other. Terms are in [GLOSSARY.md](GLOSSARY.md).

## What protects a run

- **A run never applies a change.** A program produces a package for a person to apply in their own change process.
  pAIchart has no step that writes to a device, a cluster or a cloud account, and the services shipped with it are read-only.
  A service you register yourself can do whatever you built it to do: register read-only ones.
- **Agents read your systems only through read-only services** that you register, and only through the tools each service's
  descriptor lists.
- **The Git file source is pinned to one repository** (`GIT_FILE_SOURCE_PIN`, [INSTALL.md](INSTALL.md) step 9c). A spec that
  names any other repository is refused at its first read.
- **Approval gates.** The work behind a gate does not start until the gate is released. The platform's own machinery never
  releases one. Release is open to the project's owner, its team members and administrators, not only to the named
  approver, and it is recorded ([GATES.md](GATES.md), "Who can release a gate").
- **Facts are recorded by the platform, not claimed by an agent.** What a release rests on (containment checks, the edit
  receipt, the reviewer's transcribed verdict) is computed and stored by the platform ([READING-A-RUN.md](READING-A-RUN.md)).
- **Kept copies and stored results are redacted** (the second guard below). A copy fetched with `held.get` has secrets
  replaced by a placeholder ([SELF-HOST-KEPT-FILES.md](SELF-HOST-KEPT-FILES.md)).

## The two output guards

pAIchart runs two guards on its own side, whatever service a run reads through. Each is one line in `.env`, read when a
process starts, so a change needs a restart of both processes (`sudo systemctl restart paichart-mcp paichart-web`). The
same line is the off switch. `.env.example` ships both on.

| | Sanitizer | Redactor |
|---|---|---|
| **Setting** | `CONNECTED_OUTPUT_SANITIZE_ENABLED` | `ARTIFACT_SECRET_REDACT_ENABLED` |
| **What it does** | Neutralises untrusted output from a connected service before an agent reads it: prompt-injection patterns, zero-width and control characters, attempts to break out of the "reference data" wrapper. A poisoned device banner cannot steer the model. | Replaces secrets with a placeholder in what pAIchart stores (`report.md`, `result.json`, kept copies) before it is written. A secret a service leaks does not end up in a stored result. |
| **When it runs** | only when the line is `=true` | always, unless the line is `=false` |

Two things to know about the sanitizer:

- **It can rewrite ordinary configuration.** Its injection patterns match some harmless text. `system:` inside a device
  configuration line is the known case: `logging level system:informational` and a route-map named `SYSTEM:PREPEND` are both
  rewritten. Every rewrite is recorded on the tool call (`rewritten`, `neutralizedCount`, `rewriteClasses`), so you can see
  when it happened.
- **Never act on the in-band `[NEUTRALIZED-INJECTION:…]` marker.** Device output that contains that literal passes through
  unchanged, so an attacker can forge it. Go by the recorded fields.

One thing to know about the redactor:

- **Kubernetes values it redacts, and what it still does not:** in a Kubernetes object a run reads, the redactor removes the
  value of an environment variable whose name marks it as a credential (`PASSWORD`, `API_KEY`, a cloud secret key…), the token
  in a `Bearer` or `Basic` value under any name, and the value of a credential flag in a container's arguments
  (`--password=…`, also inside a `sh -c "…"` string) — in the object's spec and in its
  `kubectl.kubernetes.io/last-applied-configuration` annotation, which can still hold an old value after the spec moved to a
  Secret reference. Still **not** redacted: a flag and its value given as two separate arguments (`"--password", "x"`), a
  base64 registry credential stored in a ConfigMap, and a credential written in a manifest's raw YAML text rather than read as an
  object. Secret values themselves are never returned by the read-only service. Keep credentials in Secrets
  (`valueFrom: secretKeyRef`) and these residuals do not arise.
- **Collector, nginx and htpasswd values it redacts (redactor version `paichart.r10/13` and later), and what it still does not:**
  these rules are not limited to collector or nginx files — they apply to every text the redactor sees (a kept file, a tool
  result, a report; a Kubernetes ConfigMap or ingress snippet that carries nginx lines is treated the same). The redactor removes the value of a credential header set by `proxy_set_header` or
  `grpc_set_header` (`Authorization`, `Cookie`, `X-API-Key`, an `X-…-Token` name; the scheme word such as `Bearer` stays), a
  literal assigned to a credential-named nginx variable (`set $api_token "…"`), `secure_link_secret`, a literal a credential
  variable is compared with (`if ($http_x_api_key != "…")`, the entries of a `map $http_authorization … { }` block), an htpasswd
  hash after `user:` (`$apr1$`, bcrypt, `{SHA}` …), every entry of a collector `htpasswd:` → `inline:` block, a credential in a
  one-line YAML map (`headers: { api-key: … }`), and the collector keys `instrumentation_key` and `account_token`. The directive,
  the header or key name and the rest of the line stay in the kept copy, so you can still see what the line is. A line whose
  value was redacted **cannot be changed by a pipeline edit at all** — not its value, not its header name: the package is refused
  (`touches-redacted-line`) and that line is yours to change by hand. Redaction can also hit a line that holds no secret (for
  example a non-secret literal under a credential-named header or variable): the kept copy then shows the placeholder, edits to
  that line are refused in the same way, and the rest of the file is unaffected — make that one change yourself, or write the
  value as a reference. Still **not** redacted: a bare
  `user:password` line outside that `inline:` block (it looks like `host:port`; a file *named* `htpasswd` is never read or kept),
  a token inside a URL path or query (`?api_key=…`), a literal inside a Lua or njs block or a `secure_link_md5` expression,
  `fastcgi_param` / `add_header Set-Cookie` values, a commented-out directive, and a short or letters-only literal (under eight
  characters, or with no digit or symbol) in a `set`, `if` or `map`, and the entries of a `map` block that come AFTER a line
  containing a brace (a quoted regex entry with a `{n}` quantifier ends the block for the redactor). Reference a secret
  (`$variable`, `${env:NAME}`) instead of writing it and none of these arise.

**What a file comparison can quote** (observability, from observability-config 1.12.0). When a leg keeps a config file from Git
and also reads its served copy, the platform compares the two and shows the leg's Architect and Reviewer the lines that differ
(at most 20 a side for each file). Before a line is shown the platform redacts the secret shapes it knows and withholds any line
that looks like a credential. It cannot recognise a secret kept under a name that does not look like one: a line such as
`region_code: s3cr3t` is shown as written and is stored with the run. Keep secrets out of config files. Reference them (an
environment variable, a secret store) and do not write their values.

The interface contract (the values every leg of a program must use exactly) is not sanitized or truncated, by design:
section 2 below says why.

---

# Security properties of agent orchestration

These are not about jailbreaks, prompt hygiene or model alignment. Each is about what happens when agents hand work to each
other, and several invert the obvious advice. They were earned on live runs in August 2026. Read them before designing a new
pipeline or program: most are consequences of design choices (which channel carries what, with what framing), not of code
defects.

---

## The one-line frame

> **In a single-agent system, security is about what the model is asked. In an orchestration system,
> it is about what agents are ALLOWED TO TELL EACH OTHER, how much authority that carries, and who
> can write into that channel.**

Almost everything below follows from taking that seriously.

---

## 1. Binding-frame authority amplification

The pipeline-context renderer wraps the interface contract in maximum-trust framing — *"Every
design/config value you produce MUST honor these shared constants… do not re-derive, renumber, or
deviate… escalate; never invent one"* (`lib/agents/harness/render-pipeline-context.ts`).

That framing is correct and load-bearing for fidelity. But the contract originates in a
**user-writable field** (`task.create parameters.interfaceContract`). So propagating it to N children
delivers attacker-influenceable text to N agents **with maximum-trust framing and an explicit
do-not-question instruction attached**.

The fidelity fix and the injection amplifier are **the same mechanism**.

> **Generalisable: the trust FRAMING around a channel is part of its attack surface, not just its
> contents.** A reviewer assessing "is this channel safe" must read the wrapper, not only the payload.

## 2. Sanitising can be the wrong safety move

The sanitizer (`CONNECTED_OUTPUT_SANITIZE_ENABLED`, called R9 in the code) exists to neutralise hostile output from connected services,
and it is right for that. Applied to a **binding constant**, it is actively harmful: it corrupts the
exact value every downstream agent is required to transcribe verbatim.

This is not theoretical. The C1/R5 incident showed platform mutation *inside an agent-attributed view*
producing a **false blocking verdict** — a clean package refused, at the cost of a full round.

> **Where a value's INTEGRITY is the security property, "sanitize everything" is the wrong reflex.**
> The interface contract is therefore rendered verbatim and exempt from R9 and truncation — by design,
> not by omission. Anyone "hardening" that path should read this first.

## 3. Defence-by-accident, and losing it deliberately

Before contract inheritance shipped, the harness paraphrased the contract into child briefs, lossily.
That paraphrase was functioning as a **weak accidental sanitizer** for injection prose: a lossy channel
degrades an attack payload along with everything else.

Fixing the fidelity bug removed that. The trade is correct — defence-by-accident is not a control, and
the lossiness was causing real defects — but the point is procedural:

> **When a fix removes an accidental protection, NAME the trade at the time.** Discovering it later,
> during an incident, is how a team concludes it was compromised by its own improvement.

## 4. Conditional obligations with unsatisfiable predicates

A guard written as *"where X is present, do Y"* is **not a guard** unless something verifies X actually
reaches the agent. When X never arrives the predicate is false, **no obligation is owed, nothing is
skipped, and no transcript records anything.** It is invisible to every forensic method we have — the
run looks clean because, formally, it *was*.

Confirmed live: the author's *"where the contract carries a canonical stanza template, TRANSCRIBE it"*
and the reviewer's *"verify every non-placeholder line appears"*. Both correctly written. Both inert for
five or more rounds. Between them they let two rounds ship config that left a routing protocol INACTIVE
while entering, committing and displaying cleanly.

> **This is a registered bug class, not an anecdote.** For any conditional obligation, the only question
> that matters is: **what guarantees the predicate's subject reaches this agent's context?**

## 5. Provenance forgery

`interfaceContractInheritedFrom` and `interfaceContractInheritedAt` (`lib/tasks/services/inputContext.ts`)
*look* platform-authored. They live in a user-writable channel.

> **Generalisable: platform-looking metadata in an agent-writable store is attacker-controllable.**
> A forensic consumer must treat a provenance stamp as a **hint to verify**, never as a fact. The same
> caution applies to every `metadata.*` field a run reads back and believes.

## 6. Transitivity is not trust

The tempting argument — *"the parent row was validated at create, so copying it to a child is safe"* —
is **false** when other write doors reach that row with weaker validation. Validation is a property of
the DOOR, not of the row, and a row does not remember which door it came through.

> sec-ops' phrasing, kept verbatim because it is the most useful sentence in this document:
> **"transitivity from an unvalidated source is not trust, it's laundering."**

## 7. Co-location as authorization

Contract inheritance flows parent → child keyed **only on `stage_id`**
(`p.metadata->>'pipelineStageId' = c.stage_id`). Its entire safety therefore rests on one prior
invariant: *a caller cannot place a task into another POV's stage.*

That guard does exist (the cross-POV stage guard, Wave A C3, 2026-05-23). The hazard is structural:

> **A new data flow can silently make an OLD invariant load-bearing in a NEW way, and nothing
> re-verifies it.** When you add a flow keyed on an existing field, find the invariant you have just
> started depending on and re-confirm it explicitly. It was written for a different purpose.

## 8. Validation-door asymmetry

One field, three write doors, two protection levels. `inputContext` is reachable through several
paths that do not all validate identically — so "the field is validated" is true of the field's *name*
and false of the field's *contents*.

> **Audit a field by enumerating its WRITE DOORS, never by reading the one you happen to know about.**

## 9. Expected-denial is not degradation

A verb-enum or RBAC denial returned as an MCP `isError: true` tool result is recorded `success: true`
**by construction** — the service RETURNS the error rather than throwing. So a confined harvest, denied
at the boundary, **does not self-degrade** and does not trip the anti-fabrication signals that key off
failure.

Only a genuine throw degrades. Therefore:

> **The fix for a noisy denial path is a CONTRACT with the service (return `isError`, don't throw),
> not engine calibration.** Pinned by test, because it is the kind of property a well-meaning refactor
> quietly inverts.

---

## What generalises beyond this platform

1. **The channel's framing is part of its attack surface.** Trust wrappers amplify whatever they wrap.
2. **Integrity and sanitisation can be opposed.** Ask which property the value actually has.
3. **A conditional guard is only as real as the delivery of its subject.** Unsatisfiable predicates
   fail silently and invisibly — the most dangerous failure shape in the system.
4. **Platform-looking metadata in an agent-writable store is attacker-controllable.**
5. **Validation is a property of the door, not the row.**
6. **New flows inherit old invariants without telling anyone.**

## Standing practice these imply

- When adding a channel between agents, state its **trust framing** and its **write doors** in the
  design, not after.
- When a fix removes an accidental protection, **name the trade in the commit**.
- For every conditional obligation you write into a protocol or role guidance, answer in the same
  breath: *what guarantees the subject arrives?* If nothing does, it is decoration.
- Prefer a **fact** the consumer can check over a **verdict** it must believe — the same Protocol 10
  rule, applied to security signals.

---

*Earned during a routing-migration campaign and the contract-inheritance work of August 2026.*
