-- AddValidationConstraints
-- P0 Security Enhancement: Add VARCHAR constraints to prevent schema drift
-- Created: 2025-10-29
-- Expected Duration: <1 second (instant ALTER COLUMN)
-- Downtime: ZERO (instant operation, no table rewrite)

-- POV.title: Add VARCHAR(500) constraint to match Zod validation
-- Current max length: 60 chars (8.3x safety margin)
ALTER TABLE "POV" ALTER COLUMN "title" TYPE VARCHAR(500);

-- PhaseTemplate.name: Add VARCHAR(255) constraint to match Zod validation
-- Current max length: 56 chars (4.6x safety margin)
ALTER TABLE "PhaseTemplate" ALTER COLUMN "name" TYPE VARCHAR(255);
