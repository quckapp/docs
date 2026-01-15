---
sidebar_position: 1
---

# API Reference

QuckApp provides REST, WebSocket, and gRPC APIs for client integration.

## Base URLs

| Environment | URL |
|------------|-----|
| Development | `http://localhost:3000` |
| Staging | `https://api.staging.QuckApp.dev` |
| Production | `https://api.QuckApp.dev` |

## Authentication

All API requests require authentication via JWT Bearer token:

```http
Authorization: Bearer <access_token>
```

### Obtaining Tokens

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",
  "refreshToken": "dGhpcyBpcyBhIHJlZnJl...",
  "expiresIn": 900
}
```

## API Versioning

API version is included in the URL path:

```
/api/v1/users
/api/v1/workspaces
/api/v1/channels
```

## Rate Limiting

| Endpoint Type | Limit |
|--------------|-------|
| General API | 100 requests/15 min |
| Authentication | 10 requests/15 min |
| OTP/SMS | 5 requests/hour |
| File Upload | 50 requests/hour |

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699900000
```

## Response Format

### Success Response

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### Error Response

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

## API Categories

- [REST API](./rest) - Standard HTTP endpoints
- [WebSocket API](./websocket) - Real-time events
- [gRPC API](./grpc) - High-performance RPC
