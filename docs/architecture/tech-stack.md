---
sidebar_position: 2
---

# Technology Stack

Detailed breakdown of all technologies used in QuckApp.

## Backend Languages & Frameworks

### Java 21 + Spring Boot 3.x

**Used for**: Authentication, User Management, RBAC, Audit Logging

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
</parent>

<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-security</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
</dependencies>
```

**Key Features**:
- Spring Security for authentication
- Spring Data JPA for database access
- Spring Kafka for event streaming
- Spring Actuator for health checks
- Flyway for database migrations

### TypeScript + NestJS 10.x

**Used for**: API Gateway, Notifications, WebSocket Gateway

```json
{
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-socket.io": "^10.0.0",
    "@nestjs/typeorm": "^10.0.0",
    "@nestjs/kafka": "^10.0.0"
  }
}
```

**Key Features**:
- Modular architecture
- Built-in dependency injection
- TypeORM for database access
- Socket.IO for WebSockets
- Swagger/OpenAPI integration

### Elixir 1.15 + Phoenix 1.7

**Used for**: Real-time messaging, Presence, Calls, Huddles

```elixir
defp deps do
  [
    {:phoenix, "~> 1.7.0"},
    {:phoenix_pubsub, "~> 2.1"},
    {:mongodb_driver, "~> 1.0"},
    {:kafka_ex, "~> 0.13"},
    {:jason, "~> 1.4"}
  ]
end
```

**Key Features**:
- Phoenix Channels for real-time
- OTP for fault tolerance
- GenServer for state management
- ETS for in-memory caching
- Exceptional concurrency (millions of connections)

### Go 1.21+

**Used for**: High-performance CRUD, File handling, Search

```go
module QuckApp/workspace-service

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/go-sql-driver/mysql v1.7.1
    github.com/segmentio/kafka-go v0.4.45
    github.com/go-redis/redis/v9 v9.3.0
)
```

**Key Features**:
- Gin/Fiber for HTTP routing
- GORM for database access
- Native concurrency (goroutines)
- Low memory footprint
- Fast compilation

### Python 3.11 + FastAPI

**Used for**: Analytics, ML/AI, Sentiment Analysis

```python
# requirements.txt
fastapi==0.104.1
uvicorn==0.24.0
sqlalchemy==2.0.23
aiokafka==0.9.0
pandas==2.1.3
scikit-learn==1.3.2
transformers==4.35.2
```

**Key Features**:
- Async support with asyncio
- Pydantic for data validation
- SQLAlchemy for database access
- Rich ML ecosystem
- Azure Databricks integration

## Databases

### PostgreSQL 16

**Used by**: NestJS Backend Gateway

```sql
-- Features used
- JSONB columns for flexible data
- Full-text search with tsvector
- Partitioning for large tables
- Row-level security (RLS)
- Triggers for audit logging
```

**Configuration**:
```yaml
postgresql:
  image: postgres:16
  environment:
    POSTGRES_DB: QuckApp
    POSTGRES_USER: QuckApp
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  volumes:
    - postgres_data:/var/lib/postgresql/data
```

### MySQL 8.0

**Used by**: Spring Boot services, Go services

```sql
-- Features used
- InnoDB for transactions
- JSON columns
- Generated columns
- Window functions
- Common table expressions (CTEs)
```

**Configuration**:
```yaml
mysql:
  image: mysql:8.0
  environment:
    MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    MYSQL_DATABASE: QuckApp
  command: --default-authentication-plugin=mysql_native_password
```

### MongoDB 7.0

**Used by**: Elixir services, Go media services

```javascript
// Features used
- Replica sets for high availability
- Sharding for horizontal scaling
- Change streams for real-time
- Time-series collections
- Aggregation pipelines
```

**Configuration**:
```yaml
mongodb:
  image: mongo:7.0
  environment:
    MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
    MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
  volumes:
    - mongo_data:/data/db
