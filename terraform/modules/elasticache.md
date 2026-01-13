# ElastiCache Module

Creates ElastiCache Redis or Memcached clusters for caching and session storage with high availability and monitoring.

## Features

- Redis replication groups with Multi-AZ
- Redis cluster mode (sharding)
- Memcached clusters
- ElastiCache Serverless
- Global Datastore for cross-region
- Authentication (AUTH token, user groups)
- Encryption at rest and in transit
- Parameter groups and subnet groups
- CloudWatch alarms and dashboards
- Slow log and engine log

## Usage

### Redis Replication Group (Recommended)

```hcl
module "elasticache" {
  source = "../../modules/elasticache"

  environment = "prod"
  vpc_id      = module.vpc.vpc_id
  subnet_ids  = module.vpc.elasticache_subnet_ids

  # Engine
  engine         = "redis"
  engine_version = "7.1"

  # Replication group
  create_replication_group  = true
  node_type                 = "cache.r6g.large"
  num_cache_clusters        = 3
  automatic_failover_enabled = true
  multi_az_enabled          = true

  # Security
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  kms_key_arn                = module.kms.elasticache_key_arn
  auth_token                 = var.redis_auth_token

  # Maintenance
  maintenance_window      = "sun:05:00-sun:06:00"
  snapshot_window         = "03:00-04:00"
  snapshot_retention_limit = 7

  # Monitoring
  enable_cloudwatch_alarms = true
  alarm_actions            = [module.sns.alerts_topic_arn]

  tags = var.tags
}
```

### Redis Cluster Mode (Sharding)

```hcl
module "elasticache" {
  source = "../../modules/elasticache"

  environment = "prod"

  create_replication_group = true
  cluster_mode_enabled     = true
  num_node_groups          = 3        # Shards
  replicas_per_node_group  = 2        # Replicas per shard

  node_type = "cache.r6g.xlarge"

  tags = var.tags
}
```

### Memcached Cluster

```hcl
module "elasticache" {
  source = "../../modules/elasticache"

  environment = "prod"

  engine     = "memcached"
  node_type  = "cache.r6g.large"
  num_cache_nodes = 3

  az_mode = "cross-az"

  tags = var.tags
}
```

### ElastiCache Serverless

```hcl
module "elasticache" {
  source = "../../modules/elasticache"

  environment = "prod"

  create_serverless_cache = true
  serverless_max_ecpu     = 5000
  serverless_max_storage  = 10  # GB

  tags = var.tags
}
```

## Architecture

### Redis Replication Group

```
                    ┌─────────────────────────┐
                    │    Primary Endpoint     │
                    │      (Read/Write)       │
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   ┌────▼────┐             ┌────▼────┐             ┌────▼────┐
   │ Primary │             │ Replica │             │ Replica │
   │  (AZ-a) │────────────▶│  (AZ-b) │────────────▶│  (AZ-c) │
   └─────────┘   async     └─────────┘   async     └─────────┘

                    ┌─────────────────────────┐
                    │    Reader Endpoint      │
                    │   (Load Balanced)       │
                    └─────────────────────────┘
```

### Redis Cluster Mode (Sharded)

```
                    ┌─────────────────────────┐
                    │  Configuration Endpoint │
                    │    (Auto-discovery)     │
                    └───────────┬─────────────┘
                                │
    ┌───────────────────────────┼───────────────────────────┐
    │                           │                           │
┌───▼───────────┐       ┌───────▼───────┐       ┌───────────▼───┐
│   Shard 1     │       │   Shard 2     │       │   Shard 3     │
│ [0-5461]      │       │ [5462-10922]  │       │ [10923-16383] │
├───────────────┤       ├───────────────┤       ├───────────────┤
│Primary│Replica│       │Primary│Replica│       │Primary│Replica│
└───────────────┘       └───────────────┘       └───────────────┘
```

### Memcached Cluster

```
                    ┌─────────────────────────┐
                    │  Configuration Endpoint │
                    │    (Auto-discovery)     │
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   ┌────▼────┐             ┌────▼────┐             ┌────▼────┐
   │  Node 1 │             │  Node 2 │             │  Node 3 │
   │  (AZ-a) │             │  (AZ-b) │             │  (AZ-c) │
   └─────────┘             └─────────┘             └─────────┘
```

## Redis vs Memcached

| Feature | Redis | Memcached |
|---------|-------|-----------|
| Data persistence | Yes | No |
| Replication | Yes | No |
| Cluster mode | Yes | Yes (auto-discovery) |
| Data types | Rich (strings, lists, sets, hashes) | Simple (strings) |
| Pub/Sub | Yes | No |
| Lua scripting | Yes | No |
| Transactions | Yes | No |
| Backup/Restore | Yes | No |

**Use Redis for**: Sessions, caching with persistence, pub/sub, leaderboards, rate limiting
**Use Memcached for**: Simple caching, large cache sizes, multi-threaded performance

## Authentication

### AUTH Token (Redis)

```hcl
auth_token                 = var.redis_auth_token
transit_encryption_enabled = true  # Required for AUTH token
```

### User Groups (Redis 6+)

```hcl
create_user_group = true

users = {
  admin = {
    user_name     = "admin"
    access_string = "on ~* +@all"
    passwords     = [var.admin_password]
  }
  readonly = {
    user_name     = "readonly"
    access_string = "on ~* +@read"
    passwords     = [var.readonly_password]
  }
}
```

