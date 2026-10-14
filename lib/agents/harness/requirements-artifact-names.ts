/**
 * Artifact names for the requirements Author's in-run correction (G1 B, 2026-10-10). A standalone, import-free module
 * so the terminal persist and the agent.results handler can name the artifact without loading the correction module.
 *
 * REQUIREMENTS_PRE_CORRECTION_ARTIFACT holds the ORIGINAL draft whenever a correction turn was attempted. It is an
 * operator artifact: NOT chained (the chainer reads result.json / report.md by name), NOT returned by agent.results
 * (excluded at its select), never the deliverable. Pinned in scripts/test-requirements-form-correction.ts.
 */
export const REQUIREMENTS_PRE_CORRECTION_ARTIFACT = 'requirements.pre-correction.md' as const;

/**
 * REQUIREMENTS_CORRECTION_NOT_ADOPTED_ARTIFACT (Phase 4 group 1 / 1b, 2026-10-12) holds a correction turn's text when it
 * came back non-empty and was NOT adopted — on those attempts the pre-correction artifact equals the deliverable, so
 * without this the corrected text is lost (measured: both refusals of 2026-10-11). Same handling as the pre-correction
 * artifact: operator-only, R10-redacted at persist, never chained, never returned by agent.results.
 */
export const REQUIREMENTS_CORRECTION_NOT_ADOPTED_ARTIFACT = 'requirements.correction-not-adopted.md' as const;

/** Every operator-only artifact of the requirements correction — the agent.results exclusion list (`notIn`). */
export const REQUIREMENTS_OPERATOR_ARTIFACTS: readonly string[] = [REQUIREMENTS_PRE_CORRECTION_ARTIFACT, REQUIREMENTS_CORRECTION_NOT_ADOPTED_ARTIFACT];
