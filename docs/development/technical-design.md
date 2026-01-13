---
sidebar_position: 2
---

# Technical Design Document (TDD)

## Document Information

| Field | Value |
|-------|-------|
| **Document ID** | QUIKAPP-TDD-001 |
| **Version** | 1.5 |
| **Status** | Approved |
| **Last Updated** | 2024-01-15 |
| **Owner** | Engineering Team |

## 1. Introduction

This Technical Design Document (TDD) provides detailed specifications for implementing QuikApp's core features. It bridges the gap between high-level architecture and actual code implementation.

## 2. Message Service Design

### 2.1 Overview

The Message Service handles all real-time messaging functionality including sending, receiving, and storing messages.

### 2.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Message Service Components                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         API Layer                                    │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │    │
│  │  │  REST API   │  │  WebSocket  │  │   gRPC      │                 │    │
│  │  │  Handler    │  │  Handler    │  │   Handler   │                 │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │    │
│  └─────────┼────────────────┼────────────────┼───────────────────────────┘    │
│            └────────────────┴────────────────┘                              │
│                             │                                                │
│                             ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      Service Layer                                   │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │    │
│  │  │  Message    │  │   Thread    │  │  Reaction   │                 │    │
│  │  │  Service    │  │   Service   │  │   Service   │                 │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │    │
│  └─────────┼────────────────┼────────────────┼───────────────────────────┘    │
│            └────────────────┴────────────────┘                              │
│                             │                                                │
│                             ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Repository Layer                                  │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │    │
│  │  │  MongoDB    │  │   Redis     │  │ Elasticsearch│                 │    │
│  │  │   Repo      │  │   Cache     │  │    Index    │                 │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Class Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Message Classes                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────┐                                            │
│  │       <<interface>>         │                                            │
│  │      MessageService         │                                            │
│  ├─────────────────────────────┤                                            │
│  │ + send(msg: Message): Msg   │                                            │
│  │ + get(id: string): Message  │                                            │
│  │ + update(msg: Message): Msg │                                            │
│  │ + delete(id: string): void  │                                            │
│  │ + list(opts: ListOpts): []  │                                            │
│  └──────────────┬──────────────┘                                            │
│                 │                                                            │
│                 │ implements                                                 │
│                 ▼                                                            │
│  ┌─────────────────────────────┐                                            │
│  │    MessageServiceImpl       │                                            │
│  ├─────────────────────────────┤                                            │
│  │ - repo: MessageRepository   │                                            │
│  │ - cache: RedisCache         │                                            │
│  │ - search: SearchService     │                                            │
│  │ - events: EventPublisher    │                                            │
│  ├─────────────────────────────┤                                            │
│  │ + send(msg: Message): Msg   │                                            │
│  │ + get(id: string): Message  │                                            │
│  │ - validate(msg): void       │                                            │
│  │ - publish(event): void      │                                            │
│  └─────────────────────────────┘                                            │
│                                                                              │
│  ┌─────────────────────────────┐      ┌─────────────────────────────┐      │
│  │         Message             │      │       MessageContent        │      │
│  ├─────────────────────────────┤      ├─────────────────────────────┤      │
│  │ + id: ObjectId              │      │ + text: string              │      │
│  │ + channelId: ObjectId       │      │ + blocks: Block[]           │      │
│  │ + userId: ObjectId          │──────│ + mentions: ObjectId[]      │      │
│  │ + content: MessageContent   │      │ + links: Link[]             │      │
│  │ + attachments: Attachment[] │      └─────────────────────────────┘      │
│  │ + reactions: Reaction[]     │                                            │
│  │ + threadId: ObjectId?       │      ┌─────────────────────────────┐      │
│  │ + ts: number                │      │        Attachment           │      │
│  │ + createdAt: Date           │      ├─────────────────────────────┤      │
│  │ + editedAt: Date?           │      │ + id: ObjectId              │      │
│  │ + deletedAt: Date?          │──────│ + type: AttachmentType      │      │
│  └─────────────────────────────┘      │ + name: string              │      │
│                                        │ + url: string               │      │
│                                        │ + size: number              │      │
│                                        └─────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Sequence Diagrams

#### Send Message Flow

```
┌──────┐     ┌──────────┐     ┌───────────┐     ┌─────────┐     ┌───────┐
│Client│     │ Gateway  │     │ Msg Svc   │     │ MongoDB │     │ Kafka │
└──┬───┘     └────┬─────┘     └─────┬─────┘     └────┬────┘     └───┬───┘
   │              │                 │                │              │
   │ POST /msg    │                 │                │              │
   │─────────────>│                 │                │              │
   │              │  gRPC send()    │                │              │
   │              │────────────────>│                │              │
   │              │                 │                │              │
   │              │                 │ validate()     │              │
   │              │                 │───┐            │              │
   │              │                 │<──┘            │              │
   │              │                 │                │              │
   │              │                 │ insert()       │              │
   │              │                 │───────────────>│              │
   │              │                 │    ack         │              │
   │              │                 │<───────────────│              │
   │              │                 │                │              │
   │              │                 │ publish(event) │              │
   │              │                 │───────────────────────────────>│
   │              │                 │                │              │
   │              │   Message       │                │              │
   │              │<────────────────│                │              │
   │   200 OK     │                 │                │              │
   │<─────────────│                 │                │              │
   │              │                 │                │              │
```

