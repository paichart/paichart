/**
 * OpenWeatherMap API Client
 * Free tier: 60 calls/min, 1M calls/month
 * Docs: https://openweathermap.org/api
 */

import fetch from 'node-fetch';
import https from 'https';

const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const GEO_URL = 'https://api.openweathermap.org/geo/1.0';
// Hardening (2026-05-28): every upstream call is now bounded by a timeout, retried
// on transient errors, and uses a non-keep-alive agent. Previously these fetch()
// calls had NO timeout at all — a hung request would wait indefinitely until the
// Hub's 30s per-step ceiling, with no retry. REQUEST_TIMEOUT sits well under that
// ceiling so a transient hang fails fast with room for the retry to finish.
const REQUEST_TIMEOUT = 15000;
const MAX_RETRIES = 3;
// keepAlive:false avoids reuse of a connection idled-out by the upstream/NAT
// (the stale-socket-after-idle failure mode). Negligible cost for low volume.
const httpsAgent = new https.Agent({ keepAlive: false });

export interface CurrentWeather {
  location: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  windDirection: number;
  conditions: string;
  description: string;
  icon: string;
  timestamp: number;
}

export interface ForecastDay {
  date: string;
  tempMin: number;
  tempMax: number;
  conditions: string;
  description: string;
  precipitation: number;
  humidity: number;
  windSpeed: number;
}

export interface HourlyForecast {
  time: string;
  temperature: number;
  feelsLike: number;
  conditions: string;
  precipitation: number;
  windSpeed: number;
}

export interface AirQuality {
  aqi: number;
  category: string;
  components: {
    co: number;
    no: number;
    no2: number;
    o3: number;
    so2: number;
    pm2_5: number;
    pm10: number;
    nh3: number;
  };
}

export class OpenWeatherClient {
  private cache = new Map<string, { data: any; expiry: number }>();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Geocode location name to coordinates
   */
  private async geocode(location: string): Promise<{ lat: number; lon: number; name: string }> {
    const cacheKey = `geo:${location}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const results = await this.fetchJson<any[]>(
      `${GEO_URL}/direct?q=${encodeURIComponent(location)}&limit=1&appid=${API_KEY}`,
      'geocode'
    );
    if (results.length === 0) {
      throw new Error(`Location not found: ${location}`);
    }

    const coords = {
      lat: results[0].lat,
      lon: results[0].lon,
      name: results[0].name
    };
    this.setCache(cacheKey, coords, 24 * 60 * 60 * 1000); // Cache for 24h
    return coords;
  }

  /**
   * Get current weather for a location
   */
  async getCurrentWeather(location: string, units: 'metric' | 'imperial' = 'metric'): Promise<CurrentWeather> {
    if (!API_KEY) {
      throw new Error('OPENWEATHER_API_KEY environment variable not set');
    }

    const { lat, lon, name } = await this.geocode(location);
    const cacheKey = `current:${lat},${lon}:${units}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const data = await this.fetchJson<any>(
      `${BASE_URL}/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`,
      'current-weather'
    );

    const weather: CurrentWeather = {
      location: name,
      temperature: data.main.temp,
      feelsLike: data.main.feels_like,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      windSpeed: data.wind.speed,
      windDirection: data.wind.deg,
      conditions: data.weather[0].main,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      timestamp: data.dt
    };

    this.setCache(cacheKey, weather);
    return weather;
  }

