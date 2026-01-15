---
sidebar_position: 10
---

# Realtime API

REST API endpoints for the consolidated Elixir Realtime Service.

## Base URL

```
https://api.QuckApp.dev/api/realtime
```

## Health Endpoints

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "node": "quckapp_realtime@node-1",
  "cluster": {
    "nodes": ["node-1", "node-2", "node-3"],
    "connected": true
  },
  "dependencies": {
    "mysql": "healthy",
    "redis": "healthy",
    "kafka": "healthy",
    "mongo": "healthy"
  },
  "stats": {
    "websocket_connections": 15420,
    "online_users": 8234,
    "active_calls": 142,
    "active_huddles": 28
  }
}
```

### Readiness Check

```http
GET /health/ready
```

### Liveness Check

```http
GET /health/live
```

---

## Call Management

### Invite User to Call

```http
POST /api/calls/:call_id/invite
Content-Type: application/json
Authorization: Bearer {token}

{
  "user_id": "user-456",
  "call_type": "video"
}
```

**Response:**
```json
{
  "success": true,
  "call_id": "call_abc123",
  "invited_user": "user-456"
}
```

### Get Call Participants

```http
GET /api/calls/:call_id/participants
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "participants": [
    {
      "user_id": "user-123",
      "joined_at": "2024-01-15T10:30:00Z",
      "media": {
        "audio": true,
        "video": true
      }
    }
  ],
  "count": 2
}
```

### Get ICE Servers Configuration

```http
GET /api/calls/:call_id/ice-servers
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "ice_servers": [
    {
      "urls": "stun:stun.quckapp.com:3478"
    },
    {
      "urls": "turn:turn.quckapp.com:3478",
      "username": "1705312200:user-123",
      "credential": "abc123hash=="
    }
  ],
  "ttl": 86400
}
```

---

## Call Recording

### Start Recording

```http
POST /api/calls/:call_id/recording/start
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "recording_id": "rec_1705312200_abc123",
  "started_at": "2024-01-15T10:30:00Z"
}
```

### Stop Recording

```http
POST /api/calls/:call_id/recording/stop
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "recording_id": "rec_1705312200_abc123",
  "duration": 3600
}
```

### Get Recording Status

```http
GET /api/calls/:call_id/recording/status
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "recording": true,
  "recording_id": "rec_1705312200_abc123",
  "started_at": "2024-01-15T10:30:00Z",
  "started_by": "user-123"
}
```

### List Recordings

```http
GET /api/recordings?conversation_id={conversation_id}&limit=20&offset=0
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "recordings": [
    {
      "id": "rec_1705312200_abc123",
      "call_id": "call_abc123",
      "conversation_id": "conv-456",
      "call_type": "video",
      "started_by": "user-123",
      "started_at": "2024-01-15T10:30:00Z",
      "ended_at": "2024-01-15T11:30:00Z",
      "duration": 3600,
      "status": "completed"
    }
  ],
  "count": 1
}
```

### Get Recording Details

```http
GET /api/recordings/:recording_id
Authorization: Bearer {token}
```

### Delete Recording

```http
DELETE /api/recordings/:recording_id
Authorization: Bearer {token}
```

### Get Download URL

```http
GET /api/recordings/:recording_id/download
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "url": "https://storage.quckapp.com/recordings/call_abc123/rec_123.webm?token=xyz",
  "expires_in": 3600
}
```

---

## Huddle Management

### Create Huddle

```http
POST /api/huddles
Content-Type: application/json
Authorization: Bearer {token}

