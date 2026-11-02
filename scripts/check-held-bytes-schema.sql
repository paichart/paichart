-- PLATFORM-HELD-BYTES — read-only schema check for the held-bytes tables (Stage A WI-1: three tables; Stage B push 1
-- P1-1: + held_views, the four relaxed held_file_refs call-provenance columns, fromRefId; held-k8s K-3 2026-10-18: + sourceRevision).
-- Run after `db push` (local) and after moment 1 on prod:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-held-bytes-schema.sql
-- Every row printed must read ok = t. It asserts the CATALOG (pg_constraint / pg_index / information_schema), never
-- `\d` text: `\d` omits the default ON UPDATE NO ACTION, so a text check would fail on a correct schema (panel DB NEW-2).
-- Codes: confupdtype/confdeltype 'a' = NO ACTION, 'r' = RESTRICT, 'c' = CASCADE.
-- Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-1 / §6; STAGE-B-PLAN.md P1-1.
SET default_transaction_read_only = on;

-- ONE read-only statement: every assertion, then a summary row DERIVED from all of them (code review DB note: the old
-- summary recomputed only 3 of 12; a temp view is not allowed in a read-only transaction).
WITH expect(name, ok) AS (
  -- four tables exist (Stage B: + held_views)
  SELECT 'tables exist (4)',
         (SELECT count(*) FROM information_schema.tables
           WHERE table_schema = current_schema()
             AND table_name IN ('held_blobs','held_file_refs','held_capture_refusals','held_views')) = 4
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
  -- no FK of the four tables cascades on update (Prisma's default would be CASCADE)
  SELECT 'no ON UPDATE CASCADE on any held_* FK',
         NOT EXISTS (SELECT 1 FROM pg_constraint
                      WHERE contype = 'f' AND confupdtype = 'c'
                        AND conrelid IN ('held_blobs'::regclass, 'held_file_refs'::regclass,
                                         'held_capture_refusals'::regclass, 'held_views'::regclass))
  UNION ALL
  -- Stage B: held_views PK = (scope, baseSha256, r9Version, viewVersion), in that order, named held_views_pkey
  SELECT 'held_views PK = (scope, baseSha256, r9Version, viewVersion) named held_views_pkey',
         (SELECT array_agg(a.attname::text ORDER BY k.ord)
            FROM pg_constraint c
            CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
           WHERE c.conrelid = 'held_views'::regclass AND c.contype = 'p' AND c.conname = 'held_views_pkey')
           = ARRAY['scope','baseSha256','r9Version','viewVersion']
  UNION ALL
  -- Stage B: view -> blob: ON UPDATE NO ACTION, ON DELETE CASCADE (a view goes with its blob at GC)
  SELECT 'held_views -> held_blobs: update NO ACTION, delete CASCADE',
         EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'held_views'::regclass AND confrelid = 'held_blobs'::regclass
                    AND contype = 'f' AND confupdtype = 'a' AND confdeltype = 'c')
  UNION ALL
  -- Stage B: the four call-provenance columns are nullable (BASE / CANDIDATE rows), and so is fromRefId
  SELECT 'held_file_refs relaxed: sourceTool toolCallIndex selector declaredBy fromRefId nullable',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'held_file_refs'
             AND column_name IN ('sourceTool','toolCallIndex','selector','declaredBy','fromRefId')
             AND is_nullable = 'YES') = 5
  UNION ALL
  -- Stage B: every column required on every kind is STILL NOT NULL (the relaxation touched exactly four)
  SELECT 'held_file_refs kind-true columns still NOT NULL (10)',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'held_file_refs'
             AND column_name IN ('serviceId','serviceName','target','path','hashBasis','decodeVersion',
                                 'redactorVersion','redactedCount','lineCount','placeholderPreexistingCount')
             AND is_nullable = 'NO') = 10
  UNION ALL
  -- held-k8s K-3 (2026-10-18): the Git commit a CAPTURE was read at — text, nullable, unindexed (the index count below stays 4)
  SELECT 'held_file_refs.sourceRevision present, text, nullable',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'held_file_refs'
             AND column_name = 'sourceRevision' AND data_type = 'text' AND is_nullable = 'YES') = 1
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
  UNION ALL
  -- WI-B10 (2026-10-23): registrant declarations — 6 nullable mcp_tools columns, the content-addressed snapshot table, a
  -- nullable declarationSha256 on refs + refusals, and NO foreign key from any held table to mcp_tools or held_declarations
  -- (teardown must never fail or cascade into held evidence).
  SELECT 'WI-B10: mcp_tools declaration columns present, nullable (6)',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'mcp_tools'
             AND column_name IN ('heldFiles','heldFilesSha256','declarationSource','descriptorUrl','descriptorSha256','descriptorFetchedAt')
             AND is_nullable = 'YES') = 6
  UNION ALL
  SELECT 'WI-B10: held_declarations PK = (sha256)',
         (SELECT array_agg(a.attname::text) FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
           WHERE i.indrelid = to_regclass('held_declarations') AND i.indisprimary) = ARRAY['sha256']
  UNION ALL
  SELECT 'WI-B10: declarationSha256 nullable on held_file_refs and held_capture_refusals',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name IN ('held_file_refs','held_capture_refusals')
             AND column_name = 'declarationSha256' AND data_type = 'text' AND is_nullable = 'YES') = 2
  UNION ALL
  SELECT 'WI-B10: NO foreign key from a held table to mcp_tools or held_declarations, none on held_declarations',
         NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.contype = 'f'
                       AND (c.confrelid IN (to_regclass('mcp_tools'), to_regclass('held_declarations'))
                            AND c.conrelid IN (to_regclass('held_file_refs'), to_regclass('held_capture_refusals'),
                                               to_regclass('held_blobs'), to_regclass('held_views'))
                            OR c.conrelid = to_regclass('held_declarations')))
  UNION ALL
  -- INTERNAL-FIT IF-3 (2026-10-24): the owner-written POV grant list (text[] DEFAULT '{}', the db-push-safe form) and the
  -- capture-time eligibility + grantPovId on refs + refusals (nullable text; NULL on every pre-IF-3 row).
  SELECT 'IF-3: mcp_tools.heldGrantPovIds is text[] with an empty-array default',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'mcp_tools' AND column_name = 'heldGrantPovIds'
             AND data_type = 'ARRAY' AND udt_name = '_text' AND column_default LIKE 'ARRAY[]%') = 1
  UNION ALL
  SELECT 'IF-3: eligibility + grantPovId nullable text on held_file_refs and held_capture_refusals (4)',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name IN ('held_file_refs','held_capture_refusals')
             AND column_name IN ('eligibility','grantPovId') AND data_type = 'text' AND is_nullable = 'YES') = 4
)
SELECT name, ok FROM (
  SELECT 0 AS k, name, ok FROM expect
  UNION ALL SELECT 1, CASE WHEN bool_and(ok) THEN 'held_bytes_schema: ALL OK' ELSE 'held_bytes_schema: FAIL' END, bool_and(ok) FROM expect
) r ORDER BY k, ok, name;
