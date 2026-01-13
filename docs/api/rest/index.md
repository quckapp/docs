---
sidebar_position: 1
---

# REST API

QuikApp provides a comprehensive REST API for all platform operations.

## Base URL

```
https://api.QuikApp.dev/api/v1
```

## Authentication

All API requests require authentication via Bearer token:

```http
Authorization: Bearer <access_token>
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| [Authentication](./authentication) | Login, register, token refresh |
| [Users](./users) | User management and profiles |
| [Workspaces](./workspaces) | Workspace CRUD operations |
| [Channels](./channels) | Channel management |
| [Messages](./messages) | Messaging operations |
| [Calls](./calls) | Voice/video call management |
| [Files](./files) | File upload and management |
| [Search](./search) | Global search functionality |
| [Notifications](./notifications) | Notification preferences |
| [**Realtime**](./realtime) | Realtime service (presence, devices, signaling, recording) |

## Response Format

All responses follow a consistent format:

```json
{
  "success": true,
  "data": { },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req-uuid"
  }
}
```

## Error Responses

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": []
  }
}
```

## Rate Limiting

| Endpoint Type | Rate Limit |
|---------------|------------|
| General API | 100 requests/second |
| Authentication | 10 requests/second |
| File Upload | 5 requests/second |

Rate limit headers are included in all responses:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705312200
```