  /**
   * Get 5-day forecast
   */
  async getForecast(location: string, days: number = 5, units: 'metric' | 'imperial' = 'metric'): Promise<ForecastDay[]> {
    if (!API_KEY) {
      throw new Error('OPENWEATHER_API_KEY environment variable not set');
    }

    const { lat, lon } = await this.geocode(location);
    const cacheKey = `forecast:${lat},${lon}:${units}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached.slice(0, days);

    const data = await this.fetchJson<any>(
      `${BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`,
      'forecast'
    );

    // Group by day (forecast is 3-hour intervals)
    const dailyMap = new Map<string, any[]>();
    for (const item of data.list) {
      const date = new Date(item.dt * 1000).toISOString().split('T')[0];
      if (!dailyMap.has(date)) {
        dailyMap.set(date, []);
      }
      dailyMap.get(date)!.push(item);
    }

    const forecast: ForecastDay[] = Array.from(dailyMap.entries()).map(([date, items]) => {
      const temps = items.map(i => i.main.temp);
      const precipitation = items.reduce((sum, i) => sum + (i.rain?.['3h'] || 0), 0);

      return {
        date,
        tempMin: Math.min(...temps),
        tempMax: Math.max(...temps),
        conditions: items[0].weather[0].main,
        description: items[0].weather[0].description,
        precipitation,
        humidity: items[0].main.humidity,
        windSpeed: items[0].wind.speed
      };
    });

    this.setCache(cacheKey, forecast);
    return forecast.slice(0, days);
  }

  /**
   * Get 24-hour hourly forecast
   */
  async getHourlyForecast(location: string, units: 'metric' | 'imperial' = 'metric'): Promise<HourlyForecast[]> {
    if (!API_KEY) {
      throw new Error('OPENWEATHER_API_KEY environment variable not set');
    }

    const { lat, lon } = await this.geocode(location);
    const cacheKey = `hourly:${lat},${lon}:${units}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const data = await this.fetchJson<any>(
      `${BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`,
      'hourly-forecast'
    );

    // Take first 8 entries (3-hour intervals = 24 hours)
    const hourly: HourlyForecast[] = data.list.slice(0, 8).map((item: any) => ({
      time: new Date(item.dt * 1000).toISOString(),
      temperature: item.main.temp,
      feelsLike: item.main.feels_like,
      conditions: item.weather[0].main,
      precipitation: item.rain?.['3h'] || 0,
      windSpeed: item.wind.speed
    }));

    this.setCache(cacheKey, hourly);
    return hourly;
  }

  /**
   * Get air quality index
   */
  async getAirQuality(location: string): Promise<AirQuality> {
    if (!API_KEY) {
      throw new Error('OPENWEATHER_API_KEY environment variable not set');
    }

    const { lat, lon } = await this.geocode(location);
    const cacheKey = `aqi:${lat},${lon}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const data = await this.fetchJson<any>(
      `${BASE_URL}/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`,
      'air-quality'
    );
    const pollution = data.list[0];

    const aqiCategories = ['Good', 'Fair', 'Moderate', 'Poor', 'Very Poor'];

    const airQuality: AirQuality = {
      aqi: pollution.main.aqi,
      category: aqiCategories[pollution.main.aqi - 1] || 'Unknown',
      components: pollution.components
    };

    this.setCache(cacheKey, airQuality);
    return airQuality;
  }

  /**
   * Bounded, retrying JSON fetch (2026-05-28 hardening).
   * - AbortController timeout below the Hub's per-step ceiling
   * - retry on transient network/timeout/5xx errors (fresh, non-keep-alive socket)
   * - per-call latency logging (these calls were previously silent)
   */
  private async fetchJson<T = any>(url: string, label: string): Promise<T> {
    let lastErr: any;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch(url, { signal: controller.signal as any, agent: httpsAgent });
        if (!response.ok) {
          const retryableStatus = response.status >= 500 || response.status === 429;
          if (retryableStatus && attempt < MAX_RETRIES) {
            throw Object.assign(new Error(`${label}: ${response.status} ${response.statusText}`), { __retryable: true });
          }
          throw new Error(`${label} failed: ${response.statusText}`);
        }
        const data = await response.json() as T;
        console.log(`[WeatherService] upstream OK ${label} ${Date.now() - startedAt}ms`);
        return data;
      } catch (error: any) {
        const isTransient = error.__retryable === true
          || error.name === 'AbortError'
          || error.type === 'aborted'   // node-fetch abort
          || error.type === 'system'    // node-fetch network error
          || ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.code || '');
        if (isTransient && attempt < MAX_RETRIES) {
          lastErr = error;
          console.error(`[WeatherService] upstream RETRY ${label} attempt ${attempt + 1} after ${Date.now() - startedAt}ms: ${error.code || error.name || ''} ${error.message}`);
          await new Promise(r => setTimeout(r, 1000 * (2 ** attempt)));
          continue;
        }
        console.error(`[WeatherService] upstream FAILED ${label} after ${Date.now() - startedAt}ms: ${error.code || error.name || ''} ${error.message}`);
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  }

  // Cache utilities
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }
    return cached.data;
  }

  private setCache(key: string, data: any, ttl: number = this.CACHE_TTL): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl
    });
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

export const weatherClient = new OpenWeatherClient();
