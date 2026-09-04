// This script initializes the LLM settings in the CustomSchema table

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
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
