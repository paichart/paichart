# Case Studies

Worked, real-run case studies of pAIchart's autonomous delivery engine — the pipeline/program
layer that turns an objective into a reviewed, approved-but-unapplied change package and never
applies it. Each study follows one real run (including the ones that deliberately fail), what it
did, and what it does when it *can't* succeed.

These are narrative companions to the [verification pack](../verification), which carries the same
claims linked to their machine-checked proofs. The case studies tell the story; the verification
pack shows the receipts.

## Studies

The three studies below follow the **same** cross-domain program from three angles — read any first:

| Study | What it shows |
|---|---|
| [A Coordinated Infrastructure Change, Checked by Machine](coordinated-infra-change.md) | **Can you trust it?** A real multi-domain change — two network switches plus a cloud storage policy that had to match them exactly, a value that didn't exist until the live devices were read. Includes the subnet-math error the engine caught that a reviewer had approved at high confidence, and what it does when the devices are unreachable (it escalates; it never fabricates). |
| [You Approve; You Don't Author](you-approve-you-dont-author.md) | **What does it buy you?** The role shift: one intent, stated in plain language, fans out to configuration in several vendors' languages (Arista EOS and Terraform/AWS from real runs; a firewall leg shown illustratively) — none of it hand-written. You keep the High-Level Design and the approval gate; the engine takes the per-vendor Low-Level Design off your plate. |
| [Inside a Multi-Domain Program](inside-a-multi-domain-program.md) | **How is it built — and how far does it scale?** The architecture, internals named: how the change is decomposed into a **DAG**, reviewed by a three-node triad (Architect, per-leg, integration), checked in **three non-bypassable tiers** (deterministic code, independent reviewers, a deterministic release gate), and how far the shape scales — 100 devices today, 1000 with hierarchical review. Proven at 2 devices; the scale figures are architectural, stated as such. |

## License

Case-study content (the markdown files in this directory) is published under the Creative Commons
Attribution 4.0 International License. Code and config samples embedded in the studies fall under the
repository's main [LICENSE](../LICENSE).
