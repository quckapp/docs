---
sidebar_position: 5
---

# Messages API

## List Messages

```http
GET /api/v1/channels/{channelId}/messages?limit=50&before={messageId}
```

## Send Message

```http
POST /api/v1/channels/{channelId}/messages
```

**Request:**
```json
{
  "content": "Hello, world!",
  "attachments": []
}
```

## Edit Message

```http
PUT /api/v1/messages/{id}
```

## Delete Message

```http
DELETE /api/v1/messages/{id}
```

## Add Reaction

```http
POST /api/v1/messages/{id}/reactions
```

**Request:**
```json
{
  "emoji": "thumbsup"
}
```
