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
