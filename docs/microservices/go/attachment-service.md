---
sidebar_position: 9
---

# Attachment Service

Go service for message attachments.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5012 |
| **Database** | MongoDB |
| **Framework** | Gin |
| **Language** | Go 1.21 |

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5012/swagger/index.html
- **OpenAPI Spec:** http://localhost:5012/swagger/doc.json

### Swag Configuration

The attachment-service uses [swaggo/swag](https://github.com/swaggo/swag) for OpenAPI documentation:

```go
// @title QuckApp Attachment Service API
// @version 1.0.0
// @description Message attachments management
// @host localhost:5012
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
| Attachments | Attachment upload and retrieval |
| Messages | Message attachment linking |

### Security

- **Authentication:** JWT Bearer token via `Authorization` header
