---
sidebar_position: 8
---

# PostgreSQL

QuckApp uses PostgreSQL as the primary relational database for most microservices, providing ACID compliance, advanced querying, and reliable data persistence.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Cluster                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │    Primary      │  │    Replica 1    │  │    Replica 2    │  │
│  │   (Read/Write)  │──│   (Read Only)   │──│   (Read Only)   │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┴────────────────────┘           │
│                              │                                   │
│                      ┌───────┴───────┐                          │
│                      │    PgPool-II   │                          │
│                      │ (Load Balancer)│                          │
│                      └───────┬───────┘                          │
└──────────────────────────────┼──────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
   ┌───────────┐        ┌───────────┐        ┌───────────┐
   │ Workspace │        │  Channel  │        │ Analytics │
   │  Service  │        │  Service  │        │  Service  │
   └───────────┘        └───────────┘        └───────────┘
```

## Services Using PostgreSQL

| Service | Database | Purpose |
|---------|----------|---------|
| **workspace-service** (Go) | `QuckApp_workspace` | Workspace metadata, membership |
| **channel-service** (Go) | `QuckApp_channel` | Channels, DMs, permissions |
| **thread-service** (Go) | `QuckApp_thread` | Thread metadata, replies |
| **bookmark-service** (Go) | `QuckApp_bookmark` | User bookmarks |
| **reminder-service** (Go) | `QuckApp_reminder` | Scheduled reminders |
| **analytics-service** (Python) | `QuckApp_analytics` | Usage metrics, reports |
| **export-service** (Python) | `QuckApp_export` | Export jobs, history |
| **integration-service** (Python) | `QuckApp_integration` | Third-party integrations |
| **backend-gateway** (NestJS) | `QuckApp_main` | Sessions, cache metadata |

## Database Schema

### Workspace Database

```sql
-- QuckApp_workspace

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    owner_id UUID NOT NULL,
    plan VARCHAR(20) DEFAULT 'free',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(20) DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    invited_by UUID,
    UNIQUE(workspace_id, user_id)
);

CREATE TABLE workspace_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'member',
    token VARCHAR(100) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    used_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX idx_workspaces_slug ON workspaces(slug);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
```

### Channel Database

```sql
-- QuckApp_channel

CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    name VARCHAR(80) NOT NULL,
    description TEXT,
    type VARCHAR(20) DEFAULT 'public', -- public, private, dm
    is_archived BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    UNIQUE(workspace_id, name)
);

CREATE TABLE channel_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(20) DEFAULT 'member', -- admin, member
    muted BOOLEAN DEFAULT FALSE,
    muted_until TIMESTAMPTZ,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    UNIQUE(channel_id, user_id)
);

CREATE TABLE channel_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    message_id UUID NOT NULL,
    pinned_by UUID NOT NULL,
    pinned_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_channels_workspace ON channels(workspace_id);
CREATE INDEX idx_channels_type ON channels(type);
CREATE INDEX idx_channel_members_user ON channel_members(user_id);
CREATE INDEX idx_channel_members_channel ON channel_members(channel_id);
```

### Analytics Database

```sql
-- QuckApp_analytics

CREATE TABLE daily_active_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    date DATE NOT NULL,
    user_count INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    reaction_count INTEGER DEFAULT 0,
    file_upload_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, date)
);

CREATE TABLE message_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    channel_id UUID NOT NULL,
    hour TIMESTAMPTZ NOT NULL,
    message_count INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    avg_message_length FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    date DATE NOT NULL,
    messages_sent INTEGER DEFAULT 0,
    reactions_given INTEGER DEFAULT 0,
    files_uploaded INTEGER DEFAULT 0,
    time_spent_minutes INTEGER DEFAULT 0,
    UNIQUE(user_id, workspace_id, date)
);

