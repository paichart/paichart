/**
 * Utility functions for fetch operations
 */

/**
 * Fetch with authentication
 * @param url URL to fetch
 * @param options Fetch options
 * @returns Fetch response
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  // Get the authentication token from localStorage or cookies
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  
  // Add the token to the headers if it exists
  const headers = {
    ...options.headers,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
  
  // Return the fetch with the updated headers
  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Fetch with JSON content type
 * @param url URL to fetch
 * @param options Fetch options
 * @returns Fetch response
 */
export async function fetchJson(url: string, options: RequestInit = {}): Promise<Response> {
  // Add the content type header
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  // Return the fetch with the updated headers
  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Fetch with authentication and JSON content type
 * @param url URL to fetch
 * @param options Fetch options
 * @returns Fetch response
 */
export async function fetchJsonWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  // Get the authentication token from localStorage or cookies
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  
  // Add the token and content type to the headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
  
  // Return the fetch with the updated headers
  return fetch(url, {
    ...options,
    headers,
  });
}
