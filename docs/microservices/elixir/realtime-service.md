---
sidebar_position: 7
---

# Realtime Service (Elixir)

Consolidated Elixir/Phoenix service for real-time communication combining presence, messaging, calls, notifications, and huddles into a single high-performance service.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 4000 |
| **Database** | MySQL (persistence), MongoDB (documents) |
| **Cache** | Redis (cross-node sync) |
| **Framework** | Phoenix 1.7 |
| **Language** | Elixir 1.15 |
| **Event Streaming** | Apache Kafka |

## Features

### Core Features
- Real-time messaging via Phoenix Channels
- User presence tracking (ETS + Redis)
- Typing indicators with auto-expiry
- Store-and-forward for offline messages
- Erlang clustering for horizontal scaling

### Voice/Video Calls
- WebRTC signaling (offer/answer/ICE)
- TURN credential generation (RFC 5766 compliant)
- Call session management with state machine
- Call recording with cloud storage
- Per-call GenServer actors with timeouts

### Push Notifications
- APNs provider (iOS) with JWT authentication
- FCM provider (Android)
- Email notifications (SMTP, SendGrid, AWS SES, Mailgun)
- Device token management

### Huddles
- Audio rooms with multiple participants
- Real-time participant tracking
- Mute/unmute controls

## Architecture

```
                              CLIENTS
    Web (WebSocket)    Mobile (Socket)    Desktop (Socket)
           |                  |                  |
           +------------------+------------------+
                              |
                              v
+------------------------------------------------------------------+
|                    NGINX / LOAD BALANCER                          |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                   ELIXIR REALTIME SERVICE                         |
|                         (Port 4000)                               |
+------------------------------------------------------------------+
|                                                                    |
|  +------------------+  +------------------+  +------------------+  |
|  |  Phoenix        |  |  User Session    |  |  Call Session    |  |
|  |  Channels       |  |  Actors          |  |  Actors          |  |
|  |  (WebSocket)    |  |  (GenServer)     |  |  (GenServer)     |  |
|  +------------------+  +------------------+  +------------------+  |
|                                                                    |
|  +------------------+  +------------------+  +------------------+  |
|  |  Presence       |  |  Typing          |  |  Signaling       |  |
|  |  Manager        |  |  Tracker         |  |  Server          |  |
|  |  (ETS)          |  |  (MapSet)        |  |  (TURN/ICE)      |  |
|  +------------------+  +------------------+  +------------------+  |
|                                                                    |
|  +------------------+  +------------------+  +------------------+  |
|  |  Store &        |  |  Notification    |  |  Device          |  |
|  |  Forward        |  |  Dispatcher      |  |  Manager         |  |
|  |  (MySQL)        |  |  (FCM/APNs)      |  |  (Tokens)        |  |
|  +------------------+  +------------------+  +------------------+  |
|                                                                    |
+------------------------------------------------------------------+
         |              |              |              |
         v              v              v              v
    +--------+    +--------+    +--------+    +--------+
    | MySQL  |    | MongoDB|    | Redis  |    | Kafka  |
    +--------+    +--------+    +--------+    +--------+
```

## Supervision Tree

```elixir
QuckChatRealtime.Application
├── QuckChatRealtimeWeb.Telemetry
├── QuckChatRealtime.Repo (MySQL)
├── Phoenix.PubSub
├── QuckChatRealtime.Redis
├── Finch (HTTP client)
├── Registry (UserRegistry)
├── Registry (CallRegistry)
├── QuckChatRealtime.ConnectionSupervisor
├── QuckChatRealtime.PresenceManager
├── QuckChatRealtime.PresenceCleanup
├── QuckChatRealtime.TypingTracker
├── QuckChatRealtime.StoreAndForward
├── QuckChatRealtime.SignalingServer
├── QuckChatRealtime.CallManagerV2
├── QuckChatRealtime.ClusterManager
├── QuckChatRealtime.Kafka.Producer
├── QuckChatRealtime.Kafka.Consumer
├── QuckChatRealtime.Providers.APNs
├── QuckChatRealtime.Providers.Email
├── QuckChatRealtime.Presence
├── QuckChatRealtime.CallManager
├── QuckChatRealtime.HuddleManager
├── QuckChatRealtime.NotificationDispatcher
└── QuckChatRealtimeWeb.Endpoint
```