#### Real-time Delivery Flow

```
┌───────┐    ┌───────────┐    ┌─────────┐    ┌──────────┐    ┌───────┐
│ Kafka │    │ Presence  │    │ Phoenix │    │ WebSocket│    │ Client│
└───┬───┘    └─────┬─────┘    └────┬────┘    └────┬─────┘    └───┬───┘
    │              │               │              │              │
    │ msg.sent     │               │              │              │
    │─────────────>│               │              │              │
    │              │               │              │              │
    │              │ get_online()  │              │              │
    │              │───┐           │              │              │
    │              │<──┘           │              │              │
    │              │               │              │              │
    │              │ broadcast()   │              │              │
    │              │──────────────>│              │              │
    │              │               │              │              │
    │              │               │ push(msg)    │              │
    │              │               │─────────────>│              │
    │              │               │              │              │
    │              │               │              │ ws: message  │
    │              │               │              │─────────────>│
    │              │               │              │              │
```

### 2.5 API Specifications

#### Send Message

```yaml
POST /api/v1/channels/{channelId}/messages
Content-Type: application/json
Authorization: Bearer {token}

Request:
{
  "content": {
    "text": "Hello @john, check out this code:",
    "blocks": [
      { "type": "text", "text": "Hello " },
      { "type": "mention", "userId": "user_123" },
      { "type": "text", "text": ", check out this code:" },
      { "type": "code", "language": "javascript", "code": "console.log('hi')" }
    ]
  },
  "attachments": [
    { "fileId": "file_456" }
  ],
  "threadId": null
}

Response (201 Created):
{
  "id": "msg_789",
  "channelId": "ch_123",
  "userId": "user_456",
  "content": { ... },
  "attachments": [ ... ],
  "reactions": [],
  "threadId": null,
  "ts": 1705312800000,
  "createdAt": "2024-01-15T10:00:00Z"
}

Errors:
- 400: Invalid message content
- 401: Unauthorized
- 403: No permission to post
- 404: Channel not found
- 429: Rate limited
```

### 2.6 Data Models

#### MongoDB Schema

```javascript
// messages collection
{
  _id: ObjectId,
  channel_id: ObjectId,
  workspace_id: ObjectId,
  user_id: ObjectId,
  thread_id: ObjectId | null,

  content: {
    text: String,
    blocks: [{
      type: String,  // "text", "mention", "code", "link"
      // type-specific fields
    }]
  },

  attachments: [{
    id: ObjectId,
    type: String,  // "file", "image", "video"
    name: String,
    url: String,
    size: Number,
    mime_type: String
  }],

  reactions: [{
    emoji: String,
    users: [ObjectId],
    count: Number
  }],

  mentions: [ObjectId],
  edited_at: Date | null,
  deleted_at: Date | null,
  created_at: Date,
  ts: NumberLong  // Lamport timestamp
}

// Indexes
{ channel_id: 1, ts: -1 }           // Primary query
{ thread_id: 1, ts: 1 }             // Thread replies
{ workspace_id: 1, created_at: -1 } // Workspace feed
{ user_id: 1, created_at: -1 }      // User messages
{ mentions: 1, created_at: -1 }     // Mention lookup
```

### 2.7 Error Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Error Handling Strategy                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Error Categories:                                                          │
│  ├── Validation Errors (400)                                               │
│  │   └── Return field-level errors                                         │
│  ├── Authentication Errors (401)                                           │
│  │   └── Clear auth state, redirect                                        │
│  ├── Authorization Errors (403)                                            │
│  │   └── Show permission denied UI                                         │
│  ├── Not Found Errors (404)                                                │
│  │   └── Show resource not found                                           │
│  ├── Conflict Errors (409)                                                 │
│  │   └── Handle optimistic locking                                         │
│  ├── Rate Limit Errors (429)                                               │
│  │   └── Show cooldown, retry with backoff                                 │
│  └── Server Errors (5xx)                                                   │
│      └── Log, alert, show generic error                                    │
│                                                                              │
│  Error Response Format:                                                     │
│  {                                                                          │
│    "error": {                                                               │
│      "code": "VALIDATION_ERROR",                                           │
│      "message": "Message content is required",                             │
│      "details": [                                                          │
│        { "field": "content.text", "error": "required" }                   │
│      ],                                                                     │
│      "requestId": "req_abc123"                                             │
│    }                                                                        │
│  }                                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 3. Authentication Service Design

