/**
 * Take Screenshot Tool
 *
 * Captures screenshots of web pages or specific elements.
 */

import { Page } from 'playwright';
import { z } from 'zod';

export const takeScreenshotSchema = z.object({
  url: z.string().url().optional(),
  fullPage: z.boolean().default(false),
  selector: z.string().optional()
});

export type TakeScreenshotInput = z.infer<typeof takeScreenshotSchema>;

export interface TakeScreenshotOutput {
  success: boolean;
  imageBase64: string;
  size: {
    width: number;
    height: number;
  };
  mimeType: string;
  pageTitle?: string;
  pageUrl?: string;
  errors?: string[];
}

export async function takeScreenshot(
  page: Page,
  input: TakeScreenshotInput
): Promise<TakeScreenshotOutput> {
  try {
    // Navigate if URL provided. 'domcontentloaded' + short idle grace: busy /
    // Cloudflare-fronted pages may never reach network-idle and would otherwise
    // hit Playwright's nav timeout. See scrape-page.ts for the rationale.
    if (input.url) {
      await page.goto(input.url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }

    let buffer: Buffer;
    let size: { width: number; height: number };

    if (input.selector) {
      // Screenshot specific element
      const element = await page.$(input.selector);
      if (!element) {
        return {
          success: false,
          imageBase64: '',
          size: { width: 0, height: 0 },
          mimeType: 'image/png',
          errors: [`Element not found: ${input.selector}`]
        };
      }

      buffer = await element.screenshot({ type: 'png' });
      const box = await element.boundingBox();
      size = {
        width: Math.round(box?.width ?? 0),
        height: Math.round(box?.height ?? 0)
      };
    } else {
      // Full page or viewport screenshot
      buffer = await page.screenshot({
        type: 'png',
        fullPage: input.fullPage
      });

      const viewport = page.viewportSize();
      size = viewport ?? { width: 1920, height: 1080 };

      if (input.fullPage) {
        // Get actual page dimensions for full page
        const dimensions = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight
        }));
        size = dimensions;
      }
    }

    const pageTitle = await page.title();
    const pageUrl = page.url();

    return {
      success: true,
      imageBase64: buffer.toString('base64'),
      size,
      mimeType: 'image/png',
      pageTitle,
      pageUrl
    };

  } catch (error: any) {
    return {
      success: false,
      imageBase64: '',
      size: { width: 0, height: 0 },
      mimeType: 'image/png',
      errors: [error.message]
    };
  }
}
