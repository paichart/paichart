-- PLATFORM-HELD-BYTES Stage A — read-only schema check for the three held-bytes tables (WI-1).
-- Run after `db push` (local) and after moment 1 on prod:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-held-bytes-schema.sql
-- Every row printed must read ok = t. It asserts the CATALOG (pg_constraint / pg_index / information_schema), never
-- `\d` text: `\d` omits the default ON UPDATE NO ACTION, so a text check would fail on a correct schema (panel DB NEW-2).
-- Codes: confupdtype/confdeltype 'a' = NO ACTION, 'r' = RESTRICT, 'c' = CASCADE.
-- Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-1 / §6.
SET default_transaction_read_only = on;

-- ONE read-only statement: every assertion, then a summary row DERIVED from all of them (code review DB note: the old
-- summary recomputed only 3 of 12; a temp view is not allowed in a read-only transaction).
WITH expect(name, ok) AS (
  -- three tables exist
  SELECT 'tables exist (3)',
         (SELECT count(*) FROM information_schema.tables
           WHERE table_schema = current_schema()
             AND table_name IN ('held_blobs','held_file_refs','held_capture_refusals')) = 3
  UNION ALL
  -- composite primary key on held_blobs = (scope, sha256)
  SELECT 'held_blobs PK = (scope, sha256)',
         (SELECT array_agg(a.attname::text ORDER BY k.ord)
            FROM pg_constraint c
            CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
           WHERE c.conrelid = 'held_blobs'::regclass AND c.contype = 'p') = ARRAY['scope','sha256']
  UNION ALL
  SELECT 'held_blobs.content is bytea',
         (SELECT data_type FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'held_blobs' AND column_name = 'content') = 'bytea'
  UNION ALL
  -- ref -> blob: ON UPDATE NO ACTION, ON DELETE RESTRICT (a blob can never vanish under a live ref)
  SELECT 'held_file_refs -> held_blobs: update NO ACTION, delete RESTRICT',
         EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'held_file_refs'::regclass AND confrelid = 'held_blobs'::regclass
                    AND contype = 'f' AND confupdtype = 'a' AND confdeltype = 'r')
  UNION ALL
  -- both execution FKs: ON UPDATE NO ACTION, ON DELETE CASCADE
  SELECT 'held_file_refs -> agent_executions: update NO ACTION, delete CASCADE',
         EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'held_file_refs'::regclass AND confrelid = 'agent_executions'::regclass
                    AND contype = 'f' AND confupdtype = 'a' AND confdeltype = 'c')
  UNION ALL
  SELECT 'held_capture_refusals -> agent_executions: update NO ACTION, delete CASCADE',
         EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'held_capture_refusals'::regclass AND confrelid = 'agent_executions'::regclass
                    AND contype = 'f' AND confupdtype = 'a' AND confdeltype = 'c')
  UNION ALL
  -- no FK of the three tables cascades on update (Prisma's default would be CASCADE)
  SELECT 'no ON UPDATE CASCADE on any held_* FK',
         NOT EXISTS (SELECT 1 FROM pg_constraint
                      WHERE contype = 'f' AND confupdtype = 'c'
                        AND conrelid IN ('held_blobs'::regclass, 'held_file_refs'::regclass,
                                         'held_capture_refusals'::regclass))
  UNION ALL
  -- the five non-PK indexes on refs and refusals (4 on refs, 2 on refusals; names are Prisma-generated)
  SELECT 'held_file_refs indexes: (scope,blobSha256) (executionId) (legTaskId) (rootTaskId)',
         (SELECT count(*) FROM pg_index i WHERE i.indrelid = 'held_file_refs'::regclass AND NOT i.indisprimary) = 4
  UNION ALL
  SELECT 'held_capture_refusals indexes: (executionId) (refusal,createdAt)',
         (SELECT count(*) FROM pg_index i WHERE i.indrelid = 'held_capture_refusals'::regclass AND NOT i.indisprimary) = 2
  UNION ALL
  -- refusal identity nullable (owner decision OA-20), ref identity required
  SELECT 'held_capture_refusals.serviceId and serviceName nullable',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'held_capture_refusals'
             AND column_name IN ('serviceId','serviceName') AND is_nullable = 'YES') = 2
  UNION ALL
  SELECT 'held_file_refs.serviceId and serviceName NOT NULL',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'held_file_refs'
             AND column_name IN ('serviceId','serviceName') AND is_nullable = 'NO') = 2
  UNION ALL
  -- owner decision OA-25: complete -> serviceReportsComplete, onDiskExact dropped
  SELECT 'OA-25: serviceReportsComplete present, complete/onDiskExact absent',
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
                   AND table_name = 'held_file_refs' AND column_name = 'serviceReportsComplete')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
                   AND table_name = 'held_file_refs' AND column_name IN ('complete','onDiskExact'))
)
SELECT name, ok FROM (
  SELECT 0 AS k, name, ok FROM expect
  UNION ALL SELECT 1, CASE WHEN bool_and(ok) THEN 'held_bytes_schema: ALL OK' ELSE 'held_bytes_schema: FAIL' END, bool_and(ok) FROM expect
) r ORDER BY k, ok, name;
