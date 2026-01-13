---
sidebar_position: 6
---

# Calls API

## Initiate Call

```http
POST /api/v1/calls
```

**Request:**
```json
{
  "channelId": "channel-uuid",
  "type": "video"
}
```

## Get Call

```http
GET /api/v1/calls/{id}
```

## End Call

```http
POST /api/v1/calls/{id}/end
```

## Get Call History

```http
GET /api/v1/calls?limit=20
```
