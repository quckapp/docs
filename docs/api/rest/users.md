---
sidebar_position: 2
---

# Users API

The Users API provides endpoints for user management, profiles, preferences, and search functionality.

**Base URL:** `http://localhost:8082/api/users`

**API Documentation:**
- **Swagger UI:** http://localhost:8082/swagger-ui.html
- **OpenAPI Spec:** http://localhost:8082/api-docs

## Authentication Methods

| Method | Description |
|--------|-------------|
| API Key | Service-to-service authentication via X-API-Key header |
| Service Auth | Internal service mesh authentication via X-Service-Name header |

```http
X-API-Key: <api_key>
X-Service-Name: <service_name>
```

---

## User Management

### Create User

```http
POST /api/users
```

Creates a new user in the system. This endpoint is typically called by the auth-service after successful registration.

**Request:**
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "displayName": "John Doe",
  "avatarUrl": "https://example.com/avatar.jpg",
  "phone": "+1234567890",
  "timezone": "America/New_York",
  "locale": "en-US"
}
```

**Validation Rules:**
| Field | Rules |
|-------|-------|
| email | Required, valid email format |
| username | Required, 3-50 chars, alphanumeric with `-` and `_` only |
| displayName | Optional, max 100 chars |
| avatarUrl | Optional, max 500 chars |
| phone | Optional |
| timezone | Optional |
| locale | Optional |

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User created",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "username": "johndoe",
    "displayName": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg",
    "phone": "+1234567890",
    "timezone": "America/New_York",
    "locale": "en-US",
    "status": "ACTIVE",
    "emailVerified": false,
    "phoneVerified": false,
    "lastLoginAt": null,
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Get User by ID

```http
GET /api/users/{id}
```

**Path Parameters:**
- `id` (UUID): The user's unique identifier

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "username": "johndoe",
    "displayName": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg",
    "phone": "+1234567890",
    "timezone": "America/New_York",
    "locale": "en-US",
    "status": "ACTIVE",
    "emailVerified": true,
    "phoneVerified": false,
    "lastLoginAt": "2024-01-15T09:00:00Z",
    "createdAt": "2024-01-10T08:00:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Get User by Email

```http
GET /api/users/email/{email}
```

**Path Parameters:**
- `email` (string): The user's email address

**Response:** Same structure as Get User by ID

### Get User by Username

```http
GET /api/users/username/{username}
```

**Path Parameters:**
- `username` (string): The user's username

**Response:** Same structure as Get User by ID

### Update User

```http
PUT /api/users/{id}
```

**Path Parameters:**
- `id` (UUID): The user's unique identifier

**Request:**
```json
{
  "displayName": "John D. Doe",
  "avatarUrl": "https://example.com/new-avatar.jpg",
  "phone": "+1987654321",
  "timezone": "Europe/London",
  "locale": "en-GB"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "User updated",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "username": "johndoe",
    "displayName": "John D. Doe",
    "avatarUrl": "https://example.com/new-avatar.jpg",
    "phone": "+1987654321",
    "timezone": "Europe/London",
    "locale": "en-GB",
    "status": "ACTIVE",
    "emailVerified": true,
    "phoneVerified": false,
    "lastLoginAt": "2024-01-15T09:00:00Z",
    "createdAt": "2024-01-10T08:00:00Z",
    "updatedAt": "2024-01-15T10:35:00Z"
  },
  "timestamp": "2024-01-15T10:35:00Z"
}
```

### Deactivate User

```http
DELETE /api/users/{id}
```

Soft-deletes a user by setting their status to DEACTIVATED.

**Path Parameters:**
- `id` (UUID): The user's unique identifier

**Response (200 OK):**
```json
{
  "success": true,
  "message": "User deactivated",
  "data": null,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## Admin Operations

### Suspend User

```http
POST /api/users/{id}/suspend
```

Suspends a user account. Suspended users cannot access the system until reactivated.

**Path Parameters:**
- `id` (UUID): The user's unique identifier

**Response (200 OK):**
```json
{
  "success": true,
  "message": "User suspended",
  "data": null,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## Search & Discovery

### Search Users

```http
GET /api/users/search
```

Search for users by query string with optional filtering and pagination.

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| query | string | Yes | - | Search query (min 2 chars) |
| status | string | No | - | Filter by status: ACTIVE, INACTIVE, SUSPENDED, DEACTIVATED |
| page | int | No | 0 | Page number (0-indexed) |
| size | int | No | 20 | Page size (1-100) |

**Example Request:**
```http
GET /api/users/search?query=john&status=ACTIVE&page=0&size=20
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "content": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "username": "johndoe",
        "displayName": "John Doe",
        "avatarUrl": "https://example.com/avatar.jpg",
        "status": "ACTIVE"
      },
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "username": "johnny",
        "displayName": "Johnny Smith",
        "avatarUrl": "https://example.com/avatar2.jpg",
        "status": "ACTIVE"
      }
    ],
    "page": 0,
    "size": 20,
    "totalElements": 2,
    "totalPages": 1,
    "first": true,
    "last": true
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## Batch Operations

