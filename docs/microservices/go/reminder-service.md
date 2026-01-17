---
sidebar_position: 6
---

# Reminder Service

Go service for scheduled reminders.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5011 |
| **Database** | MySQL |
| **Framework** | Gin |
| **Language** | Go 1.21 |

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5011/swagger/index.html
- **OpenAPI Spec:** http://localhost:5011/swagger/doc.json

### Swag Configuration

The reminder-service uses [swaggo/swag](https://github.com/swaggo/swag) for OpenAPI documentation:

```go
// @title QuckApp Reminder Service API
// @version 1.0.0
// @description Scheduled reminders and notifications
// @host localhost:5011
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
| Reminders | Reminder CRUD operations |
| Schedule | Scheduling and recurrence |

### Security

- **Authentication:** JWT Bearer token via `Authorization` header
