# Middleware Directory

This directory contains various middleware functions used throughout the application.

## Rate Limiting Architecture

The application uses a **dual-layer rate limiting system** for comprehensive protection:

### 1. General Request Throttling (`request-throttle.ts`)
- **Purpose**: Basic rate limiting for all routes
- **Scope**: Applied globally to all API endpoints
- **Features**:
  - Different limits for authenticated (20 req/s) vs unauthenticated (10 req/s) users
  - Route-specific multipliers:
    - LLM routes: 5x base limit
    - MCP routes: 3x base limit  
    - Template routes: 2x base limit
    - Admin routes: 1.5x base limit
  - Simple in-memory storage (consider Redis for production)
- **Configuration**:
  - `RATE_LIMIT_MAX_REQUESTS`: Base limit for unauthenticated users
  - `RATE_LIMIT_MAX_REQUESTS_AUTH`: Base limit for authenticated users
  - `RATE_LIMIT_WINDOW_MS`: Time window (default: 1 second)
  - `RATE_LIMIT_WINDOW_MS_LLM`: Time window for LLM routes (default: 5 seconds)

### 2. Enhanced API/Auth Rate Limiting (`rate-limiter-enhanced.ts`)
- **Purpose**: Specialized rate limiting for sensitive endpoints
- **Scope**: Authentication endpoints and specific API routes
- **Features**:
  - **Authentication Protection**:
    - Max 10 login attempts per 15 minutes
    - 30-minute IP blocking after limit exceeded
    - Automatic clearing on successful login
  - **API Protection**:
    - 1000 requests per minute limit
    - Configurable time windows
  - LRU cache for efficient memory management
- **Configuration**:
  - `RATE_LIMIT_API_MAX_REQUESTS`: Max API requests per window
  - `RATE_LIMIT_API_WINDOW_MS`: API time window
  - `RATE_LIMIT_AUTH_MAX_ATTEMPTS`: Max login attempts
  - `RATE_LIMIT_AUTH_WINDOW_MS`: Auth tracking window
  - `RATE_LIMIT_AUTH_BLOCK_MS`: IP block duration

## Other Middleware

- **`activity-tracker.ts`**: Tracks user activity and analytics
- **`admin.ts`**: Admin route protection and validation
- **`auth.ts`**: Authentication middleware for protected routes
- **`config.ts`**: Configuration middleware
- **`error-handler.ts`**: Global error handling

## Usage Example

```typescript
// In an API route
import { authRateLimiter } from '@/middleware/rate-limiter-enhanced';

export async function POST(request: Request) {
  // Check rate limit
  const rateLimitResponse = await authRateLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse; // 429 Too Many Requests
  }
  
  // Continue with normal processing
  // ...
}
```

## Production Considerations

1. **Storage**: Consider using Redis instead of in-memory storage for distributed systems
2. **Monitoring**: Add metrics collection for rate limit hits
3. **Customization**: Adjust limits based on actual usage patterns
4. **IP Detection**: Ensure proper IP detection behind proxies/load balancers