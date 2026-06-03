# Chapter 12 — The Entry Point That Loads Itself: `initialize.instructions` Under Tool Search

**Audience**: Engineers shipping an MCP server to AI clients (Claude Desktop / Code, ChatGPT). Your tools and prompts work — but a new user opens a fresh chat and your server seems invisible until they go looking for it.
**Related**: [Chapter 5 — Transport boundaries](05-transport-boundaries.md) (the two-transport trap reappears here); [Chapter 11 — Error recovery signals](11-error-recovery-signals.md) (the "ship facts, not numbers that drift" discipline applies to the instructions string too).
**Reading time**: ~12 minutes.

---

## What this chapter teaches

In late 2025 and early 2026, Anthropic's clients changed how they load MCP tools. By default they now load only tool **names** at the start of a conversation and defer the full schemas until the model decides it needs them and runs a search. It's a good change for token economy — and it quietly moves a burden onto you, the server author. If the model isn't *oriented* at session start, it may never think to search for your server at all.

This chapter is the story of how that surfaced for pAIchart — a new user's fresh chat went "empty" — why it was **not** a bug, and the one roughly 2KB string that fixed it: the MCP `initialize.instructions` field. Along the way, a two-transport trap that hid the fix, and the test that keeps it from coming back.

The reusable lesson is small and sharp: **under deferred tool loading, your `initialize` instructions are the one piece of text every client reads every session before anything else. Spend it on orientation, not on a feature dump.**

---

## 1. The symptom: the server went invisible

A new user opens a fresh chat with your MCP server connected and asks for help — *"help me manage my POVs."* And the model answers generically. None of your tools fire. The server is right there, connected, but the model doesn't reach for it.

Then the user asks the magic question — *"what tools does paichart have?"* — and suddenly everything springs to life. The tools surface, the model starts calling them, and it all works.

So the capability was never gone. It just wasn't *in front of the model* until someone went looking. For an experienced user who knows to prod, that's a shrug. For a first-time user who doesn't know what to look for, it's a dead end at the worst possible moment — the very first interaction.

The most acute version of this: the tool that exists specifically to *onboard* a new user — the one that runs your guided "get started" prompt — is the one not present at session start. The front door is the thing that's missing.

## 2. Is it us? The cross-client tell

Before opening the bug tracker, ask the first diagnostic question: is this *our* server's fault, or expected client behavior?

Here's the tell. The same server, returning the same output, behaves differently across clients. In ChatGPT, the full tool list is present from the first message — the server was never invisible there. In Claude, it isn't.

**When one client shows a symptom and another doesn't, against identical server output, the variable isn't your server — it's the client.** That single observation reframes the whole investigation. This isn't a regression in your MCP implementation. Something changed on the client side. And it did, in plain sight, in the release notes.

## 3. Root cause: client-side Tool Search

The change is called **Tool Search**, or deferred tool loading. Anthropic shipped it at the API level in late 2025 (`advanced-tool-use-2025-11-20`), and Claude Code turned it on by default in January 2026 — *"MCP tools are deferred rather than loaded into context upfront… Only tool names load at session start."*

The model is simple, and worth holding in your head:

1. At the **start** of a conversation, the client loads only your tool **names** into context — not the full schemas.
2. When the model decides it needs a tool, it runs a **search**.
3. *Then* the matching schemas load, and the model can call them.

This explains the symptom exactly. *"What tools does paichart have?"* isn't a workaround — it literally **is** the search firing. The user was triggering the mechanism by hand without knowing it.

It's a genuinely good change: it keeps thousands of tokens of tool definitions out of every conversation that doesn't need them, which matters more the better your tool descriptions are (see [Chapter 2](02-the-ten-gold-standards.md) — gold-standard descriptions are *not* small). ChatGPT made the opposite default — load everything upfront — which is the entire reason for the cross-client asymmetry.

But the change relocates a responsibility. Under upfront loading, a model bumps into your tools whether or not it was looking for them. Under deferred loading, **if the model isn't oriented at session start, it may never search for you.** Orientation is now your job.

One nuance that narrowed our fix: MCP **prompts** are *not* deferred — they already surface as slash commands at session start (`/your-server:prompt-name`). So the guided "get started" prompt technically loads. What was missing wasn't the prompt; it was the model knowing, at turn one, to point a new user at it.

## 4. The lever: `initialize.instructions`

There is a field built for exactly this: the `instructions` string your server returns in its `initialize` response. Anthropic's own guidance is explicit — server instructions help the model understand *when to search for your tools*. It's capped at roughly two kilobytes.

This is the one piece of text every client reads, every session, before anything else happens. So we spend it on orientation. Here is the copy pAIchart ships (trimmed):

```
pAIchart — AI-Native Service Orchestration

pAIchart is an MCP hub for delivery management (POVs, tasks, phases) plus a
registry of external MCP services you can discover, call, and orchestrate into
multi-service workflows.

NEW HERE? Start with the guided onboarding:
• prompt_command(command: "/prompt HOWTO-get-started")
• Browse all guides and workflows: list_prompts()
• Prompts also appear as slash commands — type / to see them.

WHEN TO REACH FOR pAIchart TOOLS:
• project / perform — read and act on POV, task, phase, and stage data
• services / registry — discover, call, register external MCP services; run workflows
• analytics / template / search / fetch — recommendations, templates, search/retrieval

Tip: run /prompt HOWTO-get-started, or say "discover services" to explore.
```

Two design choices are doing the real work.

**Orient, don't enumerate.** Notice the instructions point at *one* entry point — a guided prompt called `HOWTO-get-started` — and let that prompt do the heavy lifting (it personalizes itself against the user's actual data). The instructions don't try to be the manual; they're a signpost to the front door. A model that reads them knows the single most useful next move, which is all you need at turn one.

