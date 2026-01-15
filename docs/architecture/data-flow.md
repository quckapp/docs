---
sidebar_position: 3
---

# Data Flow

How data moves through QuckApp's microservices architecture.

## Request Flow

### 1. API Request Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │────▶│  Nginx   │────▶│ Gateway  │────▶│ Service  │
│          │     │          │     │ (NestJS) │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │                │                │
                      ▼                ▼                ▼
                 Rate Limit      JWT Verify        Business
                 SSL Term        Permission        Logic
                 Load Balance    Routing           Database
```

**Example: Get User Profile**

```
1. Client sends GET /api/v1/users/123
2. Nginx rate limits and forwards to Gateway
3. Gateway validates JWT token
4. Gateway checks permissions via Permission Service
5. Gateway routes to User Service
6. User Service queries MySQL
7. Response flows back through Gateway
8. Client receives user profile
```

### 2. Authentication Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │────▶│  Nginx   │────▶│   Auth   │────▶│  MySQL   │
│          │     │          │     │ Service  │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                                 │
     │                                 ▼
     │                          ┌──────────┐
     │                          │  Redis   │
     │                          │ (Session)│
     │                          └──────────┘
     │                                 │
     ◀─────────────────────────────────┘
           JWT Token + Refresh Token
```

**Example: User Login**

```
1. Client sends POST /api/auth/login with credentials
2. Auth Service validates credentials against MySQL
3. Auth Service generates JWT and refresh token
4. Session stored in Redis
5. Tokens returned to client
6. Audit event published to Kafka
```

### 3. Real-time Message Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │◀───▶│ Realtime │◀───▶│ Message  │────▶│ MongoDB  │
│ (Socket) │     │ Gateway  │     │ Service  │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │                │
                      │                ▼
                      │          ┌──────────┐
                      │          │  Kafka   │
                      │          │          │
                      │          └──────────┘
                      │                │
                      │     ┌──────────┴──────────┐
                      │     ▼                     ▼
                      │ ┌──────────┐       ┌──────────┐
                      │ │Notification│     │Analytics │
                      │ │ Service   │     │ Service  │
                      │ └──────────┘       └──────────┘
                      │
                      ▼
               Other Connected
                  Clients
```

**Example: Send Message**

```
1. Client A sends message via WebSocket
2. Realtime Gateway authenticates and forwards to Message Service
3. Message Service:
   - Validates message content
   - Stores in MongoDB
   - Publishes to Kafka topic
4. Realtime Gateway broadcasts to recipients
5. Notification Service sends push to offline users
6. Analytics Service records message metrics
```

## Event Flow

### Kafka Event Topics

```
┌─────────────────────────────────────────────────────────────────┐
│                        KAFKA CLUSTER                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │ QuckApp.users      │  │ QuckApp.messages   │              │
│  │ • USER_CREATED      │  │ • MESSAGE_SENT      │              │
│  │ • USER_UPDATED      │  │ • MESSAGE_EDITED    │              │
│  │ • USER_DELETED      │  │ • MESSAGE_DELETED   │              │
│  │ • USER_BANNED       │  │ • REACTION_ADDED    │              │
│  └─────────────────────┘  └─────────────────────┘              │
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │ QuckApp.presence   │  │ QuckApp.calls      │              │
│  │ • USER_ONLINE       │  │ • CALL_STARTED      │              │
│  │ • USER_OFFLINE      │  │ • CALL_ENDED        │              │
│  │ • USER_TYPING       │  │ • PARTICIPANT_JOINED│              │
│  │ • STATUS_CHANGED    │  │ • PARTICIPANT_LEFT  │              │
│  └─────────────────────┘  └─────────────────────┘              │
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │ QuckApp.audit      │  │ QuckApp.analytics  │              │
│  │ • LOGIN_SUCCESS     │  │ • PAGE_VIEW         │              │
│  │ • LOGIN_FAILED      │  │ • FEATURE_USED      │              │
│  │ • PERMISSION_DENIED │  │ • ERROR_OCCURRED    │              │
│  │ • DATA_EXPORTED     │  │ • PERFORMANCE_METRIC│              │
│  └─────────────────────┘  └─────────────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Event Processing

