#!/usr/bin/env node
/**
 * Pattern Registry Drift Validator
 *
 * Validates that PATTERN-REGISTRY.md stays in sync with actual pattern files.
 * Catches:
 *   - Section header counts that don't match actual entries
 *   - Total count mismatch with pattern files on disk
 *   - Pattern files not listed in registry
 *   - Registry entries pointing to missing files
 *
 * Usage: node scripts/validate-pattern-registry.js
 */

const fs = require('fs');
const path = require('path');

const PATTERNS_DIR = path.join(__dirname, '..', '.claude', 'knowledge', 'patterns');
const REGISTRY_FILE = path.join(PATTERNS_DIR, 'PATTERN-REGISTRY.md');

let errors = 0;
let warnings = 0;

function error(msg) {
  console.error(`  ❌ ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`  ⚠️  ${msg}`);
  warnings++;
}

function ok(msg) {
  console.log(`  ✅ ${msg}`);
}

// 1. Get actual pattern files on disk
const allFiles = fs.readdirSync(PATTERNS_DIR)
  .filter(f => f.endsWith('.md') && f !== 'PATTERN-REGISTRY.md');

console.log(`\nPattern Registry Validator`);
console.log(`${'='.repeat(40)}`);
console.log(`\nPattern files on disk: ${allFiles.length}`);

// 2. Parse the registry
const content = fs.readFileSync(REGISTRY_FILE, 'utf-8');
const lines = content.split('\n');

// Extract total count from header
const totalMatch = content.match(/\*\*Total Patterns\*\*:\s*(\d+)/);
const declaredTotal = totalMatch ? parseInt(totalMatch[1]) : null;

// Parse sections and entries
const sections = [];
let currentSection = null;

for (const line of lines) {
  // Section header: ## Performance Patterns (12 patterns)
  const sectionMatch = line.match(/^## (.+?) \((\d+) patterns?\)/);
  if (sectionMatch) {
    currentSection = {
      name: sectionMatch[1],
      declaredCount: parseInt(sectionMatch[2]),
      entries: [],
    };
    sections.push(currentSection);
    continue;
  }

  // Entry: ### **filename.md** - XX% Confidence
  if (currentSection) {
    const entryMatch = line.match(/^### \*\*(.+?\.md)\*\*/);
    if (entryMatch) {
      currentSection.entries.push(entryMatch[1]);
    }
  }
}

// 3. Validate section counts
console.log(`\nSection Validation:`);
let totalEntries = 0;

for (const section of sections) {
  totalEntries += section.entries.length;
  if (section.declaredCount !== section.entries.length) {
    error(`${section.name}: header says ${section.declaredCount} but has ${section.entries.length} entries`);
  } else {
    ok(`${section.name}: ${section.entries.length} entries match header`);
  }
}

// 4. Validate total count
console.log(`\nTotal Validation:`);
if (declaredTotal !== null) {
  if (declaredTotal !== totalEntries) {
    error(`Total header says ${declaredTotal} but registry has ${totalEntries} entries`);
  } else {
    ok(`Total count: ${totalEntries} entries match header`);
  }
} else {
  warn(`Could not find "Total Patterns" in registry header`);
}

// 5. Check for missing files (entries in registry but no file on disk)
console.log(`\nFile Cross-Reference:`);
const registryEntries = sections.flatMap(s => s.entries);

const missingFiles = registryEntries.filter(e => !allFiles.includes(e));
if (missingFiles.length > 0) {
  for (const f of missingFiles) {
    error(`Registry references "${f}" but file not found on disk`);
  }
} else {
  ok(`All ${registryEntries.length} registry entries have matching files`);
}

// 6. Check for unlisted files (files on disk but not in registry)
const unlistedFiles = allFiles.filter(f => !registryEntries.includes(f));
if (unlistedFiles.length > 0) {
  for (const f of unlistedFiles) {
    warn(`File "${f}" exists but is not listed in registry`);
  }
} else {
  ok(`All ${allFiles.length} pattern files are listed in registry`);
}

// 7. File count vs registry count
console.log(`\nDisk vs Registry:`);
if (allFiles.length !== registryEntries.length) {
  warn(`${allFiles.length} files on disk vs ${registryEntries.length} in registry (${allFiles.length - registryEntries.length} unlisted)`);
} else {
  ok(`File count matches registry count: ${allFiles.length}`);
}

// Summary
console.log(`\n${'='.repeat(40)}`);
if (errors > 0) {
  console.error(`\n❌ FAILED: ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
} else if (warnings > 0) {
  console.warn(`\n⚠️  PASSED with ${warnings} warning(s)`);
  process.exit(0);
} else {
  console.log(`\n✅ ALL CHECKS PASSED`);
  process.exit(0);
}
