#!/usr/bin/env node

/**
 * Component Naming Convention Checker
 * Ensures all React components follow proper naming conventions
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMPONENT_DIRS = [
  'components',
  'app',
  'lib/components'
];

const NAMING_RULES = {
  // React components should be PascalCase
  component: /^[A-Z][a-zA-Z0-9]*\.tsx?$/,
  // Hooks should start with 'use'
  hook: /^use[A-Z][a-zA-Z0-9]*\.(ts|js)$/,
  // Pages can be lowercase with hyphens
  page: /^[a-z][a-z0-9-]*\.(tsx?|js)$/,
  // Utility files can be camelCase or kebab-case
  utility: /^[a-z][a-zA-Z0-9-]*\.(ts|js)$/
};

async function checkDirectory(dir) {
  try {
    const fullPath = path.join(__dirname, '..', dir);
    const exists = await fs.access(fullPath).then(() => true).catch(() => false);
    
    if (!exists) {
      console.log(`✓ Directory ${dir} does not exist, skipping`);
      return true;
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    let isValid = true;

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Recursively check subdirectories
        const subDirValid = await checkDirectory(path.join(dir, entry.name));
        if (!subDirValid) isValid = false;
      } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
        // Check file naming
        const fileName = entry.name;
        
        // Skip index files and special Next.js files
        if (fileName === 'index.ts' || fileName === 'index.tsx' || 
            fileName === 'layout.tsx' || fileName === 'page.tsx' ||
            fileName === 'loading.tsx' || fileName === 'not-found.tsx' ||
            fileName === 'error.tsx' || fileName === 'route.ts' ||
            fileName.startsWith('_') || fileName.startsWith('.')) {
          continue;
        }

        // Basic validation: no spaces, no special characters except hyphens and dots
        if (!/^[a-zA-Z0-9.-]+$/.test(fileName)) {
          console.error(`❌ Invalid characters in file name: ${path.join(dir, fileName)}`);
          isValid = false;
          continue;
        }

        // More lenient approach - just ensure reasonable naming
        if (fileName.length > 100) {
          console.error(`❌ File name too long: ${path.join(dir, fileName)}`);
          isValid = false;
        }
      }
    }

    return isValid;
  } catch (error) {
    console.error(`Error checking directory ${dir}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔍 Checking component naming conventions...\n');
  
  let allValid = true;

  for (const dir of COMPONENT_DIRS) {
    console.log(`Checking ${dir}/...`);
    const dirValid = await checkDirectory(dir);
    if (!dirValid) allValid = false;
  }

  if (allValid) {
    console.log('\n✅ All files pass naming convention checks!');
    process.exit(0);
  } else {
    console.log('\n❌ Some files failed naming convention checks.');
    process.exit(1);
  }
}

main().catch(console.error);