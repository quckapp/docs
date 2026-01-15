---
sidebar_position: 1
---

# Microservices Overview

QuckApp consists of **32+ microservices** built with 5 different technology stacks.

## Service Categories

### Authentication & Security (Spring Boot)

| Service | Port | Database | Description |
|---------|------|----------|-------------|
| [auth-service](./spring-boot/auth-service) | 8081 | MySQL | JWT, OAuth, 2FA, OTP |
| [user-service](./spring-boot/user-service) | 8082 | MySQL | User CRUD, profiles |
| [permission-service](./spring-boot/permission-service) | 8083 | MySQL | RBAC, Casbin |
| [audit-service](./spring-boot/audit-service) | 8084 | MySQL | Audit logging |
| [admin-service](./spring-boot/admin-service) | 8085 | MySQL | Admin operations |

### API & Notifications (NestJS)

| Service | Port | Database | Description |
|---------|------|----------|-------------|
| [backend-gateway](./nestjs/backend-gateway) | 3000 | PostgreSQL | API Gateway |
| [realtime-service](./nestjs/realtime-service) | 4000 | Redis | WebSocket Gateway |
| [notification-service](./nestjs/notification-service) | 3001 | PostgreSQL | Push, Email, SMS |

### Real-time Communication (Elixir)

#### Consolidated Realtime Service (Recommended)

| Service | Port | Database | Description |
|---------|------|----------|-------------|
| [**realtime-service**](./elixir/realtime-service) | 4000 | MySQL + MongoDB + Redis | Consolidated real-time service |

The consolidated **realtime-service** combines all real-time features into a single high-performance Elixir/Phoenix service:

**Core Features:**
- Real-time messaging via Phoenix Channels
- User presence tracking (ETS + Redis)
- Typing indicators with auto-expiry
- Store-and-forward for offline messages
- Erlang clustering for horizontal scaling

**Voice/Video Calls:**
- WebRTC signaling (offer/answer/ICE)
- TURN credential generation (RFC 5766)
- Call session actors with state machine
- Call recording with cloud storage

**Push Notifications:**
- APNs provider (iOS) with JWT authentication
- FCM provider (Android)
- Email notifications (SMTP, SendGrid, AWS SES, Mailgun)
- Device token management (max 10 devices per user)

**Additional Features:**
- Huddle management (audio rooms)
- Kafka event streaming
- Prometheus metrics
- Health checks with dependency status

#### Individual Services (Legacy/Specialized)

| Service | Port | Database | Description |
|---------|------|----------|-------------|
| [presence-service](./elixir/presence-service) | 4001 | MongoDB | Online status |
| [call-service](./elixir/call-service) | 4002 | MongoDB | Voice/Video calls |
| [message-service](./elixir/message-service) | 4003 | MongoDB | Real-time messaging |
| [notification-orchestrator](./elixir/notification-orchestrator) | 4004 | MongoDB | Notification delivery |
| [huddle-service](./elixir/huddle-service) | 4005 | MongoDB | Audio rooms |
| [event-broadcast-service](./elixir/event-broadcast-service) | 4006 | MongoDB | Event distribution |

> **Migration Note:** The consolidated realtime-service can replace all individual Elixir services.

### Organization & Storage (Go)

| Service | Port | Database | Description |
|---------|------|----------|-------------|
| [workspace-service](./go/workspace-service) | 5004 | MySQL | Workspace management |
| [channel-service](./go/channel-service) | 5005 | MySQL | Channel management |
| [search-service](./go/search-service) | 5006 | MySQL + ES | Full-text search |
| [thread-service](./go/thread-service) | 5009 | MySQL | Thread conversations |
| [bookmark-service](./go/bookmark-service) | 5010 | MySQL | Saved items |
| [reminder-service](./go/reminder-service) | 5011 | MySQL | Reminders |
| [media-service](./go/media-service) | 5001 | MongoDB | Media processing |
| [file-service](./go/file-service) | 5002 | MongoDB | File storage |
| [attachment-service](./go/attachment-service) | 5012 | MongoDB | Attachments |
| [cdn-service](./go/cdn-service) | 5013 | MongoDB | CDN management |

### AI & Analytics (Python)

| Service | Port | Database | Description |
|---------|------|----------|-------------|
| [analytics-service](./python/analytics-service) | 5007 | MySQL | Usage analytics |
| [moderation-service](./python/moderation-service) | 5014 | MySQL | Content moderation |
| [export-service](./python/export-service) | 5015 | MySQL | Data export |
| [integration-service](./python/integration-service) | 5016 | MySQL | Third-party integrations |
| [ml-service](./python/ml-service) | 5008 | Databricks | ML predictions |
| [sentiment-service](./python/sentiment-service) | 5017 | Databricks | Sentiment analysis |
| [insights-service](./python/insights-service) | 5018 | Databricks | Business insights |
| [smart-reply-service](./python/smart-reply-service) | 5019 | Databricks | AI suggestions |

## Technology Rationale

### Why Elixir for Real-time?

- **Millions of connections** - OTP/BEAM VM designed for concurrency
- **Fault tolerance** - Supervisor trees, let it crash philosophy
- **Phoenix Channels** - Built-in WebSocket abstraction
- **Low latency** - Sub-millisecond message routing
- **Actor model** - Per-user/per-call GenServer processes
- **Hot code upgrades** - Zero-downtime deployments

## Health Endpoints

All services expose health endpoints:

- GET /health
- GET /health/ready (Kubernetes readiness)
- GET /health/live (Kubernetes liveness)
- GET /actuator/health (Spring Boot)
