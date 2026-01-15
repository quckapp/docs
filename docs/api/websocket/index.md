---
sidebar_position: 1
---

# WebSocket API

QuckApp uses WebSocket connections for real-time features including messaging, presence, typing indicators, and calls.

## Connection

### Endpoint

```
wss://realtime.QuckApp.dev/socket
```

### Authentication

Connect with JWT token as query parameter or header:

```javascript
// Query parameter
const socket = new WebSocket('wss://realtime.QuckApp.dev/socket?token=<jwt>');

// Or using Phoenix Socket (recommended)
import { Socket } from 'phoenix';

const socket = new Socket('wss://realtime.QuckApp.dev/socket', {
  params: { token: '<jwt>' }
});

socket.connect();
```

## Channels

### Channel Types

| Channel | Pattern | Description |
|---------|---------|-------------|
| User | `user:{userId}` | Personal notifications, DMs |
| Workspace | `workspace:{workspaceId}` | Workspace-wide events |
| Channel | `channel:{channelId}` | Message channel events |
| Thread | `thread:{threadId}` | Thread reply events |
| Call | `call:{callId}` | Voice/video call signaling |
| Presence | `presence:{workspaceId}` | Online status tracking |

### Joining Channels

```javascript
// Join a message channel
const channel = socket.channel('channel:abc-123', {});

channel.join()
  .receive('ok', (resp) => console.log('Joined', resp))
  .receive('error', (resp) => console.log('Failed', resp));
```

## Events

### Message Events

#### `message:new`
New message received in channel.

```json
{
  "id": "msg-uuid",
  "content": "Hello!",
  "userId": "user-uuid",
  "channelId": "channel-uuid",
  "createdAt": "2024-01-15T10:30:00Z",
  "attachments": [],
  "mentions": []
}
```

#### `message:update`
Message was edited.

```json
{
  "id": "msg-uuid",
  "content": "Hello! (edited)",
  "editedAt": "2024-01-15T10:35:00Z"
}
```

#### `message:delete`
Message was deleted.

```json
{
  "id": "msg-uuid",
  "deletedAt": "2024-01-15T10:40:00Z"
}
```

#### `message:reaction`
Reaction added/removed.

```json
{
  "messageId": "msg-uuid",
  "userId": "user-uuid",
  "emoji": "thumbsup",
  "action": "add"
}
```

### Typing Events

#### `typing:start`
User started typing.

```json
{
  "userId": "user-uuid",
  "channelId": "channel-uuid"
}
```

#### `typing:stop`
User stopped typing.

```json
{
  "userId": "user-uuid",
  "channelId": "channel-uuid"
}
```

### Presence Events

#### `presence:join`
User came online.

```json
{
  "userId": "user-uuid",
  "status": "online",
  "device": "desktop"
}
```

#### `presence:leave`
User went offline.

```json
{
  "userId": "user-uuid",
  "lastSeen": "2024-01-15T10:45:00Z"
}
```

#### `presence:update`
User status changed.

```json
{
  "userId": "user-uuid",
  "status": "away",
  "statusText": "In a meeting"
}
```

### Call Events

#### `call:incoming`
Incoming call notification.

```json
{
  "callId": "call-uuid",
  "callerId": "user-uuid",
  "callerName": "John Doe",
  "type": "video",
  "channelId": "channel-uuid"
}
```

#### `call:signal`
WebRTC signaling data.

```json
{
  "callId": "call-uuid",
  "type": "offer|answer|ice-candidate",
  "data": { }
}
```

#### `call:end`
Call ended.

```json
{
  "callId": "call-uuid",
  "reason": "ended|declined|missed",
  "duration": 300
}
```

## Client Events (Send)

### Send Message

```javascript
channel.push('message:send', {
  content: 'Hello, world!',
  attachments: []
});
```

### Send Typing Indicator

```javascript
channel.push('typing:start', {});

// After 3 seconds of no typing
channel.push('typing:stop', {});
```

### Update Presence

```javascript
userChannel.push('presence:update', {
  status: 'away',
  statusText: 'Be right back'
});
```

### Call Signaling

```javascript
callChannel.push('call:signal', {
  type: 'offer',
  data: rtcSessionDescription
});
```

## Error Handling

```javascript
channel.onError((err) => {
  console.error('Channel error:', err);
});

socket.onError((err) => {
  console.error('Socket error:', err);
});

socket.onClose(() => {
  console.log('Socket closed, attempting reconnect...');
});
```

## Reconnection

The Phoenix Socket automatically handles reconnection:

```javascript
const socket = new Socket(url, {
  params: { token },
  reconnectAfterMs: (tries) => [1000, 2000, 5000, 10000][tries - 1] || 10000
});
```
