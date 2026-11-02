/**
 * PLATFORM-HELD-BYTES Stage B V-3 — `HELD_EDIT_CLAUSE`: the Author-facing statement of edit grammar v1, GENERATED from the
 * parser's exported strings (`edits.ts`), so the grammar is written once (PC B-1 / L1, the test-parse-verdict lesson). A pin
 * (scripts/test-held-edits.ts) asserts every marker string the parser accepts appears here and that the clause's own example
 * parses to the edit it describes. The variant protocol (V-8) interpolates it at the Author site; it is agent-facing text,
 * measured by the G1 lab — an edit here is a §5 event (re-run or owner exemption).
 *
 * Wording obligations carried from the plan: the placement sentence is this grammar's own (PC S-16, not a copy of the value
 * blocks' MARKER_PLACEMENT_CLAUSE); the deeper-sub-heading rule in these words (PC S-15); the rollback heading AFTER the
 * edits section, never inside it (§0.1 A9); fences optional, fence lines never content (EF n3-6); lines never trimmed.
 */
import {
  HELD_EDITS_HEADING, HELD_ROLLBACK_HEADING, SEARCH_MARKER, DIVIDER_MARKER, REPLACE_MARKER, CREATE_OPEN_MARKER,
  CREATE_CLOSE_MARKER, RESTORE_DIRECTIVE,
} from './edits';

const tick = '`';
const code = (s: string) => `${tick}${s}${tick}`;

/** A domain's worked example (held-k8s 1j, PC S7 / AE S-6): the clause is PARAMETRISED, never neutralised — the observability
 *  default renders byte-identical (its sha is pinned in test-held-edits), and each domain passes its own example. Every example is
 *  parsed by the pin, so it can never drift from the grammar. Rules for a new example: a file of that domain (never another domain's
 *  file — kept-file pattern §3 item 3), no Secret and no credential-shaped value (R10 would placeholder it in a real held file),
 *  and a SEARCH that is unique in a multi-document file (anchor it on a line that names the object, not on a repeated key). */
export interface HeldEditExample {
  /** The per-file sub-heading's label: `### H1 (<label>)`. */
  label: string;
  /** The lines to replace, exactly as the held file carries them. */
  search: readonly string[];
  /** The new lines. */
  replace: readonly string[];
}

/** observability-config — the G1-measured example. Changing it moves obs bytes: a lab event and an obs version bump. */
export const OBS_HELD_EDIT_EXAMPLE: HeldEditExample = Object.freeze({
  label: 'the collector config',
  search: Object.freeze(['      grpc:', '        endpoint: 0.0.0.0:4317']),
  replace: Object.freeze(['      grpc:', '        endpoint: 127.0.0.1:4317']),
});

/** kubernetes-gitops (held-k8s; interpolated at step 3 — k8s 1.18.0, the held join, SYNTHESIS v3 §2 / PC S7 — NOT in any agent text in steps 1-2). A manifest repeats `resources:`,
 *  `limits:` and `memory:` across objects, so the SEARCH anchors on the container's `- name:` line, which names the object. Names are
 *  generic on purpose (never the lab rig's workload: name the property, never our rig). */
export const K8S_HELD_EDIT_EXAMPLE: HeldEditExample = Object.freeze({
  label: 'the web Deployment manifest',
  search: Object.freeze(['        - name: web', '          image: registry.example/web:1.4.2']),
  replace: Object.freeze(['        - name: web', '          image: registry.example/web:1.4.2', '          resources:',
    '            requests: { cpu: 100m, memory: 128Mi }', '            limits: { cpu: 500m, memory: 256Mi }']),
});

/** terraform-iac (held-terraform step 3 — terraform-iac 1.15.0, the held join). A `.tf` file repeats `bucket = `, `tags = ` and
 *  `}` across resources, so the SEARCH anchors on the `resource "<type>" "<name>" {` line, which names the object. Generic names
 *  (never the lab rig's bucket), no credential-shaped value, and a nested block (`lifecycle`) so the replacement needs no
 *  `terraform fmt` re-alignment of the lines it keeps. */
