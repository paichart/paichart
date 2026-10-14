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
