---
sidebar_position: 3
---

# Database Design Document

## Document Information

| Field | Value |
|-------|-------|
| **Document ID** | QUCKAPP-DDD-001 |
| **Version** | 1.5 |
| **Status** | Approved |
| **Last Updated** | 2024-01-10 |
| **Owner** | Data Architecture Team |

## 1. Overview

QuckApp uses a **polyglot persistence** strategy, selecting the optimal database technology for each service domain.

### 1.1 Database Technologies

| Technology | Version | Use Case | Services |
|------------|---------|----------|----------|
| **MySQL** | 8.0 | Relational data | Auth, User, Permission, Workspace |
| **MongoDB** | 6.0 | Document storage | Message, Notification, Channel |
| **Redis** | 7.0 | Caching, Sessions | All services |
| **Elasticsearch** | 8.x | Full-text search | Search service |
| **DynamoDB** | - | Media metadata | Media service |
| **ClickHouse** | 23.x | Analytics | Analytics service |

## 2. Entity Relationship Diagrams

### 2.1 User Domain (MySQL)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         User Domain ERD                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐    │
│  │     users       │       │   user_roles    │       │     roles       │    │
│  ├─────────────────┤       ├─────────────────┤       ├─────────────────┤    │
│  │ id (PK)         │       │ user_id (FK)    │       │ id (PK)         │    │
│  │ email           │───1:N─│ role_id (FK)    │───N:1─│ name            │    │
│  │ password_hash   │       │ workspace_id    │       │ description     │    │
│  │ display_name    │       │ granted_at      │       │ created_at      │    │
│  │ avatar_url      │       │ granted_by      │       └─────────────────┘    │
│  │ status          │       └─────────────────┘                              │
│  │ timezone        │                                                         │
│  │ locale          │       ┌─────────────────┐       ┌─────────────────┐    │
│  │ created_at      │       │ user_sessions   │       │  user_devices   │    │
│  │ updated_at      │       ├─────────────────┤       ├─────────────────┤    │
│  │ deleted_at      │───1:N─│ id (PK)         │       │ id (PK)         │    │
│  └─────────────────┘       │ user_id (FK)    │───1:N─│ user_id (FK)    │    │
│                            │ token_hash      │       │ device_type     │    │
│                            │ device_id (FK)  │       │ device_name     │    │
│                            │ ip_address      │       │ push_token      │    │
│                            │ user_agent      │       │ last_active     │    │
│                            │ expires_at      │       │ created_at      │    │
│                            │ created_at      │       └─────────────────┘    │
│                            └─────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Workspace Domain (MySQL)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Workspace Domain ERD                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐    │
│  │   workspaces    │       │workspace_members│       │    channels     │    │
│  ├─────────────────┤       ├─────────────────┤       ├─────────────────┤    │
│  │ id (PK)         │       │ workspace_id(FK)│       │ id (PK)         │    │
│  │ name            │───1:N─│ user_id (FK)    │       │ workspace_id(FK)│────│
│  │ slug            │       │ role            │       │ name            │    │
│  │ domain          │       │ joined_at       │       │ type            │    │
│  │ icon_url        │       │ invited_by      │       │ topic           │    │
│  │ plan            │       └─────────────────┘       │ description     │    │
│  │ settings (JSON) │                                 │ is_archived     │    │
│  │ created_at      │                                 │ created_by (FK) │    │
│  │ owner_id (FK)   │                                 │ created_at      │    │
│  └─────────────────┘                                 └─────────────────┘    │
│          │                                                   │              │
│          │                                                   │              │
│          │               ┌─────────────────┐                 │              │
│          │               │channel_members  │                 │              │
│          │               ├─────────────────┤                 │              │
│          └───────────────│ channel_id (FK) │─────────────────┘              │
│                          │ user_id (FK)    │                                │
│                          │ role            │                                │
│                          │ joined_at       │                                │
│                          │ last_read_at    │                                │
│                          │ notification    │                                │
│                          └─────────────────┘                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Message Domain (MongoDB)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Message Domain (MongoDB)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Collection: messages                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ {                                                                    │    │
│  │   "_id": ObjectId,                                                  │    │
│  │   "channel_id": ObjectId,                                           │    │
│  │   "workspace_id": ObjectId,                                         │    │
│  │   "user_id": ObjectId,                                              │    │
│  │   "thread_id": ObjectId | null,                                     │    │
│  │   "content": {                                                       │    │
│  │     "text": String,                                                  │    │
│  │     "blocks": [                                                      │    │
│  │       { "type": "text", "text": "Hello" },                          │    │
│  │       { "type": "mention", "user_id": ObjectId },                   │    │
│  │       { "type": "code", "language": "js", "code": "..." }           │    │
│  │     ]                                                                │    │
│  │   },                                                                 │    │
│  │   "attachments": [                                                   │    │
│  │     { "type": "file", "file_id": ObjectId, "name": "doc.pdf" }      │    │
│  │   ],                                                                 │    │
│  │   "reactions": [                                                     │    │
│  │     { "emoji": "👍", "users": [ObjectId, ObjectId] }                │    │
│  │   ],                                                                 │    │
│  │   "mentions": [ObjectId],                                           │    │
│  │   "edited_at": ISODate | null,                                      │    │
│  │   "deleted_at": ISODate | null,                                     │    │
│  │   "created_at": ISODate,                                            │    │
│  │   "ts": NumberLong  // Lamport timestamp for ordering               │    │
│  │ }                                                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Indexes:                                                                    │
│  - { channel_id: 1, ts: -1 }  // Primary query                             │
│  - { workspace_id: 1, created_at: -1 }  // Workspace feed                  │
│  - { user_id: 1, created_at: -1 }  // User messages                        │
│  - { thread_id: 1, ts: 1 }  // Thread replies                              │
│  - { "content.text": "text" }  // Full-text search                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 3. Table Definitions