## Components

### 1. Presence Manager

ETS-based presence tracking with O(1) lookups.

```elixir
defmodule QuckChatRealtime.PresenceManager do
  # Track user online/offline status
  def track_user(user_id, device_id, metadata)
  def untrack_user(user_id, device_id)
  def get_presence(user_id)
  def get_online_users(workspace_id)
  def is_online?(user_id)
end
```

**Redis Keys:**
```
presence:user:{user_id}        # Hash: status, last_seen, device_count
presence:online:{workspace_id} # Sorted Set: online users
```

### 2. Presence Cleanup

Periodic cleanup of stale presence records.

```elixir
defmodule QuckChatRealtime.PresenceCleanup do
  @cleanup_interval 30_000   # 30 seconds
  @stale_threshold 120       # 2 minutes

  # Removes users who disconnected without proper cleanup
  # Syncs ETS with Redis
  # Publishes offline events to Kafka
end
```

### 3. Typing Tracker

Enhanced typing indicators with MapSet and telemetry.

```elixir
defmodule QuckChatRealtime.TypingTracker do
  @typing_timeout 5_000  # 5 seconds

  def start_typing(conversation_id, user_id)
  def stop_typing(conversation_id, user_id)
  def get_typing_users(conversation_id)
  def is_typing?(conversation_id, user_id)
end
```

### 4. Signaling Server

WebRTC signaling with TURN credential generation.

```elixir
defmodule QuckChatRealtime.SignalingServer do
  # ICE server configuration
  def get_ice_config(user_id)

  # Generate time-limited TURN credentials (RFC 5766)
  def generate_turn_credentials(user_id)
  # Returns: %{username: "timestamp:user_id", credential: hmac_sha1, ttl: 86400}

  # WebRTC signaling
  def relay_offer(from_user, to_user, sdp)
  def relay_answer(from_user, to_user, sdp)
  def relay_ice_candidate(from_user, to_user, candidate)
end
```

**TURN Credential Generation:**
```elixir
def generate_turn_credentials(user_id) do
  timestamp = System.system_time(:second) + @credential_ttl
  username = "#{timestamp}:#{user_id}"
  credential = :crypto.mac(:hmac, :sha, @turn_secret, username) |> Base.encode64()
  %{username: username, credential: credential, ttl: @credential_ttl}
end
```

### 5. Call Session Actor

Per-call GenServer with state machine.

```elixir
defmodule QuckChatRealtime.Actors.CallSession do
  use GenServer, restart: :transient

  @ringing_timeout 60_000     # 60 seconds
  @max_call_duration 3_600_000 # 1 hour

  # States: :ringing -> :active -> :ended

  def start_link(call_id, opts)
  def get_state(call_id)
  def add_participant(call_id, user_id)
  def remove_participant(call_id, user_id)
  def answer(call_id, user_id)
  def end_call(call_id, reason)
  def toggle_recording(call_id, enabled, user_id)
end
```

### 6. APNs Provider

Apple Push Notification Service with JWT authentication.

```elixir
defmodule QuckChatRealtime.Providers.APNs do
  @apns_production_url "https://api.push.apple.com"
  @apns_sandbox_url "https://api.sandbox.push.apple.com"

  # Send alert notification
  def send(device_token, notification, opts \\ [])

  # Send VoIP notification (for incoming calls)
  def send_voip(device_token, notification, opts \\ [])

  # Send silent notification (background update)
  def send_silent(device_token, data, opts \\ [])

  # Generate ES256 JWT token
  defp generate_jwt()
end
```

### 7. Email Provider

Multi-provider email notification support.

