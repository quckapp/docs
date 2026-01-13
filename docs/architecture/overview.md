---
sidebar_position: 1
---

# Architecture Overview

QuikApp is built on a **polyglot microservices architecture** designed for scalability, maintainability, and performance.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │   Web    │  │  Mobile  │  │ Desktop  │  │   CLI    │  │   API    │      │
│  │  (React) │  │(RN/Flutter)│ │(Electron)│  │          │  │ Clients  │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
└───────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┘
        │             │             │             │             │
        └─────────────┴─────────────┴─────────────┴─────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NGINX REVERSE PROXY                                │
│                              (Port 80/443)                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Rate Limiting │ SSL Termination │ Load Balancing │ Caching         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│    NestJS     │         │    NestJS     │         │    NestJS     │
│   Backend     │         │   Realtime    │         │ Notification  │
│   Gateway     │         │   Gateway     │         │   Service     │
│  (Port 3000)  │         │  (Port 4000)  │         │  (Port 3001)  │
└───────┬───────┘         └───────┬───────┘         └───────┬───────┘
        │                         │                         │
        └─────────────────────────┼─────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │      APACHE KAFKA         │
                    │    (Event Streaming)      │
                    └─────────────┬─────────────┘
                                  │
    ┌─────────────────────────────┼─────────────────────────────┐
    │                             │                             │
    ▼                             ▼                             ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  SPRING BOOT    │   │     ELIXIR      │   │       GO        │
│   SERVICES      │   │    SERVICES     │   │    SERVICES     │
├─────────────────┤   ├─────────────────┤   ├─────────────────┤
│ • Auth          │   │ • Presence      │   │ • Workspace     │
│ • User          │   │ • Call          │   │ • Channel       │
│ • Permission    │   │ • Message       │   │ • Search        │
│ • Audit         │   │ • Notification  │   │ • Media         │
│ • Admin         │   │ • Huddle        │   │ • File          │
│                 │   │ • Event Broadcast│   │ • Thread        │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │
         │            ┌────────┴────────┐            │
         │            │     PYTHON      │            │
         │            │    SERVICES     │            │
         │            ├─────────────────┤            │
         │            │ • Analytics     │            │
         │            │ • ML            │            │
         │            │ • Sentiment     │            │
         │            │ • Moderation    │            │
         │            └────────┬────────┘            │
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────┐
│                         DATABASES                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │PostgreSQL│  │  MySQL   │  │ MongoDB  │  │  Redis   │     │
│  │ (NestJS) │  │ (Spring) │  │ (Elixir) │  │ (Cache)  │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
│                     ┌──────────────┐                         │
│                     │Elasticsearch │                         │
│                     │   (Search)   │                         │
│                     └──────────────┘                         │
└──────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Polyglot Architecture

Each service uses the language/framework best suited for its task:

| Language | Strengths | Used For |
|----------|-----------|----------|
| **Java/Spring Boot** | Enterprise security, transactions | Authentication, RBAC, Audit |
| **TypeScript/NestJS** | API composition, real-time | Gateway, Notifications |
| **Elixir/Phoenix** | Concurrency, fault tolerance | Real-time messaging, WebSockets |
| **Go** | High performance, low latency | CRUD operations, file handling |
| **Python** | ML libraries, data science | Analytics, AI features |

### 2. Event-Driven Architecture

Services communicate through Apache Kafka for:
- **Loose coupling** - Services don't need to know about each other
- **Scalability** - Events can be processed in parallel
- **Reliability** - Events are persisted and can be replayed
- **Auditability** - Complete event history

### 3. Database Per Service

Each service owns its data:

| Service Category | Database | Reason |
|-----------------|----------|--------|
| Auth/User/Permission | MySQL | ACID transactions, relational integrity |
| Presence/Messages/Calls | MongoDB | High write throughput, flexible schema |
| Gateway/Notifications | PostgreSQL | Complex queries, JSONB support |
| All Services | Redis | Caching, session storage, pub/sub |

### 4. API Gateway Pattern

The NestJS Backend Gateway provides:
- **Single entry point** for all client requests
- **Authentication** validation
- **Rate limiting** per user/endpoint
- **Request routing** to appropriate services
- **Response aggregation** from multiple services
- **Protocol translation** (REST ↔ gRPC ↔ WebSocket)

## Service Categories

### Core Services (Always Required)

```
┌─────────────────────────────────────────────────┐
│                 CORE SERVICES                    │
├─────────────────────────────────────────────────┤
│  Backend Gateway    │  API orchestration        │
│  Auth Service       │  Authentication           │
│  User Service       │  User management          │
│  Permission Service │  RBAC                     │
└─────────────────────────────────────────────────┘
```

### Communication Services

```
┌─────────────────────────────────────────────────┐
│              COMMUNICATION SERVICES              │
├─────────────────────────────────────────────────┤
│  Message Service    │  Real-time messaging      │
│  Presence Service   │  Online status            │
│  Call Service       │  Voice/video calls        │
│  Huddle Service     │  Audio rooms              │
│  Notification       │  Push notifications       │
└─────────────────────────────────────────────────┘
```

### Organization Services

```
┌─────────────────────────────────────────────────┐
│             ORGANIZATION SERVICES                │
├─────────────────────────────────────────────────┤
│  Workspace Service  │  Workspace management     │
│  Channel Service    │  Channel management       │
│  Thread Service     │  Thread conversations     │
│  Search Service     │  Full-text search         │
└─────────────────────────────────────────────────┘
```

### Media Services

```
┌─────────────────────────────────────────────────┐
│                MEDIA SERVICES                    │
├─────────────────────────────────────────────────┤
│  Media Service      │  Image/video processing   │
│  File Service       │  File storage             │
│  Attachment Service │  Message attachments      │
│  CDN Service        │  Content delivery         │
└─────────────────────────────────────────────────┘
```

### Intelligence Services

```
┌─────────────────────────────────────────────────┐
│             INTELLIGENCE SERVICES                │
├─────────────────────────────────────────────────┤
│  Analytics Service  │  Usage analytics          │
│  ML Service         │  Recommendations          │
│  Sentiment Service  │  Message analysis         │
│  Smart Reply        │  AI suggestions           │
│  Moderation         │  Content filtering        │
└─────────────────────────────────────────────────┘
```

## Communication Patterns

### Synchronous (REST/gRPC)

Used for:
- User-facing API requests
- Service-to-service queries
- Real-time data requirements

```
Client → Gateway → Service → Database → Response
```

### Asynchronous (Kafka Events)

Used for:
- Cross-service notifications
- Analytics data collection
- Audit logging
- Background processing

```
Service A → Kafka Topic → Service B, C, D (parallel)
```

### Real-time (WebSocket)

Used for:
- Instant messaging
- Presence updates
- Typing indicators
- Call signaling

```
Client ↔ Realtime Gateway ↔ Elixir Services (Phoenix Channels)
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                           │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Network    │ Nginx, TLS, Rate Limiting            │
│  Layer 2: Gateway    │ JWT Validation, API Keys             │
│  Layer 3: Service    │ RBAC (Casbin), Permission Guards     │
│  Layer 4: Data       │ Encryption at Rest, Field Encryption │
│  Layer 5: Audit      │ Complete Activity Logging            │
└─────────────────────────────────────────────────────────────┘
```

## Next Steps

- [Tech Stack Details](./tech-stack) - Deep dive into each technology
- [Data Flow](./data-flow) - How data moves through the system
- [Security](./security) - Security implementation details
- [Scalability](./scalability) - Scaling strategies