## Parameter Groups

### Redis Parameters

```hcl
parameters = [
  {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  },
  {
    name  = "notify-keyspace-events"
    value = "Ex"  # Expired events
  },
  {
    name  = "timeout"
    value = "300"
  }
]
```

### Memcached Parameters

```hcl
parameters = [
  {
    name  = "max_item_size"
    value = "10485760"  # 10MB
  }
]
```

### Memory Policies

| Policy | Description |
|--------|-------------|
| `volatile-lru` | Evict keys with TTL using LRU |
| `allkeys-lru` | Evict any key using LRU |
| `volatile-lfu` | Evict keys with TTL using LFU |
| `allkeys-lfu` | Evict any key using LFU |
| `volatile-random` | Random eviction of keys with TTL |
| `allkeys-random` | Random eviction of any key |
| `volatile-ttl` | Evict keys with shortest TTL |
| `noeviction` | Return error when memory full |

## Global Datastore

Cross-region active-passive replication:

```hcl
create_global_datastore       = true
global_datastore_suffix       = "global"
global_replication_group_suffix = "secondary"
```

### Considerations

- Primary region handles writes
- Secondary regions are read-only
- Automatic failover available
- Increased latency for writes
- Higher cost (cross-region transfer)

## Monitoring

### CloudWatch Alarms

| Alarm | Threshold | Description |
|-------|-----------|-------------|
| CPU Utilization | > 75% | High CPU usage |
| Engine CPU | > 90% | Redis engine CPU |
| Freeable Memory | < 256 MB | Memory pressure |
| Evictions | > 1000/5min | Cache evictions |
| Current Connections | > 1000 | Connection limit |
| Replication Lag | > 30s | Replication delay |

### Key Metrics

```hcl
# Redis metrics
- CPUUtilization
- EngineCPUUtilization
- FreeableMemory
- DatabaseMemoryUsagePercentage
- CacheHits / CacheMisses
- CurrConnections
- Evictions
- ReplicationLag

# Memcached metrics
- CPUUtilization
- FreeableMemory
- CurrConnections
- CacheHits / CacheMisses
- Evictions
- BytesUsedForCacheItems
```

### CloudWatch Dashboard

The module creates a dashboard with:
- CPU utilization (both engine and host)
- Memory usage and freeable memory
- Cache hit rate
- Current connections
- Evictions over time
- Replication lag (Redis)

## Connecting to ElastiCache

### Redis (Node.js)

```javascript
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_ENDPOINT,
  port: 6379,
  password: process.env.REDIS_AUTH_TOKEN,
  tls: {}  // Required if transit encryption enabled
});

// Basic operations
await redis.set('key', 'value', 'EX', 3600);
const value = await redis.get('key');
```

### Redis Cluster Mode (Node.js)

```javascript
const Redis = require('ioredis');

const cluster = new Redis.Cluster([
  { host: process.env.REDIS_CONFIG_ENDPOINT, port: 6379 }
], {
  redisOptions: {
    password: process.env.REDIS_AUTH_TOKEN,
    tls: {}
  }
});
```

### Memcached (Node.js)

```javascript
const Memcached = require('memcached');

const memcached = new Memcached(process.env.MEMCACHED_ENDPOINT);

memcached.set('key', 'value', 3600, (err) => {
  if (err) console.error(err);
});

memcached.get('key', (err, data) => {
  console.log(data);
});
```

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `environment` | Environment name | string | - |
| `engine` | Cache engine | string | `"redis"` |
| `engine_version` | Engine version | string | `"7.1"` |
| `node_type` | Instance type | string | `"cache.t3.micro"` |
| `num_cache_clusters` | Number of nodes | number | `1` |
| `create_replication_group` | Create replication group | bool | `false` |
| `cluster_mode_enabled` | Enable cluster mode | bool | `false` |
| `automatic_failover_enabled` | Enable auto failover | bool | `false` |
| `multi_az_enabled` | Enable Multi-AZ | bool | `false` |

## Outputs

| Name | Description |
|------|-------------|
| `primary_endpoint` | Primary endpoint (read/write) |
| `reader_endpoint` | Reader endpoint (load balanced) |
| `configuration_endpoint` | Config endpoint (cluster mode) |
| `port` | Cache port |
| `security_group_id` | Security group ID |
| `connection_config` | Full connection configuration |

## Cost Optimization

### Node Sizing

| Workload | Node Type | vCPU | Memory | Network |
|----------|-----------|------|--------|---------|
| Dev/Test | cache.t3.micro | 2 | 0.5 GB | Low |
| Small | cache.r6g.large | 2 | 13 GB | Up to 10 Gbps |
| Medium | cache.r6g.xlarge | 4 | 26 GB | Up to 10 Gbps |
| Large | cache.r6g.2xlarge | 8 | 52 GB | Up to 10 Gbps |

### Cost Savings

1. **Reserved Nodes**: Up to 55% savings for 1-3 year terms
2. **Right-sizing**: Monitor memory usage and resize
3. **Serverless**: Pay per ECPU for variable workloads
4. **Cluster mode**: Scale horizontally vs vertically

### Pricing (On-Demand)

| Node Type | Hourly Cost | Monthly (~730h) |
|-----------|-------------|-----------------|
| cache.t3.micro | $0.017 | ~$12 |
| cache.r6g.large | $0.149 | ~$109 |
| cache.r6g.xlarge | $0.298 | ~$217 |
