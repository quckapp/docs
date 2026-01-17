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

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:3000/api/docs
- **OpenAPI Spec:** Available via Swagger UI export

### Swagger Configuration

The backend-gateway uses `@nestjs/swagger` with comprehensive configuration in `main.ts`:

```typescript
const swaggerConfig = new DocumentBuilder()
  .setTitle('QuickChat API')
  .setDescription('QuickChat Backend API Documentation')
  .setVersion('1.0')
  .addBearerAuth(
    {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'JWT',
      description: 'Enter JWT token',
      in: 'header',
    },
    'JWT-auth',
  )
  .addTag('Auth', 'Authentication and authorization endpoints')
  .addTag('Users', 'User management endpoints')
  .addTag('Conversations', 'Conversation management endpoints')
  .addTag('Messages', 'Messaging endpoints')
  .addTag('Calls', 'Voice and video call endpoints')
  .addTag('Notifications', 'Push notification endpoints')
  .addTag('Media', 'File upload and media endpoints')
  .build();

SwaggerModule.setup('api/docs', app, document, {
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'none',
    filter: true,
    showRequestDuration: true,
  },
});
```

### Security Scheme

| Scheme | Type | Format | Description |
|--------|------|--------|-------------|
| `JWT-auth` | Bearer | JWT | JWT token authentication via Authorization header |

### API Tags

| Tag | Description |
|-----|-------------|
| Auth | Authentication and authorization endpoints |
| Users | User management endpoints |
| Conversations | Conversation management endpoints |
| Messages | Messaging endpoints |
| Calls | Voice and video call endpoints |
| Notifications | Push notification endpoints |
| Media | File upload and media endpoints |
| Status | User status/stories endpoints |
| Communities | Community management endpoints |
| Admin | Administrative endpoints |
| Health | Health check endpoints |

### Swagger UI Features

- **Persist Authorization** - JWT tokens are saved across page refreshes
- **Filter** - Search and filter endpoints by name
- **Request Duration** - Shows timing for API calls
- **Syntax Highlighting** - Monokai theme for code blocks
- **Try It Out** - Interactive API testing directly from the browser
