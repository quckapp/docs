---
sidebar_position: 2
---

# Getting Started

This guide will help you set up QuikApp for local development.

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Docker | 24.0+ | Container runtime |
| Docker Compose | 2.20+ | Multi-container orchestration |
| Node.js | 20.0+ | NestJS services |
| Java | 21+ | Spring Boot services |
| Go | 1.21+ | Go microservices |
| Elixir | 1.15+ | Phoenix services |
| Python | 3.11+ | ML/Analytics services |

### Optional Tools

- **kubectl** - Kubernetes CLI (for K8s deployment)
- **Helm** - Kubernetes package manager
- **pgAdmin** - PostgreSQL GUI
- **MongoDB Compass** - MongoDB GUI
- **Redis Insight** - Redis GUI

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/QuikApp/QuikApp.git
cd QuikApp
```

### 2. Set Up Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your configuration
# Required variables:
# - DATABASE_URL
# - REDIS_URL
# - JWT_SECRET
# - KAFKA_BROKERS
```

### 3. Start Infrastructure Services

```bash
# Start databases and message queues
docker-compose up -d
```

This starts:
- PostgreSQL (port 5432)
- MySQL (port 3306)
- MongoDB (port 27017)
- Redis (port 6379)
- Kafka (port 9092)
- Zookeeper (port 2181)
- Elasticsearch (port 9200)

### 4. Start Microservices

#### Option A: Docker Compose (Recommended)

```bash
# Start all services
docker-compose -f docker-compose.yml -f docker-compose.services.yml up -d
```

#### Option B: Individual Services

```bash
# Start NestJS Backend Gateway
cd backend && npm install && npm run start:dev

# Start Spring Boot Auth Service
cd services/auth-service && ./mvnw spring-boot:run

# Start Elixir Presence Service
cd services/presence-service && mix deps.get && mix phx.server

# Start Go Workspace Service
cd services/workspace-service && go run main.go

# Start Python Analytics Service
cd services/analytics-service && pip install -r requirements.txt && uvicorn main:app --reload
```

### 5. Verify Installation

```bash
# Check all services are running
docker-compose ps

# Test the API Gateway
curl http://localhost:3000/health

# Test individual services
curl http://localhost:8081/actuator/health  # Auth Service
curl http://localhost:4001/health           # Presence Service
curl http://localhost:5004/health           # Workspace Service
```

## Project Structure

```
QuikApp/
├── backend/                    # NestJS API Gateway
│   ├── src/
│   │   ├── common/            # Shared utilities
│   │   ├── microservices/     # Internal microservice modules
│   │   └── modules/           # Feature modules
│   └── package.json
├── services/                   # Polyglot microservices
│   ├── auth-service/          # Spring Boot (Java)
│   ├── user-service/          # Spring Boot (Java)
│   ├── presence-service/      # Elixir/Phoenix
│   ├── call-service/          # Elixir/Phoenix
│   ├── message-service/       # Elixir/Phoenix
│   ├── workspace-service/     # Go
│   ├── channel-service/       # Go
│   ├── file-service/          # Go
│   ├── analytics-service/     # Python/FastAPI
│   └── ml-service/            # Python/FastAPI
├── nginx/                      # Nginx configuration
├── docker-compose.yml          # Infrastructure services
├── docker-compose.services.yml # Application services
└── docs/                       # This documentation
```

## Service Ports

### Infrastructure

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | 5432 | Primary database |
| MySQL | 3306 | Secondary database |
| MongoDB | 27017 | Document database |
| Redis | 6379 | Cache & pub/sub |
| Kafka | 9092 | Event streaming |
| Elasticsearch | 9200 | Search engine |
| Nginx | 80 | Reverse proxy |

### Application Services

| Service | Port | Stack |
|---------|------|-------|
| Backend Gateway | 3000 | NestJS |
| Notification Service | 3001 | NestJS |
| Realtime Service | 4000 | NestJS |
| Auth Service | 8081 | Spring Boot |
| User Service | 8082 | Spring Boot |
| Permission Service | 8083 | Spring Boot |
| Audit Service | 8084 | Spring Boot |
| Admin Service | 8085 | Spring Boot |
| Presence Service | 4001 | Elixir |
| Call Service | 4002 | Elixir |
| Message Service | 4003 | Elixir |
| Notification Orchestrator | 4004 | Elixir |
| Media Service | 5001 | Go |
| File Service | 5002 | Go |
| Workspace Service | 5004 | Go |
| Channel Service | 5005 | Go |
| Search Service | 5006 | Go |
| Analytics Service | 5007 | Python |
| ML Service | 5008 | Python |

## Development Workflow

### Running Tests

```bash
# NestJS tests
cd backend && npm test

# Spring Boot tests
cd services/auth-service && ./mvnw test

# Elixir tests
cd services/presence-service && mix test

# Go tests
cd services/workspace-service && go test ./...

# Python tests
cd services/analytics-service && pytest
```

### Database Migrations

```bash
# NestJS (TypeORM)
cd backend && npm run migration:run

# Spring Boot (Flyway)
cd services/auth-service && ./mvnw flyway:migrate

# Elixir (Ecto)
cd services/presence-service && mix ecto.migrate

# Go (golang-migrate)
cd services/workspace-service && migrate -path ./migrations -database $DATABASE_URL up
```

### Code Generation

```bash
# Generate NestJS module
cd backend && nest generate module my-module

# Generate Spring Boot entity
cd services/auth-service && ./mvnw spring-boot:run

# Generate Elixir context
cd services/presence-service && mix phx.gen.context
```

## Common Issues

### Docker Memory Issues

```bash
# Increase Docker memory limit to at least 8GB
# Docker Desktop > Settings > Resources > Memory
```

### Port Conflicts

```bash
# Check what's using a port
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Database Connection Issues

```bash
# Reset all containers
docker-compose down -v
docker-compose up -d

# Check logs
docker-compose logs postgres
docker-compose logs mysql
```

## Next Steps

- Read the [Architecture Overview](./architecture/overview) to understand the system design
- Explore the [Microservices](./microservices/overview) documentation
- Check the [API Reference](./api/overview) for endpoint details