### Get Users by IDs

```http
POST /api/users/batch
```

Retrieve multiple users by their IDs in a single request. Useful for populating user data in lists.

**Request:**
```json
[
  "550e8400-e29b-41d4-a716-446655440000",
  "660e8400-e29b-41d4-a716-446655440001",
  "770e8400-e29b-41d4-a716-446655440002"
]
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "johndoe",
      "displayName": "John Doe",
      "avatarUrl": "https://example.com/avatar.jpg",
      "status": "ACTIVE"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "username": "janesmith",
      "displayName": "Jane Smith",
      "avatarUrl": "https://example.com/avatar2.jpg",
      "status": "ACTIVE"
    }
  ],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

:::note
Users not found will be silently omitted from the response.
:::

---

## Profile Management

### Get User Profile

```http
GET /api/users/{id}/profile
```

Retrieve extended profile information for a user.

**Path Parameters:**
- `id` (UUID): The user's unique identifier

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Senior Software Engineer",
    "department": "Engineering",
    "location": "San Francisco, CA",
    "bio": "Passionate about building scalable systems and mentoring junior developers.",
    "customStatus": "In a meeting",
    "statusEmoji": "📅",
    "statusExpiry": "2024-01-15T12:00:00Z",
    "pronouns": "he/him",
    "birthday": "1990-05-15T00:00:00Z",
    "linkedinUrl": "https://linkedin.com/in/johndoe",
    "twitterUrl": "https://twitter.com/johndoe",
    "githubUrl": "https://github.com/johndoe",
    "updatedAt": "2024-01-15T10:30:00Z"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Update User Profile

```http
PATCH /api/users/{id}/profile
```

Update profile fields. Only provided fields will be updated.

**Path Parameters:**
- `id` (UUID): The user's unique identifier

**Request:**
```json
{
  "title": "Staff Software Engineer",
  "department": "Platform Engineering",
  "location": "New York, NY",
  "bio": "Building the future of distributed systems.",
  "customStatus": "Working from home",
  "statusEmoji": "🏠",
  "statusExpiry": "2024-01-16T18:00:00Z",
  "pronouns": "he/him",
  "birthday": "1990-05-15T00:00:00Z",
  "linkedinUrl": "https://linkedin.com/in/johndoe",
  "twitterUrl": "https://twitter.com/johndoe",
  "githubUrl": "https://github.com/johndoe"
}
```

**Validation Rules:**
| Field | Max Length |
|-------|------------|
| title | 100 chars |
| department | 100 chars |
| location | 100 chars |
| bio | 1000 chars |
| customStatus | 200 chars |
| statusEmoji | 10 chars |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile updated",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Staff Software Engineer",
    "department": "Platform Engineering",
    "location": "New York, NY",
    "bio": "Building the future of distributed systems.",
    "customStatus": "Working from home",
    "statusEmoji": "🏠",
    "statusExpiry": "2024-01-16T18:00:00Z",
    "pronouns": "he/him",
    "birthday": "1990-05-15T00:00:00Z",
    "linkedinUrl": "https://linkedin.com/in/johndoe",
    "twitterUrl": "https://twitter.com/johndoe",
    "githubUrl": "https://github.com/johndoe",
    "updatedAt": "2024-01-15T10:35:00Z"
  },
  "timestamp": "2024-01-15T10:35:00Z"
}
```

