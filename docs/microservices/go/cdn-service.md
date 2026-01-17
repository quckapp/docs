---
sidebar_position: 10
---

# CDN Service

Go service for content delivery and caching.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5013 |
| **Database** | MongoDB |
| **Framework** | Gin |
| **Language** | Go 1.21 |

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5013/swagger/index.html
- **OpenAPI Spec:** http://localhost:5013/swagger/doc.json

### Swag Configuration

The cdn-service uses [swaggo/swag](https://github.com/swaggo/swag) for OpenAPI documentation:

```go
// @title QuckApp CDN Service API
// @version 1.0.0
// @description Content delivery and caching service
// @host localhost:5013
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
| Content | Content delivery endpoints |
| Cache | Cache management and invalidation |

### Security

- **Authentication:** JWT Bearer token or signed URLs
- **Edge Caching:** CDN-level caching with TTL control
