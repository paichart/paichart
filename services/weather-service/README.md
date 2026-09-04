# Weather Service - MCP Server

Multi-source weather data service with caching for the pAIchart MCP Hub.

## Features

- ✅ **Current Weather** - Real-time conditions, temperature, humidity, wind
- ✅ **5-Day Forecast** - Daily forecasts with temperature ranges
- ✅ **24-Hour Forecast** - Hourly forecasts with 3-hour intervals
- ✅ **Air Quality** - AQI and pollution components (PM2.5, PM10, etc.)
- ✅ **Smart Caching** - 10-minute cache for weather data, 24-hour for geocoding
- ✅ **SSE Transport** - Native MCP SDK 1.17.5 integration

## API Provider

**OpenWeatherMap Free Tier**:
- 60 calls/minute
- 1,000,000 calls/month
- Current weather ✅
- 5-day forecast ✅
- Air quality ✅

## Installation

```bash
cd services/weather-service
npm install
```

## Configuration

Create `.env` file:

```bash
WEATHER_SERVICE_PORT=3102
OPENWEATHER_API_KEY=your_key_here
```

Get API key: https://openweathermap.org/api

## Development

```bash
npm run dev
```

## Production Build

```bash
npm run build
npm start
```

## Docker

```bash
# Build
docker build -t weather-service .

# Run
docker run -p 3102:3102 \
  -e OPENWEATHER_API_KEY=your_key \
  weather-service
```

## Health Check

```bash
curl http://localhost:3102/health
```

## Tools

### current_weather

Get current weather conditions.

```javascript
{
  "location": "Sydney,AU",
  "units": "metric"  // or "imperial"
}
```

### forecast

Get 5-day weather forecast.

```javascript
{
  "location": "Melbourne,AU",
  "days": 5,
  "units": "metric"
}
```

### hourly_forecast

Get 24-hour forecast with 3-hour intervals.

```javascript
{
  "location": "Brisbane,AU",
  "units": "metric"
}
```

### air_quality

Get air quality index and pollution data.

```javascript
{
  "location": "Perth,AU"
}
```

## Cache Stats

```bash
curl http://localhost:3102/cache/stats
```

## Integration with MCP Hub

The service is automatically discovered by the MCP Hub via:
- `TRUSTED_INTERNAL_SERVICES` in `service-call-policy.js`
- SSE transport on `localhost:3102`

## Architecture

```
AI Agent → MCP Hub → call_service → Weather Service → OpenWeatherMap API
                                            ↓
                                       Cache (10min TTL)
```

## Security

- ✅ Localhost-only binding (127.0.0.1)
- ✅ Non-root container user
- ✅ Read-only filesystem
- ✅ Resource limits (0.5 CPU, 256MB RAM)
- ✅ API key via environment variable

## Performance

- **Cache Hit Rate**: ~80% (10-minute TTL)
- **Typical Latency**: 50-200ms (cached), 500-1000ms (API call)
- **API Calls**: ~100-200/day with caching

## License

MIT
