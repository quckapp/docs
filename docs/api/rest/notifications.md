---
sidebar_position: 9
---

# Notifications API

## List Notifications

```http
GET /api/v1/notifications?limit=20&unreadOnly=true
```

## Mark as Read

```http
PUT /api/v1/notifications/{id}/read
```

## Mark All as Read

```http
PUT /api/v1/notifications/read-all
```

## Get Notification Preferences

```http
GET /api/v1/notifications/preferences
```

## Update Preferences

```http
PUT /api/v1/notifications/preferences
```

**Request:**
```json
{
  "email": {
    "mentions": true,
    "directMessages": true,
    "channelUpdates": false
  },
  "push": {
    "mentions": true,
    "directMessages": true
  }
}
```
