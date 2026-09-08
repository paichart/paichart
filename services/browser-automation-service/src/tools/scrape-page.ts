/**
 * Scrape Page Tool
 *
 * Extracts data from web pages using CSS selectors.
 */

import { Page } from 'playwright';
import { z } from 'zod';

export const scrapePageSchema = z.object({
  url: z.string().url(),
  selectors: z.record(z.string()),
  waitFor: z.string().optional(),
  pagination: z.object({
    nextSelector: z.string(),
    maxPages: z.number().min(1).max(100).default(10)
  }).optional()
});

export type ScrapePageInput = z.infer<typeof scrapePageSchema>;

export interface ScrapePageOutput {
  success: boolean;
  data: Record<string, string | string[]>[];
  pageCount: number;
  timing: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
  errors?: string[];
}

export async function scrapePage(
  page: Page,
  input: ScrapePageInput
): Promise<ScrapePageOutput> {
  const startTime = new Date();
  const allData: Record<string, string | string[]>[] = [];
  const errors: string[] = [];
  let pageCount = 0;
  const maxPages = input.pagination?.maxPages ?? 1;

  try {
    // Navigate to the URL. Use 'domcontentloaded' rather than 'networkidle':
    // busy pages (analytics, chat widgets, gov/Cloudflare-fronted sites) may
    // never reach network-idle and would otherwise burn Playwright's full nav
    // timeout and fail. We then grant a short best-effort idle grace so pages
    // that *do* settle still benefit, without ever hanging on those that don't.
    await page.goto(input.url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
      // Page never went network-idle within the grace window — proceed with the
      // loaded DOM rather than failing the scrape.
    });

    // Wait for specific element if specified
    if (input.waitFor) {
      await page.waitForSelector(input.waitFor, { timeout: 10000 });
    }

    do {
      pageCount++;

      // Extract data using selectors
      const pageData: Record<string, string | string[]> = {};

      for (const [key, selector] of Object.entries(input.selectors)) {
        try {
          const elements = await page.$$(selector);

          if (elements.length === 0) {
            pageData[key] = '';
          } else if (elements.length === 1) {
            pageData[key] = await elements[0].textContent() ?? '';
          } else {
            pageData[key] = await Promise.all(
              elements.map(async (el) => (await el.textContent()) ?? '')
            );
          }
        } catch (selectorError: any) {
          errors.push(`Selector ${key} (${selector}): ${selectorError.message}`);
          pageData[key] = '';
        }
      }

      allData.push(pageData);

      // Handle pagination if configured
      if (input.pagination && pageCount < maxPages) {
        const nextButton = await page.$(input.pagination.nextSelector);
        if (nextButton) {
          const isDisabled = await nextButton.isDisabled();
          if (!isDisabled) {
            await nextButton.click();
            // Bounded idle-wait: don't hang if the next page never goes idle.
            await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
          } else {
            break;
          }
        } else {
          break;
        }
      }
    } while (input.pagination && pageCount < maxPages);

  } catch (error: any) {
    errors.push(error.message);
  }

  const endTime = new Date();

  return {
    success: errors.length === 0,
    data: allData,
    pageCount,
    timing: {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs: endTime.getTime() - startTime.getTime()
    },
    errors: errors.length > 0 ? errors : undefined
  };
}
