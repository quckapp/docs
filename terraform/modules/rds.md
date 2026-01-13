# RDS Module

Creates RDS/Aurora database infrastructure with high availability, read replicas, and comprehensive monitoring.

## Features

- RDS instances (MySQL, PostgreSQL, MariaDB)
- Aurora clusters (MySQL, PostgreSQL)
- Aurora Serverless v2
- Read replicas and cross-region replicas
- RDS Proxy for connection pooling
- Enhanced monitoring and Performance Insights
- Automated backups and snapshots
- Parameter and option groups
- CloudWatch alarms and dashboards

## Usage

### Standard RDS Instance

```hcl
module "rds" {
  source = "../../modules/rds"

  environment = "prod"
  identifier  = "quikapp-prod"

  # Engine
  engine         = "postgres"
  engine_version = "16.3"

  # Instance
  instance_class    = "db.r6g.large"
  allocated_storage = 100
  storage_type      = "gp3"

  # Database
  database_name   = "quikapp"
  master_username = "quikapp_admin"
  manage_master_password = true  # Use Secrets Manager

  # Network
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.database_subnet_ids

  # High availability
  multi_az = true

  # Monitoring
  monitoring_interval          = 60
  performance_insights_enabled = true

  tags = var.tags
}
```

### Aurora Cluster

```hcl
module "rds" {
  source = "../../modules/rds"

  environment = "prod"
  identifier  = "quikapp-prod"

  # Engine
  engine         = "aurora-postgresql"
  engine_version = "16.3"

  # Aurora configuration
  create_aurora_cluster = true
  aurora_instances = {
    writer = {
      instance_class = "db.r6g.large"
      promotion_tier = 0
    }
    reader-1 = {
      instance_class = "db.r6g.large"
      promotion_tier = 1
    }
    reader-2 = {
      instance_class = "db.r6g.large"
      promotion_tier = 2
    }
  }

  # Auto-scaling
  enable_autoscaling       = true
  autoscaling_min_capacity = 1
  autoscaling_max_capacity = 5
  autoscaling_cpu_target   = 70

  tags = var.tags
}
```

### Aurora Serverless v2

```hcl
module "rds" {
  source = "../../modules/rds"

  engine         = "aurora-postgresql"
  engine_version = "16.3"

  create_aurora_cluster   = true
  enable_serverless_v2    = true
  serverless_min_capacity = 0.5
  serverless_max_capacity = 32

  aurora_instances = {
    serverless = {
      instance_class = "db.serverless"
    }
  }
}
```

## Architecture

### Aurora Cluster

```
                    ┌─────────────────────┐
                    │   Cluster Endpoint  │
                    │      (Writer)       │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   ┌────▼────┐            ┌────▼────┐            ┌────▼────┐
   │ Writer  │            │ Reader  │            │ Reader  │
   │   (r6g) │            │   (r6g) │            │   (r6g) │
   └────┬────┘            └────┬────┘            └────┬────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Aurora Storage    │
                    │    (Shared, HA)     │
                    └─────────────────────┘

                    ┌─────────────────────┐
                    │   Reader Endpoint   │
                    │   (Load Balanced)   │
                    └─────────────────────┘
```

### RDS with Read Replicas

```
                    ┌─────────────────────┐
                    │    Primary (Writer) │
                    │     Multi-AZ        │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
         ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
         │ Replica │      │ Replica │      │Cross-Rgn│
         │  (AZ-b) │      │  (AZ-c) │      │ Replica │
         └─────────┘      └─────────┘      └─────────┘
```

## RDS Proxy

Connection pooling for serverless and high-connection workloads:

```hcl
# Enable RDS Proxy
create_rds_proxy = true
proxy_secret_arn = aws_secretsmanager_secret.db.arn

# Configuration
proxy_max_connections_percent = 100
proxy_idle_client_timeout     = 1800
proxy_require_tls             = true
proxy_iam_auth                = true
```

### Benefits

- Reduces connection overhead
- Handles connection spikes
- Improves failover time
- Supports IAM authentication

## Parameter Groups

### PostgreSQL Parameters

```hcl
parameters = [
  {
    name  = "log_statement"
    value = "ddl"
  },
  {
    name  = "log_min_duration_statement"
    value = "1000"  # Log queries > 1 second
  },
  {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }
]
```

### MySQL Parameters

```hcl
parameters = [
  {
    name  = "character_set_server"
    value = "utf8mb4"
  },
  {
    name  = "slow_query_log"
    value = "1"
  },
  {
    name  = "long_query_time"
    value = "1"
  }
]
```

## Backup Configuration

```hcl
# Automated backups
backup_retention_period = 35  # Days
backup_window           = "02:00-03:00"

# Final snapshot
skip_final_snapshot     = false
deletion_protection     = true

# Snapshots
snapshot_identifier = "restore-from-this"  # Optional restore
```

## Monitoring

### Enhanced Monitoring

```hcl
monitoring_interval = 60  # Seconds (0, 1, 5, 10, 15, 30, 60)
create_monitoring_role = true
```

### Performance Insights

```hcl
performance_insights_enabled = true
performance_insights_retention = 731  # 2 years (7 days free)
```

### CloudWatch Alarms

| Alarm | Threshold | Description |
|-------|-----------|-------------|
| CPU Utilization | > 80% | High CPU usage |
| Freeable Memory | < 256 MB | Memory pressure |
| Free Storage | < 5 GB | Low disk space |
| Database Connections | > 100 | Connection limit |
| Read Replica Lag | > 60s | Replication delay |

## IAM Authentication

```hcl
iam_database_authentication_enabled = true
```

### Connecting with IAM

```python
import boto3

rds = boto3.client('rds')
token = rds.generate_db_auth_token(
    DBHostname=host,
    Port=5432,
    DBUsername=user,
    Region=region
)

# Use token as password
conn = psycopg2.connect(
    host=host,
    port=5432,
    user=user,
    password=token,
    database=database,
    sslmode='require'
)
```

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `environment` | Environment name | string | - |
| `engine` | Database engine | string | `"postgres"` |
| `engine_version` | Engine version | string | `"16.3"` |
| `instance_class` | Instance type | string | `"db.t3.micro"` |
| `allocated_storage` | Storage (GB) | number | `20` |
| `multi_az` | Enable Multi-AZ | bool | `false` |
| `create_aurora_cluster` | Use Aurora | bool | `false` |

## Outputs

| Name | Description |
|------|-------------|
| `db_instance_endpoint` | RDS instance endpoint |
| `cluster_endpoint` | Aurora writer endpoint |
| `cluster_reader_endpoint` | Aurora reader endpoint |
| `db_instance_master_user_secret_arn` | Secrets Manager ARN |
| `database_config` | Full connection config |

## Cost Optimization

### Instance Sizing

| Workload | Instance Class | vCPU | Memory |
|----------|---------------|------|--------|
| Dev/Test | db.t3.micro | 2 | 1 GB |
| Small | db.r6g.large | 2 | 16 GB |
| Medium | db.r6g.xlarge | 4 | 32 GB |
| Large | db.r6g.2xlarge | 8 | 64 GB |

### Cost Savings

1. **Reserved Instances**: Up to 60% savings
2. **Aurora Serverless**: Pay per ACU-second
3. **Read Replicas**: Offload read traffic
4. **Storage**: Use gp3 for better price/performance
