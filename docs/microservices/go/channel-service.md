---
sidebar_position: 2
---

# Channel Service

Go service for channel management and memberships.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5005 |
| **Database** | MySQL |
| **Framework** | Gin |
| **Language** | Go 1.21 |

## API Endpoints

```http
GET    /api/v1/channels
POST   /api/v1/channels
GET    /api/v1/channels/{id}
PUT    /api/v1/channels/{id}
DELETE /api/v1/channels/{id}
GET    /api/v1/channels/{id}/members
POST   /api/v1/channels/{id}/join
POST   /api/v1/channels/{id}/leave
```

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5005/swagger/index.html
- **OpenAPI Spec:** http://localhost:5005/swagger/doc.json

### Swag Configuration

The channel-service uses [swaggo/swag](https://github.com/swaggo/swag) for OpenAPI documentation:

```go
// @title QuckApp Channel Service API
// @version 1.0.0
// @description Channel management and memberships service
// @host localhost:5005
// @BasePath /api/v1
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
func main() {
    // ...
}
```

### API Tags

| Tag | Description |
|-----|-------------|
| Channels | Channel CRUD operations |
| Members | Channel membership management |
| Settings | Channel settings and permissions |

### Security

- **Authentication:** JWT Bearer token via `Authorization` header
- **Authorization:** Channel-level permissions for private channels
