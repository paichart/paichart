# Case Studies

Worked, real-run case studies of pAIchart's autonomous delivery engine — the pipeline/program
layer that turns an objective into a reviewed, approved-but-unapplied change package and never
applies it. Each study follows one real run (including the ones that deliberately fail), what it
did, and what it does when it *can't* succeed.

These are narrative companions to the [verification pack](../verification), which carries the same
claims linked to their machine-checked proofs. The case studies tell the story; the verification
pack shows the receipts.

## Studies

| Study | What it shows |
|---|---|
| [A Coordinated Infrastructure Change, Checked by Machine](coordinated-infra-change.md) | A real multi-domain change — two network switches plus a cloud storage policy that had to match them exactly, a value that didn't exist until the live devices were read. Includes the subnet-math error the engine caught that a reviewer had approved at high confidence, and what it does when the devices are unreachable (it escalates; it never fabricates). |

## License

Case-study content (the markdown files in this directory) is published under the Creative Commons
Attribution 4.0 International License. Code and config samples embedded in the studies fall under the
repository's main [LICENSE](../LICENSE).
