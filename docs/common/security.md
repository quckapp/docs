---
sidebar_position: 2
---

# Security Configuration

Centralized security settings for helmet, CORS, and rate limiting.

## Location

`backend/src/common/security/`

## Helmet Configuration

```typescript
export function getHelmetConfig(isDevelopment: boolean): HelmetOptions {
  const useHttps = process.env.USE_HTTPS === 'true';

  return {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: useHttps ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    } : false,
    noSniff: true,
    xssFilter: true,
  };
}
```

## CORS Configuration

```typescript
export function getCorsConfig(
  allowedOrigins: string | string[],
  isDevelopment: boolean,
): CorsOptions {
  return {
    origin: (origin, callback) => {
      if (!origin || isDevelopment) {
        callback(null, true);
        return;
      }
      // Check allowed origins
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
      'X-Device-Id',
    ],
    credentials: true,
    maxAge: 86400,
  };
}
```

## Rate Limiting

```typescript
export function getRateLimitConfig(isDevelopment: boolean) {
  return {
    api: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: isDevelopment ? 1000 : 100,
    },
    auth: {
      windowMs: 15 * 60 * 1000,
      max: isDevelopment ? 100 : 10,
    },
    otp: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: isDevelopment ? 20 : 5,
    },
  };
}
```
