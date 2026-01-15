---
sidebar_position: 10
---

# Redis

QuckApp uses Redis for caching, session management, real-time pub/sub, rate limiting, and distributed locking across all microservices.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Redis Cluster                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Redis Sentinel                        │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │    │
│  │  │Sentinel 1│  │Sentinel 2│  │Sentinel 3│              │    │
│  │  └──────────┘  └──────────┘  └──────────┘              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────┐     │
│  │                                                        │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │     │
│  │  │    Master    │  │   Replica 1  │  │   Replica 2  │ │     │
│  │  │ (Read/Write) │──│  (Read Only) │──│  (Read Only) │ │     │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                               │
    ┌──────────────────────────┼──────────────────────────┐
    │                          │                          │
    ▼                          ▼                          ▼
┌────────┐              ┌────────────┐              ┌──────────┐
│Sessions│              │   Cache    │              │  Pub/Sub │
│& Tokens│              │  & Rates   │              │ & Queues │
└────────┘              └────────────┘              └──────────┘
```

## Use Cases by Service

| Service | Redis Usage |
|---------|-------------|
| **auth-service** | Session storage, token blacklist, rate limiting |
| **user-service** | User cache, status cache |
| **backend-gateway** | API response cache, rate limiting |
| **realtime-service** | Pub/sub for WebSocket events |
| **presence-service** | Online status, typing indicators |
| **notification-service** | Push notification queue |
| **search-service** | Query result cache |
| **rate-limiter** | Request counting, sliding windows |

## Key Patterns

### Key Naming Convention

```
{service}:{entity}:{identifier}:{field}
```

### Key Catalog

| Pattern | TTL | Description |
|---------|-----|-------------|
| `session:{sessionId}` | 24h | User session data |
| `token:blacklist:{tokenId}` | 15m | Revoked JWT tokens |
| `user:{userId}` | 1h | User profile cache |
| `user:{userId}:status` | - | Online status (no expiry) |
| `user:{userId}:typing:{channelId}` | 5s | Typing indicator |
| `workspace:{workspaceId}` | 1h | Workspace metadata cache |
| `channel:{channelId}:members` | 30m | Channel member list |
| `rate:{ip}:{endpoint}` | 60s | Rate limit counter |
| `rate:auth:{ip}` | 15m | Auth rate limit |
| `cache:search:{queryHash}` | 5m | Search result cache |
| `lock:{resource}:{id}` | 30s | Distributed lock |
| `queue:notifications:{userId}` | - | Notification queue |
| `pubsub:channel:{channelId}` | - | Channel message pub/sub |
| `pubsub:presence:{workspaceId}` | - | Presence updates |

## Data Structures

### Session Storage (Hash)

```redis
HSET session:abc123
    userId "user-uuid"
    email "user@example.com"
    deviceId "device-uuid"
    createdAt "2024-01-15T10:30:00Z"
    expiresAt "2024-01-16T10:30:00Z"

EXPIRE session:abc123 86400
```

### User Status (String + Sorted Set)

```redis
# Current status
SET user:user-uuid:status "online"

# Online users in workspace (Sorted Set with timestamp)
ZADD workspace:ws-uuid:online 1705312200 "user-uuid-1"
ZADD workspace:ws-uuid:online 1705312180 "user-uuid-2"

# Get online users (last 5 minutes)
ZRANGEBYSCORE workspace:ws-uuid:online (NOW-300) +inf
```

### Rate Limiting (Sliding Window)

```redis
# Fixed window counter
INCR rate:192.168.1.1:/api/messages
EXPIRE rate:192.168.1.1:/api/messages 60

# Sliding window log
ZADD rate:user-uuid:messages 1705312200 "req-uuid-1"
ZADD rate:user-uuid:messages 1705312201 "req-uuid-2"
ZREMRANGEBYSCORE rate:user-uuid:messages 0 (NOW-60)
ZCARD rate:user-uuid:messages
```

### Typing Indicators (String with TTL)

```redis
# Set typing indicator (expires in 5 seconds)
SETEX user:user-uuid:typing:channel-uuid 5 "1"

# Check who is typing
KEYS user:*:typing:channel-uuid
```

### Distributed Lock

```redis
# Acquire lock
SET lock:message:msg-uuid "owner-uuid" NX EX 30

