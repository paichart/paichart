/**
 * Type declarations for fetch-utils
 */

/**
 * Fetch with authentication
 * @param url URL to fetch
 * @param options Fetch options
 * @returns Fetch response
 */
export function fetchWithAuth(url: string, options?: RequestInit): Promise<Response>;

/**
 * Fetch with JSON content type
 * @param url URL to fetch
 * @param options Fetch options
 * @returns Fetch response
 */
export function fetchJson(url: string, options?: RequestInit): Promise<Response>;

/**
 * Fetch with authentication and JSON content type
 * @param url URL to fetch
 * @param options Fetch options
 * @returns Fetch response
 */
export function fetchJsonWithAuth(url: string, options?: RequestInit): Promise<Response>;
