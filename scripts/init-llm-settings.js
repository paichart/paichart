// This script initializes the LLM settings in the CustomSchema table

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 2026-11-12 (cold read B1): .env.example ships a placeholder. Storing it as the SYSTEM key makes every user on "use system
  // provider" fail at the provider with an authentication error instead of a clear "no key" message. Refuse, and say what to do.
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key || key === 'your-anthropic-api-key') {
    console.error('llm:init: ANTHROPIC_API_KEY is ' + (key ? 'still the placeholder from .env.example' : 'not set') + ' — nothing stored.');
    console.error('  Either set a real key in .env and load it (set -a; . ./.env; set +a) before running this,');
    console.error('  or skip this command and paste your own key in the web app: Profile Settings → LLM.');
    process.exit(1);
  }
  try {
    console.log('Checking for existing LLM settings...');
    
    // Check if LLM settings already exist
    const existingSettings = await prisma.customSchema.findFirst({
      where: { name: 'llm_settings' },
    });

    if (existingSettings) {
      console.log('LLM settings already exist. Updating...');
      
      // Update existing settings
      await prisma.customSchema.update({
        where: { id: existingSettings.id },
        data: {
          schema: {
            provider: 'anthropic_sdk',
            // NOTE: env var was misspelled ANTROPIC_API_KEY here until 2026-08-05, so this
            // script never actually picked up a key. Fixed alongside the Gemini removal.
            anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
            useSystemProvider: true,
          },
          updatedAt: new Date(),
        },
      });
      
      console.log('LLM settings updated successfully.');
    } else {
      console.log('LLM settings do not exist. Creating...');
      
      // Create new settings
      await prisma.customSchema.create({
        data: {
          name: 'llm_settings',
          schema: {
            provider: 'anthropic_sdk',
            // NOTE: env var was misspelled ANTROPIC_API_KEY here until 2026-08-05, so this
            // script never actually picked up a key. Fixed alongside the Gemini removal.
            anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
            useSystemProvider: true,
          },
        },
      });
      
      console.log('LLM settings created successfully.');
    }
  } catch (error) {
    console.error('Error initializing LLM settings:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
