/**
 * Generate PDF Tool
 *
 * Generates PDF documents from web pages.
 */

import { Page } from 'playwright';
import { z } from 'zod';

export const generatePdfSchema = z.object({
  url: z.string().url().optional(),
  pageSettings: z.object({
    format: z.enum(['A4', 'Letter', 'Legal']).default('A4'),
    landscape: z.boolean().default(false),
    margin: z.object({
      top: z.string().optional(),
      right: z.string().optional(),
      bottom: z.string().optional(),
      left: z.string().optional()
    }).optional()
  }).optional()
});

export type GeneratePdfInput = z.infer<typeof generatePdfSchema>;

export interface GeneratePdfOutput {
  success: boolean;
  pdfBase64: string;
  pages: number;
  size: number;
  pageTitle?: string;
  errors?: string[];
}

export async function generatePdf(
  page: Page,
  input: GeneratePdfInput
): Promise<GeneratePdfOutput> {
  try {
    // Navigate if URL provided. 'domcontentloaded' + short idle grace: busy /
    // Cloudflare-fronted pages may never reach network-idle and would otherwise
    // hit Playwright's nav timeout. See scrape-page.ts for the rationale.
    if (input.url) {
      await page.goto(input.url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }

    // Build PDF options
    const pdfOptions: Parameters<Page['pdf']>[0] = {
      format: input.pageSettings?.format ?? 'A4',
      landscape: input.pageSettings?.landscape ?? false,
      printBackground: true
    };

    // Add margins if specified
    if (input.pageSettings?.margin) {
      pdfOptions.margin = {
        top: input.pageSettings.margin.top ?? '20mm',
        right: input.pageSettings.margin.right ?? '20mm',
        bottom: input.pageSettings.margin.bottom ?? '20mm',
        left: input.pageSettings.margin.left ?? '20mm'
      };
    }

    // Generate PDF
    const buffer = await page.pdf(pdfOptions);

    // Estimate page count (rough estimate based on size)
    // PDF headers typically contain page count but we'll estimate
    const estimatedPages = Math.max(1, Math.ceil(buffer.length / 50000));

    const pageTitle = await page.title();

    return {
      success: true,
      pdfBase64: buffer.toString('base64'),
      pages: estimatedPages,
      size: buffer.length,
      pageTitle
    };

  } catch (error: any) {
    return {
      success: false,
      pdfBase64: '',
      pages: 0,
      size: 0,
      errors: [error.message]
    };
  }
}
