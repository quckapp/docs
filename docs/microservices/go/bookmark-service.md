---
sidebar_position: 5
---

# Bookmark Service

Go service for saved items and pins.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5010 |
| **Database** | MySQL |
| **Framework** | Gin |
| **Language** | Go 1.21 |

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5010/swagger/index.html
- **OpenAPI Spec:** http://localhost:5010/swagger/doc.json

### Swag Configuration

The bookmark-service uses [swaggo/swag](https://github.com/swaggo/swag) for OpenAPI documentation:

```go
// @title QuckApp Bookmark Service API
// @version 1.0.0
// @description Saved items and pins management
// @host localhost:5010
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
| Bookmarks | Bookmark CRUD operations |
| Pins | Pinned items management |
| Collections | Bookmark collections/folders |

### Security

- **Authentication:** JWT Bearer token via `Authorization` header
