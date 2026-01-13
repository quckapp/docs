---
sidebar_position: 4
---

# Channels API

## List Channels

```http
GET /api/v1/workspaces/{workspaceId}/channels
```

## Create Channel

```http
POST /api/v1/channels
```

**Request:**
```json
{
  "name": "general",
  "workspaceId": "workspace-uuid",
  "type": "public",
  "description": "General discussion"
}
```

## Get Channel

```http
GET /api/v1/channels/{id}
```

## Join Channel

```http
POST /api/v1/channels/{id}/join
```

## Leave Channel

```http
POST /api/v1/channels/{id}/leave
```
