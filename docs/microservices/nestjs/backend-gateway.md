---
sidebar_position: 1
---

# Backend Gateway

NestJS API Gateway for request routing, authentication, and response aggregation.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3000 |
| **Database** | PostgreSQL |
| **Framework** | NestJS 10.x |
| **Language** | TypeScript |

## Features

- API routing to microservices
- JWT validation
- Rate limiting
- Request/response logging
- Response aggregation
- Swagger/OpenAPI documentation

## Routing Configuration

```typescript
// Service routing
const routes = {
  '/api/auth/*': 'http://auth-service:8081',
  '/api/users/*': 'http://user-service:8082',
  '/api/workspaces/*': 'http://workspace-service:5004',
  '/api/channels/*': 'http://channel-service:5005',
  '/api/messages/*': 'http://message-service:4003',
  '/api/presence/*': 'http://presence-service:4001',
};
```

## Middleware Stack

```typescript
app.use(helmet());
app.use(cors(corsConfig));
app.use(rateLimiter);
app.use(requestLogger);
app.use(jwtValidator);
```
