---
sidebar_position: 5
---

# Admin Service

Spring Boot service for administrative operations and system management.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 8085 |
| **Database** | MySQL |
| **Framework** | Spring Boot 3.x |
| **Language** | Java 21 |

## Features

- User ban/unban management
- Content moderation actions
- System configuration
- Report handling
- Bulk operations
- Admin dashboard data

## API Endpoints

```http
# User Management
GET    /api/admin/users
POST   /api/admin/users/{id}/ban
POST   /api/admin/users/{id}/unban
PUT    /api/admin/users/{id}/role

# Reports
GET    /api/admin/reports
PUT    /api/admin/reports/{id}/resolve
DELETE /api/admin/reports/{id}

# System
GET  /api/admin/stats
GET  /api/admin/config
PUT  /api/admin/config
```

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:8085/swagger-ui.html
- **OpenAPI Spec (JSON):** http://localhost:8085/v3/api-docs
- **OpenAPI Spec (YAML):** http://localhost:8085/v3/api-docs.yaml

### SpringDoc Configuration

The admin-service uses SpringDoc OpenAPI for API documentation:

```java
@OpenAPIDefinition(
    info = @Info(
        title = "QuckApp Admin Service API",
        version = "1.0.0",
        description = "Administrative operations and system management"
    ),
    servers = {
        @Server(url = "http://localhost:8085", description = "Local Development"),
        @Server(url = "https://api.quckapp.com/admin", description = "Production")
    }
)
@SecurityScheme(
    name = "bearerAuth",
    type = SecuritySchemeType.HTTP,
    scheme = "bearer",
    bearerFormat = "JWT"
)
public class OpenApiConfig { }
```

### API Tags

| Tag | Description |
|-----|-------------|
| User Management | Ban, unban, and role management |
| Reports | Content report handling and moderation |
| System | System configuration and statistics |
| Bulk Operations | Batch administrative actions |

### Security

All admin endpoints require:
- Valid JWT token with `ADMIN` role
- Rate limiting: 100 requests/minute per admin user
