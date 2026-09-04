#!/usr/bin/env npx ts-node
/**
 * Validation Parity Checker
 *
 * Detects mismatches between MCP layer validation and main validation schemas.
 * Identifies fields that use different validation approaches (e.g., character
 * whitelist vs semantic pattern detection).
 *
 * Usage: npx ts-node scripts/check-validation-parity.ts
 *
 * @created 2025-12-22
 * @author validation-engine-specialist
 */

import * as fs from 'fs';
import * as path from 'path';

interface ValidationPattern {
  file: string;
  field: string;
  pattern: string;
  type: 'whitelist' | 'semantic' | 'length-only' | 'enum' | 'unknown';
  maxLength?: number;
}

interface ParityIssue {
  field: string;
  mcpValidation: ValidationPattern | null;
  mainValidation: ValidationPattern | null;
  issue: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

// Patterns to detect validation types
const PATTERNS = {
  WHITELIST: /ValidationSchemas\.(SAFE_TEXT|SAFE_NAME|COMMENT_TEXT)/,
  SEMANTIC: /detectPromptInjection|RichTextField/,
  FORM_FIELD: /FormField\.optional(String|Number|DateTime|CUID)/,
  LENGTH_ONLY: /z\.string\(\)\.max\(\d+\)/,
  ENUM: /z\.(enum|nativeEnum)/,
};

function detectValidationType(line: string): ValidationPattern['type'] {
  if (PATTERNS.SEMANTIC.test(line)) return 'semantic';
  if (PATTERNS.WHITELIST.test(line)) return 'whitelist';
  if (PATTERNS.FORM_FIELD.test(line)) return 'semantic'; // FormField uses semantic
  if (PATTERNS.ENUM.test(line)) return 'enum';
  if (PATTERNS.LENGTH_ONLY.test(line)) return 'length-only';
  return 'unknown';
}

function extractMaxLength(line: string): number | undefined {
  const match = line.match(/\.max\((\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

function parseValidationFile(filePath: string): ValidationPattern[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const patterns: ValidationPattern[] = [];

  const fileName = path.basename(filePath);

  // Simple regex to find field definitions
  const fieldPattern = /^\s*(\w+):\s*(.*?)(?:,\s*\/\/.*)?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(fieldPattern);

    if (match) {
      const [, field, validation] = match;

      // Skip non-validation fields
      if (['action', 'parameters', 'metadata'].includes(field)) continue;

      // Only interested in text fields (description, title, comment, etc.)
      const textFields = ['description', 'title', 'comment', 'reason', 'note', 'notes', 'completionNote', 'completionNotes', 'prompt', 'agentRole'];
      if (!textFields.some(tf => field.toLowerCase().includes(tf.toLowerCase()))) continue;

      const type = detectValidationType(validation);
      const maxLength = extractMaxLength(validation);

      patterns.push({
        file: fileName,
        field,
        pattern: validation.trim().substring(0, 80),
        type,
        maxLength,
      });
    }
  }

  return patterns;
}

function findParityIssues(mcpPatterns: ValidationPattern[], mainPatterns: ValidationPattern[]): ParityIssue[] {
  const issues: ParityIssue[] = [];

  // Build lookup map for main patterns
  const mainMap = new Map<string, ValidationPattern>();
  for (const p of mainPatterns) {
    mainMap.set(p.field.toLowerCase(), p);
  }

  // Check each MCP pattern against main patterns
  for (const mcpPattern of mcpPatterns) {
    const fieldLower = mcpPattern.field.toLowerCase();
    const mainPattern = mainMap.get(fieldLower);

    if (!mainPattern) {
      // No corresponding main pattern - might be MCP-only field
      continue;
    }

    // Check for type mismatch
    if (mcpPattern.type !== mainPattern.type) {
      let severity: ParityIssue['severity'] = 'MEDIUM';
      let issue = `Type mismatch: MCP uses ${mcpPattern.type}, main uses ${mainPattern.type}`;

      // Whitelist vs Semantic is HIGH severity (blocks legitimate content)
      if (
        (mcpPattern.type === 'whitelist' && mainPattern.type === 'semantic') ||
        (mcpPattern.type === 'semantic' && mainPattern.type === 'whitelist')
      ) {
        severity = 'HIGH';
        issue = `CRITICAL: MCP uses ${mcpPattern.type} but main uses ${mainPattern.type} - may block legitimate content`;
      }

      issues.push({
        field: mcpPattern.field,
        mcpValidation: mcpPattern,
        mainValidation: mainPattern,
        issue,
        severity,
      });
    }

    // Check for length mismatch (>5x difference is notable)
    if (mcpPattern.maxLength && mainPattern.maxLength) {
      const ratio = Math.max(mcpPattern.maxLength, mainPattern.maxLength) /
                    Math.min(mcpPattern.maxLength, mainPattern.maxLength);

      if (ratio > 5) {
        issues.push({
          field: mcpPattern.field,
          mcpValidation: mcpPattern,
          mainValidation: mainPattern,
          issue: `Length mismatch: MCP allows ${mcpPattern.maxLength}, main allows ${mainPattern.maxLength} (${ratio.toFixed(1)}x difference)`,
          severity: ratio > 10 ? 'HIGH' : 'MEDIUM',
        });
      }
    }
  }

  return issues;
}

function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       VALIDATION PARITY CHECKER                           ║');
  console.log('║  Detecting MCP vs Main validation mismatches              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const validationDir = path.join(__dirname, '../lib/validation');

  // Files to compare
  // Phase 3 C1 (2026-05-16): mcp-hub-validation.ts deleted — its constraints
  // migrated to lib/mcp/server/config/tool-schemas.js (L1 dispatch boundary)
  // and lib/mcp/server/tools/hub/service-update-handler.js (L3 handler boundary).
  const mcpFiles = [
    'mcp-action-validation.ts',
  ];

  const mainFiles = [
    'task-validation.ts',
    'pov.ts',
    'agent-template-validation.ts',
  ];

  // Parse all files
  let mcpPatterns: ValidationPattern[] = [];
  let mainPatterns: ValidationPattern[] = [];

  console.log('📂 Scanning MCP validation files...');
  for (const file of mcpFiles) {
    const filePath = path.join(validationDir, file);
    if (fs.existsSync(filePath)) {
      const patterns = parseValidationFile(filePath);
      mcpPatterns = mcpPatterns.concat(patterns);
      console.log(`   ✓ ${file}: ${patterns.length} text fields found`);
    } else {
      console.log(`   ⚠ ${file}: not found`);
    }
  }

  console.log('\n📂 Scanning main validation files...');
  for (const file of mainFiles) {
    const filePath = path.join(validationDir, file);
    if (fs.existsSync(filePath)) {
      const patterns = parseValidationFile(filePath);
      mainPatterns = mainPatterns.concat(patterns);
      console.log(`   ✓ ${file}: ${patterns.length} text fields found`);
    } else {
      console.log(`   ⚠ ${file}: not found`);
    }
  }

  // Find issues
  console.log('\n🔍 Checking for parity issues...\n');
  const issues = findParityIssues(mcpPatterns, mainPatterns);

  if (issues.length === 0) {
    console.log('✅ No parity issues found! MCP and main validation are aligned.\n');
  } else {
    console.log(`⚠️  Found ${issues.length} parity issue(s):\n`);

    const highIssues = issues.filter(i => i.severity === 'HIGH');
    const mediumIssues = issues.filter(i => i.severity === 'MEDIUM');
    const lowIssues = issues.filter(i => i.severity === 'LOW');

    if (highIssues.length > 0) {
      console.log('🔴 HIGH SEVERITY:');
      for (const issue of highIssues) {
        console.log(`   Field: ${issue.field}`);
        console.log(`   Issue: ${issue.issue}`);
        console.log(`   MCP:   ${issue.mcpValidation?.pattern || 'N/A'}`);
        console.log(`   Main:  ${issue.mainValidation?.pattern || 'N/A'}`);
        console.log('');
      }
    }

    if (mediumIssues.length > 0) {
      console.log('🟡 MEDIUM SEVERITY:');
      for (const issue of mediumIssues) {
        console.log(`   Field: ${issue.field}`);
        console.log(`   Issue: ${issue.issue}`);
        console.log('');
      }
    }

    if (lowIssues.length > 0) {
      console.log('🟢 LOW SEVERITY:');
      for (const issue of lowIssues) {
        console.log(`   Field: ${issue.field}`);
        console.log(`   Issue: ${issue.issue}`);
        console.log('');
      }
    }
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`MCP text fields scanned:  ${mcpPatterns.length}`);
  console.log(`Main text fields scanned: ${mainPatterns.length}`);
  console.log(`Parity issues found:      ${issues.length}`);
  console.log(`  - HIGH severity:        ${issues.filter(i => i.severity === 'HIGH').length}`);
  console.log(`  - MEDIUM severity:      ${issues.filter(i => i.severity === 'MEDIUM').length}`);
  console.log(`  - LOW severity:         ${issues.filter(i => i.severity === 'LOW').length}`);
  console.log('');

  // Exit with error code if HIGH severity issues found
  if (issues.filter(i => i.severity === 'HIGH').length > 0) {
    console.log('❌ HIGH severity issues require attention!');
    process.exit(1);
  } else {
    console.log('✅ No critical parity issues.');
    process.exit(0);
  }
}

main();
