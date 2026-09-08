/**
 * Browser Automation Service - Default Configuration
 *
 * Default settings for browser automation operations.
 */

export interface BrowserDefaults {
  viewport: { width: number; height: number };
  userAgent: string;
  timeout: number;
  headless: boolean;
  maxPoolSize: number;
  idleTimeout: number;
  maxProcessLifetime: number;
}

export const BROWSER_DEFAULTS: BrowserDefaults = {
  viewport: { width: 1920, height: 1080 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  timeout: 30000,
  headless: true,
  maxPoolSize: 3,
  idleTimeout: 600000, // 10 minutes
  maxProcessLifetime: 1800000 // 30 minutes
};

export const RATE_LIMITS = {
  maxConcurrentBrowsers: 3,
  maxRequestsPerMinute: 60,
  cooldownPeriodMs: 1000
};

export const RESOURCE_LIMITS = {
  maxMemoryMb: 1536,
  maxCpuPercent: 80,
  executionTimeoutMs: 300000 // 5 minutes
};

export interface ToolInputSchemas {
  scrape_page: {
    url: string;
    selectors: Record<string, string>;
    waitFor?: string;
    pagination?: {
      nextSelector: string;
      maxPages: number;
    };
  };
  fill_form: {
    url: string;
    fieldMappings: Record<string, string>;
    formData: Record<string, string>;
    submit?: boolean;
    submitSelector?: string;
  };
  click_element: {
    selector: string;
    waitAfter?: number;
    screenshot?: boolean;
    url?: string;
  };
  take_screenshot: {
    url?: string;
    fullPage?: boolean;
    selector?: string;
  };
  generate_pdf: {
    url?: string;
    pageSettings?: {
      format?: 'A4' | 'Letter' | 'Legal';
      landscape?: boolean;
      margin?: {
        top?: string;
        right?: string;
        bottom?: string;
        left?: string;
      };
    };
  };
  run_script: {
    script: string;
    timeout?: number;
    url?: string;
  };
  trace_session: {
    action: 'start' | 'stop' | 'get';
    traceId?: string;
  };
}
