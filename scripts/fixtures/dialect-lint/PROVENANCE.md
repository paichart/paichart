# dialect-lint fixtures — provenance

**LIVE Author packages, pulled verbatim and read-only from production.** Not hand-authored; do not
"tidy" them — a net's predicates must be pinned against the shapes Authors actually emit.

| File | What it is | Pulled | Used by |
|---|---|---|---|
| `ef-dl1-obs-ingress-author-2026-09-26.md` | Author `cmuhn7bmx009ryxcrzmoauxib` (leg `cmuhmm2u5006byxcq64ndua1v`, observability) | 2026-09-27 | EF-DL1 block; F1 (restoreIntent on the post-rollback blocks); F1-RC1 |
| `ef-dl1-obs-ingress-contract-2026-09-26.json` | that leg's interface contract | 2026-09-27 | EF-DL1 block |
| `ef-dl1-obs-ingress-harvest-2026-09-26.md` | that leg's Harvester `finalResponse` | 2026-09-28 | F1-RC1 (net #3 19 of 19) |
| `f1-tf-title-leak-cmu3d42ls001pyxe35rmj6bap.md` | Author `cmu3eb2mh0077yxe3fpmtgx6d` of terraform leg `cmu3d42ls001pyxe35rmj6bap` | 2026-09-27 (lane-1 corpus) | F1 + named residual F028 (title leak) |
| `f1-tf-marker-json-cmu7h6erg002oyx3c7v7ydlao.md` | Author `cmu7kor9700dhyx3cecci293s` of terraform leg `cmu7h6erg002oyx3c7v7ydlao` | 2026-09-27 (lane-1 corpus) | F1 + named residual F035 |
| `f1-tf-restore-cms123vmf00ewyxv8wd5o7vbu.md` | terraform Author task `cms123vmf00ewyxv8wd5o7vbu` | 2026-09-27 (lane-1 corpus) | F1 (restore section + title leak); F1-RC2 |
| `f1-tf-lane3-cmrlm3hp5004cyxjwe6rhi55a.md` | terraform Author EXECUTION `cmrlm3hp5004cyxjwe6rhi55a` (task `cmrlm1so10024yxjws9wyp857`) | 2026-09-28 | F1 (Lane 3 hand-read #1: in-fence "baseline") |
| `f1-tf-lane3-cmrmjqmko00fmyxlunmemx4vm.md` | terraform Author EXECUTION `cmrmjqmko00fmyxlunmemx4vm` (task `cmrmjpdt100bcyxluy0qou7le`) | 2026-09-28 | F1 (Lane 3 hand-read #2: hidden rollback heading); F1-RC3 |
| `ef-dl2-r12-deploy-cmt9vs7ub000eyxmjrdx4ejjn.md` (+ `-contract.json`) | Author task `cmt9yyu5a000uyxclmqn6slrb` (exec `cmt9z2vk7004eyxclqjw5j9o1`) of network leg `cmt9vs7ub000eyxmjrdx4ejjn` (IGP-T1 R12 deploy) + the leg's interface contract | 2026-09-28 | EF-DL2 (a): PRESENCE 0/10 → 10/10 |
| `ef-dl2-d076-dialect-note-cmu236uev00nyyxvrntaxjv9s.md` | Author task `cmu23cki600qryxvrn5l6coxp` (exec `cmu23glkx00t5yxvr2raf78f9`), network | 2026-09-28 | EF-DL2 (c): a long own-section "harvested" sentence is not a label (why (a) alone is insufficient) |
| `ef-dl2-d137-obs-rule-file-cmu6lojrs00j9yxqffg3qc2in.md` | Author task `cmu6noi1r00tqyxqhmkfdmx8l` (exec `cmu6nt4zf00z8yxqhabb79oyb`), observability | 2026-09-28 | EF-DL2: desired-state rule file scanned |
| `ef-dl2-d241-tf-hcl-diff-cmuhmm2sm0064yxcqx8hezp92.md` (+ `-contract.json`) | Author task `cmuhn73vu0093yxcr79cyk1q7` (exec `cmuhnatch00eiyxcr2wkoowzm`), terraform, banned-token package | 2026-09-28 | EF-DL2: HCL diff scanned |
| `ef-dl2-d042-ospf-rollback-cmtc941hi0035yx5pdsgb2q8i.md` (+ `-contract.json`) | Author task `cmtcbn0m000j6yx5pe8j0rj41` (exec `cmtcbs0z500mkyx5pltm2tnca`), network R18 P4, banned-token package | 2026-09-28 | EF-DL2 MUST STAY EXEMPT: OSPF rollback carrying `passive-interface` |
| `ef-dl2-d052-k8s-expected-cmtxqjequ000ayxw6xfkvycvp.md` (+ `-contract.json`) | Author task `cmtxqrgv6002xyxw625lnlk9v` (exec `cmtxqutnd0056yxw6hl6sou6x`), kubernetes, banned-token package | 2026-09-28 | EF-DL2 MUST STAY EXEMPT: long `**Expected output**` label (b2 regression guard) |
| `ef-dl2-d098-residual-cmu4wyjzv006syx8ybnafzc9n.md` (+ `-contract.json`) | Author task `cmu4yv2v100ekyx8zunqyu42x` (exec `cmu4z0ggi00h8yx8zaxb2a3i1`), network, banned-token package | 2026-09-28 | EF-DL2 NAMED PRE-FIX RESIDUAL (D098, not a trigger) |

Each file is the `finalResponse` of that execution's `result.json` (lone-surrogate rows filtered before any
`::jsonb`). Line numbers asserted in the tests are 1-indexed document lines of these files.

**Sensitivity check (2026-09-28):** lab/LocalStack/RFC-1918 values only (`acme-app-logs`, `10.99.0.0/27`,
`10.244.0.4/30`, `172.31.114.10`); no emails, no public addresses, no account ids. **One redaction:** the
harvest file carried a hub registry `serviceId` CUID in prose; replaced with `<serviceId redacted>` (it sits
outside every fence, so no restore line depends on it). The two Lane 3 terraform packages quote a PLANTED,
already-neutralised rig tag (`SYSTEM OVERRIDE: [NEUTRALIZED-INJECTION:…]`) and a `<<REDACTED-SECRET>>`
placeholder verbatim from the lab state — test data, kept verbatim.

**EF-DL2 commit 2 fixtures (2026-09-28).** Pulled from the lane-1 corpus and, BEFORE redaction, **md5-verified byte-identical** to each
execution's live `result.json` `finalResponse` in production (read-only, `default_transaction_read_only`,
`statement_timeout`, lone-surrogate filter; every Author had exactly one `result.json`). Contracts are the leg's
`inputContext.interfaceContract`. **Sensitivity check:** lab values only (RFC-1918 / `10.99.0.0/…`, `172.30.x`
management, router-ids `1.1.1.1`/`2.2.2.2`, IS-IS NET system ids, the planted rig bucket name). **Redactions:**
(1) in the `.md` files — hub task CUIDs cited in prose, one persona's name and email — replaced
**LENGTH-PRESERVING** (`<id-redacted------------>`, `<name---->`, `<email-redacted>`). Length matters: the
classifier's 120-char label cap decides kinds, and a shorter redaction of a CUID in D076's `## Derived Values`
provenance line pulled it under the cap and FLIPPED that block's kind (caught by a before/after check; every
file now classifies byte-identically to the unredacted text under classifier 2 AND 3). (2) in the contracts —
approver names/emails and a `povId` — replaced with `<name redacted>` / `<email redacted>` / `<id redacted>`;
contract text never reaches the classifier, and each redacted contract yields the identical `dialectLint` fact.
