---
sidebar_position: 2
---

# Local Environment (Mock)

The local environment enables developers to run the entire QuckApp stack on their machine with mocked external services and seeded data.

## Overview

| Aspect | Configuration |
|--------|---------------|
| **URL** | `http://localhost:3000` |
| **Purpose** | Local development and testing |
| **Data** | Mock data / Seed scripts |
| **External Services** | Mocked (LocalStack, MailHog, etc.) |
| **Deployment** | Docker Compose |

## Prerequisites

```bash
# Required software
- Docker Desktop 4.x+
- Docker Compose 2.x+
- Node.js 20.x LTS
- Go 1.21+
- Python 3.11+
- Java 17+ (for Spring Boot services)
- Elixir 1.15+ (for Phoenix services)
```

## Quick Start

```bash
# Clone repository
git clone https://github.com/QuckApp/QuckApp.git
cd QuckApp

# Copy environment template
cp .env.example .env.local

# Start infrastructure (databases, cache, queue)
docker-compose -f docker-compose.local.yml up -d

# Seed databases
./scripts/seed-local.sh

# Start all services in development mode
./scripts/start-local.sh
```

## Docker Compose Configuration

```yaml
# docker-compose.local.yml
version: '3.8'

services:
  # ===================
  # DATABASES (Lightweight)
  # ===================
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: QuckApp
      POSTGRES_PASSWORD: localpass
      POSTGRES_DB: QuckApp
    ports:
      - "5432:5432"
    volumes:
      - postgres_local:/var/lib/postgresql/data
      - ./scripts/init-local-postgres.sql:/docker-entrypoint-initdb.d/init.sql

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: localroot
      MYSQL_USER: QuckApp
      MYSQL_PASSWORD: localpass
    ports:
      - "3306:3306"
    volumes:
      - mysql_local:/var/lib/mysql
      - ./scripts/init-local-mysql.sql:/docker-entrypoint-initdb.d/init.sql

  mongodb:
    image: mongo:6.0
    environment:
      MONGO_INITDB_ROOT_USERNAME: QuckApp
      MONGO_INITDB_ROOT_PASSWORD: localpass
    ports:
      - "27017:27017"
    volumes:
      - mongodb_local:/data/db

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # ===================
  # MESSAGE QUEUE (Single node)
  # ===================
  kafka:
    image: confluentinc/cp-kafka:7.4.0
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      CLUSTER_ID: local-cluster-id
    ports:
      - "9092:9092"

  # ===================
  # SEARCH
  # ===================
  elasticsearch:
    image: elasticsearch:8.8.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms256m -Xmx256m"
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_local:/usr/share/elasticsearch/data

  # ===================
  # MOCK SERVICES
  # ===================
  localstack:
    image: localstack/localstack:latest
    environment:
      SERVICES: s3,ses,sns,sqs
      DEFAULT_REGION: us-east-1
    ports:
      - "4566:4566"
    volumes:
      - localstack_local:/var/lib/localstack

  mailhog:
    image: mailhog/mailhog:latest
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web UI

  # ===================
  # SERVICE DISCOVERY (Dev mode)
  # ===================
  consul:
    image: hashicorp/consul:1.17
    command: agent -dev -client=0.0.0.0
    ports:
      - "8500:8500"

  vault:
    image: hashicorp/vault:1.15
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: local-dev-token
      VAULT_DEV_LISTEN_ADDRESS: 0.0.0.0:8200
    ports:
      - "8200:8200"
    cap_add:
      - IPC_LOCK

volumes:
  postgres_local:
  mysql_local:
  mongodb_local:
  elasticsearch_local:
  localstack_local:

networks:
  default:
    name: QuckApp-local
```

## Environment Variables