**Ship facts that stay true.** Notice what is *not* in the copy: no counts. No "93 tools, 9 services, 17 prompts." This is the [Chapter 11](11-error-recovery-signals.md) discipline applied to a different surface. A count is a fact, and a *stale* fact is worse than no fact — it reads as authoritative and is silently wrong. (Concretely: an earlier version of these instructions carried hard counts, and a stale count actually mis-led the team's own diagnosis of this very issue.) Numbers that drift become self-maintaining prose, or they come out.

That's the whole fix, conceptually: prime the model with where to start, and deferred loading stops being a wall and becomes a doorway.

## 5. The trap: two transports, one forgotten

Now the part that bit us — and it's a trap any server with more than one transport can fall into. (If [Chapter 5](05-transport-boundaries.md) was about types dying at the transport boundary, this is about a whole *spec field* dying there.)

Our first instinct was "we never set instructions." Wrong. We *did* — and they shipped correctly… **on stdio**. Because over stdio, the SDK's `Server` builds the `initialize` response for you, and it includes the instructions you handed it at construction.

But the HTTP path didn't go through the SDK transport. It hand-built every response in its own request handler — and that hand-built `initialize` simply didn't include the field. Same server, two transports, one of them quietly missing a spec field the other had. The clients most affected by deferred loading were the ones on the path that dropped the orientation.

The fix has two parts, and the second matters more than the first:

1. **Emit the instructions on the HTTP path too — from the same source.** Not a copy-paste of the string into the HTTP handler (that's a second thing to forget). The HTTP `initialize` pulls the instructions *live* from the same method the SDK path uses, so the two literally cannot drift. While we were there, we aligned the server identity (`serverInfo`) the HTTP path advertised, which had also drifted from the stdio values.

2. **Add a parity test.** A small test pins the fields both transports must agree on: server identity, the instructions string, and the metadata passthrough. If a future edit drops one on either path, CI goes red — instead of a user discovering it months later in a fresh chat. The test is wired into the pre-deploy suite.

The general principle: **a hand-rolled transport, plus a spec field the SDK normally gives you for free, equals silent drift.** The durable answer isn't "be more careful." It's "make it impossible to forget" — single-source the value, then pin it with a test.

(There's a deeper version of this lurking: the right *eventual* fix is to put the HTTP path on the SDK's transport too, so the SDK shapes both responses and the drift can't exist. That's a larger migration, gated on where the MCP spec's sessionless work lands. The parity test is the bridge until then.)

## 6. Proof

Here is the whole thing working end to end, after the fix shipped. A genuinely fresh chat in Claude Desktop:

> **User:** help me get started with paichart
>
> *(The model recognizes the entry-point tool is deferred → runs a tool search to load it → invokes `prompt_command(command: "/prompt HOWTO-get-started")` → the prompt personalizes itself against this user's actual services and POVs.)*

Nobody had to know the magic words. The instructions oriented the model; it found and ran the onboarding path on its own. **The guided experience is delivered even though the tool itself is deferred** — which is the entire goal, achieved with one string of text on a path every client already reads.

## 7. The lever that wasn't: `alwaysLoad`

One more thing, because it'll save you an afternoon. There's a per-tool hint — `_meta: { "anthropic/alwaysLoad": true }` — that's supposed to force a specific tool to load at session start even under Tool Search. It's tempting: just mark your entry-point tool `alwaysLoad` and skip the instructions dance.

We tried it. As of mid-2026, **the clients ignore the server-side form** — both Desktop and Code deferred the marked tool exactly as before. The only lever that actually force-loads a tool is the user's *local* client config (`.mcp.json`), which you can't ship from the server side.

We left the `_meta` in place — it's spec-safe, zero-cost, and forward-compatible if a client later honors it — but it carries none of the weight. The instructions field carries all of it. **Don't build on a lever that isn't load-bearing**; verify that the mechanism you're relying on actually fires before you depend on it.

---

## What to remember

1. **Deferred tool loading is the default now.** Don't assume your tools are in context at session start — design for the model having to *find* them.
2. **`initialize.instructions` is your lever.** One string, every client, every session, read before anything else. Roughly 2KB. Treat it as a broad-blast-radius surface.
3. **Orient, don't enumerate.** Point at one entry point and let it do the work. Drop anything that drifts into being wrong — counts especially (Chapter 11's lens).
4. **Two transports means two places to forget a spec field.** Single-source the value so the paths can't drift, then pin it with a parity test.
5. **Verify your levers are load-bearing.** The server-side `alwaysLoad` hint is inert today; we found out by testing, not by assuming.

---

## Provenance

The `initialize.instructions` analysis is grounded in pAIchart's own MCP server: the single-source `getServerInstructions()`, the hand-rolled HTTP transport path that drifts from the SDK, and the transport-parity gate added after the split-brain was found (mid-2026).

- **pAIchart Hub overview** (latest info & instructions): <https://github.com/paichart/paichart>
- **Hub access**: <https://paichart.app/mcp>
- **Instructions**: connect with Claude Desktop (GitHub OAuth) or ChatGPT (Microsoft OAuth)
- **Chat with**: "Help me get started with paichart" or "/prompt list"
- **Privacy**: <https://github.com/paichart/paichart/blob/main/PRIVACY-DEMO.md>

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.

The smallest framing: deferred loading didn't take your server away from users. It just stopped introducing you. The `initialize` instructions are your introduction — make them count, and make sure they actually ship on every path.

---

*This chapter documents a change pAIchart made on 2026-05-31 (ship commit `6d516329`), reviewed internally by six specialists and guarded by a transport-parity test in CI. The decision to keep counts out of the instructions copy follows the team's internal Signal Design discipline — see [Chapter 11](11-error-recovery-signals.md).*
