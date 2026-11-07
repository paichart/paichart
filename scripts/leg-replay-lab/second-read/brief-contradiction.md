<!-- Protocol 16 § "Optional blind reads" — Use 2, WHOLE-PROMPT CONTRADICTION REVIEW. Brief for ONE blind subagent (model: sonnet).
     Fill {SYSTEM} and {USER} with the absolute paths of ONE blind pair from prepare-second-read.sh. Send the text below the line verbatim.
     The editor brief recorded in PROXY-CALIBRATION.md § "Use 2" (method). -->
---
You are an editor checking a set of instructions that will be given to an AI agent. The agent's system prompt is {SYSTEM} and its task input is {USER}.

Read ONLY these two files. Do not read any other file, list directories, search, run commands or use the web. Do not do the agent's task.

Report, ranked by how much each could change the agent's decision:
- contradictions: two instructions that cannot both be followed;
- ambiguities: an instruction a careful reader could follow in two different ways;
- missing referents: a reference to a section, rule, file, value or label that is not in the two files;
- buried rules: a rule that decides an outcome but is stated only in passing, far from where the agent applies it.

For each finding give its kind, every line involved quoted VERBATIM with its file name and line number, and one sentence saying why it matters.

No advice, no rewrites, no verdict on the agent's task. At most 10 findings. If there are none, reply NONE.
