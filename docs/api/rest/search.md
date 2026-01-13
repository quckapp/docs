---
sidebar_position: 8
---

# Search API

## Global Search

```http
GET /api/v1/search?q={query}&type={type}
```

**Parameters:**
- `q` - Search query
- `type` - Filter by type: `messages`, `users`, `channels`, `files`
- `workspaceId` - Filter by workspace
- `limit` - Results limit (default: 20)

**Response:**
```json
{
  "results": [
    {
      "type": "message",
      "score": 0.95,
      "data": { ... }
    }
  ],
  "total": 100
}
```
