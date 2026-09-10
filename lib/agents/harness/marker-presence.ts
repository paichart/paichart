/**
 * H-4 (2026-09-10): MARKER PRESENCE — a FACT about which machine-parsed blocks the platform found in
 * a harness leaf's final response, computed with the SAME parser the containment enrichment uses.
 *
 * WHY. Three self-host runs in a row had a leg Reviewer veto a package over the FORMAT of a
 * `## Derived Values` / `## Consumed Values` block ("the platform's checker will read it as ABSENT")
 * while the platform's own stamp on the same leg had parsed it clean. The reviewer could not know:
 * the containment stamp lands at the leg's SYNTHESIZE, after the review. Same family as R19 P4 — a
 * reviewer judging what it structurally cannot observe. This stamps the observation on the AUTHOR's
 * (and Harvester's/Architect's) own execution at persist time, the chainer carries it per predecessor,
 * and §6 renders it where the reviewer actually reads. Protocol 10: a fact, never a verdict — a ✗ for a
 * block the leg needs is the blocking FACT; a ✓ ends any format question.
 *
 * Same-parser rule: `parseFencedJsonBlock` here IS the containment enrichment's parser. A second
 * extractor would be the two-extractor drift class (heading-tolerant vs token-locked, 2026-07-18).
 */
import {
  parseFencedJsonBlock,
  HARVESTED_ALLOCATIONS_MARKER,
  DERIVED_VALUES_MARKER,
  CONSUMED_VALUES_MARKER,
} from './derivation-containment';

export interface MarkerPresence {
  harvestedAllocations: boolean;
  derivedValues: boolean;
  consumedValues: boolean;
  /** Which parser produced the booleans — the containment enrichment's, by construction. */
  parser: 'parseFencedJsonBlock';
}

/** Harness leaf roles whose final response may carry the machine-parsed blocks. */
export const HARNESS_LEAF_ROLE_RE = /harvest|architect|design|author/i;

export function computeMarkerPresence(finalResponse: string | null | undefined): MarkerPresence {
  const text = finalResponse ?? '';
  return {
    harvestedAllocations: parseFencedJsonBlock(text, HARVESTED_ALLOCATIONS_MARKER) !== null,
    derivedValues: parseFencedJsonBlock(text, DERIVED_VALUES_MARKER) !== null,
    consumedValues: parseFencedJsonBlock(text, CONSUMED_VALUES_MARKER) !== null,
    parser: 'parseFencedJsonBlock',
  };
}

/** Render for prompts and cards: `Harvested Allocations ✓ · Derived Values ✗ · Consumed Values ✓`. */
export function renderMarkerPresence(mp: Partial<MarkerPresence> | null | undefined): string | null {
  if (!mp || typeof mp !== 'object') return null;
  const t = (b: unknown) => (b === true ? '✓' : '✗');
  return `Harvested Allocations ${t(mp.harvestedAllocations)} · Derived Values ${t(mp.derivedValues)} · Consumed Values ${t(mp.consumedValues)}`;
}