### 3.1 Users Table (MySQL)

```sql
CREATE TABLE users (
    id              BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255),
    display_name    VARCHAR(100) NOT NULL,
    avatar_url      VARCHAR(512),
    status          ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    status_text     VARCHAR(100),
    status_emoji    VARCHAR(10),
    timezone        VARCHAR(50) DEFAULT 'UTC',
    locale          VARCHAR(10) DEFAULT 'en-US',
    email_verified  BOOLEAN DEFAULT FALSE,
    mfa_enabled     BOOLEAN DEFAULT FALSE,
    mfa_secret      VARCHAR(255),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP NULL,

    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.2 Workspaces Table (MySQL)

```sql
CREATE TABLE workspaces (
    id              BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    domain          VARCHAR(255),
    icon_url        VARCHAR(512),
    plan            ENUM('free', 'pro', 'business', 'enterprise') DEFAULT 'free',
    owner_id        BIGINT UNSIGNED NOT NULL,
    settings        JSON,
    member_count    INT UNSIGNED DEFAULT 0,
    channel_count   INT UNSIGNED DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (owner_id) REFERENCES users(id),
    INDEX idx_slug (slug),
    INDEX idx_domain (domain),
    INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.3 Channels Table (MySQL)

```sql
CREATE TABLE channels (
    id              BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    workspace_id    BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(80) NOT NULL,
    type            ENUM('public', 'private', 'dm', 'group_dm') NOT NULL,
    topic           VARCHAR(250),
    description     TEXT,
    is_archived     BOOLEAN DEFAULT FALSE,
    is_general      BOOLEAN DEFAULT FALSE,
    created_by      BIGINT UNSIGNED NOT NULL,
    member_count    INT UNSIGNED DEFAULT 0,
    message_count   BIGINT UNSIGNED DEFAULT 0,
    last_message_at TIMESTAMP NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    UNIQUE INDEX idx_workspace_name (workspace_id, name),
    INDEX idx_type (type),
    INDEX idx_last_message (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## 4. Indexing Strategy

### 4.1 MySQL Indexes

| Table | Index | Columns | Type | Purpose |
|-------|-------|---------|------|---------|
| users | PRIMARY | id | B-tree | Primary key |
| users | idx_email | email | B-tree | Login lookup |
| channels | idx_workspace_name | workspace_id, name | B-tree | Channel lookup |
| channel_members | idx_user_channels | user_id, channel_id | B-tree | User's channels |

### 4.2 MongoDB Indexes

```javascript
// Messages collection
db.messages.createIndex({ channel_id: 1, ts: -1 });
db.messages.createIndex({ thread_id: 1, ts: 1 });
db.messages.createIndex({ workspace_id: 1, created_at: -1 });
db.messages.createIndex({ "mentions": 1 });
db.messages.createIndex(
  { "content.text": "text" },
  { weights: { "content.text": 10 } }
);

// TTL index for deleted messages
db.messages.createIndex(
  { deleted_at: 1 },
  { expireAfterSeconds: 2592000 } // 30 days
);
```

### 4.3 Elasticsearch Mappings

```json
{
  "mappings": {
    "properties": {
      "message_id": { "type": "keyword" },
      "channel_id": { "type": "keyword" },
      "workspace_id": { "type": "keyword" },
      "user_id": { "type": "keyword" },
      "content": {
        "type": "text",
        "analyzer": "standard",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "created_at": { "type": "date" },
      "attachments": {
        "type": "nested",
        "properties": {
          "name": { "type": "text" },
          "type": { "type": "keyword" }
        }
      }
    }
  }
}
```

## 5. Data Partitioning

### 5.1 Sharding Strategy (MongoDB)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MongoDB Sharding                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Shard Key: { workspace_id: 1, channel_id: 1 }                              │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │    Shard 1      │  │    Shard 2      │  │    Shard 3      │             │
│  │                 │  │                 │  │                 │             │
│  │  Workspaces     │  │  Workspaces     │  │  Workspaces     │             │
│  │  A-H            │  │  I-P            │  │  Q-Z            │             │
│  │                 │  │                 │  │                 │             │
│  │  Primary        │  │  Primary        │  │  Primary        │             │
│  │  + 2 Replicas   │  │  + 2 Replicas   │  │  + 2 Replicas   │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 MySQL Partitioning

```sql
-- Partition audit_logs by date
CREATE TABLE audit_logs (
    id              BIGINT UNSIGNED NOT NULL,
    workspace_id    BIGINT UNSIGNED NOT NULL,
    user_id         BIGINT UNSIGNED,
    action          VARCHAR(50) NOT NULL,
    resource_type   VARCHAR(50),
    resource_id     BIGINT UNSIGNED,
    details         JSON,
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(255),
    created_at      TIMESTAMP NOT NULL
)
PARTITION BY RANGE (UNIX_TIMESTAMP(created_at)) (
    PARTITION p2024_01 VALUES LESS THAN (UNIX_TIMESTAMP('2024-02-01')),
    PARTITION p2024_02 VALUES LESS THAN (UNIX_TIMESTAMP('2024-03-01')),
    PARTITION p2024_03 VALUES LESS THAN (UNIX_TIMESTAMP('2024-04-01')),
    -- ... more partitions
    PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

## 6. Data Retention

### 6.1 Retention Policies

| Data Type | Free Plan | Pro Plan | Enterprise |
|-----------|-----------|----------|------------|
| Messages | 90 days | 1 year | Unlimited |
| Files | 5 GB | 20 GB | Unlimited |
| Audit Logs | 30 days | 1 year | 7 years |
| Analytics | 7 days | 90 days | 1 year |

### 6.2 Archival Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Data Lifecycle                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Hot Storage (0-30 days)                                                    │
│  ├── MongoDB (SSD)                                                          │
│  ├── Elasticsearch                                                          │
│  └── Redis cache                                                            │
│                                                                              │
│  Warm Storage (30-365 days)                                                 │
│  ├── MongoDB (HDD tier)                                                     │
│  └── S3 Standard                                                            │
│                                                                              │
│  Cold Storage (365+ days)                                                   │
│  ├── S3 Glacier                                                             │
│  └── Compressed archives                                                    │
│                                                                              │
│  Deletion (per policy)                                                      │
│  ├── Soft delete → 30 days → Hard delete                                   │
│  └── Compliance hold exceptions                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 7. Backup & Recovery

### 7.1 Backup Strategy

| Database | Backup Type | Frequency | Retention |
|----------|-------------|-----------|-----------|
| MySQL | Full + Incremental | Daily + Hourly | 30 days |
| MongoDB | Continuous (oplog) | Real-time | 7 days |
| Redis | RDB + AOF | Hourly + Real-time | 24 hours |
| Elasticsearch | Snapshots | Daily | 14 days |

### 7.2 Recovery Objectives

| Metric | Target |
|--------|--------|
| RPO (Recovery Point Objective) | < 1 minute |
| RTO (Recovery Time Objective) | < 15 minutes |
| Backup Verification | Weekly |
| DR Drill | Quarterly |

## 8. Security

### 8.1 Encryption

| Layer | Method |
|-------|--------|
| At Rest | AES-256 (TDE) |
| In Transit | TLS 1.3 |
| Backups | AES-256-GCM |
| Sensitive Fields | Application-level encryption |

### 8.2 Access Control

```sql
-- Role-based access
CREATE USER 'quckapp_app'@'%' IDENTIFIED BY '***';
GRANT SELECT, INSERT, UPDATE, DELETE ON quckapp.* TO 'quckapp_app'@'%';

CREATE USER 'quckapp_readonly'@'%' IDENTIFIED BY '***';
GRANT SELECT ON quckapp.* TO 'quckapp_readonly'@'%';

CREATE USER 'quckapp_analytics'@'%' IDENTIFIED BY '***';
GRANT SELECT ON quckapp.audit_logs TO 'quckapp_analytics'@'%';
GRANT SELECT ON quckapp.analytics_* TO 'quckapp_analytics'@'%';
```

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2023-04-15 | Data Team | Initial draft |
| 1.5 | 2024-01-10 | Data Team | Added sharding |