```
                    ┌──────────────────────────────────────┐
                    │           EVENT PRODUCERS            │
                    ├──────────────────────────────────────┤
                    │  Auth │ User │ Message │ Presence   │
                    └───────────────┬──────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────────────┐
                    │           KAFKA TOPICS               │
                    └───────────────┬──────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│ Notification  │         │   Analytics   │         │    Audit      │
│   Consumer    │         │   Consumer    │         │   Consumer    │
├───────────────┤         ├───────────────┤         ├───────────────┤
│ • Send Push   │         │ • Aggregate   │         │ • Store Log   │
│ • Send Email  │         │ • Calculate   │         │ • Alert       │
│ • Update Badge│         │ • Report      │         │ • Compliance  │
└───────────────┘         └───────────────┘         └───────────────┘
```

## Database Interactions

### Read Patterns

```
┌─────────────────────────────────────────────────────────────────┐
│                      READ PATTERNS                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Pattern 1: Cache-Aside                                         │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                     │
│  │ Service │───▶│  Redis  │───▶│   DB    │                     │
│  │         │◀───│ (Cache) │◀───│         │                     │
│  └─────────┘    └─────────┘    └─────────┘                     │
│                                                                  │
│  Pattern 2: Read Replica                                        │
│  ┌─────────┐    ┌─────────┐                                    │
│  │ Service │───▶│ Replica │ (for heavy read loads)             │
│  └─────────┘    └─────────┘                                    │
│                                                                  │
│  Pattern 3: Elasticsearch                                       │
│  ┌─────────┐    ┌─────────┐                                    │
│  │ Service │───▶│   ES    │ (for full-text search)             │
│  └─────────┘    └─────────┘                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Write Patterns

```
┌─────────────────────────────────────────────────────────────────┐
│                      WRITE PATTERNS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Pattern 1: Write-Through Cache                                 │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                     │
│  │ Service │───▶│   DB    │───▶│  Redis  │                     │
│  └─────────┘    └─────────┘    └─────────┘                     │
│                                                                  │
│  Pattern 2: Event Sourcing (Messages)                           │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                     │
│  │ Service │───▶│  Kafka  │───▶│ MongoDB │                     │
│  └─────────┘    └─────────┘    └─────────┘                     │
│                                                                  │
│  Pattern 3: Dual Write (Search Index)                           │
│  ┌─────────┐    ┌─────────┐                                    │
│  │ Service │───▶│   DB    │                                    │
│  │         │───▶│   ES    │                                    │
│  └─────────┘    └─────────┘                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Service Communication

### Synchronous (REST/gRPC)

```typescript
// Gateway calling User Service
const user = await this.httpService.get(
  `http://user-service:8082/api/users/${userId}`
).toPromise();
```

### Asynchronous (Kafka)

```typescript
// Publishing event
await this.kafkaService.emit('QuckApp.users.events', {
  type: 'USER_UPDATED',
  payload: { userId, changes },
  timestamp: new Date().toISOString(),
});

// Consuming event
@EventPattern('QuckApp.users.events')
async handleUserEvent(data: UserEvent) {
  if (data.type === 'USER_UPDATED') {
    await this.cacheService.invalidate(`user:${data.payload.userId}`);
  }
}
```

### WebSocket (Real-time)

```elixir
# Phoenix Channel broadcast
def handle_in("new_message", payload, socket) do
  broadcast!(socket, "new_message", payload)
  {:noreply, socket}
end
```

## Data Consistency

### Eventual Consistency Model

```
┌─────────────────────────────────────────────────────────────────┐
│                  CONSISTENCY MODEL                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Strong Consistency (Synchronous)                               │
│  ├── User Authentication                                        │
│  ├── Permission Checks                                          │
│  └── Financial Transactions                                     │
│                                                                  │
│  Eventual Consistency (Asynchronous)                            │
│  ├── Message Delivery                                           │
│  ├── Notification Delivery                                      │
│  ├── Analytics Updates                                          │
│  ├── Search Index Updates                                       │
│  └── Audit Log Storage                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Saga Pattern (Distributed Transactions)

```
┌─────────────────────────────────────────────────────────────────┐
│              SAGA: Create Workspace                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: Create Workspace Record                                │
│          ├── Success → Step 2                                   │
│          └── Failure → End                                      │
│                                                                  │
│  Step 2: Create Default Channel                                 │
│          ├── Success → Step 3                                   │
│          └── Failure → Compensate Step 1                        │
│                                                                  │
│  Step 3: Add Creator as Admin                                   │
│          ├── Success → Step 4                                   │
│          └── Failure → Compensate Steps 1-2                     │
│                                                                  │
│  Step 4: Send Welcome Notification                              │
│          ├── Success → Complete                                 │
│          └── Failure → Log Warning (non-critical)               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
