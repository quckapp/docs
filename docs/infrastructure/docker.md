---
sidebar_position: 2
---

# Docker Configuration

QuckApp uses Docker for containerization and Docker Compose for local development orchestration.

## Docker Compose Files

### Main Compose File

```yaml
# docker-compose.yml
version: '3.8'

services:
  # ===================
  # INFRASTRUCTURE
  # ===================
  nginx:
    image: nginx:alpine
    container_name: QuckApp-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - backend
      - realtime
    networks:
      - QuckApp-network
    restart: unless-stopped

  # ===================
  # DATABASES
  # ===================
  postgres:
    image: postgres:15-alpine
    container_name: QuckApp-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-QuckApp}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-secret}
      POSTGRES_DB: ${POSTGRES_DB:-QuckApp}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts/postgres:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    networks:
      - QuckApp-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U QuckApp"]
      interval: 10s
      timeout: 5s
      retries: 5

  mysql:
    image: mysql:8.0
    container_name: QuckApp-mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-rootsecret}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-QuckApp_auth}
      MYSQL_USER: ${MYSQL_USER:-QuckApp}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-secret}
    volumes:
      - mysql_data:/var/lib/mysql
      - ./init-scripts/mysql:/docker-entrypoint-initdb.d
    ports:
      - "3306:3306"
    networks:
      - QuckApp-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  mongodb:
    image: mongo:6.0
    container_name: QuckApp-mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER:-QuckApp}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD:-secret}
    volumes:
      - mongodb_data:/data/db
    ports:
      - "27017:27017"
    networks:
      - QuckApp-network

  redis:
    image: redis:7-alpine
    container_name: QuckApp-redis
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-secret}
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    networks:
      - QuckApp-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ===================
  # MESSAGE QUEUE
  # ===================
  zookeeper:
    image: confluentinc/cp-zookeeper:7.4.0
    container_name: QuckApp-zookeeper
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    volumes:
      - zookeeper_data:/var/lib/zookeeper/data
    networks:
      - QuckApp-network

  kafka:
    image: confluentinc/cp-kafka:7.4.0
    container_name: QuckApp-kafka
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    volumes:
      - kafka_data:/var/lib/kafka/data
    networks:
      - QuckApp-network

  # ===================
  # SERVICE DISCOVERY
  # ===================
  consul:
    image: consul:1.15
    container_name: QuckApp-consul
    ports:
      - "8500:8500"
    command: agent -server -bootstrap-expect=1 -ui -client=0.0.0.0
    volumes:
      - consul_data:/consul/data
    networks:
      - QuckApp-network

  vault:
    image: vault:1.13
    container_name: QuckApp-vault
    ports:
      - "8200:8200"
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: ${VAULT_TOKEN:-dev-token}
      VAULT_DEV_LISTEN_ADDRESS: 0.0.0.0:8200
    cap_add:
      - IPC_LOCK
    networks:
      - QuckApp-network

networks:
  QuckApp-network:
    driver: bridge

volumes:
  postgres_data:
  mysql_data:
  mongodb_data:
  redis_data:
  zookeeper_data:
  kafka_data:
  consul_data:
```

### Services Compose File

