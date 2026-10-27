# Publish notes — telemetry-export-held

**Not a program input.** The program reads `requirements.program.md` and `topology.json` only.

- **Source:** a hand-shaped copy of `telemetry-export-genspec-t1zero-v2` (the spec Program Run 11 RELEASED on, 2026-10-01), edited
  by pipeline-harness on 2026-10-28 under the owner's decision to re-run the four-domain program on kept files (assessment:
  copov15 `cline_docs/reviews/telemetry-held-program-2026-10-28/ASSESSMENT.md`). Not regenerated: the question registry has no
  file-source rows.
- **Edits to `requirements.md` and `requirements.program.md` (identical in both; nothing else changed):**
  1. The fabric leg is a **value** leg (`network-derivation`): it changes nothing. Its row keys and leg name follow the token.
     The owner's quoted answers are untouched.
  2. The kubernetes-gitops and terraform-iac legs make their change to the config-repo file `topology.json` names, read through the
     platform's file source. Each task description must name that file exactly. The live read is evidence.
  3. Leg types are written into *Program scope* (1 value + 3 change).
  4. Node C check **5** is APPENDED (held files). Checks 1–4 keep their numbers.
  5. Title.
- **Edits to `topology.json`:**
  - `cluster.configRepo` (`k8s/sample-workloads.yaml`, ref `main`) and `cloud.configRepo` (`terraform/main.tf`) are added.
  - Four stale statements of today's state are replaced. They described an earlier objective: route advertisement on the fabric,
    an alert on observability, and "the namespace has NO NetworkPolicy", which is false against today's repo. They now defer to
    each leg's harvest and its rows. The observability purpose now matches the requirements (sender restriction on 4317/4318).
- **Checks:** size check fits (program view 7/9 pages, run 8/12, 13,766 headroom). The lint candidates are the declared contract
  constants (ports, resource address, role ARN) plus one Open-questions line naming the declared resource; the same set as v2.
  Owner quotes are unchanged, so citations are as in v2 (45/45).
- **Owner decision 2026-10-28 (Steve):** value-only fabric leg, hand-shaped spec, new POV.
