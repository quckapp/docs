---
sidebar_position: 1
---

# Common Utilities Overview

Shared utilities and modules used across QuckApp's NestJS services.

## Directory Structure

```
backend/src/common/
├── bullmq/          # Queue processing
├── cache/           # Redis caching
├── casbin/          # RBAC authorization
├── consul/          # Service discovery
├── cqrs/            # Command/Query separation
├── database/        # Database utilities
├── decorators/      # Custom decorators
├── dto/             # Data transfer objects
├── email/           # Email service
├── events/          # Event system
├── exceptions/      # Custom exceptions
├── filters/         # Exception filters
├── guards/          # Auth guards
├── http/            # HTTP client
├── i18n/            # Internationalization
├── interceptors/    # Request interceptors
├── kafka/           # Kafka integration
├── logger/          # Logging & audit
├── monitoring/      # Datadog monitoring
├── pipes/           # Validation pipes
├── rabbitmq/        # RabbitMQ integration
├── search/          # Elasticsearch
├── security/        # Security config
├── services/        # Shared services
├── storage/         # File storage
├── throttler/       # Rate limiting
├── utils/           # Utility functions
├── validators/      # Custom validators
└── vault/           # Secrets management
```

## Key Modules

| Module | Purpose |
|--------|---------|
| [Security](./security) | Helmet, CORS, rate limiting |
| [Guards](./guards) | Role & permission guards |
| [Casbin RBAC](./casbin-rbac) | Role-based access control |
| [Audit Logging](./audit-logging) | Activity tracking |
| [Exceptions](./exceptions) | Custom exception types |
| [Vault](./vault) | Secrets management |
| [Consul](./consul) | Service discovery |
| [Kafka](./kafka) | Event streaming |
| [Database](./database) | Plugins & migrations |

## Usage

```typescript
// Import from common module
import {
  RolesGuard,
  Roles,
  AuditService,
  CacheService,
  KafkaService,
} from '@common';

@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private audit: AuditService,
    private cache: CacheService,
  ) {}

  @Get(':id')
  @Roles('user', 'admin')
  async getUser(@Param('id') id: string) {
    // Check cache first
    const cached = await this.cache.get(`user:${id}`);
    if (cached) return cached;

    // ... fetch and cache
  }
}
```