```

### Redis 7.2

**Used by**: All services (caching, sessions, pub/sub)

```
# Features used
- String caching
- Hash for user sessions
- Sets for presence tracking
- Pub/Sub for real-time events
- Streams for message queues
- RedisJSON for document caching
```

**Configuration**:
```yaml
redis:
  image: redis:7.2-alpine
  command: redis-server --appendonly yes
  volumes:
    - redis_data:/data
```

### Elasticsearch 8.11

**Used by**: Search Service

```json
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "QuckApp_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "snowball"]
        }
      }
    }
  }
}
```

## Message Queues

### Apache Kafka 3.6

**Used for**: Event streaming between services

```yaml
kafka:
  image: confluentinc/cp-kafka:7.5.0
  environment:
    KAFKA_BROKER_ID: 1
    KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
    KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
```

**Topics**:
```
QuckApp.users.events
QuckApp.messages.events
QuckApp.presence.events
QuckApp.notifications.events
QuckApp.analytics.events
QuckApp.audit.events
```

### RabbitMQ 3.12

**Used for**: Task queues, delayed messages

```yaml
rabbitmq:
  image: rabbitmq:3.12-management
  environment:
    RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER}
    RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
```

**Queues**:
```
QuckApp.email.queue
QuckApp.push.queue
QuckApp.media.processing.queue
QuckApp.export.queue
```

## Infrastructure

### Nginx

**Used for**: Reverse proxy, SSL termination, load balancing

```nginx
upstream backend {
    server backend:3000;
}

upstream auth_service {
    server auth-service:8081;
}

server {
    listen 80;

    location /api/v1 {
        proxy_pass http://backend;
    }

    location /api/auth {
        proxy_pass http://auth_service;
    }
}
```

### HashiCorp Vault

**Used for**: Secrets management, encryption

```hcl
path "secret/data/QuckApp/*" {
  capabilities = ["read", "list"]
}

path "database/creds/QuckApp-role" {
  capabilities = ["read"]
}

path "transit/encrypt/QuckApp-key" {
  capabilities = ["update"]
}
```

### HashiCorp Consul

**Used for**: Service discovery, health checks, KV store

```json
{
  "service": {
    "name": "auth-service",
    "port": 8081,
    "check": {
      "http": "http://localhost:8081/actuator/health",
      "interval": "10s"
    }
  }
}
```

## Monitoring & Observability

### Prometheus + Grafana

```yaml
prometheus:
  scrape_configs:
    - job_name: 'QuckApp-services'
      static_configs:
        - targets:
          - 'backend:3000'
          - 'auth-service:8081'
          - 'presence-service:4001'
```

### Datadog

```typescript
// NestJS integration
import tracer from 'dd-trace';
tracer.init({
  service: 'QuckApp-backend',
  env: process.env.NODE_ENV,
});
```

### ELK Stack

```yaml
# Log aggregation
elasticsearch:
  image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0

logstash:
  image: docker.elastic.co/logstash/logstash:8.11.0

kibana:
  image: docker.elastic.co/kibana/kibana:8.11.0
```

## Cloud Services

### Azure Databricks

**Used for**: ML model training and serving

```python
# Databricks connection
from databricks import sql

connection = sql.connect(
    server_hostname=os.environ["DATABRICKS_HOST"],
    http_path=os.environ["DATABRICKS_HTTP_PATH"],
    access_token=os.environ["DATABRICKS_TOKEN"]
)
```

### AWS S3 / Azure Blob Storage

**Used for**: File storage

```typescript
// S3 configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
```

## Version Summary

| Component | Version |
|-----------|---------|
| Java | 21 |
| Spring Boot | 3.2.x |
| Node.js | 20.x |
| NestJS | 10.x |
| Elixir | 1.15.x |
| Phoenix | 1.7.x |
| Go | 1.21.x |
| Python | 3.11.x |
| FastAPI | 0.104.x |
| PostgreSQL | 16 |
| MySQL | 8.0 |
| MongoDB | 7.0 |
| Redis | 7.2 |
| Elasticsearch | 8.11 |
| Kafka | 3.6 |
| Docker | 24.x |
| Kubernetes | 1.28.x |
