/**
 * Click Element Tool
 *
 * Clicks an element on the page and optionally captures state.
 */

import { Page } from 'playwright';
import { z } from 'zod';

export const clickElementSchema = z.object({
  selector: z.string(),
  url: z.string().url().optional(),
  waitAfter: z.number().min(0).max(30000).default(1000),
  screenshot: z.boolean().default(false)
});

export type ClickElementInput = z.infer<typeof clickElementSchema>;

export interface ClickElementOutput {
  success: boolean;
  newUrl?: string;
  screenshot?: string;
  elementText?: string;
  errors?: string[];
}

export async function clickElement(
  page: Page,
  input: ClickElementInput
): Promise<ClickElementOutput> {
  const errors: string[] = [];

  try {
    // Navigate if URL provided. 'domcontentloaded' + short idle grace: busy /
    // Cloudflare-fronted pages may never reach network-idle and would otherwise
    // hit Playwright's nav timeout. See scrape-page.ts for the rationale.
    if (input.url) {
      await page.goto(input.url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }

    // Find the element
    const element = await page.$(input.selector);
    if (!element) {
      return {
        success: false,
        errors: [`Element not found: ${input.selector}`]
      };
    }

    // Get element text before clicking
    const elementText = await element.textContent() ?? undefined;

    // Click the element
    await element.click();

    // Wait if specified
    if (input.waitAfter > 0) {
      await page.waitForTimeout(input.waitAfter);
    }

    // Wait for any navigation (bounded so a never-idle page can't stall 30s)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Get new URL
    const newUrl = page.url();

    // Take screenshot if requested
    let screenshot: string | undefined;
    if (input.screenshot) {
      const buffer = await page.screenshot({ type: 'png' });
      screenshot = buffer.toString('base64');
    }

    return {
      success: true,
      newUrl,
      screenshot,
      elementText
    };

  } catch (error: any) {
    return {
      success: false,
      errors: [error.message]
    };
  }
}
