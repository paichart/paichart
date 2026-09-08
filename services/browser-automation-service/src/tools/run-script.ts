/**
 * Run Script Tool
 *
 * Executes JavaScript in the browser context.
 */

import { Page } from 'playwright';
import { z } from 'zod';

export const runScriptSchema = z.object({
  script: z.string(),
  url: z.string().url().optional(),
  timeout: z.number().min(1000).max(300000).default(30000)
});

export type RunScriptInput = z.infer<typeof runScriptSchema>;

export interface RunScriptOutput {
  success: boolean;
  result: any;
  console: string[];
  errors?: string[];
  executionTime: number;
}

export async function runScript(
  page: Page,
  input: RunScriptInput
): Promise<RunScriptOutput> {
  const consoleMessages: string[] = [];
  const startTime = Date.now();

  // Capture console messages
  const consoleHandler = (msg: any) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  };
  page.on('console', consoleHandler);

  try {
    // Navigate if URL provided. 'domcontentloaded' + short idle grace: busy /
    // Cloudflare-fronted pages may never reach network-idle and would otherwise
    // hit Playwright's nav timeout. See scrape-page.ts for the rationale.
    if (input.url) {
      await page.goto(input.url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }

    // Execute the script with timeout
    const result = await Promise.race([
      page.evaluate(input.script),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Script execution timeout')), input.timeout)
      )
    ]);

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      result,
      console: consoleMessages,
      executionTime
    };

  } catch (error: any) {
    const executionTime = Date.now() - startTime;

    return {
      success: false,
      result: null,
      console: consoleMessages,
      errors: [error.message],
      executionTime
    };
  } finally {
    page.off('console', consoleHandler);
  }
}
