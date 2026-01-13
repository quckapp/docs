---
sidebar_position: 2
---

# Realtime Service

NestJS WebSocket gateway for real-time communication.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 4000 |
| **Database** | Redis |
| **Framework** | NestJS 10.x + Socket.IO |
| **Language** | TypeScript |

## Features

- WebSocket connection management
- Room-based messaging
- Presence synchronization
- Event broadcasting
- Redis adapter for scaling

## WebSocket Events

```typescript
// Client → Server
'join_channel': { channelId: string }
'leave_channel': { channelId: string }
'send_message': { channelId: string, content: string }
'typing_start': { channelId: string }
'typing_stop': { channelId: string }

// Server → Client
'message': { message: Message }
'presence_update': { userId: string, status: string }
'typing': { userId: string, channelId: string }
```
