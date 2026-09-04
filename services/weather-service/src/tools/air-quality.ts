import { z } from 'zod';
import { weatherClient } from '../client/openweather-client.js';

export const airQualitySchema = z.object({
  location: z.string().describe('City name, country code')
});

export async function getAirQuality(args: z.infer<typeof airQualitySchema>) {
  try {
    const aqi = await weatherClient.getAirQuality(args.location);

    return {
      success: true,
      data: aqi,
      summary: `Air Quality in ${args.location}: ${aqi.category} (AQI: ${aqi.aqi}/5). ` +
        `PM2.5: ${aqi.components.pm2_5.toFixed(1)} μg/m³, PM10: ${aqi.components.pm10.toFixed(1)} μg/m³`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}
