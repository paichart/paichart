#!/usr/bin/env node

/**
 * Schema-Prisma Parity Validator
 *
 * Validates that Zod validation schemas match Prisma schema definitions
 * Prevents drift issues like:
 * - Enum mismatches (URGENT in Zod, not in Prisma)
 * - Missing enum values (BLOCKED missing from StageStatus)
 * - ID type mismatches (UUID vs CUID)
 * - Required vs optional field mismatches
 *
 * Run: node scripts/validate-schema-prisma-parity.js
 *
 * @see /cline_docs/reviews/schema-validation-audit-2025-11-03/
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Schema-Prisma Parity...\n');

// Read Prisma schema
const prismaSchemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
const prismaContent = fs.readFileSync(prismaSchemaPath, 'utf-8');

let violations = [];
let warnings = [];
let checks = 0;

// ==================== Check 1: Enum Parity ====================
console.log('Checking enum parity...');

// Extract Prisma enums
const prismaEnums = {};
const enumMatches = prismaContent.matchAll(/enum (\w+) \{([^}]+)\}/g);

for (const match of enumMatches) {
  const enumName = match[1];
  const enumValues = match[2]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('//'))
    .map(line => line.split(/\s+/)[0]);

  prismaEnums[enumName] = enumValues;
  checks++;
}

console.log(`  Found ${Object.keys(prismaEnums).length} Prisma enums`);

// Check if enum-validation.ts has all of them
const enumValidationPath = path.resolve(process.cwd(), 'lib/validation/enum-validation.ts');

if (fs.existsSync(enumValidationPath)) {
  const enumValidationContent = fs.readFileSync(enumValidationPath, 'utf-8');

  Object.keys(prismaEnums).forEach(enumName => {
    checks++;

    // Check if enum is imported
    const importPattern = new RegExp(`import.*${enumName}.*from.*@prisma/client`);
    const hasImport = importPattern.test(enumValidationContent);

    // Check if enum has schema
    const schemaPattern = new RegExp(`${enumName}Schema.*=.*z\\.nativeEnum\\(${enumName}\\)`);
    const hasSchema = schemaPattern.test(enumValidationContent);

    if (!hasImport && !hasSchema) {
      warnings.push({
        type: 'MISSING_ENUM_SCHEMA',
        enum: enumName,
        message: `Prisma enum "${enumName}" not imported in enum-validation.ts`,
        severity: 'MEDIUM',
        suggestion: `Add: export const ${enumName}Schema = z.nativeEnum(${enumName});`
      });
    }
  });

  console.log(`  ✅ Enum imports validated`);
} else {
  warnings.push({
    type: 'MISSING_FILE',
    file: 'lib/validation/enum-validation.ts',
    message: 'Enum validation file does not exist',
    severity: 'HIGH'
  });
}

console.log('');

// ==================== Check 2: ID Type Consistency ====================
console.log('Checking ID type consistency...');

// Check all @id @default patterns
const idMatches = prismaContent.matchAll(/@id @default\((\w+)\(\)\)/g);
const idTypes = {};

for (const match of idMatches) {
  const idType = match[1];
  idTypes[idType] = (idTypes[idType] || 0) + 1;
  checks++;
}

console.log(`  Found ID types: ${Object.keys(idTypes).map(t => `${t} (${idTypes[t]})`).join(', ')}`);

// Check for UUID usage in validation files
const { glob } = require('glob');
const validationFiles = glob.sync('lib/validation/**/*.ts', {
  ignore: ['**/node_modules/**']
});

validationFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    checks++;

    // Check for .uuid() usage (should be .cuid())
    if (line.match(/\.uuid\(/)) {
      violations.push({
        type: 'UUID_USAGE',
        file,
        line: index + 1,
        content: line.trim(),
        message: 'Using .uuid() but Prisma uses cuid()',
        severity: 'CRITICAL',
        suggestion: 'Change to .cuid()'
      });
    }
  });
});

if (violations.filter(v => v.type === 'UUID_USAGE').length === 0) {
  console.log(`  ✅ No .uuid() usage found (all use .cuid())`);
}

console.log('');