# Release lock (use Lua script for atomicity)
-- Script checks owner before deleting
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
```

### Pub/Sub Channels

```redis
# Subscribe to channel messages
SUBSCRIBE channel:channel-uuid:messages

# Publish new message
PUBLISH channel:channel-uuid:messages '{"type":"new_message","data":{...}}'

# Pattern subscribe for workspace
PSUBSCRIBE workspace:ws-uuid:*
```

## Docker Configuration

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    container_name: QuckApp-redis
    command: >
      redis-server
      --appendonly yes
      --appendfsync everysec
      --maxmemory 2gb
      --maxmemory-policy allkeys-lru
      --requirepass ${REDIS_PASSWORD:-secret}
      --tcp-keepalive 300
      --timeout 0
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    networks:
      - QuckApp-network
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-secret}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  redis_data:
```

### Redis Sentinel Setup

```yaml
# docker-compose.redis-ha.yml
services:
  redis-master:
    image: redis:7-alpine
    command: redis-server --requirepass secret --masterauth secret
    networks:
      - QuckApp-network

  redis-replica-1:
    image: redis:7-alpine
    command: redis-server --replicaof redis-master 6379 --requirepass secret --masterauth secret
    depends_on:
      - redis-master
    networks:
      - QuckApp-network

  redis-replica-2:
    image: redis:7-alpine
    command: redis-server --replicaof redis-master 6379 --requirepass secret --masterauth secret
    depends_on:
      - redis-master
    networks:
      - QuckApp-network

  redis-sentinel-1:
    image: redis:7-alpine
    command: redis-sentinel /etc/redis/sentinel.conf
    volumes:
      - ./config/redis/sentinel.conf:/etc/redis/sentinel.conf
    networks:
      - QuckApp-network
```

### Sentinel Configuration

```conf
# config/redis/sentinel.conf
sentinel monitor mymaster redis-master 6379 2
sentinel auth-pass mymaster secret
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
sentinel parallel-syncs mymaster 1
```

## Client Configuration

### NestJS (ioredis)

```typescript
// redis.module.ts
import { Module, Global } from '@nestjs/common';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT, 10) || 6379,
          password: process.env.REDIS_PASSWORD || 'secret',
          db: 0,
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          keyPrefix: 'QuckApp:',
        });
      },
    },
    {
      provide: 'REDIS_SUBSCRIBER',
      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT, 10) || 6379,
          password: process.env.REDIS_PASSWORD || 'secret',
        });
      },
    },
  ],
  exports: ['REDIS_CLIENT', 'REDIS_SUBSCRIBER'],
})
export class RedisModule {}
```

### Spring Boot (Lettuce)

```yaml
# application.yml
spring:
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
      password: ${REDIS_PASSWORD:secret}
      timeout: 2000ms
      lettuce:
        pool:
          max-active: 20
          max-idle: 10
          min-idle: 5
          max-wait: 1000ms
```

```java
// RedisConfig.java
@Configuration
@EnableCaching
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new GenericJackson2JsonRedisSerializer());
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setHashValueSerializer(new GenericJackson2JsonRedisSerializer());
        return template;
    }

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(60))
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()));

        return RedisCacheManager.builder(factory)
            .cacheDefaults(config)
            .withCacheConfiguration("users", config.entryTtl(Duration.ofHours(1)))
            .withCacheConfiguration("sessions", config.entryTtl(Duration.ofHours(24)))
            .build();
    }
}
```

### Go (go-redis)

```go
// redis/client.go
package redis

import (
    "context"
    "time"

    "github.com/redis/go-redis/v9"
)

type Client struct {
    rdb *redis.Client
}

func NewClient(addr, password string) *Client {
    rdb := redis.NewClient(&redis.Options{
        Addr:         addr,
        Password:     password,
        DB:           0,
        PoolSize:     20,
        MinIdleConns: 5,
        DialTimeout:  5 * time.Second,
        ReadTimeout:  3 * time.Second,
        WriteTimeout: 3 * time.Second,
        PoolTimeout:  4 * time.Second,
    })
    return &Client{rdb: rdb}
}

func (c *Client) SetWithTTL(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
    return c.rdb.Set(ctx, key, value, ttl).Err()
}

func (c *Client) Get(ctx context.Context, key string) (string, error) {
    return c.rdb.Get(ctx, key).Result()
}

func (c *Client) Publish(ctx context.Context, channel string, message interface{}) error {
    return c.rdb.Publish(ctx, channel, message).Err()
}

func (c *Client) Subscribe(ctx context.Context, channels ...string) *redis.PubSub {
    return c.rdb.Subscribe(ctx, channels...)
}
```

