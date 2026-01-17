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

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:4000/api/docs
- **OpenAPI Spec:** http://localhost:4000/api/docs-json
- **WebSocket:** Socket.IO at http://localhost:4000

### NestJS Swagger Configuration

The realtime-service uses `@nestjs/swagger` for REST API documentation:

```typescript
const config = new DocumentBuilder()
  .setTitle('QuckApp Realtime Service API')
  .setDescription('WebSocket gateway for real-time communication')
  .setVersion('1.0')
  .addBearerAuth()
  .addTag('Connections', 'Connection management')
  .addTag('Rooms', 'Room operations')
  .build();

SwaggerModule.setup('api/docs', app, document);
```

### API Tags

| Tag | Description |
|-----|-------------|
| Connections | WebSocket connection management |
| Rooms | Room/channel operations |
| Broadcast | Event broadcasting |

### Security

- **WebSocket:** Token authentication on connect
- **REST API:** JWT Bearer token via `Authorization` header
