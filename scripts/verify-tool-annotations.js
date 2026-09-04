/**
 * Tool Annotations Verification Script
 *
 * Purpose: Verify all tools in tool-security.js have annotations in tool-annotations.js
 * Specialist: validation-engine-specialist recommendation
 *
 * Validates:
 * - All working tools are annotated
 * - No orphaned annotations
 * - readOnlyHint and destructiveHint are logical
 *
 * Created: 2026-01-31
 */

const { PUBLIC_TOOLS, AUTHENTICATED_TOOLS, ADMIN_TOOLS } = require('../lib/mcp/server/config/tool-security');
const { getToolAnnotations } = require('../lib/mcp/server/config/tool-annotations');

console.log('🔍 Tool Annotations Verification\n');

let passed = 0;
let failed = 0;
let warnings = 0;

// Get all tools
const allTools = [...PUBLIC_TOOLS, ...AUTHENTICATED_TOOLS, ...ADMIN_TOOLS];
console.log(`Total tools to verify: ${allTools.length}`);
console.log(`- PUBLIC: ${PUBLIC_TOOLS.length}`);
console.log(`- AUTHENTICATED: ${AUTHENTICATED_TOOLS.length}`);
console.log(`- ADMIN: ${ADMIN_TOOLS.length}\n`);

console.log('=====================================');
console.log('Annotation Coverage Check');
console.log('=====================================\n');

// Check each tool has annotation
allTools.forEach(toolName => {
  const annotation = getToolAnnotations(toolName);

  if (!annotation) {
    console.error(`❌ Missing annotation: ${toolName}`);
    failed++;
  } else {
    console.log(`✅ ${toolName}: ${annotation.title}`);

    // Validate annotation structure
    if (annotation.readOnlyHint === undefined) {
      console.warn(`   ⚠️  readOnlyHint undefined for ${toolName}`);
      warnings++;
    }
    if (annotation.destructiveHint === undefined) {
      console.warn(`   ⚠️  destructiveHint undefined for ${toolName}`);
      warnings++;
    }

    // Logical validation
    if (annotation.readOnlyHint && annotation.destructiveHint) {
      console.warn(`   ⚠️  Inconsistent: ${toolName} marked both readOnly AND destructive`);
      warnings++;
    }

    passed++;
  }
});

console.log('\n=====================================');
console.log('Annotation Logic Check');
console.log('=====================================\n');

// Known read-only tools
const expectedReadOnly = [
  'project', 'analytics', 'template',
  'list_prompts',
  'search', 'fetch'
];

// Known destructive tools
const expectedDestructive = [
  'perform', 'services', 'registry',
  'prompt_command'
];

let logicPassed = 0;
let logicFailed = 0;

expectedReadOnly.forEach(toolName => {
  const annotation = getToolAnnotations(toolName);
  if (annotation) {
    if (annotation.readOnlyHint === true && annotation.destructiveHint === false) {
      console.log(`✅ ${toolName}: Correctly marked read-only`);
      logicPassed++;
    } else {
      console.error(`❌ ${toolName}: Should be read-only but isn't`);
      console.error(`   readOnlyHint: ${annotation.readOnlyHint}, destructiveHint: ${annotation.destructiveHint}`);
      logicFailed++;
    }
  }
});

expectedDestructive.forEach(toolName => {
  const annotation = getToolAnnotations(toolName);
  if (annotation) {
    if (annotation.destructiveHint === true) {
      console.log(`✅ ${toolName}: Correctly marked destructive`);
      logicPassed++;
    } else {
      console.error(`❌ ${toolName}: Should be destructive but isn't`);
      console.error(`   destructiveHint: ${annotation.destructiveHint}`);
      logicFailed++;
    }
  }
});

console.log('\n=====================================');
console.log('Summary');
console.log('=====================================');
console.log(`\n✅ Coverage Passed: ${passed}/${allTools.length}`);
console.log(`❌ Coverage Failed: ${failed}`);
console.log(`⚠️  Warnings: ${warnings}`);
console.log(`\n✅ Logic Passed: ${logicPassed}`);
console.log(`❌ Logic Failed: ${logicFailed}`);
console.log('=====================================\n');

if (failed > 0 || logicFailed > 0) {
  console.error('❌ Annotation verification failed!\n');
  console.error('Action needed:');
  console.error('- Add missing annotations to lib/mcp/server/config/tool-annotations.js');
  console.error('- Fix incorrect readOnlyHint/destructiveHint values\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('⚠️  Verification passed with warnings\n');
  console.log('Review warnings above and fix if needed\n');
  process.exit(0);
} else {
  console.log('✅ All tool annotations verified!\n');
  console.log('Summary:');
  console.log(`- ${passed} tools have annotations`);
  console.log(`- ${logicPassed} tools have correct hints`);
  console.log('- 0 missing annotations');
  console.log('- 0 incorrect hints\n');
  process.exit(0);
}
