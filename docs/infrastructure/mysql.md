---
sidebar_position: 9
---

# MySQL

QuikApp uses MySQL as the database for Spring Boot microservices, providing robust authentication, user management, and permission storage.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      MySQL Cluster                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │     Master      │  │     Slave 1     │  │     Slave 2     │  │
│  │  (Read/Write)   │──│   (Read Only)   │──│   (Read Only)   │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┴────────────────────┘           │
│                              │                                   │
│                      ┌───────┴───────┐                          │
│                      │   ProxySQL    │                          │
│                      │(Query Router) │                          │
│                      └───────┬───────┘                          │
└──────────────────────────────┼──────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
   ┌───────────┐        ┌───────────┐        ┌───────────┐
   │   Auth    │        │   User    │        │ Permission│
   │  Service  │        │  Service  │        │  Service  │
   └───────────┘        └───────────┘        └───────────┘
```

## Services Using MySQL

| Service | Database | Purpose |
|---------|----------|---------|
| **auth-service** (Spring Boot) | `QuikApp_auth` | Authentication, tokens, sessions |
| **user-service** (Spring Boot) | `QuikApp_user` | User profiles, preferences |
| **permission-service** (Spring Boot) | `QuikApp_permission` | RBAC, roles, permissions |
| **audit-service** (Spring Boot) | `QuikApp_audit` | Audit logs, compliance |
| **admin-service** (Spring Boot) | `QuikApp_admin` | Admin operations, system config |

## Database Schema

### Auth Database

```sql
-- QuikApp_auth