### Python (redis-py)

```python
# redis_client.py
import redis
from redis import ConnectionPool
import os
import json

pool = ConnectionPool(
    host=os.getenv('REDIS_HOST', 'localhost'),
    port=int(os.getenv('REDIS_PORT', 6379)),
    password=os.getenv('REDIS_PASSWORD', 'secret'),
    db=0,
    max_connections=20,
    decode_responses=True
)

redis_client = redis.Redis(connection_pool=pool)

class RedisCache:
    def __init__(self, prefix: str = 'QuckApp'):
        self.prefix = prefix
        self.client = redis_client

    def _key(self, key: str) -> str:
        return f"{self.prefix}:{key}"

    def get(self, key: str):
        data = self.client.get(self._key(key))
        return json.loads(data) if data else None

    def set(self, key: str, value, ttl: int = 3600):
        self.client.setex(self._key(key), ttl, json.dumps(value))

    def delete(self, key: str):
        self.client.delete(self._key(key))

    def publish(self, channel: str, message: dict):
        self.client.publish(channel, json.dumps(message))
```

### Elixir (Redix)

```elixir
# lib/QuckApp/redis.ex
defmodule QuckApp.Redis do
  use GenServer

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def init(_opts) do
    {:ok, conn} = Redix.start_link(
      host: System.get_env("REDIS_HOST", "localhost"),
      port: String.to_integer(System.get_env("REDIS_PORT", "6379")),
      password: System.get_env("REDIS_PASSWORD", "secret")
    )
    {:ok, %{conn: conn}}
  end

  def get(key) do
    GenServer.call(__MODULE__, {:get, key})
  end

  def set(key, value, ttl \\ 3600) do
    GenServer.call(__MODULE__, {:set, key, value, ttl})
  end

  def handle_call({:get, key}, _from, %{conn: conn} = state) do
    {:ok, value} = Redix.command(conn, ["GET", key])
    {:reply, value, state}
  end

  def handle_call({:set, key, value, ttl}, _from, %{conn: conn} = state) do
    {:ok, _} = Redix.command(conn, ["SETEX", key, ttl, value])
    {:reply, :ok, state}
  end
end
```

## Rate Limiting Implementation

```typescript
// rate-limiter.service.ts
import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RateLimiterService {
  constructor(@Inject('REDIS_CLIENT') private redis: Redis) {}

  async isRateLimited(
    key: string,
    limit: number,
    windowSec: number
  ): Promise<{ limited: boolean; remaining: number; resetAt: number }> {
    const now = Date.now();
    const windowStart = now - windowSec * 1000;
    const redisKey = `rate:${key}`;

    // Use pipeline for atomic operations
    const pipe = this.redis.pipeline();
    pipe.zremrangebyscore(redisKey, 0, windowStart);
    pipe.zcard(redisKey);
    pipe.zadd(redisKey, now, `${now}-${Math.random()}`);
    pipe.expire(redisKey, windowSec);

    const results = await pipe.run();
    const currentCount = results[1][1] as number;

    const limited = currentCount >= limit;
    const remaining = Math.max(0, limit - currentCount - 1);

    return {
      limited,
      remaining,
      resetAt: Math.ceil((now + windowSec * 1000) / 1000),
    };
  }
}
```

## Monitoring

### Key Metrics

```redis
# Memory usage
INFO memory

# Connected clients
INFO clients

# Command stats
INFO commandstats

# Keyspace info
INFO keyspace

# Replication status
INFO replication
```

### Prometheus Exporter

```yaml
# docker-compose.monitoring.yml
services:
  redis-exporter:
    image: oliver006/redis_exporter:v1.55.0
    container_name: QuckApp-redis-exporter
    environment:
      REDIS_ADDR: redis://redis:6379
      REDIS_PASSWORD: secret
    ports:
      - "9121:9121"
    networks:
      - QuckApp-network
```

## Performance Tips

1. **Use pipelining** for bulk operations
2. **Use Lua scripts** for atomic multi-step operations
3. **Set appropriate TTLs** to prevent memory bloat
4. **Use `SCAN` instead of `KEYS`** in production
5. **Monitor memory** with `maxmemory-policy`
6. **Use connection pooling** in all clients
