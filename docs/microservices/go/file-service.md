---
sidebar_position: 8
---

# File Service

Go service for file storage and management.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5002 |
| **Database** | MongoDB |
| **Framework** | Gin |
| **Language** | Go 1.21 |

## Features

- Multi-part uploads
- S3/Azure Blob integration
- Virus scanning
- File versioning
- Access control

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5002/swagger/index.html
- **OpenAPI Spec:** http://localhost:5002/swagger/doc.json

### Swag Configuration

The file-service uses [swaggo/swag](https://github.com/swaggo/swag) for OpenAPI documentation:

```go
// @title QuckApp File Service API
// @version 1.0.0
// @description File storage and management service
// @host localhost:5002
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
| Files | File upload, download, and management |
| Versions | File versioning operations |
| Access | File access control and sharing |

### Security

- **Authentication:** JWT Bearer token via `Authorization` header
- **Virus Scanning:** All uploads scanned before storage
- **Access Control:** File-level permissions
