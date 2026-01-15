---
sidebar_position: 1
---

# Development Documentation Overview

Development documents help engineers **build and maintain** QuckApp. These documents bridge the gap between design specifications and working code.

## Document Types

| Document | Purpose | Primary Audience |
|----------|---------|------------------|
| [Technical Design Document](./technical-design) | Detailed module/component designs | Engineers |
| [API Documentation](../api/overview) | API specifications | All developers |
| [Code Standards](./code-standards) | Coding guidelines | All developers |
| [Development Setup](../getting-started) | Local environment setup | New developers |

## Development Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Development Workflow                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Requirements                                                            │
│     │ SRS, PRD, User Stories                                               │
│     ▼                                                                        │
│  2. Design                                                                  │
│     │ System Architecture, Database Design                                  │
│     ▼                                                                        │
│  3. Technical Design                                                        │
│     │ TDD, API Specs, Component Design                                     │
│     ▼                                                                        │
│  4. Implementation                                                          │
│     │ Code, Unit Tests, Documentation                                      │
│     ▼                                                                        │
│  5. Code Review                                                             │
│     │ PR Review, Security Review                                           │
│     ▼                                                                        │
│  6. Testing                                                                 │
│     │ Integration Tests, QA Testing                                        │
│     ▼                                                                        │
│  7. Deployment                                                              │
│     │ CI/CD Pipeline, Environment Promotion                                │
│     ▼                                                                        │
│  8. Monitoring                                                              │
│       Metrics, Logs, Alerts                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stacks

### Backend Services

| Stack | Services | Docs |
|-------|----------|------|
| **Spring Boot** | Auth, User, Permission, Audit, Admin | [Spring Boot Services](../microservices/spring-boot/auth-service) |
| **NestJS** | Gateway, Notification, Realtime | [NestJS Services](../microservices/nestjs/backend-gateway) |
| **Elixir** | Presence, Call, Message, Huddle | [Elixir Services](../microservices/elixir/presence-service) |
| **Go** | Workspace, Channel, Search, Media | [Go Services](../microservices/go/workspace-service) |
| **Python** | Analytics, ML, Moderation | [Python Services](../microservices/python/analytics-service) |

### Frontend Applications

| Platform | Technology | Docs |
|----------|------------|------|
| **Web** | React, TypeScript | Coming soon |
| **iOS** | Swift, SwiftUI | Coming soon |
| **Android** | Kotlin, Jetpack | Coming soon |
| **Desktop** | Electron | Coming soon |

## API Documentation

### REST API
- [Authentication](../api/rest/authentication)
- [Users](../api/rest/users)
- [Workspaces](../api/rest/workspaces)
- [Channels](../api/rest/channels)
- [Messages](../api/rest/messages)
- [Calls](../api/rest/calls)
- [Files](../api/rest/files)
- [Search](../api/rest/search)

### WebSocket API
- [WebSocket API](../api/websocket)

### gRPC API
- [gRPC API](../api/grpc)

## Development Tools

### Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Docker | 24+ | Containerization |
| Kubernetes | 1.28+ | Orchestration |
| Git | 2.40+ | Version control |
| Node.js | 20 LTS | NestJS, tooling |
| Go | 1.21+ | Go services |
| Java | 21 LTS | Spring Boot |
| Python | 3.11+ | Python services |
| Elixir | 1.15+ | Elixir services |

### Recommended IDEs

| IDE | Languages |
|-----|-----------|
| **IntelliJ IDEA** | Java, Kotlin |
| **VS Code** | TypeScript, Go, Python |
| **GoLand** | Go |
| **PyCharm** | Python |

## Code Quality

### Linting & Formatting

| Language | Linter | Formatter |
|----------|--------|-----------|
| Java | Checkstyle, SpotBugs | Google Java Format |
| TypeScript | ESLint | Prettier |
| Go | golangci-lint | gofmt |
| Python | Ruff, MyPy | Black |
| Elixir | Credo | mix format |

### Testing Requirements

| Type | Coverage | Tools |
|------|----------|-------|
| Unit Tests | > 80% | JUnit, Jest, GoTest |
| Integration Tests | Critical paths | Testcontainers |
| E2E Tests | Happy paths | Playwright |

## Related Documentation

- [Architecture Overview](../architecture/overview)
- [Microservices](../microservices/overview)
- [API Documentation](../api/overview)
- [DevOps](../devops/overview)