{
  "name": "Quick Sync",
  "workspace_id": "ws-123",
  "channel_id": "ch-456"
}
```

**Response:**
```json
{
  "success": true,
  "huddle": {
    "id": "huddle_abc123",
    "name": "Quick Sync",
    "created_by": "user-123",
    "participants": [],
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

### Get Huddle

```http
GET /api/huddles/:huddle_id
Authorization: Bearer {token}
```

### Invite to Huddle

```http
POST /api/huddles/:huddle_id/invite
Content-Type: application/json
Authorization: Bearer {token}

{
  "user_ids": ["user-456", "user-789"]
}
```

### Join Huddle

```http
POST /api/huddles/:huddle_id/join
Authorization: Bearer {token}
```

### Leave Huddle

```http
POST /api/huddles/:huddle_id/leave
Authorization: Bearer {token}
```

---

## Presence

### Get User Presence

```http
GET /api/presence/:user_id
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "presence": {
    "user_id": "user-123",
    "status": "online",
    "custom_message": "In a meeting",
    "emoji": "📞",
    "last_seen": "2024-01-15T10:30:00Z",
    "devices": [
      {"id": "web:browser_abc", "timestamp": 1705312200}
    ]
  }
}
```

### Get Online Users

```http
GET /api/presence/online?workspace_id={workspace_id}&limit=50
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "users": [
    {"user_id": "user-123", "status": "online"},
    {"user_id": "user-456", "status": "away"}
  ],
  "total": 142
}
```

### Get Typing Users

```http
GET /api/presence/typing/:conversation_id
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "typing_users": ["user-123", "user-456"]
}
```

---

## Device Management

### Register Device

```http
POST /api/devices
Content-Type: application/json
Authorization: Bearer {token}

{
  "device_id": "device-abc123",
  "platform": "ios",
  "token": "apns-token-here",
  "name": "iPhone 15 Pro",
  "app_version": "1.0.0"
}
```

**Response:**
```json
{
  "success": true,
  "device": {
    "id": "device-abc123",
    "platform": "ios",
    "name": "iPhone 15 Pro",
    "registered_at": "2024-01-15T10:30:00Z"
  }
}
```

### List Devices

```http
GET /api/devices
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "devices": [
    {
      "id": "device-abc123",
      "platform": "ios",
      "name": "iPhone 15 Pro",
      "last_active": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 2
}
```

### Update Device Token

```http
PUT /api/devices/:device_id/token
Content-Type: application/json
Authorization: Bearer {token}

{
  "token": "new-apns-token-here"
}
```

### Unregister Device

```http
DELETE /api/devices/:device_id
Authorization: Bearer {token}
```

### Device Heartbeat

```http
POST /api/devices/:device_id/heartbeat
Authorization: Bearer {token}
```

---

## WebRTC Signaling

### Get ICE Configuration

```http
GET /api/signaling/ice-config
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "config": {
    "ice_servers": [
      {"urls": "stun:stun.quckapp.com:3478"},
      {"urls": "stun:stun.l.google.com:19302"},
      {
        "urls": "turn:turn.quckapp.com:3478",
        "username": "1705312200:user-123",
        "credential": "hmac-sha1-credential"
      },
      {
        "urls": "turn:turn.quckapp.com:443?transport=tcp",
        "username": "1705312200:user-123",
        "credential": "hmac-sha1-credential"
      },
      {
        "urls": "turns:turn.quckapp.com:443",
        "username": "1705312200:user-123",
        "credential": "hmac-sha1-credential"
      }
    ],
    "ice_transport_policy": "all",
    "ttl": 86400
  }
}
```

### Generate TURN Credentials

```http
POST /api/signaling/turn-credentials
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "credentials": {
    "username": "1705312200:user-123",
    "credential": "base64-hmac-sha1-credential",
    "ttl": 86400,
    "urls": [
      "turn:turn.quckapp.com:3478",
      "turn:turn.quckapp.com:443?transport=tcp",
      "turns:turn.quckapp.com:443"
    ]
  }
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `call_not_found` | The specified call does not exist |
| `call_not_active` | The call is not currently active |
| `recording_not_found` | The specified recording does not exist |
| `not_authorized` | User does not have permission |
| `device_limit_exceeded` | Maximum 10 devices per user |
| `huddle_full` | Huddle has reached maximum participants |
| `invalid_turn_credentials` | TURN credential generation failed |
