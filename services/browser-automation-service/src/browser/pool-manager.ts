/**
 * Browser Pool Manager
 *
 * Manages a pool of Playwright browser instances for efficient resource usage.
 * Adapted from OnDemandBrowserService patterns.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BROWSER_DEFAULTS, RATE_LIMITS, RESOURCE_LIMITS } from '../config/defaults.js';

interface BrowserInstance {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: Date;
  lastUsed: Date;
  usageCount: number;
  isAvailable: boolean;
}

interface BrowserPoolConfig {
  maxPoolSize?: number;
  idleTimeout?: number;
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
}

export class BrowserPoolManager {
  private static instance: BrowserPoolManager;
  private pool: Map<string, BrowserInstance> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private config: Required<BrowserPoolConfig>;

  private constructor(config?: BrowserPoolConfig) {
    this.config = {
      maxPoolSize: config?.maxPoolSize ?? BROWSER_DEFAULTS.maxPoolSize,
      idleTimeout: config?.idleTimeout ?? BROWSER_DEFAULTS.idleTimeout,
      headless: config?.headless ?? BROWSER_DEFAULTS.headless,
      viewport: config?.viewport ?? BROWSER_DEFAULTS.viewport,
      userAgent: config?.userAgent ?? BROWSER_DEFAULTS.userAgent
    };

    // Start cleanup interval
    this.startCleanupInterval();
  }

  static getInstance(config?: BrowserPoolConfig): BrowserPoolManager {
    if (!BrowserPoolManager.instance) {
      BrowserPoolManager.instance = new BrowserPoolManager(config);
    }
    return BrowserPoolManager.instance;
  }

  /**
   * Acquire a browser instance from the pool or create a new one
   */
  async acquire(): Promise<{ id: string; page: Page; context: BrowserContext }> {
    // Check for available browser in pool
    for (const [id, instance] of this.pool) {
      if (instance.isAvailable) {
        instance.isAvailable = false;
        instance.lastUsed = new Date();
        instance.usageCount++;
        console.log(`[BrowserPoolManager] Reusing browser instance ${id}`);
        return { id, page: instance.page, context: instance.context };
      }
    }

    // Create new browser if pool not at capacity
    if (this.pool.size < this.config.maxPoolSize) {
      return await this.createBrowser();
    }

    // Wait for an available browser
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for available browser'));
      }, 30000);

      const checkAvailable = setInterval(() => {
        for (const [id, instance] of this.pool) {
          if (instance.isAvailable) {
            clearInterval(checkAvailable);
            clearTimeout(timeout);
            instance.isAvailable = false;
            instance.lastUsed = new Date();
            instance.usageCount++;
            resolve({ id, page: instance.page, context: instance.context });
            return;
          }
        }
      }, 100);
    });
  }

  /**
   * Release a browser instance back to the pool
   */
  async release(id: string): Promise<void> {
    const instance = this.pool.get(id);
    if (instance) {
      instance.isAvailable = true;
      instance.lastUsed = new Date();

      // Clear page state for reuse
      try {
        await instance.page.goto('about:blank');
      } catch (error) {
        console.warn(`[BrowserPoolManager] Error resetting page for ${id}:`, error);
      }

      console.log(`[BrowserPoolManager] Released browser instance ${id}`);
    }
  }

  /**
   * Create a new browser instance
   */
  private async createBrowser(): Promise<{ id: string; page: Page; context: BrowserContext }> {
    const id = `browser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[BrowserPoolManager] Creating new browser instance ${id}`);

    const browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    });

    const context = await browser.newContext({
      viewport: this.config.viewport,
      userAgent: this.config.userAgent,
      ignoreHTTPSErrors: true
    });

    const page = await context.newPage();

    const instance: BrowserInstance = {
      id,
      browser,
      context,
      page,
      createdAt: new Date(),
      lastUsed: new Date(),
      usageCount: 1,
      isAvailable: false
    };

    this.pool.set(id, instance);
    console.log(`[BrowserPoolManager] Created browser instance ${id}. Pool size: ${this.pool.size}`);

    return { id, page, context };
  }

  /**
   * Close a specific browser instance
   */
  async closeBrowser(id: string): Promise<void> {
    const instance = this.pool.get(id);
    if (instance) {
      try {
        await instance.context.close();
        await instance.browser.close();
      } catch (error) {
        console.warn(`[BrowserPoolManager] Error closing browser ${id}:`, error);
      }
      this.pool.delete(id);
      console.log(`[BrowserPoolManager] Closed browser instance ${id}. Pool size: ${this.pool.size}`);
    }
  }

  /**
   * Start the idle browser cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleBrowsers();
    }, 60000); // Check every minute
  }

  /**
   * Clean up idle browsers that have exceeded the idle timeout
   */
  private async cleanupIdleBrowsers(): Promise<void> {
    const now = Date.now();
    const toClose: string[] = [];

    for (const [id, instance] of this.pool) {
      if (instance.isAvailable) {
        const idleTime = now - instance.lastUsed.getTime();
        if (idleTime > this.config.idleTimeout) {
          toClose.push(id);
        }
      }
    }

    for (const id of toClose) {
      console.log(`[BrowserPoolManager] Cleaning up idle browser ${id}`);
      await this.closeBrowser(id);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    poolSize: number;
    available: number;
    inUse: number;
    maxPoolSize: number;
  } {
    let available = 0;
    for (const instance of this.pool.values()) {
      if (instance.isAvailable) available++;
    }

    return {
      poolSize: this.pool.size,
      available,
      inUse: this.pool.size - available,
      maxPoolSize: this.config.maxPoolSize
    };
  }

  /**
   * Shutdown the pool manager
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const id of this.pool.keys()) {
      await this.closeBrowser(id);
    }

    console.log('[BrowserPoolManager] Shutdown complete');
  }
}

export default BrowserPoolManager;
