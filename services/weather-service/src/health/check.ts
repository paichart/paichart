import { weatherClient } from '../client/openweather-client.js';

export async function checkHealth() {
  const cacheStats = weatherClient.getCacheStats();
  const hasApiKey = !!process.env.OPENWEATHER_API_KEY;

  // Determine overall health status
  let status: 'healthy' | 'degraded' | 'unhealthy';
  const issues: string[] = [];

  if (!hasApiKey) {
    status = 'unhealthy';
    issues.push('OPENWEATHER_API_KEY not configured');
  } else {
    status = 'healthy';
  }

  return {
    status,
    service: 'weather-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    cache: {
      size: cacheStats.size,
      enabled: true,
      ttl: '10 minutes'
    },
    apiKey: hasApiKey ? 'configured' : 'missing',
    issues: issues.length > 0 ? issues : undefined
  };
}