export const TF_HELD_EDIT_EXAMPLE: HeldEditExample = Object.freeze({
  label: 'the storage module',
  search: Object.freeze(['resource "aws_s3_bucket" "logs" {', '  bucket = "example-logs"']),
  replace: Object.freeze(['resource "aws_s3_bucket" "logs" {', '  bucket = "example-logs"', '', '  lifecycle {', '    prevent_destroy = true', '  }']),
});

/** network-provisioning (held-network step 3 push 3 — network-provisioning 1.25.0, the held join; J2-TEXT-DRAFT §2). An indented
 *  device configuration repeats `description`, `mtu` and `shutdown` across interfaces, so the SEARCH anchors on the `interface …`
 *  line, which names the object. A neutral object name (never a vendor interface name, never the lab rig's device), no credential. */
export const NET_HELD_EDIT_EXAMPLE: HeldEditExample = Object.freeze({
  label: 'the device configuration',
  search: Object.freeze(['interface uplink1', '   description to-core-a']),
  replace: Object.freeze(['interface uplink1', '   description to-core-a', '   mtu 9000']),
});

/** The worked example block for one domain. */
export function heldEditClauseExample(ex: HeldEditExample = OBS_HELD_EDIT_EXAMPLE): string {
  return [
    `## ${HELD_EDITS_HEADING}`,
    '',
    `### H1 (${ex.label})`,
    '',
    `${SEARCH_MARKER} H1`,
    ...ex.search,
    DIVIDER_MARKER,
    ...ex.replace,
    REPLACE_MARKER,
    '',
    `## ${HELD_ROLLBACK_HEADING}`,
    '',
    `${RESTORE_DIRECTIVE} H1`,
  ].join('\n');
}

/** The observability example — what every existing caller and pin read. */
export const HELD_EDIT_CLAUSE_EXAMPLE = heldEditClauseExample();

/** The Author-facing clause for one domain (its own worked example). */
export function heldEditClause(ex: HeldEditExample = OBS_HELD_EDIT_EXAMPLE): string {
  return [
  `**Held files are edited by reference.** Each held file is shown to you once, as a held block with a handle (H1, H2, …). ` +
  `You never retype a held file: you write EDITS, and the platform applies them to its own copy of the file's bytes and shows ` +
  `the reviewer the resulting diff.`,
  '',
  `- **Where edits go.** Put every edit under a heading whose exact title is ${code(HELD_EDITS_HEADING)}, on its own heading line ` +
  `(any number of ${code('#')}). Put the rollback under a heading whose exact title is ${code(HELD_ROLLBACK_HEADING)}, AFTER the ` +
  `edits section, never inside it. An edit written anywhere else is not applied.`,
  `- **Per-file sub-headings.** A per-file sub-heading must be at least one level DEEPER than its section heading; a heading at ` +
  `the same or a higher level ends the section.`,
  `- **An edit** replaces exact lines of one held file. Write the opening line ${code(`${SEARCH_MARKER} H<n>`)}, then the lines to ` +
  `replace copied EXACTLY from that file's held block (every space, never trimmed), then ${code(DIVIDER_MARKER)}, then the new ` +
  `lines, then ${code(REPLACE_MARKER)}. The lines to replace must occur exactly once in the held block; if they occur N times ` +
  `and you mean all of them, write ${code(`${SEARCH_MARKER} H<n> count=N`)}. Include enough lines to be unique, no more.`,
  `- **A new file** beside a held file: ${code(`${CREATE_OPEN_MARKER} H<new n> on H<n> <path>`)}, then the file's lines, then ` +
  `${code(CREATE_CLOSE_MARKER)}. The path is in the same directory as H<n>.`,
  `- **The rollback** of a held file you edit is the line ${code(`${RESTORE_DIRECTIVE} H<n>`)} under ${code(HELD_ROLLBACK_HEADING)}: ` +
  `the platform restores its held bytes. Do not quote the old file.`,
  `- An edit may sit inside a ${code('```')} fence or not; the fence lines are never part of the edit.`,
  '',
  'Example:',
  '',
  '````markdown',
  heldEditClauseExample(ex),
  '````',
  ].join('\n');
}

/** The observability clause — byte-identical to the pre-parametrised constant (pinned). */
export const HELD_EDIT_CLAUSE = heldEditClause();
