#!/usr/bin/env node

/**
 * Validation Schema Discovery Tool
 *
 * Discovers all existing validation schemas and maps them to potential usage
 * Helps identify "Week 5 gap" scenarios (schemas exist but not applied)
 *
 * Run: node scripts/discover-validation-schemas.js [endpoint-path]
 *
 * Example: node scripts/discover-validation-schemas.js agent-templates/builder
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const endpointArg = process.argv[2];

console.log('🔍 Discovering Validation Schemas...\n');

// Find all validation schema files
const validationFiles = glob.sync('lib/validation/*.ts', {
  ignore: ['**/node_modules/**']
});

console.log(`📂 Found ${validationFiles.length} validation files\n`);

// Extract schemas from each file
const allSchemas = [];

validationFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Match: export const SomethingSchema = z.object({
    const match = line.match(/export const (\w+Schema) = z\./);
    if (match) {
      const schemaName = match[1];

      // Try to find what it validates (from comments above)
      let purpose = '';
      for (let i = Math.max(0, index - 5); i < index; i++) {
        if (lines[i].includes('*') || lines[i].includes('//')) {
          purpose += lines[i].replace(/\/\*\*?|\*\/|\*|\/\//g, '').trim() + ' ';
        }
      }

      allSchemas.push({
        name: schemaName,
        file: file.replace('lib/validation/', ''),
        line: index + 1,
        purpose: purpose.trim().slice(0, 100)
      });
    }
  });
});

console.log(`📊 Found ${allSchemas.length} validation schemas total\n`);

// If endpoint argument provided, suggest relevant schemas
if (endpointArg) {
  console.log(`🎯 Schemas relevant to "${endpointArg}":\n`);

  const keywords = endpointArg.toLowerCase().split(/[-/]/);

  const relevantSchemas = allSchemas.filter(schema => {
    const schemaLower = schema.name.toLowerCase();
    const purposeLower = schema.purpose.toLowerCase();

    return keywords.some(keyword =>
      schemaLower.includes(keyword) ||
      purposeLower.includes(keyword) ||
      schema.file.toLowerCase().includes(keyword)
    );
  });

  if (relevantSchemas.length > 0) {
    relevantSchemas.forEach(schema => {
      console.log(`  ✅ ${schema.name}`);
      console.log(`     File: ${schema.file}:${schema.line}`);
      if (schema.purpose) {
        console.log(`     Purpose: ${schema.purpose}`);
      }
      console.log('');
    });

    console.log(`💡 Suggested imports for ${endpointArg}:`);
    console.log(`   import { ${relevantSchemas.map(s => s.name).join(', ')} } from '@/lib/validation/${relevantSchemas[0].file.replace('.ts', '')}';`);
  } else {
    console.log(`  ⚠️  No existing schemas found. You may need to create new ones.`);
  }
} else {
  // No argument - show all schemas by category
  console.log('📋 All Validation Schemas by File:\n');

  const byFile = {};
  allSchemas.forEach(schema => {
    if (!byFile[schema.file]) {
      byFile[schema.file] = [];
    }
    byFile[schema.file].push(schema);
  });

  Object.keys(byFile).sort().forEach(file => {
    console.log(`  ${file} (${byFile[file].length} schemas):`);
    byFile[file].forEach(schema => {
      console.log(`    - ${schema.name}`);
    });
    console.log('');
  });

  console.log('\n💡 Usage:');
  console.log('   node scripts/discover-validation-schemas.js agent-templates/builder');
  console.log('   node scripts/discover-validation-schemas.js pov');
  console.log('   node scripts/discover-validation-schemas.js tasks');
}

console.log('\n---');
console.log('✅ Schema discovery complete');
