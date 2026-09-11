# rollback-containment fixtures — provenance

**These are LIVE campaign artifacts, pulled verbatim from production on 2026-09-11.** They are not
hand-authored, and they must not be "tidied". A net's key predicate has to be pinned against a live
artifact shape: dialect-lint's `extractBannedTokens` matched `/banned/i` while the live Architect
emits `forbiddenTokens`, so a named reason gated nothing while appearing fully wired, and only a
real artifact exposed it.

Each pair is `<name>-author.md` (the change package) and `<name>-harvest.md` (the harvest that leg
itself witnessed) — both the `finalResponse` of the task's latest `result.json` artifact.

| Fixture | lane | leg task | stage | harvest child | author child |
|---|---|---|---|---|---|
| `r19p4` | (b) | `cmtfew6iv0039yx7usxs80ox7` | `cmtfg9shc00jsyx7un8sgohvv` | `cmtfga37b00k0yx7ubjyv8rn2` | `cmtfgancv00klyx7uy6cjx0ss` |
| `r3a3` | (b) | `cmtvdq59h0021yxu8xxz0bdxk` | `cmtvdqzr4002fyxu8h5g9644w` | `cmtvdr7p8002nyxu8qcg9j962` | `cmtvdrtq20034yxu85g0dij3v` |
| `r3b2` | (b) | `cmtvg2nye0065yxlp3ayw4jsz` | `cmtvg3ahe006jyxlpfdlft748` | `cmtvg3hel006ryxlpxrsgfkw6` | `cmtvg40jy0078yxlp6poshjaj` |
| `fw` | n/a | `cmt2rpxc8000hyx78aejnqujj` | `cmt2rup5j002jyx78incoommv` | `cmt2rv05t002ryx78ky5zbtv5` | `cmt2rviw70030yx7847zjwq6o` |
| `k8s` | **(a)** | `cmqx7fbtp0003yxhi3dshk5un` | `cmqx7g4uk000fyxhiist48yz7` | `cmqx7gmly000nyxhipe1u439z` | `cmqx7hhsd000wyxhiieqeh7zb` |

## What each one is for

- **`r19p4`** — the motivating incident. A reviewer called six interface `description` lines
  "anachronistic", said in its own verdict that it could not re-verify against the raw harvest, and
  asserted the anachronism as proven anyway. All 51 restore lines are in the harvest verbatim.
- **`r3a3`** — the excerpt lane. The disputed `rule_files` glob is byte-equal to the harvest
  (harvest lines 22-23). Also the only fixture exercising `expected-output` and
  `validation-command` exclusions in the same rollback section.
- **`r3b2`** — the whole-file lane. The rollback is line-identical to the as-deployed file. This is
  the fixture the BLOCKING direction mutates.
- **`fw`** — a clean firewall package with a greenfield, all-`no `-form rollback. Exercises
  `inverse-rollback-block` and proves the naive rule's 100%-flag class is classified, not flagged.
- **`k8s`** — ⚠️ **the NON-SUPPRESSION fixture, and the only (a)-lane one.** Its reviewer blocked
  for missing LimitRange / ResourceQuota / PDB evidence and **was right** — the harvester had
  captured all three as `❌ None` and the package did not restate them. The fact must contribute
  NOTHING here (0 restore lines, 0 missing) so the reviewer's legitimate catch stands. If a change
  ever makes this fixture report restore lines, the net has started eating (a)-lane catches, which
  is the failure mode that would discredit it. **There is no second k8s specimen — it is the only
  k8s pipeline in existence — so this fixture cannot be cross-checked against a sibling.**

## Refreshing

Don't, casually. If a fixture must be re-pulled, the query is:

```sql
SELECT (content::jsonb)->>'finalResponse'
FROM agent_artifacts
WHERE name = 'result.json' AND content LIKE '{%'
  AND (content::jsonb)->>'taskId' = '<child task id>'
ORDER BY "createdAt" DESC LIMIT 1;
```

A refreshed fixture whose expectations move is a FINDING, not a number to update.
