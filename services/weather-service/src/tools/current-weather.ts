import { z } from 'zod';
import { weatherClient } from '../client/openweather-client.js';

export const currentWeatherSchema = z.object({
  location: z.string().describe('City name, country code (e.g., "London,UK", "New York,US")'),
  units: z.enum(['metric', 'imperial']).optional().default('metric')
    .describe('Temperature units: metric (Celsius) or imperial (Fahrenheit)')
});

export async function getCurrentWeather(args: z.infer<typeof currentWeatherSchema>) {
  try {
    const weather = await weatherClient.getCurrentWeather(args.location, args.units);

    const tempUnit = args.units === 'metric' ? '°C' : '°F';
    const windUnit = args.units === 'metric' ? 'm/s' : 'mph';

    return {
      success: true,
      data: weather,
      summary: `${weather.location}: ${weather.temperature}${tempUnit}, ${weather.description}. Feels like ${weather.feelsLike}${tempUnit}. Humidity: ${weather.humidity}%. Wind: ${weather.windSpeed}${windUnit}.`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}