```elixir
defmodule QuckChatRealtime.Providers.Email do
  # Supported providers: :smtp, :sendgrid, :ses, :mailgun

  def send(user_id, notification, opts \\ [])
  def send_template(user_id, template_name, variables, opts \\ [])
end
```

### 8. Device Controller

Device token management for push notifications.

```elixir
# Max 10 devices per user
def register(user_id, device_info)
def update_token(device_id, new_token)
def unregister(device_id)
def list(user_id)
def heartbeat(device_id)
```

## API Endpoints

### Health Checks

```http
GET /health
GET /health/ready
GET /health/live
```

### Call Management

```http
POST   /api/calls/:call_id/invite
GET    /api/calls/:call_id/participants
GET    /api/calls/:call_id/ice-servers
```

### Call Recording

```http
POST   /api/calls/:call_id/recording/start
POST   /api/calls/:call_id/recording/stop
GET    /api/calls/:call_id/recording/status
GET    /api/recordings
GET    /api/recordings/:recording_id
DELETE /api/recordings/:recording_id
GET    /api/recordings/:recording_id/download
```

### Huddles

```http
POST   /api/huddles
GET    /api/huddles/:huddle_id
POST   /api/huddles/:huddle_id/invite
POST   /api/huddles/:huddle_id/join
POST   /api/huddles/:huddle_id/leave
```

### Presence

```http
GET    /api/presence/:user_id
GET    /api/presence/online
GET    /api/presence/typing/:conversation_id
```

### Device Management

```http
POST   /api/devices                    # Register device
GET    /api/devices                    # List user devices
PUT    /api/devices/:device_id/token   # Update push token
DELETE /api/devices/:device_id         # Unregister device
POST   /api/devices/:device_id/heartbeat
```

### WebRTC Signaling

```http
GET    /api/signaling/ice-config       # Get ICE server configuration
POST   /api/signaling/turn-credentials # Generate TURN credentials
```

## WebSocket Channels

### User Channel

```elixir
# Join: user:{user_id}
# Events:
"presence_update"    # Presence changes
"incoming_call"      # Incoming call notification
"call_ended"         # Call ended notification
"message"            # New message
"notification"       # Push notification
```

### Conversation Channel

```elixir
# Join: conversation:{conversation_id}
# Events:
"new_message"        # New message in conversation
"message_edited"     # Message was edited
"message_deleted"    # Message was deleted
"typing"             # User typing indicator
"read_receipt"       # Message read receipt
```

### Call Channel

```elixir
# Join: call:{call_id}
# Events:
"participant_joined" # Someone joined the call
"participant_left"   # Someone left the call
"offer"              # WebRTC SDP offer
"answer"             # WebRTC SDP answer
"ice_candidate"      # ICE candidate
"recording_started"  # Recording started
"recording_stopped"  # Recording stopped
```

### Huddle Channel

```elixir
# Join: huddle:{huddle_id}
# Events:
"participant_joined"
"participant_left"
"participant_muted"
"participant_unmuted"
"huddle_ended"
```

## Kafka Topics

### Produced Events

```
quikapp.presence.events
  - user_online
  - user_offline
  - status_changed

quikapp.messages.events
  - message_sent
  - message_delivered
  - message_read

quikapp.calls.events
  - call_started
  - call_answered
  - call_ended
  - recording_started
  - recording_stopped

quikapp.notifications.events
  - notification_sent
  - notification_delivered
  - notification_failed
```

### Consumed Events

```
quikapp.users.events
  - user_created
  - user_updated
  - user_deleted
```

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=mysql://user:pass@localhost/quckchat_realtime
MONGO_URL=mongodb://localhost:27017/quckchat

# Redis
REDIS_URL=redis://localhost:6379

# Kafka
KAFKA_BROKERS=localhost:9092

# WebRTC / TURN
TURN_SERVERS=turn:turn.quikapp.com:3478
TURN_SECRET=your-turn-secret
STUN_SERVERS=stun:stun.l.google.com:19302

