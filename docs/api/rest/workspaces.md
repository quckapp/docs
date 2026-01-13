---
sidebar_position: 3
---

# Workspaces API

## List Workspaces

```http
GET /api/v1/workspaces
```

## Create Workspace

```http
POST /api/v1/workspaces
```

**Request:**
```json
{
  "name": "My Workspace",
  "description": "Team collaboration space"
}
```

## Get Workspace

```http
GET /api/v1/workspaces/{id}
```

## Update Workspace

```http
PUT /api/v1/workspaces/{id}
```

## Delete Workspace

```http
DELETE /api/v1/workspaces/{id}
```

## List Members

```http
GET /api/v1/workspaces/{id}/members
```

## Invite Member

```http
POST /api/v1/workspaces/{id}/invite
```

**Request:**
```json
{
  "email": "newmember@example.com",
  "role": "member"
}
```