```yaml
# docker-compose.services.yml
version: '3.8'

services:
  # ===================
  # SPRING BOOT SERVICES
  # ===================
  auth-service:
    build: ./services/auth-service
    container_name: QuckApp-auth
    ports:
      - "8001:8001"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - MYSQL_HOST=mysql
      - REDIS_HOST=redis
      - KAFKA_BOOTSTRAP_SERVERS=kafka:29092
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - QuckApp-network

  user-service:
    build: ./services/user-service
    container_name: QuckApp-user
    ports:
      - "8002:8002"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - MYSQL_HOST=mysql
      - REDIS_HOST=redis
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - QuckApp-network

  # ===================
  # NESTJS SERVICES
  # ===================
  backend:
    build: ./backend
    container_name: QuckApp-backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://QuckApp:secret@postgres:5432/QuckApp
      - REDIS_URL=redis://:secret@redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - QuckApp-network

  realtime:
    build: ./services/realtime-service
    container_name: QuckApp-realtime
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=development
      - REDIS_URL=redis://:secret@redis:6379
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - QuckApp-network

  notification:
    build: ./services/notification-service
    container_name: QuckApp-notification
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=development
      - KAFKA_BROKERS=kafka:29092
    depends_on:
      - kafka
    networks:
      - QuckApp-network

  # ===================
  # ELIXIR SERVICES
  # ===================
  presence:
    build: ./services/presence-service
    container_name: QuckApp-presence
    ports:
      - "4001:4001"
    environment:
      - MIX_ENV=prod
      - REDIS_URL=redis://:secret@redis:6379
    networks:
      - QuckApp-network

  call:
    build: ./services/call-service
    container_name: QuckApp-call
    ports:
      - "4002:4002"
    environment:
      - MIX_ENV=prod
    networks:
      - QuckApp-network

  # ===================
  # GO SERVICES
  # ===================
  workspace:
    build: ./services/workspace-service
    container_name: QuckApp-workspace
    ports:
      - "6001:6001"
    environment:
      - DATABASE_URL=postgresql://QuckApp:secret@postgres:5432/QuckApp
    networks:
      - QuckApp-network

  channel:
    build: ./services/channel-service
    container_name: QuckApp-channel
    ports:
      - "6002:6002"
    environment:
      - DATABASE_URL=postgresql://QuckApp:secret@postgres:5432/QuckApp
    networks:
      - QuckApp-network

  search:
    build: ./services/search-service
    container_name: QuckApp-search
    ports:
      - "6003:6003"
    environment:
      - ELASTICSEARCH_URL=http://elasticsearch:9200
    depends_on:
      - elasticsearch
    networks:
      - QuckApp-network

  # ===================
  # PYTHON SERVICES
  # ===================
  analytics:
    build: ./services/analytics-service
    container_name: QuckApp-analytics
    ports:
      - "5001:5001"
    environment:
      - DATABASE_URL=postgresql://QuckApp:secret@postgres:5432/QuckApp
    networks:
      - QuckApp-network

  ml:
    build: ./services/ml-service
    container_name: QuckApp-ml
    ports:
      - "5006:5006"
    environment:
      - MODEL_PATH=/models
    volumes:
      - ./models:/models:ro
    networks:
      - QuckApp-network

  # ===================
  # SEARCH
  # ===================
  elasticsearch:
    image: elasticsearch:8.8.0
    container_name: QuckApp-elasticsearch
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"
    networks:
      - QuckApp-network

volumes:
  elasticsearch_data:

networks:
  QuckApp-network:
    external: true
```

## Dockerfiles

### NestJS Service Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### Spring Boot Dockerfile

```dockerfile
# services/auth-service/Dockerfile
FROM eclipse-temurin:17-jdk-alpine AS builder
WORKDIR /app
COPY gradle gradle
COPY gradlew build.gradle settings.gradle ./
COPY src src
RUN ./gradlew build -x test

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=builder /app/build/libs/*.jar app.jar

EXPOSE 8001
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### Go Service Dockerfile

```dockerfile
# services/workspace-service/Dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

FROM alpine:3.18
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/main .

EXPOSE 6001
CMD ["./main"]
```

### Elixir Service Dockerfile

```dockerfile
# services/presence-service/Dockerfile
FROM elixir:1.15-alpine AS builder
WORKDIR /app
ENV MIX_ENV=prod

RUN mix local.hex --force && mix local.rebar --force

COPY mix.exs mix.lock ./
RUN mix deps.get --only prod && mix deps.compile

COPY . .
RUN mix release

FROM alpine:3.18
RUN apk add --no-cache libstdc++ openssl ncurses-libs
WORKDIR /app

COPY --from=builder /app/_build/prod/rel/presence ./

EXPOSE 4001
CMD ["bin/presence", "start"]
```

### Python Service Dockerfile

```dockerfile
# services/analytics-service/Dockerfile
FROM python:3.11-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY . .

EXPOSE 5001
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001"]
```

## Docker Commands

### Development

```bash
# Start all infrastructure
docker-compose up -d

# Start services
docker-compose -f docker-compose.services.yml up -d

# View logs
docker-compose logs -f backend

# Rebuild single service
docker-compose -f docker-compose.services.yml up -d --build auth-service

# Stop everything
docker-compose down
docker-compose -f docker-compose.services.yml down
```

### Production Build

```bash
# Build all images
docker-compose -f docker-compose.services.yml build

# Tag for registry
docker tag QuckApp-backend:latest registry.QuckApp.dev/backend:v1.0.0

# Push to registry
docker push registry.QuckApp.dev/backend:v1.0.0
```

## Environment Variables

Create a `.env` file in the project root:

```env
# Database
POSTGRES_USER=QuckApp
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=QuckApp

MYSQL_ROOT_PASSWORD=your-root-password
MYSQL_USER=QuckApp
MYSQL_PASSWORD=your-secure-password

MONGO_USER=QuckApp
MONGO_PASSWORD=your-secure-password

# Cache
REDIS_PASSWORD=your-redis-password

# Security
JWT_SECRET=your-jwt-secret-key
VAULT_TOKEN=your-vault-token

# External Services
SMTP_HOST=smtp.sendgrid.net
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-key
```
