import { z } from 'zod';
import { weatherClient } from '../client/openweather-client.js';

export const forecastSchema = z.object({
  location: z.string().describe('City name, country code'),
  days: z.number().min(1).max(5).optional().default(5)
    .describe('Number of days to forecast (1-5)'),
  units: z.enum(['metric', 'imperial']).optional().default('metric')
});

export async function getForecast(args: z.infer<typeof forecastSchema>) {
  try {
    const forecast = await weatherClient.getForecast(args.location, args.days, args.units);

    const tempUnit = args.units === 'metric' ? '°C' : '°F';

    return {
      success: true,
      data: forecast,
      summary: `${args.days}-day forecast for ${args.location}:\n` +
        forecast.map(day =>
          `${day.date}: ${day.tempMin}-${day.tempMax}${tempUnit}, ${day.description}`
        ).join('\n')
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}
