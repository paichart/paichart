"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Server, ArrowRight, GitBranch, Braces, Clock, ShieldCheck, CircleDot, KeyRound, Fingerprint } from 'lucide-react';

/**
 * "How it works" — a conceptual explainer for the workflow model plus a code-verified field
 * reference (execution modes, failure strategies, chaining, timeouts, retries, the service-access
 * layer). Durable by design: describes the architecture, not the inventory.
 */
export function WorkflowsHowItWorks() {
  return (
    <div className="max-w-4xl space-y-8 py-2">
      <section>
        <h2 className="text-xl font-bold">How workflows work</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A workflow chains calls to your registered MCP services into one repeatable, named operation —
          run it on demand, or invoke it from an AI client.
        </p>
      </section>

      {/* Building blocks */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-foreground">
              <Server className="h-4 w-4 text-primary" />
              <span className="font-semibold">Service</span>
            </div>
            <p className="text-sm text-muted-foreground">
              A registered MCP service (yours or a hub service) that exposes one or more <strong>tools</strong>.{' '}
              <span className="font-mono text-xs">e.g. paichart-project-service</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-foreground">
              <ArrowRight className="h-4 w-4 text-primary" />
              <span className="font-semibold">Step</span>
            </div>
            <p className="text-sm text-muted-foreground">
              One call: a <strong>service + tool + arguments</strong>. A step can wait on earlier steps and
              reuse their output.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-foreground">
              <GitBranch className="h-4 w-4 text-primary" />
              <span className="font-semibold">Workflow</span>
            </div>
            <p className="text-sm text-muted-foreground">
              An ordered set of steps (1–20) with an <strong>execution mode</strong> +{' '}
              <strong>failure strategy</strong>, saved under a unique <strong>name</strong> you run it by.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Execution modes */}
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <GitBranch className="h-4 w-4 text-primary" /> Execution modes
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span><strong>sequential</strong> (default) — steps run in order, 1 → N.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>parallel</strong> — independent steps run together (max 5 at once); a step with{' '}
              <span className="font-mono">dependsOn</span> waits for those steps first. Dependencies must point to{' '}
              <em>earlier</em> steps — cycles and forward references are rejected on save.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>conditional</strong> — an if / then / else on <strong>1–3 steps</strong>: step 1 is the
              condition, step 2 (then) runs if it succeeds, step 3 (else) runs if it fails. Only one branch runs.
              (<span className="font-mono">dependsOn</span> is a parallel-mode feature — it does not drive conditional.)
            </span>
          </div>
        </div>
      </section>

      {/* Failure strategies */}
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <CircleDot className="h-4 w-4 text-primary" /> Failure strategies
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span><strong>stop</strong> (default) — halts on the first step error.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span><strong>continue</strong> — skips the failed step and runs the rest.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>rollback</strong> — a <em>future feature</em>. Today it behaves like <strong>stop</strong>{' '}
              (halts on the first error); completed calls are <strong>not</strong> undone. If you need compensation,
              add an explicit undo step.
            </span>
          </div>
        </div>
      </section>

      {/* Variable chaining */}
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Braces className="h-4 w-4 text-primary" /> Variable chaining
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              A step&apos;s arguments can reference a prior step&apos;s result:{' '}
              <span className="font-mono text-xs">{'{{step.N.output}}'}</span> (whole output),{' '}
              <span className="font-mono text-xs">{'{{step.N.output.field}}'}</span>,{' '}
              <span className="font-mono text-xs">{'{{step.N.output.arr[0].field}}'}</span>, or{' '}
              <span className="font-mono text-xs">{'{{step.N.data}}'}</span> (alias for output).
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              A reference to a <strong>missing step</strong> fails the step loudly; a missing <strong>field</strong>{' '}
              on an existing step resolves <strong>silently</strong> to <span className="font-mono">undefined</span>{' '}
              (or leaves the <span className="font-mono">{'{{…}}'}</span> literal in surrounding text) — so a typo in a
              field path doesn&apos;t error, it just goes blank.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              Chained output is <strong>untrusted</strong> — it comes from whatever service ran the prior step. The
              engine strips prototype-pollution keys, but don&apos;t pipe a downstream service&apos;s output straight
              into an auth-bearing or command-like argument without your own validation.
            </span>
          </div>
        </div>
      </section>

      {/* Timeouts + retries */}
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Clock className="h-4 w-4 text-primary" /> Timeouts &amp; retries
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Three separate clocks:</strong> the Builder&apos;s <strong>Timeout</strong> field is the{' '}
              <em>whole-workflow</em> budget (1–300 s in the UI); each step can set its own <em>per-step</em> timeout
              (up to 60 s); and every underlying <em>service call</em> has its own ceiling (up to 5 min). They&apos;re
              not the same number.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              A whole-workflow timeout aborts the <em>wait</em>, not the work — an in-flight step keeps running (its
              side effects still land), and the run is marked timed-out.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Retries are opt-in.</strong> A step retries only if you set{' '}
              <span className="font-mono">retries</span> &gt; 0 <em>and</em> the error is retryable (timeout/network,
              not validation or bad-reference errors), with exponential backoff. Retries draw on a shared,
              workflow-wide budget (default 10).
            </span>
          </div>
        </div>
      </section>

      {/* Service access */}
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" /> Making a step reach a real service
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              The service must be <strong>registered + Active</strong>, and a step can only target one that is{' '}
              <strong>public</strong>, that <strong>you own</strong>, or (as admin) any. The tool you name must be one
              that service actually registered.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Identity forwarding:</strong> an external service is authenticated <em>as you</em> only at
              OWNER or TEAM_MEMBER trust — otherwise the step runs with no caller token. See{' '}
              <em>&ldquo;How your identity reaches a service&rdquo;</em> below for the full mechanism.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              A saved workflow whose steps need POV context can declare{' '}
              <span className="font-mono">requires: [&quot;povId&quot;]</span> so it fails fast at the front door if run
              without one (API-only — not in the Builder yet). POV-scoped runs need write access to that POV; demo
              users are excluded.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              A bad or unregistered service name fails that step <strong>instantly</strong> (no retry); a slow or down
              service times out and retries only if the step opted in.
            </span>
          </div>
        </div>
      </section>

      {/* Identity / JWKS token passing */}
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <KeyRound className="h-4 w-4 text-primary" /> How your identity reaches a service (JWKS)
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>The idea:</strong> when a step calls an external service and you have the right relationship
              to it, the Hub mints a short-lived, cryptographically-signed token that <em>carries your identity</em>{' '}
              and hands it to the service alongside the call. You never share a password or API key — the service
              learns <em>who</em> is calling from the token itself.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>What decides it — your trust level.</strong> The Hub assigns a trust level <em>per step</em> from
              your relationship to the target service. Two paths grant a token to a workflow caller:{' '}
              <strong>OWNER</strong> (you own the service) and <strong>TEAM_MEMBER</strong> (the service&apos;s owner is
              on the team of a POV you pass as <span className="font-mono">povId</span>). A public service called with an
              unrelated <span className="font-mono">povId</span> is <strong>SCOPED</strong> (no token); with no{' '}
              <span className="font-mono">povId</span> it&apos;s <strong>ANONYMOUS</strong> (no token). First-party hub
              services are <strong>INTERNAL/TRUSTED</strong> and always tokened.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>POV membership is the switch.</strong> To let a teammate&apos;s service authenticate you, you both
              need to be on the same <strong>POV team</strong>, and you run the workflow with that{' '}
              <span className="font-mono">povId</span>. That shared POV is what turns your user identity into an
              OWNER/TEAM_MEMBER token the service will trust.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>What&apos;s in the token, and how it&apos;s checked.</strong> A per-call{' '}
              <strong>RS256</strong> JWT (~15-min life) carrying your <span className="font-mono">userId</span>,{' '}
              <span className="font-mono">email</span> and <span className="font-mono">role</span>, issued by{' '}
              <span className="font-mono">https://paichart.app</span>. The service validates it against the Hub&apos;s
              <strong> public JWKS keys</strong> (<span className="font-mono">/api/auth/jwks</span>) — signature, issuer,
              audience and expiry. The Hub signs with a private key; the service verifies with the public key, so there is{' '}
              <strong>no shared secret</strong> to leak.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>See exactly what happened.</strong> Each step result includes an{' '}
              <span className="font-mono">identity</span> fact —{' '}
              <span className="font-mono text-xs">{'{ trustLevel, tokenForwarded, audience }'}</span> — so you can confirm
              your identity was forwarded (or see <em>why not</em>) instead of guessing. It reports what the Hub{' '}
              <em>did</em>; it never claims the service <em>accepted</em> the token (only the service can say that).
            </span>
          </div>
        </div>
      </section>

      {/* Audiences (RFC 8707) */}
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Fingerprint className="h-4 w-4 text-primary" /> Audiences: one token, one service
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              Every forwarded token is stamped with an <strong>audience</strong> naming exactly one service:{' '}
              <span className="font-mono text-xs">aud: https://paichart.app/mcp/&lt;service-slug&gt;</span>. A token minted
              for your Snowflake service is valid <em>only</em> at that service.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Why it matters — blast-radius isolation (RFC 8707).</strong> If one service is compromised and
              leaks a token it received, that token <strong>can&apos;t be replayed</strong> against any other service or
              the front-door API — each verifier only accepts <em>its own</em> audience. One breach can&apos;t cascade.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>If you register a service:</strong> accept <em>your own</em> audience, not the generic{' '}
              <span className="font-mono">/mcp</span>. The full JWKS accept-list code (JS + Python) is in the{' '}
              <span className="font-mono">HOWTO-validate-jwt-tokens</span> guide;{' '}
              <span className="font-mono">ABOUT-trust-levels</span> covers the 6-tier model, and{' '}
              <span className="font-mono">HOWTO-register-service</span> walks a service from zero to tokened end-to-end.
            </span>
          </div>
        </div>
      </section>

      {/* Naming, status + running */}
      <section>
        <h3 className="text-base font-semibold">Naming, status &amp; running</h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Name</strong> must be lowercase letters, digits and hyphens only{' '}
              (<span className="font-mono">^[a-z0-9-]+$</span>, 1–100 chars) and is <strong>immutable</strong> after
              create — it&apos;s the key you run the workflow by. A workflow needs at least <strong>one step</strong>{' '}
              to save (max 20).
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Status:</strong> only <span className="text-emerald-400">Active</span> workflows resolve by name
              at <span className="font-mono">workflow.execute</span> — a <em>Paused</em> or <em>Deprecated</em>{' '}
              workflow returns not-found when run by name. <em>Deprecated</em> is a soft delete.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">•</span>
            <span>
              <strong>Run</strong> it from a row, or from an AI client:{' '}
              <span className="font-mono text-xs">{'services({ action: "workflow.execute", workflowName: "…" })'}</span>.
              Run history lives in the <strong>Executions</strong> tab.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
