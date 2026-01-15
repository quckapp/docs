# Docker Local Development

This documentation covers the Docker Compose setup for local development of QuckApp.

## Overview

The Docker setup provides local alternatives to AWS services, allowing developers to work without AWS credentials or incurring cloud costs.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Docker Network                                │
│                       (quckapp-network)                             │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────────┐ │
│  │  PostgreSQL │  │    Redis    │  │         LocalStack           │ │
│  │   :5432     │  │    :6379    │  │           :4566              │ │
│  │             │  │             │  │  ┌─────┬─────┬─────┬─────┐   │ │
│  │  - users    │  │  - cache    │  │  │ S3  │ SQS │ SNS │ DDB │   │ │
│  │  - media    │  │  - sessions │  │  └─────┴─────┴─────┴─────┘   │ │
│  │  - messages │  │  - pubsub   │  │                              │ │
│  └─────────────┘  └─────────────┘  └──────────────────────────────┘ │
│                                                                     │
│  Optional Services (Profiles)                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Keycloak  │  │   MailHog   │  │    MinIO    │                 │
│  │    :8080    │  │    :8025    │  │    :9001    │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
│                                                                     │
│  Admin Tools (Profiles)                                             │
│  ┌─────────────┐  ┌─────────────┐                                  │
│  │   Adminer   │  │   Redis     │                                  │
│  │    :8081    │  │  Commander  │                                  │
│  │             │  │    :8082    │                                  │
│  └─────────────┘  └─────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
cd docker

# Copy environment file
cp .env.example .env

# Start core services
docker-compose up -d

# Verify all services are healthy
docker-compose ps
```

## Service Details

### PostgreSQL (RDS Alternative)

PostgreSQL 16 Alpine with:
- Automatic schema initialization
- Test data seeding
- Health checks

**Connection:**
```
Host: localhost
Port: 5432
User: quckapp
Password: quckapp_dev
Database: quckapp
```

### Redis (ElastiCache Alternative)

Redis 7 Alpine with:
- AOF persistence
- 256MB memory limit
- LRU eviction policy

**Connection:**
```
Host: localhost
Port: 6379
```

### LocalStack (AWS Services)

Emulates multiple AWS services:

| Service | Port | Endpoint |
|---------|------|----------|
| S3 | 4566 | http://localhost:4566 |
| DynamoDB | 4566 | http://localhost:4566 |
| SQS | 4566 | http://localhost:4566 |
| SNS | 4566 | http://localhost:4566 |
| Secrets Manager | 4566 | http://localhost:4566 |
| KMS | 4566 | http://localhost:4566 |
| Lambda | 4566 | http://localhost:4566 |

## Profiles

Optional services are enabled via Docker Compose profiles:

```bash
# Single profile
docker-compose --profile auth up -d

# Multiple profiles
docker-compose --profile auth --profile tools up -d
```

### Available Profiles

| Profile | Services | Use Case |
|---------|----------|----------|
| `minio` | MinIO | S3-compatible storage with web UI |
| `dynamodb` | DynamoDB Local | Alternative to LocalStack DynamoDB |
| `auth` | Keycloak | Cognito-like authentication |
| `mail` | MailHog | Email testing |
| `tools` | Adminer, Redis Commander | Database admin UIs |

## Initialization Scripts

### LocalStack (`init-scripts/localstack/01-init-aws.sh`)

Creates:
- S3 buckets with CORS configuration
- DynamoDB tables with GSIs
- SQS queues with DLQ
- SNS topics
- Secrets Manager entries
- KMS keys

### PostgreSQL (`init-scripts/postgres/01-init-db.sql`)

Creates:
- Database schema (users, media, messages, etc.)
- Indexes for performance
- Triggers for updated_at
- Test seed data

## Data Persistence

Docker volumes persist data between restarts:

```bash
# List volumes
docker volume ls | grep quckapp

# Remove all data
docker-compose down -v
```

## AWS CLI Examples

```bash
# Configure alias for convenience
alias awslocal='aws --endpoint-url=http://localhost:4566'

# S3
awslocal s3 ls
awslocal s3 cp file.txt s3://quckapp-media-dev/
awslocal s3 ls s3://quckapp-media-dev/

# DynamoDB
awslocal dynamodb list-tables
awslocal dynamodb scan --table-name quckapp-media-metadata

# SQS
awslocal sqs list-queues
awslocal sqs send-message \
  --queue-url http://localhost:4566/000000000000/quckapp-media-processing \
  --message-body '{"mediaId": "123"}'

# SNS
awslocal sns list-topics
awslocal sns publish \
  --topic-arn arn:aws:sns:us-east-1:000000000000:quckapp-media-events-dev \
  --message '{"event": "test"}'

# Secrets Manager
awslocal secretsmanager list-secrets
awslocal secretsmanager get-secret-value --secret-id quckapp/dev/database
```

## Application Integration

### Environment Variables

```bash
# AWS Configuration
AWS_ENDPOINT_URL=http://localhost:4566
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# Database
DATABASE_URL=postgresql://quckapp:quckapp_dev@localhost:5432/quckapp

# Redis
REDIS_URL=redis://localhost:6379
```

### SDK Configuration

See the [docker/README.md](../../docker/README.md) for SDK configuration examples.

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs <service>

# Check port conflicts
lsof -i :5432
lsof -i :6379
lsof -i :4566
```

### LocalStack Resources Missing

```bash
# Re-run initialization
docker-compose exec localstack /etc/localstack/init/ready.d/01-init-aws.sh
```

### Database Schema Issues

```bash
# Connect and check
docker-compose exec postgres psql -U quckapp -d quckapp -c '\dt'

# Reset database
docker-compose down -v
docker-compose up -d postgres
```

## Comparison with Production

| Aspect | Local (Docker) | Production (AWS) |
|--------|---------------|------------------|
| PostgreSQL | Docker container | RDS Multi-AZ |
| Redis | Single instance | ElastiCache cluster |
| S3 | LocalStack | S3 with replication |
| DynamoDB | LocalStack | DynamoDB on-demand |
| Authentication | Keycloak (optional) | Cognito |
| Scaling | None | Auto-scaling |
| Encryption | None | KMS encryption |
| Backups | Manual | Automated |

## Related Documentation

- [Terraform Modules](../terraform/README.md)
- [CI/CD Workflows](../terraform/ci-cd.md)
- [Environment Configuration](../terraform/environments.md)
