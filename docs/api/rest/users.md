---
sidebar_position: 2
---

# Users API

## Get Current User

```http
GET /api/v1/users/me
Authorization: Bearer <access_token>
```

## Get User by ID

```http
GET /api/v1/users/{id}
```

## Update User

```http
PUT /api/v1/users/{id}
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "displayName": "John Doe",
  "bio": "Software Developer",
  "avatarUrl": "https://..."
}
```

## Search Users

```http
GET /api/v1/users/search?q={query}&limit=20
```

## Get User Settings

```http
GET /api/v1/users/{id}/settings
```

## Update Settings

```http
PUT /api/v1/users/{id}/settings
```

**Request:**
```json
{
  "notifications": {
    "email": true,
    "push": true
  },
  "privacy": {
    "profileVisibility": "public",
    "lastSeenVisibility": "contacts"
  }
}
```

## Block User

```http
POST /api/v1/users/{id}/block
```

**Request:**
```json
{
  "userId": "user-to-block-id"
}
```