-- Partitioning for large tables
CREATE TABLE events (
    id UUID DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    user_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE events_2024_01 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE events_2024_02 PARTITION OF events
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
-- Continue for each month...

-- Indexes
CREATE INDEX idx_daily_active_users_workspace ON daily_active_users(workspace_id, date);
CREATE INDEX idx_message_analytics_channel ON message_analytics(channel_id, hour);
CREATE INDEX idx_user_activity_user ON user_activity(user_id, date);
CREATE INDEX idx_events_workspace ON events(workspace_id, created_at);
```

## Docker Configuration

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15-alpine
    container_name: QuckApp-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-QuckApp}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-secret}
      POSTGRES_DB: ${POSTGRES_DB:-QuckApp}
      POSTGRES_MULTIPLE_DATABASES: QuckApp_workspace,QuckApp_channel,QuckApp_analytics
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
    command:
      - "postgres"
      - "-c"
      - "max_connections=200"
      - "-c"
      - "shared_buffers=256MB"
      - "-c"
      - "effective_cache_size=768MB"
      - "-c"
      - "maintenance_work_mem=128MB"
      - "-c"
      - "checkpoint_completion_target=0.9"
      - "-c"
      - "wal_buffers=16MB"
      - "-c"
      - "default_statistics_target=100"
      - "-c"
      - "random_page_cost=1.1"
      - "-c"
      - "effective_io_concurrency=200"
      - "-c"
      - "work_mem=4MB"
      - "-c"
      - "min_wal_size=1GB"
      - "-c"
      - "max_wal_size=4GB"

volumes:
  postgres_data:
```

### Multiple Databases Init Script

```bash
#!/bin/bash
# init-scripts/postgres/01-init-databases.sh

set -e
set -u

function create_database() {
    local database=$1
    echo "Creating database '$database'"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        CREATE DATABASE $database;
        GRANT ALL PRIVILEGES ON DATABASE $database TO $POSTGRES_USER;
EOSQL
}

if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
    echo "Multiple database creation requested: $POSTGRES_MULTIPLE_DATABASES"
    for db in $(echo $POSTGRES_MULTIPLE_DATABASES | tr ',' ' '); do
        create_database $db
    done
    echo "Multiple databases created"
fi
```

## Connection Configuration

### Go Services

```go
// config/database.go
package config

import (
    "fmt"
    "os"
    "time"

    "gorm.io/driver/postgres"
    "gorm.io/gorm"
    "gorm.io/gorm/logger"
)

type DBConfig struct {
    Host         string
    Port         string
    User         string
    Password     string
    Database     string
    SSLMode      string
    MaxOpenConns int
    MaxIdleConns int
    MaxLifetime  time.Duration
}

func NewDBConfig() *DBConfig {
    return &DBConfig{
        Host:         getEnv("DB_HOST", "localhost"),
        Port:         getEnv("DB_PORT", "5432"),
        User:         getEnv("DB_USER", "QuckApp"),
        Password:     getEnv("DB_PASSWORD", "secret"),
        Database:     getEnv("DB_NAME", "QuckApp_workspace"),
        SSLMode:      getEnv("DB_SSLMODE", "disable"),
        MaxOpenConns: 25,
        MaxIdleConns: 10,
        MaxLifetime:  5 * time.Minute,
    }
}

func (c *DBConfig) DSN() string {
    return fmt.Sprintf(
        "host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
        c.Host, c.Port, c.User, c.Password, c.Database, c.SSLMode,
    )
}

func ConnectDB(config *DBConfig) (*gorm.DB, error) {
    db, err := gorm.Open(postgres.Open(config.DSN()), &gorm.Config{
        Logger: logger.Default.LogMode(logger.Info),
    })
    if err != nil {
        return nil, err
    }

    sqlDB, err := db.DB()
    if err != nil {
        return nil, err
    }

    sqlDB.SetMaxOpenConns(config.MaxOpenConns)
    sqlDB.SetMaxIdleConns(config.MaxIdleConns)
    sqlDB.SetConnMaxLifetime(config.MaxLifetime)

    return db, nil
}
```

### Python Services

```python
# config/database.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import QueuePool

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://QuckApp:secret@localhost:5432/QuckApp_analytics"
)

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=1800,
    echo=os.getenv("DB_ECHO", "false").lower() == "true"
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### NestJS Services

```typescript
// config/database.config.ts
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USER || 'QuckApp',
  password: process.env.DB_PASSWORD || 'secret',
  database: process.env.DB_NAME || 'QuckApp_main',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV !== 'production',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  extra: {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
};
```

## Migrations

### Using golang-migrate (Go Services)

```bash
# Install migrate CLI
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Create migration
migrate create -ext sql -dir migrations -seq create_workspaces

# Run migrations
migrate -path migrations -database "postgresql://QuckApp:secret@localhost:5432/QuckApp_workspace?sslmode=disable" up

# Rollback
migrate -path migrations -database "postgresql://QuckApp:secret@localhost:5432/QuckApp_workspace?sslmode=disable" down 1
```

### Using Alembic (Python Services)

```bash
# Initialize Alembic
alembic init migrations

# Generate migration
alembic revision --autogenerate -m "add user activity table"

# Run migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

### Using TypeORM (NestJS Services)

```bash
# Generate migration
npm run typeorm migration:generate -- -n CreateSessions

# Run migrations
npm run typeorm migration:run

# Revert migration
npm run typeorm migration:revert
```

## Performance Tuning

### Configuration for Production

```ini
# postgresql.conf

# Memory Settings
shared_buffers = 4GB                    # 25% of RAM
effective_cache_size = 12GB             # 75% of RAM
work_mem = 64MB                         # Per-operation memory
maintenance_work_mem = 1GB              # For VACUUM, CREATE INDEX

# Checkpoint Settings
checkpoint_completion_target = 0.9
wal_buffers = 64MB
min_wal_size = 2GB
max_wal_size = 8GB

# Query Planner
random_page_cost = 1.1                  # For SSD storage
effective_io_concurrency = 200          # For SSD storage
default_statistics_target = 100

# Connections
max_connections = 200
superuser_reserved_connections = 3

# Logging
log_min_duration_statement = 1000       # Log queries > 1s
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on

# Autovacuum
autovacuum = on
autovacuum_max_workers = 4
autovacuum_naptime = 30s
autovacuum_vacuum_threshold = 50
autovacuum_analyze_threshold = 50
```

### Useful Indexes

```sql
-- Partial indexes for common queries
CREATE INDEX idx_channels_active
    ON channels(workspace_id, created_at)
    WHERE is_archived = FALSE;

CREATE INDEX idx_members_active
    ON channel_members(channel_id)
    WHERE muted = FALSE;

-- GIN index for JSONB
CREATE INDEX idx_workspace_settings
    ON workspaces USING GIN (settings);

-- BRIN index for time-series data
CREATE INDEX idx_events_created
    ON events USING BRIN (created_at);

-- Covering index
CREATE INDEX idx_channels_workspace_covering
    ON channels(workspace_id)
    INCLUDE (name, type, created_at);
```

## Monitoring

### Key Metrics

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Connection by database
SELECT datname, count(*)
FROM pg_stat_activity
GROUP BY datname;

-- Slow queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
AND state != 'idle';

-- Table sizes
SELECT
    relname AS table_name,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;

-- Index usage
SELECT
    relname AS table_name,
    indexrelname AS index_name,
    idx_scan AS times_used
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC
LIMIT 20;

-- Cache hit ratio (should be > 99%)
SELECT
    sum(heap_blks_read) AS heap_read,
    sum(heap_blks_hit) AS heap_hit,
    sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) AS ratio
