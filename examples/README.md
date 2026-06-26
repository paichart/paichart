# Examples — real outputs from pAIchart's autonomous pipelines

Worked artifacts produced by pAIchart's **Pipeline Harness** — the agentic layer that turns a one-line objective into a reviewed, decision-grade deliverable by orchestrating a team of specialist agents (decompose → assign → chain context → quality-gate → synthesize). These are **actual pipeline outputs**, not mockups.

| Example | Pipeline | What it shows |
|---|---|---|
| [network-provisioning-change-report.md](./network-provisioning-change-report.md) | Network Provisioning | An **approved-but-unapplied** network change package generated from a live device's real running state |

---

## Network Provisioning — change report

**The objective** (one sentence, in natural language): *"Add a Loopback0 per switch and advertise it into BGP."*

**What the pipeline did, autonomously:**

1. **Self-provisioned** a read-only device service from a descriptor URL carried in the task (register → read-only call → tear down) — pAIchart stores no device credentials and the registration doesn't persist.
2. **Harvested** the real running-config, interfaces, and BGP state from a 2-node Arista EOS fabric — read-only, never a mutating command.
3. **Designed** the target change (addressing, BGP advertisement, change ordering) against the harvested state.
4. **Authored** the deliverable: per-device candidate config + deterministic validation steps (the exact `show` command and expected output that prove each change) + a per-device rollback plan.
5. **Reviewed** it through an independent QA agent that emitted an explicit verdict (**APPROVED 92/100**).

**The two things that make it trustworthy:**

- **It never actuates.** The output is a change *to be applied* — applying it stays out-of-band and human-gated. The cognition/actuation seam is permanent by design, not a missing feature.
- **The device output is treated as untrusted, and secrets stay out of the artifact.** pAIchart sanitizes device output before any reasoner reads it, and redacts secrets token-in-place from the persisted report (see the *Guard Verification* section in the example — run on the real harvested config: 0 false-positives on the sanitizer, every secret redacted while the directive structure is preserved).

**Honest scope:** this run was validated against a **simulated** Arista device (a containerized cEOS lab standing in for the production switches). It exercises the full cognition pipeline + pAIchart's own security guards against real device output. The device service in this example authenticates with a static lab credential rather than pAIchart's per-user JWKS identity — the latter is the production identity contract for a customer-governed device service.
