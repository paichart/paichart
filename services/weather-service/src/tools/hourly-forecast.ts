import { z } from 'zod';
import { weatherClient } from '../client/openweather-client.js';

export const hourlyForecastSchema = z.object({
  location: z.string().describe('City name, country code'),
  units: z.enum(['metric', 'imperial']).optional().default('metric')
});

export async function getHourlyForecast(args: z.infer<typeof hourlyForecastSchema>) {
  try {
    const hourly = await weatherClient.getHourlyForecast(args.location, args.units);

    const tempUnit = args.units === 'metric' ? '°C' : '°F';

    return {
      success: true,
      data: hourly,
      summary: `24-hour forecast for ${args.location} (3-hour intervals):\n` +
        hourly.map(h => {
          const time = new Date(h.time).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            hour12: true
          });
          return `${time}: ${h.temperature}${tempUnit}, ${h.conditions}`;
        }).join('\n')
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}
