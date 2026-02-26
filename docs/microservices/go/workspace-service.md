---
sidebar_position: 1
---

# Workspace Service

Go service for workspace management and settings.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5004 |
| **Database** | MySQL |
| **Framework** | Gin |
| **Language** | Go 1.21 |

## Features

- Workspace CRUD
- Member management
- Workspace settings
- Invitation system
- Billing integration

## API Endpoints

```http
GET    /api/v1/workspaces
POST   /api/v1/workspaces
GET    /api/v1/workspaces/{id}
PUT    /api/v1/workspaces/{id}
DELETE /api/v1/workspaces/{id}
GET    /api/v1/workspaces/{id}/members
POST   /api/v1/workspaces/{id}/members
DELETE /api/v1/workspaces/{id}/members/{userId}
POST   /api/v1/workspaces/{id}/invite
```

## Data Model

```go
type Workspace struct {
    ID          string    `json:"id" gorm:"primaryKey"`
    Name        string    `json:"name"`
    Slug        string    `json:"slug" gorm:"uniqueIndex"`
    Description string    `json:"description"`
    IconURL     string    `json:"iconUrl"`
    OwnerID     string    `json:"ownerId"`
    Plan        string    `json:"plan" gorm:"default:free"`
    CreatedAt   time.Time `json:"createdAt"`
    UpdatedAt   time.Time `json:"updatedAt"`
}
```

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5004/swagger/index.html
- **OpenAPI Spec:** http://localhost:5004/swagger/doc.json

### Swag Configuration

The workspace-service uses [swaggo/swag](https://github.com/swaggo/swag) for OpenAPI documentation:

```go
// @title QuckApp Workspace Service API
// @version 1.0.0
// @description Workspace management and settings service
// @host localhost:5004
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
| Workspaces | Workspace CRUD operations |
| Members | Workspace member management |
| Invitations | Workspace invitation system |
| Settings | Workspace settings and configuration |

### Security

- **Authentication:** JWT Bearer token via `Authorization` header
- **Rate Limiting:** 1000 requests/minute per workspace