### 3.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OAuth 2.0 / OIDC Flow                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐          │
│  │ Client │      │  Gateway │      │   Auth   │      │   IdP    │          │
│  └────┬───┘      └────┬─────┘      └────┬─────┘      └────┬─────┘          │
│       │               │                 │                 │                 │
│       │ 1. Login      │                 │                 │                 │
│       │──────────────>│                 │                 │                 │
│       │               │                 │                 │                 │
│       │               │ 2. Auth URL     │                 │                 │
│       │               │────────────────>│                 │                 │
│       │               │                 │                 │                 │
│       │               │ 3. Redirect URL │                 │                 │
│       │               │<────────────────│                 │                 │
│       │               │                 │                 │                 │
│       │ 4. Redirect   │                 │                 │                 │
│       │<──────────────│                 │                 │                 │
│       │               │                 │                 │                 │
│       │ 5. User Auth  │                 │                 │                 │
│       │─────────────────────────────────────────────────>│                 │
│       │               │                 │                 │                 │
│       │ 6. Code       │                 │                 │                 │
│       │<─────────────────────────────────────────────────│                 │
│       │               │                 │                 │                 │
│       │ 7. Code       │                 │                 │                 │
│       │──────────────────────────────────>│                 │                 │
│       │               │                 │                 │                 │
│       │               │                 │ 8. Exchange     │                 │
│       │               │                 │────────────────>│                 │
│       │               │                 │                 │                 │
│       │               │                 │ 9. Tokens       │                 │
│       │               │                 │<────────────────│                 │
│       │               │                 │                 │                 │
│       │ 10. JWT       │                 │                 │                 │
│       │<────────────────────────────────│                 │                 │
│       │               │                 │                 │                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 JWT Structure

```javascript
// Header
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key_123"
}

// Payload
{
  "sub": "user_456",           // User ID
  "iss": "https://auth.quikapp.com",
  "aud": "quikapp-api",
  "exp": 1705399200,           // Expiry (1 hour)
  "iat": 1705395600,           // Issued at
  "jti": "jwt_789",            // JWT ID

  // Custom claims
  "workspace_id": "ws_123",
  "roles": ["member"],
  "permissions": ["read:messages", "write:messages"],
  "session_id": "sess_abc"
}

// Signature
RSASHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  privateKey
)
```

## 4. Caching Strategy

### 4.1 Cache Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Caching Architecture                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  L1: Application Cache (In-Memory)                                          │
│  ├── Hot data (< 1MB)                                                       │
│  ├── TTL: 1 minute                                                          │
│  └── Per-pod, not shared                                                    │
│                                                                              │
│  L2: Redis Cache (Distributed)                                              │
│  ├── Session data                                                           │
│  ├── User profiles                                                          │
│  ├── Channel metadata                                                       │
│  ├── TTL: 5-60 minutes                                                      │
│  └── Shared across pods                                                     │
│                                                                              │
│  L3: CDN Cache (Edge)                                                       │
│  ├── Static assets                                                          │
│  ├── Media files                                                            │
│  ├── TTL: 1 day - 1 year                                                   │
│  └── Geographically distributed                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Cache Keys

```
// User cache
user:{userId}                    // User profile
user:{userId}:sessions           // User sessions
user:{userId}:workspaces         // User workspaces

// Channel cache
channel:{channelId}              // Channel metadata
channel:{channelId}:members      // Channel members
channel:{channelId}:recent       // Recent messages (last 50)

// Workspace cache
workspace:{workspaceId}          // Workspace metadata
workspace:{workspaceId}:settings // Workspace settings

// Presence cache
presence:{workspaceId}           // Online users (SET)
presence:user:{userId}           // User presence
```

## 5. Event Schema

### 5.1 Kafka Topics

| Topic | Partitions | Retention | Purpose |
|-------|------------|-----------|---------|
| `message.sent` | 32 | 7 days | New messages |
| `message.updated` | 16 | 7 days | Edited messages |
| `message.deleted` | 16 | 7 days | Deleted messages |
| `presence.changed` | 16 | 1 day | Online status |
| `user.activity` | 32 | 30 days | Analytics |

### 5.2 Event Format

```javascript
// CloudEvents format
{
  "specversion": "1.0",
  "id": "evt_abc123",
  "source": "quikapp/message-service",
  "type": "com.quikapp.message.sent",
  "time": "2024-01-15T10:00:00Z",
  "datacontenttype": "application/json",
  "data": {
    "messageId": "msg_789",
    "channelId": "ch_123",
    "workspaceId": "ws_456",
    "userId": "user_789",
    "content": { ... }
  }
}
```

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2023-05-01 | Engineering | Initial draft |
| 1.5 | 2024-01-15 | Engineering | Added caching design |
