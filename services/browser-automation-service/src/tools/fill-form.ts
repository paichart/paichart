/**
 * Fill Form Tool
 *
 * Fills and optionally submits web forms.
 */

import { Page } from 'playwright';
import { z } from 'zod';

export const fillFormSchema = z.object({
  url: z.string().url(),
  fieldMappings: z.record(z.string()),
  formData: z.record(z.string()),
  submit: z.boolean().default(false),
  submitSelector: z.string().optional()
});

export type FillFormInput = z.infer<typeof fillFormSchema>;

export interface FillFormOutput {
  success: boolean;
  filledFields: string[];
  submissionId?: string;
  finalUrl?: string;
  errors?: string[];
}

export async function fillForm(
  page: Page,
  input: FillFormInput
): Promise<FillFormOutput> {
  const filledFields: string[] = [];
  const errors: string[] = [];

  try {
    // Navigate to the URL. 'domcontentloaded' + short idle grace: busy /
    // Cloudflare-fronted pages may never reach network-idle and would otherwise
    // hit Playwright's nav timeout. See scrape-page.ts for the rationale.
    await page.goto(input.url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    // Fill each field
    for (const [fieldName, value] of Object.entries(input.formData)) {
      const selector = input.fieldMappings[fieldName];
      if (!selector) {
        errors.push(`No selector mapping for field: ${fieldName}`);
        continue;
      }

      try {
        const element = await page.$(selector);
        if (!element) {
          errors.push(`Element not found for field ${fieldName}: ${selector}`);
          continue;
        }

        // Get element type
        const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
        const inputType = await element.evaluate((el) =>
          el instanceof HTMLInputElement ? el.type : null
        );

        if (tagName === 'select') {
          await element.selectOption(value);
        } else if (inputType === 'checkbox' || inputType === 'radio') {
          const shouldCheck = value === 'true' || value === '1';
          if (shouldCheck) {
            await element.check();
          } else {
            await element.uncheck();
          }
        } else {
          // Clear and fill for text inputs
          await element.fill('');
          await element.fill(value);
        }

        filledFields.push(fieldName);
      } catch (fieldError: any) {
        errors.push(`Error filling ${fieldName}: ${fieldError.message}`);
      }
    }

    // Submit if requested
    let submissionId: string | undefined;
    let finalUrl: string | undefined;

    if (input.submit) {
      const submitSelector = input.submitSelector || 'button[type="submit"], input[type="submit"]';
      const submitButton = await page.$(submitSelector);

      if (submitButton) {
        // Generate submission ID
        submissionId = `submit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Click submit and wait for navigation
        await Promise.all([
          // Bounded so a never-idle post-submit page can't stall 30s
          page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}),
          submitButton.click()
        ]);

        finalUrl = page.url();
      } else {
        errors.push(`Submit button not found: ${submitSelector}`);
      }
    }

    return {
      success: errors.length === 0,
      filledFields,
      submissionId,
      finalUrl,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error: any) {
    return {
      success: false,
      filledFields,
      errors: [error.message]
    };
  }
}