---

## Preferences Management

### Get User Preferences

```http
GET /api/users/{id}/preferences
```

Retrieve user notification, display, and privacy preferences.

**Path Parameters:**
- `id` (UUID): The user's unique identifier

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "pushEnabled": true,
    "emailEnabled": true,
    "smsEnabled": false,
    "desktopNotifications": true,
    "soundEnabled": true,
    "quietHoursStart": "22:00:00",
    "quietHoursEnd": "08:00:00",
    "quietHoursEnabled": true,
    "theme": "dark",
    "language": "en",
    "compactMode": false,
    "sidebarCollapsed": false,
    "showUnreadOnly": false,
    "messagePreview": true,
    "enterToSend": true,
    "markdownEnabled": true,
    "emojiSuggestionsEnabled": true,
    "showOnlineStatus": true,
    "showTypingIndicator": true,
    "showReadReceipts": true,
    "reducedMotion": false,
    "highContrast": false,
    "fontSize": 14,
    "customSettings": {},
    "updatedAt": "2024-01-15T10:30:00Z"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Update User Preferences

```http
PATCH /api/users/{id}/preferences
```

Update preference fields. Only provided fields will be updated.

**Path Parameters:**
- `id` (UUID): The user's unique identifier

**Request:**
```json
{
  "pushEnabled": true,
  "emailEnabled": false,
  "smsEnabled": false,
  "desktopNotifications": true,
  "soundEnabled": false,
  "quietHoursStart": "23:00:00",
  "quietHoursEnd": "07:00:00",
  "quietHoursEnabled": true,
  "theme": "light",
  "language": "en-US",
  "compactMode": true,
  "sidebarCollapsed": true,
  "showUnreadOnly": true,
  "messagePreview": false,
  "enterToSend": false,
  "markdownEnabled": true,
  "emojiSuggestionsEnabled": false,
  "showOnlineStatus": false,
  "showTypingIndicator": false,
  "showReadReceipts": false,
  "reducedMotion": true,
  "highContrast": true,
  "fontSize": 16,
  "customSettings": {
    "customKey": "customValue"
  }
}
```

**Validation Rules:**
| Field | Rules |
|-------|-------|
| fontSize | 10-24 |
| theme | Any string (typically: "light", "dark", "system") |
| language | Any string (BCP 47 format recommended) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Preferences updated",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "pushEnabled": true,
    "emailEnabled": false,
    "theme": "light",
    "fontSize": 16,
    "updatedAt": "2024-01-15T10:35:00Z"
  },
  "timestamp": "2024-01-15T10:35:00Z"
}
```

---

## User Status Values

| Status | Description |
|--------|-------------|
| `ACTIVE` | User is active and can access the system |
| `INACTIVE` | User has not completed onboarding or verification |
| `SUSPENDED` | User account has been suspended by admin |
| `DEACTIVATED` | User has deactivated their account |

---

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Human-readable error message",
  "data": null,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Common Error Codes

| HTTP Status | Description |
|-------------|-------------|
| 400 | Bad Request - Validation failed |
| 404 | Not Found - User does not exist |
| 409 | Conflict - Email or username already exists |
| 500 | Internal Server Error |

### Validation Error Response

```json
{
  "success": false,
  "message": "Validation failed",
  "data": {
    "email": "must be a valid email address",
    "username": "must be between 3 and 50 characters"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## Data Events

The User Service publishes events to Kafka for other services to consume:

| Event | Topic | Description |
|-------|-------|-------------|
| UserCreated | quckapp.users.events | New user created |
| UserUpdated | quckapp.users.events | User data updated |
| UserDeactivated | quckapp.users.events | User deactivated |
| UserSuspended | quckapp.users.events | User suspended |
| ProfileUpdated | quckapp.users.events | User profile updated |
| PreferencesUpdated | quckapp.users.events | User preferences updated |

---

## Caching

The User Service uses Redis caching for performance:

| Cache | TTL | Description |
|-------|-----|-------------|
| User by ID | 5 min | Individual user data |
| User by Email | 5 min | User lookup by email |
| User by Username | 5 min | User lookup by username |

Cache is automatically invalidated on user updates.
