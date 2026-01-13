---
sidebar_position: 2
---

# Channel Service

Go service for channel management and memberships.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5005 |
| **Database** | MySQL |
| **Framework** | Gin |
| **Language** | Go 1.21 |

## API Endpoints

```http
GET    /api/channels
POST   /api/channels
GET    /api/channels/{id}
PUT    /api/channels/{id}
DELETE /api/channels/{id}
GET    /api/channels/{id}/members
POST   /api/channels/{id}/join
POST   /api/channels/{id}/leave
```
