/**
 * Requirements SOURCES check — what a spec writer is told to DO about each problem (observability-config 1.12.0 join, 2026-11-23).
 *
 * The check (scripts/check-requirements-sources.ts) names a problem with the word the SHIPPING parser returns. A word alone is half
 * a message: `live-read-without-base` does not say which line to add. This file holds ONE fix sentence per problem word, for both
 * grammars and for the block-level label check.
 *
 * WHY A SEPARATE FILE. The check holds no kind name and no separator of its own (PIN1 / PIN5 of test:requirements-sources: every
 * grammar QUESTION is the shipping parser's). A fix sentence has to name a kind, and two problem words contain one, so the wording
 * lives here. This file answers no grammar question: it never decides whether a line parses.
 *
 * WHAT KEEPS IT HONEST:
 *   - Each table is a `Record` over the shipping problem union, so a problem word added to the grammar does not compile until it has
 *     a sentence here.
 *   - Every list a sentence prints (the kinds a protocol admits, the platform's label targets) is READ from the shipping tables at
 *     call time, never typed.
 *   - test:requirements-sources (FX cases) pins that every kind a sentence names in backticks is a kind of the shipping tables.
 *
 * No agent reads this text: it is printed by an operator script.
 */
import {
  CONFIG_SOURCE_KINDS_BY_PROTOCOL, configPairingOf, type ConfigBlockProblem, type ConfigLabelProblem,
} from '../lib/agents/harness/config-sources';
import { DEVICE_SOURCE_KINDS, type BlockProblem } from '../lib/agents/harness/device-sources';
import { canonicalProtocolName } from '../lib/agents/harness/program-protocol';
import { platformLabelTargets } from '../lib/agents/harness/held-bytes/config-label';

/** The kinds a protocol's block admits, as the shipping table lists them. */
export function configKindsOf(protocol: string): readonly string[] {
  return CONFIG_SOURCE_KINDS_BY_PROTOCOL[canonicalProtocolName(protocol)] ?? [];
}

/** The label shapes the platform's file table supports, one per target a label can name (a target whose path cannot be known from a
 *  label is left out: no label can name it). */
export function supportedLabelShapes(): string[] {
  const out: string[] = [];
  for (const [target, spec] of platformLabelTargets()) {
    if ('const' in spec.path) out.push(`${target} (one file, ${spec.path.const}; no key)`);
    else if ('template' in spec.path) out.push(`${target}.<file name> (the file ${spec.path.template.split('{key}').join('<file name>')})`);
  }
  return out;
}

const NEVER_HELD = 'the path names a file the platform never reads or keeps (Terraform state, plan, variables or CLI credentials; a device inventory; a password or key file, by its NAME) - remove the line and reference the secret instead of listing its file';

/** Problems both grammars share (a line that does not parse; a block-level shape problem). */
const SHARED: Record<Exclude<BlockProblem, 'duplicate-source' | 'command-package-not-alone' | 'live-read-not-alone' | 'unknown-kind'>, string> = {
  'not-a-source-line': 'every line under the heading is "<label>: <kind> ..." - remove prose from the block, or end the block with a blank line before it',
  'device-name-invalid': 'the label before the colon holds a character a label cannot hold (a space, a slash, a backtick) - rename it',
  'separator-invalid': 'the part between the kind and the service name is not spelled as the platform reads it - copy the line shape from a released example or the protocol text rather than retyping the dash',
  'service-invalid': 'the service name is empty, too long, or holds a semicolon, a backtick or a control character - write the registered service name or its descriptor URL only',
  'git-coordinates-invalid': 'after the semicolon write <owner>/<repo>/<path>, each part non-empty, with no "." or ".." path segment',
  'ref-invalid': 'write at most one "@ <branch, tag or commit>" after the path, with no space inside the ref',
  'trailing-text': 'a line of this kind takes nothing after the kind - remove the rest of the line',
  'multiple-blocks': 'a leg carries ONE sources heading - merge the two blocks into one',
  'empty-block': 'the heading has no line under it - list the sources, or remove the heading',
  'contract-value-not-lines': 'the contract value must be the block\'s lines as text (one string, or a list of line strings)',
  'too-many-lines': 'the block is over the platform\'s line limit - split the work into legs that each list fewer sources',
};

/** Every `## Device sources` problem (network) ⇒ what to do. A full table, so a test can walk every sentence. */
export function deviceFixTable(): Record<BlockProblem, string> {
  return {
    ...SHARED,
    'unknown-kind': `the kinds a Device sources block admits are: ${DEVICE_SOURCE_KINDS.join(', ')} - use one of them`,
    'duplicate-source': 'a device has at most one line of each kind - remove the repeated line',
    'command-package-not-alone': 'a device declared `command-package` takes no other line - remove the device\'s other lines, or declare it by its files instead',
    'live-read-not-alone': 'a device declared `live-read` takes no other line - the both-declared pair is `git-file` plus `device-read`',
  };
}
export function deviceFix(problem: BlockProblem): string { return deviceFixTable()[problem]; }

/** Every `## Config sources` problem ⇒ what to do, for the protocol the block was read under (the block-level label problems
 *  included: `ConfigBlockProblem` holds them). */
export function configFixTable(protocol: string): Record<ConfigBlockProblem, string> {
  const kinds = configKindsOf(protocol);
  const shapes = supportedLabelShapes().join('; ');
  const labels: Record<Exclude<ConfigLabelProblem, 'path-never-held'>, string> = {
    'label-target-not-supported': `for ${protocol} a label names one of the platform's file targets - the part before the first dot must be one of: ${shapes}`,
    'label-key-invalid': `a one-file target takes no ".<file name>" and a several-file target needs one (never ".", ".." or empty) - the supported labels are: ${shapes}`,
    'label-path-not-resolvable': `the label names a target whose file cannot be known from a label - use one of: ${shapes}`,
  };
  return {
    ...SHARED,
    ...labels,
    'unknown-kind': `the kinds ${protocol} admits in a block are: ${kinds.join(', ')} - a kind another protocol admits is refused here; use one of these`,
    'path-never-held': NEVER_HELD,
    'duplicate-label': 'two lines share a label - one line per label' + (kinds.length && configPairingOf(protocol) !== 'none'
      ? ' (on this protocol: one base line per label, `git-file` or `service-held`, and at most one `live-read` beside a `git-file`)' : ''),
    'protocol-declares-no-config-sources': `${protocol} legs declare no Config sources - remove the block`,
    'redundant-live-read': 'a `service-held` line already keeps the served file, so a `live-read` on the same label adds nothing - remove the `live-read` line, or keep the file from Git (`git-file`) and read the served copy as evidence',
    'live-read-without-base': 'on this protocol a `live-read` line reads the served copy of a file as evidence beside a `git-file` line of the SAME label - add that `git-file` line, or, to keep the file from the service instead, write the one line as `service-held`',
  };
}
export function configFix(problem: ConfigBlockProblem, protocol: string): string { return configFixTable(protocol)[problem]; }
