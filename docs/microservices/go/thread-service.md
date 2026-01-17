---
sidebar_position: 4
---

# Thread Service

Go service for thread conversations.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5009 |
| **Database** | MySQL |
| **Framework** | Gin |
| **Language** | Go 1.21 |

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5009/swagger/index.html
- **OpenAPI Spec:** http://localhost:5009/swagger/doc.json

### Swag Configuration

The thread-service uses [swaggo/swag](https://github.com/swaggo/swag) for OpenAPI documentation:

```go
// @title QuckApp Thread Service API
// @version 1.0.0
// @description Thread conversations and replies management
// @host localhost:5009
// @BasePath /api
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
| Threads | Thread CRUD operations |
| Replies | Thread reply management |
| Subscriptions | Thread subscription and notifications |

### Security

- **Authentication:** JWT Bearer token via `Authorization` header
