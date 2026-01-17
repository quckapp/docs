---
sidebar_position: 7
---

# Media Service

Go service for media processing and transcoding.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5001 |
| **Database** | MongoDB |
| **Framework** | Gin |
| **Language** | Go 1.21 |

## Features

- Image resizing/compression
- Video transcoding
- Thumbnail generation
- Format conversion
- Metadata extraction

## API Endpoints

```http
POST /api/media/upload
GET  /api/media/{id}
GET  /api/media/{id}/thumbnail
DELETE /api/media/{id}
```

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5001/swagger/index.html
- **OpenAPI Spec:** http://localhost:5001/swagger/doc.json

### Swag Configuration

The media-service uses [swaggo/swag](https://github.com/swaggo/swag) for OpenAPI documentation:

```go
// @title QuckApp Media Service API
// @version 1.0.0
// @description Media processing and transcoding service
// @host localhost:5001
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
| Media | Media upload and retrieval |
| Thumbnails | Thumbnail generation |
| Processing | Media transcoding and conversion |

### Security

- **Authentication:** JWT Bearer token via `Authorization` header
- **File Validation:** Virus scanning and file type validation
