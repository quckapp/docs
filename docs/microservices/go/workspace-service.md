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
GET    /api/workspaces
POST   /api/workspaces
GET    /api/workspaces/{id}
PUT    /api/workspaces/{id}
DELETE /api/workspaces/{id}
GET    /api/workspaces/{id}/members
POST   /api/workspaces/{id}/members
DELETE /api/workspaces/{id}/members/{userId}
POST   /api/workspaces/{id}/invite
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
