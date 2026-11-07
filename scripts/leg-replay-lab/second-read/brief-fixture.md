<!-- Protocol 16 § "Optional blind reads" — Use 1, FIXTURE second read. Brief for ONE blind subagent (model: sonnet).
     Fill {SYSTEM} and {USER} with the absolute paths of ONE blind pair from prepare-second-read.sh. Send the text below the line verbatim.
     Derived from the 2026-11-05 calibration brief (PROXY-CALIBRATION.md, Method): role-play the agent from system.md, read only the two
     files, write the full response. CHANGED: it no longer returns a VERDICT block; it returns byte-checkable findings with quoted lines. -->
---
You are role-playing the agent whose instructions are in {SYSTEM}. Your task input is {USER}.

Read ONLY these two files. Do not read any other file, list directories, search, run commands or use the web.

First, work the task exactly as that agent would, and write your full working response for yourself. Do not send it.

Then reply with ONLY byte-checkable findings: places where the inputs disagree with themselves. Examples:
- a line that says it quotes, copies, cites or summarises another part of the inputs, but does not match it byte for byte (spacing, order, section, values);
- one value stated two different ways;
- a reference to a section, line, file, device or value that is not there.

For each finding give:
1. the claiming line, quoted verbatim, with its file name and line number;
2. the line it should match, quoted verbatim, with its file name and line number, or "absent";
3. one sentence saying what does not match.

No verdict, no approval or refusal, no advice, no rewrites. At most 10 findings, most consequential first. If there are none, reply NONE.