# APNs
APNS_KEY_ID=your-key-id
APNS_TEAM_ID=your-team-id
APNS_KEY_PATH=/path/to/AuthKey.p8
APNS_BUNDLE_ID=com.quikapp.app
APNS_ENVIRONMENT=production  # or sandbox

# Email
EMAIL_PROVIDER=sendgrid  # smtp, sendgrid, ses, mailgun
SENDGRID_API_KEY=your-api-key
EMAIL_FROM=noreply@quikapp.com

# FCM
FCM_SERVER_KEY=your-server-key

# Clustering
CLUSTER_STRATEGY=kubernetes  # or dns, gossip
CLUSTER_TOPOLOGY=kubernetes
KUBERNETES_SELECTOR=app=quckchat-realtime
KUBERNETES_NAMESPACE=default

# Service
PORT=4000
SECRET_KEY_BASE=your-secret-key
```

### config/runtime.exs

```elixir
config :quckchat_realtime, QuckChatRealtime.Repo,
  url: System.get_env("DATABASE_URL"),
  pool_size: String.to_integer(System.get_env("POOL_SIZE", "10"))

config :quckchat_realtime, :redis,
  url: System.get_env("REDIS_URL", "redis://localhost:6379")

config :quckchat_realtime, :turn,
  servers: System.get_env("TURN_SERVERS", "turn:turn.quikapp.com:3478"),
  secret: System.get_env("TURN_SECRET"),
  ttl: 86400

config :quckchat_realtime, :apns,
  key_id: System.get_env("APNS_KEY_ID"),
  team_id: System.get_env("APNS_TEAM_ID"),
  key_path: System.get_env("APNS_KEY_PATH"),
  bundle_id: System.get_env("APNS_BUNDLE_ID"),
  environment: String.to_atom(System.get_env("APNS_ENVIRONMENT", "sandbox"))
```

## Metrics (Prometheus)

```elixir
# Presence
presence_online_users{workspace_id}
presence_tracking_operations_total{operation}

# Typing
typing_active_users{conversation_id}
typing_operations_total{operation}

# Calls
calls_active_total
calls_duration_seconds{type}
calls_recording_active_total

# WebSocket
websocket_connections_total
websocket_messages_total{direction, type}

# Notifications
notifications_sent_total{provider, type}
notifications_failed_total{provider, reason}

# Redis
redis_commands_total{command}
redis_latency_seconds{operation}
```

## Health Check Response

```http
GET /health
```

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "node": "quckchat_realtime@node-1",
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

## Deployment

### Docker

```dockerfile
FROM elixir:1.15-alpine AS builder

WORKDIR /app
ENV MIX_ENV=prod

COPY mix.exs mix.lock ./
RUN mix deps.get --only prod
RUN mix deps.compile

COPY . .
RUN mix release

FROM alpine:3.18
RUN apk add --no-cache libstdc++ openssl ncurses-libs

WORKDIR /app
COPY --from=builder /app/_build/prod/rel/quckchat_realtime ./

ENV PORT=4000
EXPOSE 4000

CMD ["bin/quckchat_realtime", "start"]
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: quckchat-realtime
spec:
  replicas: 3
  selector:
    matchLabels:
      app: quckchat-realtime
  template:
    metadata:
      labels:
        app: quckchat-realtime
    spec:
      containers:
      - name: quckchat-realtime
        image: quikapp/realtime:latest
        ports:
        - containerPort: 4000
        env:
        - name: CLUSTER_STRATEGY
          value: kubernetes
        - name: KUBERNETES_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 4000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 4000
          initialDelaySeconds: 5
          periodSeconds: 5
```

## Performance Characteristics

| Metric | Value |
|--------|-------|
| WebSocket connections per node | 100,000+ |
| Message latency (p99) | < 50ms |
| Presence update latency | < 10ms |
| Call setup time | < 2s |
| Memory per connection | ~10KB |
| Erlang processes per user | 1-3 |