CREATE TABLE users_auth (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    status ENUM('active', 'inactive', 'suspended', 'pending') DEFAULT 'pending',
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at DATETIME,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(255),
    failed_login_attempts INT DEFAULT 0,
    locked_until DATETIME,
    last_login_at DATETIME,
    last_login_ip VARCHAR(45),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refresh_tokens (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    device_info JSON,
    ip_address VARCHAR(45),
    expires_at DATETIME NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users_auth(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_token_hash (token_hash),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_reset_tokens (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users_auth(id) ON DELETE CASCADE,
    INDEX idx_token (token_hash),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE oauth_connections (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    provider ENUM('google', 'github', 'microsoft', 'slack') NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users_auth(id) ON DELETE CASCADE,
    UNIQUE KEY uk_provider_user (provider, provider_user_id),
    INDEX idx_user_provider (user_id, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE otp_codes (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    code VARCHAR(10) NOT NULL,
    type ENUM('email_verification', 'password_reset', 'two_factor', 'phone_verification') NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts INT DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users_auth(id) ON DELETE CASCADE,
    INDEX idx_user_type (user_id, type),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### User Database

```sql
-- QuikApp_user

CREATE TABLE users (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    full_name VARCHAR(200),
    avatar_url VARCHAR(500),
    phone VARCHAR(20),
    timezone VARCHAR(50) DEFAULT 'UTC',
    locale VARCHAR(10) DEFAULT 'en',
    status ENUM('online', 'away', 'dnd', 'offline') DEFAULT 'offline',
    status_text VARCHAR(100),
    status_emoji VARCHAR(10),
    status_expires_at DATETIME,
    last_seen_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_display_name (display_name),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_preferences (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL UNIQUE,
    theme ENUM('light', 'dark', 'system') DEFAULT 'system',
    notification_sound BOOLEAN DEFAULT TRUE,
    desktop_notifications BOOLEAN DEFAULT TRUE,
    email_notifications JSON,
    push_notifications JSON,
    message_preview BOOLEAN DEFAULT TRUE,
    compact_mode BOOLEAN DEFAULT FALSE,
    keyboard_shortcuts BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_devices (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    device_type ENUM('web', 'desktop', 'ios', 'android') NOT NULL,
    device_name VARCHAR(100),
    push_token TEXT,
    last_active_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_device (user_id, device_id),
    INDEX idx_push_token (push_token(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Permission Database

```sql
-- QuikApp_permission

CREATE TABLE roles (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    is_system BOOLEAN DEFAULT FALSE,
    priority INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE permissions (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255),
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_resource_action (resource, action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
    role_id CHAR(36) NOT NULL,
    permission_id CHAR(36) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roles (
    user_id CHAR(36) NOT NULL,
    role_id CHAR(36) NOT NULL,
    workspace_id CHAR(36),
    granted_by CHAR(36),
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    PRIMARY KEY (user_id, role_id, workspace_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    INDEX idx_workspace (workspace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default roles
INSERT INTO roles (id, name, description, is_system, priority) VALUES
    (UUID(), 'super_admin', 'Full system access', TRUE, 100),
    (UUID(), 'workspace_owner', 'Workspace owner with full workspace access', TRUE, 90),
    (UUID(), 'workspace_admin', 'Workspace administrator', TRUE, 80),
    (UUID(), 'member', 'Regular workspace member', TRUE, 10),
    (UUID(), 'guest', 'Limited guest access', TRUE, 1);
```

### Audit Database

```sql
-- QuikApp_audit

CREATE TABLE audit_logs (
    id CHAR(36) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    severity ENUM('info', 'warning', 'error', 'critical') DEFAULT 'info',
    user_id CHAR(36),
    workspace_id CHAR(36),
    resource_type VARCHAR(50),
    resource_id CHAR(36),
    action VARCHAR(50) NOT NULL,
    old_values JSON,
    new_values JSON,
    metadata JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_event_type (event_type),
    INDEX idx_user_id (user_id),
    INDEX idx_workspace_id (workspace_id),
    INDEX idx_resource (resource_type, resource_id),
    INDEX idx_created_at (created_at),
    INDEX idx_severity (severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Partitioning for audit logs (by month)
ALTER TABLE audit_logs
PARTITION BY RANGE (YEAR(created_at) * 100 + MONTH(created_at)) (
    PARTITION p202401 VALUES LESS THAN (202402),
    PARTITION p202402 VALUES LESS THAN (202403),
    PARTITION p202403 VALUES LESS THAN (202404),
    PARTITION p202404 VALUES LESS THAN (202405),
    PARTITION p202405 VALUES LESS THAN (202406),
    PARTITION p202406 VALUES LESS THAN (202407),
    PARTITION p202407 VALUES LESS THAN (202408),
    PARTITION p202408 VALUES LESS THAN (202409),
    PARTITION p202409 VALUES LESS THAN (202410),
    PARTITION p202410 VALUES LESS THAN (202411),
    PARTITION p202411 VALUES LESS THAN (202412),
    PARTITION p202412 VALUES LESS THAN (202501),
    PARTITION pmax VALUES LESS THAN MAXVALUE
);

CREATE TABLE security_events (
    id CHAR(36) PRIMARY KEY,
    event_type ENUM('login_success', 'login_failure', 'logout', 'password_change',
                    'two_factor_enabled', 'two_factor_disabled', 'account_locked',
                    'suspicious_activity', 'token_revoked') NOT NULL,
    user_id CHAR(36),
    ip_address VARCHAR(45),
    user_agent TEXT,
    location JSON,
    details JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at),
    INDEX idx_ip (ip_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## Docker Configuration

```yaml
# docker-compose.yml
services:
  mysql:
    image: mysql:8.0
    container_name: QuikApp-mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-rootsecret}
      MYSQL_USER: ${MYSQL_USER:-QuikApp}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-secret}
    volumes:
      - mysql_data:/var/lib/mysql
      - ./init-scripts/mysql:/docker-entrypoint-initdb.d
      - ./config/mysql/my.cnf:/etc/mysql/conf.d/my.cnf
    ports:
      - "3306:3306"
    networks:
      - QuikApp-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 5
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
      - --default-authentication-plugin=mysql_native_password
      - --max_connections=200
      - --innodb_buffer_pool_size=1G
      - --innodb_log_file_size=256M
      - --innodb_flush_log_at_trx_commit=2
      - --slow_query_log=1
      - --long_query_time=2

volumes:
  mysql_data:
```

### Multiple Databases Init Script

```sql
-- init-scripts/mysql/01-init-databases.sql

CREATE DATABASE IF NOT EXISTS QuikApp_auth;
CREATE DATABASE IF NOT EXISTS QuikApp_user;
CREATE DATABASE IF NOT EXISTS QuikApp_permission;
CREATE DATABASE IF NOT EXISTS QuikApp_audit;
CREATE DATABASE IF NOT EXISTS QuikApp_admin;

GRANT ALL PRIVILEGES ON QuikApp_auth.* TO 'QuikApp'@'%';
GRANT ALL PRIVILEGES ON QuikApp_user.* TO 'QuikApp'@'%';
GRANT ALL PRIVILEGES ON QuikApp_permission.* TO 'QuikApp'@'%';
GRANT ALL PRIVILEGES ON QuikApp_audit.* TO 'QuikApp'@'%';
GRANT ALL PRIVILEGES ON QuikApp_admin.* TO 'QuikApp'@'%';

FLUSH PRIVILEGES;
```

## Spring Boot Configuration

### application.yml

```yaml
# auth-service/src/main/resources/application.yml
spring:
  datasource:
    url: jdbc:mysql://${MYSQL_HOST:localhost}:${MYSQL_PORT:3306}/QuikApp_auth?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true
    username: ${MYSQL_USER:QuikApp}
    password: ${MYSQL_PASSWORD:secret}
    driver-class-name: com.mysql.cj.jdbc.Driver
    hikari:
      minimum-idle: 5
      maximum-pool-size: 20
      idle-timeout: 300000
      pool-name: AuthHikariCP
      max-lifetime: 1200000
      connection-timeout: 20000

  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    properties:
      hibernate:
        dialect: org.hibernate.dialect.MySQL8Dialect
        format_sql: true
        jdbc:
          batch_size: 50
        order_inserts: true
        order_updates: true

  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true
```

### Entity Example

```java
// User.java
@Entity
@Table(name = "users_auth")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserAuth {

    @Id
    @Column(length = 36)
    private String id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false, length = 64)
    private String salt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserStatus status = UserStatus.PENDING;

    @Column(name = "email_verified")
    private Boolean emailVerified = false;

    @Column(name = "two_factor_enabled")
    private Boolean twoFactorEnabled = false;

    @Column(name = "failed_login_attempts")
    private Integer failedLoginAttempts = 0;

    @Column(name = "locked_until")
    private LocalDateTime lockedUntil;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "last_login_ip", length = 45)
    private String lastLoginIp;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (id == null) {
            id = UUID.randomUUID().toString();
        }
    }
}
```

## Migrations with Flyway

```sql
-- db/migration/V1__create_users_auth.sql
CREATE TABLE users_auth (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    -- ... rest of schema
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- db/migration/V2__create_refresh_tokens.sql
CREATE TABLE refresh_tokens (
    -- ... schema
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## Performance Tuning

### my.cnf Configuration

```ini
# config/mysql/my.cnf
[mysqld]
# InnoDB Settings
innodb_buffer_pool_size = 4G
innodb_buffer_pool_instances = 4
innodb_log_file_size = 512M
innodb_log_buffer_size = 64M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
innodb_file_per_table = 1
innodb_io_capacity = 2000
innodb_io_capacity_max = 4000

# Connection Settings
max_connections = 200
max_connect_errors = 100
wait_timeout = 28800
interactive_timeout = 28800

# Query Cache (disabled in MySQL 8.0+)
# query_cache_type = 0

# Buffer Settings
key_buffer_size = 256M
sort_buffer_size = 4M
read_buffer_size = 2M
read_rnd_buffer_size = 8M
join_buffer_size = 4M

# Temp Table Settings
tmp_table_size = 256M
max_heap_table_size = 256M

# Logging
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2
log_queries_not_using_indexes = 1

# Binary Logging (for replication)
server-id = 1
log_bin = mysql-bin
binlog_format = ROW
expire_logs_days = 7
max_binlog_size = 500M
```

## Monitoring

### Key Queries

```sql
-- Active connections
SHOW PROCESSLIST;

-- Connection status
SHOW STATUS LIKE 'Threads%';

-- InnoDB status
SHOW ENGINE INNODB STATUS;

-- Slow queries
SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 10;

-- Table sizes
SELECT
    table_schema AS 'Database',
    table_name AS 'Table',
    ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.tables
WHERE table_schema IN ('QuikApp_auth', 'QuikApp_user', 'QuikApp_permission', 'QuikApp_audit')
ORDER BY (data_length + index_length) DESC;

-- Index usage
SELECT
    object_schema,
    object_name,
    index_name,
    count_star AS usage_count
FROM performance_schema.table_io_waits_summary_by_index_usage
WHERE object_schema LIKE 'QuikApp_%'
ORDER BY count_star DESC;
```

### Prometheus Exporter

```yaml
# docker-compose.monitoring.yml
services:
  mysql-exporter:
    image: prom/mysqld-exporter:v0.15.0
    container_name: QuikApp-mysql-exporter
    environment:
      DATA_SOURCE_NAME: "exporter:exporterpass@(mysql:3306)/"
    ports:
      - "9104:9104"
    networks:
      - QuikApp-network
```

## Backup & Recovery

```bash
#!/bin/bash
# scripts/backup-mysql.sh

BACKUP_DIR="/backups/mysql"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATABASES="QuikApp_auth QuikApp_user QuikApp_permission QuikApp_audit QuikApp_admin"

for DB in $DATABASES; do
    mysqldump -h localhost -u root -p"$MYSQL_ROOT_PASSWORD" \
        --single-transaction \
        --routines \
        --triggers \
        $DB > "$BACKUP_DIR/${DB}_${TIMESTAMP}.sql"

    gzip "$BACKUP_DIR/${DB}_${TIMESTAMP}.sql"
done

# Keep only last 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

# Upload to S3
aws s3 sync $BACKUP_DIR s3://QuikApp-backups/mysql/
```