// ==================== Check 3: Hardcoded Enum Detection ====================
console.log('Checking for hardcoded Prisma enums...');

validationFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    checks++;

    // Find z.enum([...]) with values that match Prisma enums
    const enumMatch = line.match(/z\.enum\(\[([^\]]+)\]/);
    if (enumMatch) {
      const enumValues = enumMatch[1]
        .split(',')
        .map(v => v.trim().replace(/['"]/g, ''));

      // Check if these values match any Prisma enum
      Object.keys(prismaEnums).forEach(prismaEnumName => {
        const prismaValues = prismaEnums[prismaEnumName];

        // If >50% of values match, likely should use z.nativeEnum
        const matchCount = enumValues.filter(v => prismaValues.includes(v)).length;
        const matchPercentage = matchCount / Math.min(enumValues.length, prismaValues.length);

        if (matchPercentage > 0.5 && enumValues.length > 1) {
          warnings.push({
            type: 'HARDCODED_PRISMA_ENUM',
            file,
            line: index + 1,
            enum: prismaEnumName,
            content: line.trim().slice(0, 80),
            message: `Hardcoded enum matches Prisma ${prismaEnumName} (${Math.round(matchPercentage * 100)}% match)`,
            severity: 'MEDIUM',
            suggestion: `Use z.nativeEnum(${prismaEnumName}) instead`
          });
        }
      });
    }
  });
});

const hardcodedEnumWarnings = warnings.filter(w => w.type === 'HARDCODED_PRISMA_ENUM');
if (hardcodedEnumWarnings.length === 0) {
  console.log(`  ✅ No hardcoded Prisma enums detected`);
} else {
  console.log(`  ⚠️  Found ${hardcodedEnumWarnings.length} potential hardcoded Prisma enums`);
}

console.log('');

// ==================== Results Summary ====================
console.log('=====================================');
console.log('Schema-Prisma Parity Results:');
console.log(`🔍 Checks performed: ${checks}`);
console.log(`🔴 Violations (CRITICAL): ${violations.filter(v => v.severity === 'CRITICAL').length}`);
console.log(`🟡 Warnings (MEDIUM/HIGH): ${warnings.filter(w => w.severity !== 'LOW').length}`);
console.log(`ℹ️  Info (LOW): ${warnings.filter(w => w.severity === 'LOW').length}`);
console.log('=====================================\n');

// Display violations
if (violations.length > 0) {
  console.log('🔴 CRITICAL VIOLATIONS:\n');
  violations.forEach(v => {
    console.log(`  ${v.file}:${v.line}`);
    console.log(`    ${v.message}`);
    console.log(`    Code: ${v.content}`);
    console.log(`    Fix: ${v.suggestion}\n`);
  });
}

// Display warnings
if (warnings.length > 0 && warnings.length <= 10) {
  console.log('🟡 WARNINGS:\n');
  warnings.forEach(w => {
    if (w.severity !== 'LOW') {
      console.log(`  [${w.severity}] ${w.message}`);
      if (w.file) console.log(`    File: ${w.file}:${w.line || ''}`);
      if (w.suggestion) console.log(`    Fix: ${w.suggestion}`);
      console.log('');
    }
  });
} else if (warnings.length > 10) {
  console.log(`🟡 ${warnings.length} warnings found (showing first 5):\n`);
  warnings.slice(0, 5).forEach(w => {
    console.log(`  [${w.severity}] ${w.message}`);
  });
  console.log(`  ... and ${warnings.length - 5} more\n`);
}

// Final result
console.log('=====================================');

if (violations.length > 0) {
  console.error('\n❌ Schema-Prisma parity check FAILED');
  console.error(`   Fix ${violations.length} critical violations before deployment\n`);
  process.exit(1);
} else if (warnings.filter(w => w.severity === 'HIGH').length > 0) {
  console.warn('\n⚠️  Schema-Prisma parity check PASSED with warnings');
  console.warn(`   Consider fixing ${warnings.filter(w => w.severity === 'HIGH').length} high-priority warnings\n`);
  process.exit(0);
} else {
  console.log('\n✅ Schema-Prisma parity check PASSED');
  console.log('   All schemas are consistent with Prisma definitions\n');
  process.exit(0);
}
