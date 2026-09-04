/**
 * Server Configuration Store
 * Persists MCP server configurations separately from their runtime state
 */

import { MCPServerConfig } from '../llm/mcp-integration';
import fs from 'fs/promises';
import path from 'path';
import { mcpLogger } from '@/lib/logger';

export class ServerConfigStore {
  private configPath: string;
  private configs: Map<string, MCPServerConfig> = new Map();
  private isLoaded: boolean = false;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), '.mcp-servers.json');
  }

  async load(): Promise<void> {
    mcpLogger.debug({ configPath: this.configPath }, 'loading server configurations');
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(data);

      if (parsed.servers && Array.isArray(parsed.servers)) {
        this.configs.clear();
        for (const config of parsed.servers) {
          this.configs.set(config.name, config);
        }
      } else {
        mcpLogger.warn('invalid config file format, missing servers array');
      }

      mcpLogger.info({ serverCount: this.configs.size }, 'loaded server configurations');
      this.isLoaded = true;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        mcpLogger.debug('no config file found, starting with empty configuration');
        // Don't create empty file - just start with empty config
        this.isLoaded = true;
        // DO NOT call save() here - this overwrites existing files!
      } else {
        mcpLogger.error({ err: error }, 'error loading configurations');
        // Don't set isLoaded = true on parse errors
      }
    }
  }

  async save(): Promise<void> {
    // Don't save if we haven't loaded yet to prevent overwriting with empty data
    if (!this.isLoaded) {
      mcpLogger.warn('attempted to save before loading, skipping to prevent data loss');
      return;
    }
    
    try {
      // Never write an empty servers array — prevents race-condition data loss on shutdown
      if (this.configs.size === 0) {
        mcpLogger.warn('skipping save: configs is empty (prevents emptying file on disk)');
        return;
      }

      const data = {
        version: '1.0',
        servers: Array.from(this.configs.values())
      };

      await fs.writeFile(this.configPath, JSON.stringify(data, null, 2));
      mcpLogger.debug({ serverCount: this.configs.size }, 'saved server configurations');
    } catch (error) {
      mcpLogger.error({ err: error }, 'error saving configurations');
      throw error;
    }
  }

  async add(config: MCPServerConfig): Promise<void> {
    this.configs.set(config.name, config);
    await this.save();
  }

  async remove(name: string): Promise<void> {
    this.configs.delete(name);
    await this.save();
  }

  async update(name: string, config: MCPServerConfig): Promise<void> {
    if (this.configs.has(name)) {
      this.configs.set(name, config);
      await this.save();
    }
  }

  get(name: string): MCPServerConfig | undefined {
    return this.configs.get(name);
  }

  getAll(): MCPServerConfig[] {
    return Array.from(this.configs.values());
  }

  has(name: string): boolean {
    return this.configs.has(name);
  }
}

// Singleton instance
export const serverConfigStore = new ServerConfigStore();