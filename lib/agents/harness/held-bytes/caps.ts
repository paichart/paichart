/**
 * PLATFORM-HELD-BYTES — capture caps (Stage A WI-17, 2026-10-14). Dependency-free constants so the truncation-tier pin
 * can import them without the capture helper (panel arch S3).
 *
 * Owner decisions: 5 MB per held file and 16 MB per execution (2026-10-13); 256 files per execution (OA-23,
 * 2026-10-14). Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-17.
 *
 * MEMORY (panel AE N3): peak transient memory is about 4–5× the accepted bytes — B, a UTF-8 Buffer for the hash and the
 * bind, Prisma's base64 serialisation of the bytea parameter, and the request string — so about 70–90 MB at the 16 MB cap
 * per execution. The original text C costs nothing extra (it is the existing string), and the batch handed to the
 * terminal transaction holds no content, so the buffers are released before the transaction.
 *
 * TIME (panel AE D2 / arch D-2): the pure half runs R10 SYNCHRONOUSLY, so its time bound (< 2 s for a 5 MB file, pinned
 * in test-held-bytes-capture) is a stall of the WHOLE process, including paichart-web's HTTP and SSE. Irrelevant at
 * today's 1–3 KB observability files; carried to Stage B (network configs, 20–100 KB).
 */

/** One held file, in UTF-8 bytes. Equal to the existing Tier-4 artifact cap (MAX_ARTIFACT_SIZE). */
export const HELD_FILE_CAP = 5 * 1024 * 1024;

/** Accepted held bytes per execution, summed in tool-call order. */
export const HELD_EXECUTION_CAP = 16 * 1024 * 1024;

/** Files enumerated per execution (held or refused). Past it, files collapse to ONE over-cap row per call. */
export const HELD_EXECUTION_FILE_CAP = 256;

/** Columns bound per row of the blob upsert — HELD_EXECUTION_FILE_CAP × this must stay under Postgres's 65,535 binds. */
export const HELD_ROW_BINDS = 6;

/** Stage B V-3 (plan §3 V-3 `edit-set-too-large`): edit blocks per package, and summed SEARCH + REPLACE bytes (UTF-8). The
 *  applier is linear in these (one indexOf scan per edit over the view), so the caps bound its time too (pinned). */
export const HELD_EDIT_MAX_EDITS = 64;
export const HELD_EDIT_MAX_BYTES = 256 * 1024;

// ── Config sources STEP 3 P3: the file comparison's bounds (plan §5.4, §13.B; sec-ops ruling on evidence caps E1–E7) ─────────────
// Dependency-free here so capture (lib/services/held-bytes-capture.ts) and the comparator (file-source-compare.ts) read ONE value.
//
// EVIDENCE — a served file kept in memory for the comparison and never stored — has its OWN caps and never touches the held
// counters above: those bound what is STORED, and the served text comes from a registered service and from calls an agent chose
// to make, so a chatty or hostile service must not be able to push a Git file past a held cap (ruling §3).

/** One side of a comparison, in UTF-8 bytes. Tested on the served file's RAW bytes BEFORE `canonicalBase` (a 5 MB line is never
 *  redacted or split), and again on its redacted text (a placeholder can lengthen a line). Over ⇒ `over-compare-cap`. */
export const COMPARE_SIDE_MAX_BYTES = 262_144;
/** One side of a comparison, in lines. Counted by index, stopping at the cap. Over ⇒ `over-compare-cap`. */
export const COMPARE_SIDE_MAX_LINES = 5_000;
/** Evidence items that may REACH `canonicalBase` in one persist, kept or refused by it (ruling E2). The next one never enters it
 *  and reads `comparison-budget`. Also the bound on per-file `served-file-evidence-only` rows (ruling E4). */
export const COMPARE_PERSIST_MAX_FILES = 40;
/** RAW bytes of evidence that may enter the chain in one persist — the bound on what the evidence chain COSTS, which is time
 *  (ruling §1: `canonicalBase` runs R10 synchronously on the process's one event loop, and the persist's echo-source walk reads
 *  every tool record). Set by the timing pin (STEP3-P3-BUILD.md § timing): forty files AT the byte cap took 1.7 s on the build host
 *  against a 1 s ceiling, so the WORK is bounded here rather than by cutting the file count to four — forty ordinary files of a few
 *  kilobytes each still fit. The file that crosses it, and every later one, reads `comparison-budget` and costs one length test. */
export const COMPARE_PERSIST_EVIDENCE_MAX_BYTES = 4 * COMPARE_SIDE_MAX_BYTES;
/** Operations of the line comparison in one persist — every interned line, every trimmed line, every step of the search. A COUNT,
 *  never a clock: the same input always reads the same state. The pair that crosses it, and every later one, reads
 *  `comparison-budget`. Set by the timing pin (STEP3-P3-BUILD.md § timing); lowered to meet a ceiling, never raised past one. */
export const COMPARE_PERSIST_OP_BUDGET = 10_000_000;