```bash
# .env.local

# Environment
NODE_ENV=development
ENVIRONMENT=local

# API URLs
API_URL=http://localhost:3000
WS_URL=ws://localhost:3001
CDN_URL=http://localhost:4566/QuckApp-local

# Database - PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=QuckApp
POSTGRES_PASSWORD=localpass
POSTGRES_DB=QuckApp

# Database - MySQL
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=QuckApp
MYSQL_PASSWORD=localpass
MYSQL_DATABASE=QuckApp_auth

# Database - MongoDB
MONGODB_URI=mongodb://QuckApp:localpass@localhost:27017/QuckApp?authSource=admin

# Redis
REDIS_URL=redis://localhost:6379

# Kafka
KAFKA_BROKERS=localhost:9092

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200

# Consul
CONSUL_HOST=localhost
CONSUL_PORT=8500

# Vault
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=local-dev-token

# Mock AWS (LocalStack)
AWS_ENDPOINT=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=us-east-1
S3_BUCKET=QuckApp-local

# Mock Email (MailHog)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=

# JWT (Development keys)
JWT_ACCESS_SECRET=local-access-secret-key-not-for-production
JWT_REFRESH_SECRET=local-refresh-secret-key-not-for-production

# Feature Flags
ENABLE_MOCK_AUTH=true
ENABLE_SEED_DATA=true
DISABLE_RATE_LIMITING=true
```

## Seed Data

```bash
#!/bin/bash
# scripts/seed-local.sh

echo "Seeding local databases..."

# Wait for databases
./scripts/wait-for-it.sh localhost:5432 -t 30
./scripts/wait-for-it.sh localhost:3306 -t 30
./scripts/wait-for-it.sh localhost:27017 -t 30

# Seed PostgreSQL
psql -h localhost -U QuckApp -d QuckApp -f ./seeds/postgres/workspaces.sql
psql -h localhost -U QuckApp -d QuckApp -f ./seeds/postgres/channels.sql

# Seed MySQL
mysql -h localhost -u QuckApp -plocalpass QuckApp_auth < ./seeds/mysql/users.sql
mysql -h localhost -u QuckApp -plocalpass QuckApp_auth < ./seeds/mysql/roles.sql

# Seed MongoDB
mongosh "mongodb://QuckApp:localpass@localhost:27017/QuckApp?authSource=admin" ./seeds/mongodb/messages.js

# Seed Elasticsearch indices
curl -X PUT "localhost:9200/QuckApp-messages" -H "Content-Type: application/json" -d @./seeds/elasticsearch/messages-mapping.json
curl -X POST "localhost:9200/QuckApp-messages/_bulk" -H "Content-Type: application/json" --data-binary @./seeds/elasticsearch/messages-data.json

# Setup LocalStack S3
aws --endpoint-url=http://localhost:4566 s3 mb s3://QuckApp-local
aws --endpoint-url=http://localhost:4566 s3 cp ./seeds/files/ s3://QuckApp-local/files/ --recursive

# Setup Vault secrets
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=local-dev-token
vault kv put secret/database/postgres host=localhost port=5432 username=QuckApp password=localpass
vault kv put secret/jwt access_secret=local-access-secret refresh_secret=local-refresh-secret

echo "Seeding complete!"
```

## Mock Users

| Email | Password | Role |
|-------|----------|------|
| admin@local.dev | admin123 | Super Admin |
| owner@local.dev | owner123 | Workspace Owner |
| member@local.dev | member123 | Member |
| guest@local.dev | guest123 | Guest |

## Running Services Individually

```bash
# Backend Gateway (NestJS)
cd backend && npm run start:dev

# Auth Service (Spring Boot)
cd services/auth-service && ./gradlew bootRun

# User Service (Spring Boot)
cd services/user-service && ./gradlew bootRun

# Workspace Service (Go)
cd services/workspace-service && go run main.go

# Message Service (Elixir)
cd services/message-service && mix phx.server

# Analytics Service (Python)
cd services/analytics-service && uvicorn main:app --reload
```

## Debugging

### View Logs

```bash
# All services
docker-compose -f docker-compose.local.yml logs -f

# Specific service
docker-compose -f docker-compose.local.yml logs -f postgres

# Application logs
tail -f logs/backend.log
```

### Access Tools

| Tool | URL | Purpose |
|------|-----|---------|
| Consul UI | http://localhost:8500 | Service discovery |
| Vault UI | http://localhost:8200 | Secrets management |
| MailHog | http://localhost:8025 | Email testing |
| Kafka UI | http://localhost:9000 | Message queue |
| Elasticsearch | http://localhost:9200 | Search indices |

## Troubleshooting

### Reset Everything

```bash
# Stop all containers
docker-compose -f docker-compose.local.yml down -v

# Remove volumes
docker volume prune -f

# Restart
docker-compose -f docker-compose.local.yml up -d
./scripts/seed-local.sh
```

### Port Conflicts

```bash
# Check what's using a port
lsof -i :3000
netstat -ano | findstr :3000  # Windows

# Kill process
kill -9 <PID>
```