FROM pg_statio_user_tables;
```

### Prometheus Exporter

```yaml
# docker-compose.monitoring.yml
services:
  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:v0.14.0
    container_name: QuckApp-postgres-exporter
    environment:
      DATA_SOURCE_NAME: "postgresql://QuckApp:secret@postgres:5432/QuckApp?sslmode=disable"
    ports:
      - "9187:9187"
    networks:
      - QuckApp-network
```

## Backup & Recovery

### Automated Backups

```bash
#!/bin/bash
# scripts/backup-postgres.sh

BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATABASES="QuckApp_workspace QuckApp_channel QuckApp_analytics"

for DB in $DATABASES; do
    pg_dump -h localhost -U QuckApp -Fc $DB > "$BACKUP_DIR/${DB}_${TIMESTAMP}.dump"
done

# Keep only last 30 days
find $BACKUP_DIR -name "*.dump" -mtime +30 -delete

# Upload to S3
aws s3 sync $BACKUP_DIR s3://QuckApp-backups/postgres/
```

### Point-in-Time Recovery

```bash
# Enable WAL archiving in postgresql.conf
archive_mode = on
archive_command = 'aws s3 cp %p s3://QuckApp-wal-archive/%f'

# Restore to specific point in time
pg_restore -h localhost -U QuckApp -d QuckApp_workspace \
    --target-time="2024-01-15 10:30:00" \
    /backups/postgres/QuckApp_workspace_20240115.dump
```
