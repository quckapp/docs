---
sidebar_position: 2
---

# User Service

Spring Boot service for user profile management, settings, and user-related operations.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 8082 |
| **Database** | MySQL |
| **Framework** | Spring Boot 3.x |
| **Language** | Java 21 |

## Features

- User profile CRUD operations
- User search and discovery
- User settings management
- Blocking/unblocking users
- Contact synchronization
- FCM token management
- Device linking

## API Endpoints

### Users

```http
GET    /api/users
GET    /api/users/{id}
POST   /api/users
PUT    /api/users/{id}
DELETE /api/users/{id}
GET    /api/users/search?q={query}
GET    /api/users/me
```

### Profile

```http
GET  /api/users/{id}/profile
PUT  /api/users/{id}/profile
POST /api/users/{id}/avatar
```

### Settings

```http
GET  /api/users/{id}/settings
PUT  /api/users/{id}/settings
PUT  /api/users/{id}/settings/notifications
PUT  /api/users/{id}/settings/privacy
```

### Blocking

```http
GET    /api/users/{id}/blocked
POST   /api/users/{id}/block
DELETE /api/users/{id}/unblock/{blockedId}
```

### Contacts

```http
GET  /api/users/{id}/contacts
POST /api/users/{id}/contacts/sync
```

### Devices

```http
GET    /api/users/{id}/devices
POST   /api/users/{id}/devices
DELETE /api/users/{id}/devices/{deviceId}
POST   /api/users/{id}/fcm-token
```

## Data Models

### User

```java
@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(unique = true)
    private String email;

    @Column(unique = true)
    private String username;

    private String displayName;
    private String avatarUrl;
    private String bio;
    private String phoneNumber;

    @Enumerated(EnumType.STRING)
    private UserRole role = UserRole.USER;

    @Enumerated(EnumType.STRING)
    private UserStatus status = UserStatus.ACTIVE;

    private boolean isBanned;
    private String banReason;
    private LocalDateTime bannedAt;

    private boolean isVerified;
    private LocalDateTime verifiedAt;

    private LocalDateTime lastActiveAt;

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
```

### User Settings

```java
@Entity
@Table(name = "user_settings")
public class UserSettings {
    @Id
    private String userId;

    // Notification settings
    private boolean emailNotifications = true;
    private boolean pushNotifications = true;
    private boolean smsNotifications = false;

    // Privacy settings
    @Enumerated(EnumType.STRING)
    private PrivacyLevel profileVisibility = PrivacyLevel.PUBLIC;

    @Enumerated(EnumType.STRING)
    private PrivacyLevel lastSeenVisibility = PrivacyLevel.CONTACTS;

    private boolean readReceipts = true;
    private boolean typingIndicators = true;

    // Preferences
    private String language = "en";
    private String timezone = "UTC";
    private String theme = "system";

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
```

## Configuration

```yaml
server:
  port: 8082

spring:
  datasource:
    url: jdbc:mysql://${MYSQL_HOST:localhost}:3306/QuikApp_users
    username: ${MYSQL_USER:root}
    password: ${MYSQL_PASSWORD:password}

  servlet:
    multipart:
      max-file-size: 10MB
      max-request-size: 10MB

storage:
  type: s3
  bucket: QuikApp-avatars
  region: ${AWS_REGION:us-east-1}
```

## Service Implementation

```java
@Service
@Transactional
public class UserService {

    public User createUser(CreateUserDto dto) {
        if (userRepository.existsByEmail(dto.getEmail())) {
            throw new UserAlreadyExistsException("Email already registered");
        }

        User user = User.builder()
            .email(dto.getEmail())
            .username(generateUsername(dto.getEmail()))
            .displayName(dto.getDisplayName())
            .build();

        user = userRepository.save(user);

        // Create default settings
        userSettingsRepository.save(UserSettings.builder()
            .userId(user.getId())
            .build());

        // Publish event
        kafkaTemplate.send("QuikApp.users.events",
            new UserCreatedEvent(user.getId(), user.getEmail()));

        return user;
    }
}
```

## Kafka Events

```java
public class UserCreatedEvent {
    private String userId;
    private String email;
    private LocalDateTime timestamp;
}

public class UserUpdatedEvent {
    private String userId;
    private Map<String, Object> changes;
    private LocalDateTime timestamp;
}

public class UserBannedEvent {
    private String userId;
    private String reason;
    private String bannedBy;
    private LocalDateTime timestamp;
}
```

## MySQL Database Integration

QuikApp User Service leverages MySQL 8.0 for reliable, ACID-compliant user data storage with advanced features for high-performance queries and horizontal scaling.

### MySQL Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User Service                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │   Spring    │───▶│  HikariCP   │───▶│    JDBC     │             │
│  │    Data     │    │ Connection  │    │   Driver    │             │
│  │    JPA      │    │    Pool     │    │             │             │
│  └─────────────┘    └─────────────┘    └──────┬──────┘             │
└──────────────────────────────────────────────│──────────────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
             ┌──────▼──────┐            ┌──────▼──────┐            ┌──────▼──────┐
             │   Primary   │            │   Replica   │            │   Replica   │
             │   (Write)   │───────────▶│   (Read)    │            │   (Read)    │
             │             │  Async     │             │            │             │
             └─────────────┘  Repl.     └─────────────┘            └─────────────┘
```

### HikariCP Connection Pool Configuration

```yaml
# application.yml
spring:
  datasource:
    url: jdbc:mysql://${MYSQL_HOST:localhost}:3306/quikapp_users?useSSL=true&serverTimezone=UTC&rewriteBatchedStatements=true
    username: ${MYSQL_USER:quikapp}
    password: ${MYSQL_PASSWORD}
    driver-class-name: com.mysql.cj.jdbc.Driver

    # HikariCP Configuration
    hikari:
      pool-name: QuikAppUserPool
      maximum-pool-size: 20
      minimum-idle: 5
      idle-timeout: 300000        # 5 minutes
      max-lifetime: 1800000       # 30 minutes
      connection-timeout: 30000   # 30 seconds
      validation-timeout: 5000    # 5 seconds
      leak-detection-threshold: 60000  # 1 minute

      # Connection test query
      connection-test-query: SELECT 1

      # Data source properties
      data-source-properties:
        cachePrepStmts: true
        prepStmtCacheSize: 250
        prepStmtCacheSqlLimit: 2048
        useServerPrepStmts: true
        useLocalSessionState: true
        rewriteBatchedStatements: true
        cacheResultSetMetadata: true
        cacheServerConfiguration: true
        elideSetAutoCommits: true
        maintainTimeStats: false
```

### Read/Write Splitting Configuration

```java
@Configuration
public class DataSourceConfig {

    @Bean
    @Primary
    public DataSource routingDataSource(
            @Qualifier("primaryDataSource") DataSource primaryDataSource,
            @Qualifier("replicaDataSource") DataSource replicaDataSource) {

        RoutingDataSource routingDataSource = new RoutingDataSource();

        Map<Object, Object> dataSourceMap = new HashMap<>();
        dataSourceMap.put(DataSourceType.PRIMARY, primaryDataSource);
        dataSourceMap.put(DataSourceType.REPLICA, replicaDataSource);

        routingDataSource.setTargetDataSources(dataSourceMap);
        routingDataSource.setDefaultTargetDataSource(primaryDataSource);

        return routingDataSource;
    }

    @Bean
    @ConfigurationProperties("spring.datasource.primary")
    public DataSource primaryDataSource() {
        return DataSourceBuilder.create()
            .type(HikariDataSource.class)
            .build();
    }

    @Bean
    @ConfigurationProperties("spring.datasource.replica")
    public DataSource replicaDataSource() {
        return DataSourceBuilder.create()
            .type(HikariDataSource.class)
            .build();
    }
}

public class RoutingDataSource extends AbstractRoutingDataSource {

    @Override
    protected Object determineCurrentLookupKey() {
        return TransactionSynchronizationManager.isCurrentTransactionReadOnly()
            ? DataSourceType.REPLICA
            : DataSourceType.PRIMARY;
    }
}

public enum DataSourceType {
    PRIMARY, REPLICA
}
```

### JPA/Hibernate Configuration

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: validate
      naming:
        physical-strategy: org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy

    properties:
      hibernate:
        dialect: org.hibernate.dialect.MySQLDialect
        format_sql: true
        use_sql_comments: true

        # Batch processing
        jdbc:
          batch_size: 50
          batch_versioned_data: true
        order_inserts: true
        order_updates: true

        # Second-level cache (with Redis)
        cache:
          use_second_level_cache: true
          use_query_cache: true
          region:
            factory_class: org.redisson.hibernate.RedissonRegionFactory

        # Statistics
        generate_statistics: true

        # Connection handling
        connection:
          handling_mode: DELAYED_ACQUISITION_AND_RELEASE_AFTER_TRANSACTION

    open-in-view: false  # Disable OSIV for better performance
```

### Database Schema with Indexes

```sql
-- Users table with optimized indexes
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    username VARCHAR(50) NOT NULL,
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    bio TEXT,
    phone_number VARCHAR(20),
    role ENUM('USER', 'MODERATOR', 'ADMIN') DEFAULT 'USER',
    status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason VARCHAR(500),
    banned_at DATETIME(6),
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at DATETIME(6),
    last_active_at DATETIME(6),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    -- Unique constraints
    CONSTRAINT uk_users_email UNIQUE (email),
    CONSTRAINT uk_users_username UNIQUE (username),
    CONSTRAINT uk_users_phone UNIQUE (phone_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optimized indexes for common queries
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_last_active ON users(last_active_at);
CREATE INDEX idx_users_is_banned ON users(is_banned);

-- Full-text search index
CREATE FULLTEXT INDEX ft_users_search ON users(display_name, username, bio);

-- User settings table
CREATE TABLE user_settings (
    user_id VARCHAR(36) PRIMARY KEY,
    email_notifications BOOLEAN DEFAULT TRUE,
    push_notifications BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT FALSE,
    profile_visibility ENUM('PUBLIC', 'CONTACTS', 'PRIVATE') DEFAULT 'PUBLIC',
    last_seen_visibility ENUM('PUBLIC', 'CONTACTS', 'PRIVATE') DEFAULT 'CONTACTS',
    read_receipts BOOLEAN DEFAULT TRUE,
    typing_indicators BOOLEAN DEFAULT TRUE,
    language VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    theme ENUM('LIGHT', 'DARK', 'SYSTEM') DEFAULT 'SYSTEM',
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User blocks table
CREATE TABLE user_blocks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    blocker_id VARCHAR(36) NOT NULL,
    blocked_id VARCHAR(36) NOT NULL,
    reason VARCHAR(500),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT uk_user_blocks UNIQUE (blocker_id, blocked_id),
    CONSTRAINT fk_blocks_blocker FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_blocks_blocked FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,

    INDEX idx_blocks_blocker (blocker_id),
    INDEX idx_blocks_blocked (blocked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User contacts table
CREATE TABLE user_contacts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    contact_user_id VARCHAR(36) NOT NULL,
    contact_name VARCHAR(100),
    phone_number VARCHAR(20),
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT uk_user_contacts UNIQUE (user_id, contact_user_id),
    CONSTRAINT fk_contacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_contacts_contact FOREIGN KEY (contact_user_id) REFERENCES users(id) ON DELETE CASCADE,

    INDEX idx_contacts_user (user_id),
    INDEX idx_contacts_favorite (user_id, is_favorite)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User devices table
CREATE TABLE user_devices (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    device_name VARCHAR(100),
    device_type ENUM('IOS', 'ANDROID', 'WEB', 'DESKTOP') NOT NULL,
    device_token VARCHAR(500),
    fcm_token VARCHAR(500),
    apns_token VARCHAR(500),
    last_used_at DATETIME(6),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

    INDEX idx_devices_user (user_id),
    INDEX idx_devices_fcm (fcm_token(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Repository with Query Optimization

```java
@Repository
public interface UserRepository extends JpaRepository<User, String>, JpaSpecificationExecutor<User> {

    // Use projections for performance
    @Query("SELECT u.id as id, u.username as username, u.displayName as displayName, " +
           "u.avatarUrl as avatarUrl FROM User u WHERE u.id = :id")
    Optional<UserSummaryProjection> findSummaryById(@Param("id") String id);

    // Batch fetching
    @Query("SELECT u FROM User u WHERE u.id IN :ids")
    @QueryHints(@QueryHint(name = "org.hibernate.fetchSize", value = "50"))
    List<User> findAllByIds(@Param("ids") Collection<String> ids);

    // Native query for full-text search
    @Query(value = "SELECT * FROM users WHERE MATCH(display_name, username, bio) " +
                   "AGAINST(:query IN NATURAL LANGUAGE MODE) AND status = 'ACTIVE' LIMIT :limit",
           nativeQuery = true)
    List<User> fullTextSearch(@Param("query") String query, @Param("limit") int limit);

    // Optimized exists check
    @Query("SELECT CASE WHEN COUNT(u) > 0 THEN true ELSE false END FROM User u WHERE u.email = :email")
    boolean existsByEmail(@Param("email") String email);

    // Pagination with count query optimization
    @Query(value = "SELECT u FROM User u WHERE u.status = :status",
           countQuery = "SELECT COUNT(u.id) FROM User u WHERE u.status = :status")
    Page<User> findByStatus(@Param("status") UserStatus status, Pageable pageable);

    // Stream for large datasets
    @Query("SELECT u FROM User u WHERE u.createdAt >= :since")
    @QueryHints(@QueryHint(name = "org.hibernate.fetchSize", value = "100"))
    Stream<User> streamUsersCreatedSince(@Param("since") LocalDateTime since);

    // Update query (avoid loading entity)
    @Modifying
    @Query("UPDATE User u SET u.lastActiveAt = :timestamp WHERE u.id = :userId")
    int updateLastActiveAt(@Param("userId") String userId, @Param("timestamp") LocalDateTime timestamp);

    // Bulk update
    @Modifying
    @Query("UPDATE User u SET u.status = :status WHERE u.id IN :userIds")
    int bulkUpdateStatus(@Param("userIds") Collection<String> userIds, @Param("status") UserStatus status);
}

// Projection interface for optimized queries
public interface UserSummaryProjection {
    String getId();
    String getUsername();
    String getDisplayName();
    String getAvatarUrl();
}
```

### Query Performance Optimization Service

```java
@Service
@Slf4j
public class UserQueryService {

    private final UserRepository userRepository;
    private final EntityManager entityManager;

    @Transactional(readOnly = true)
    public Page<UserDto> searchUsers(UserSearchCriteria criteria, Pageable pageable) {
        Specification<User> spec = buildSpecification(criteria);

        // Use scroll for large result sets
        if (pageable.getPageSize() > 100) {
            return searchWithScroll(spec, pageable);
        }

        return userRepository.findAll(spec, pageable)
            .map(this::toDto);
    }

    private Specification<User> buildSpecification(UserSearchCriteria criteria) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            // Always filter active users
            predicates.add(cb.equal(root.get("status"), UserStatus.ACTIVE));

            if (StringUtils.hasText(criteria.getQuery())) {
                String pattern = "%" + criteria.getQuery().toLowerCase() + "%";
                predicates.add(cb.or(
                    cb.like(cb.lower(root.get("username")), pattern),
                    cb.like(cb.lower(root.get("displayName")), pattern),
                    cb.like(cb.lower(root.get("email")), pattern)
                ));
            }

            if (criteria.getRole() != null) {
                predicates.add(cb.equal(root.get("role"), criteria.getRole()));
            }

            if (criteria.getCreatedAfter() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), criteria.getCreatedAfter()));
            }

            // Optimize: Only fetch required columns
            if (query.getResultType() != Long.class) {
                root.fetch("settings", JoinType.LEFT);
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    @Transactional(readOnly = true)
    public void exportUsers(LocalDateTime since, Consumer<User> consumer) {
        // Use stream for memory-efficient processing
        try (Stream<User> userStream = userRepository.streamUsersCreatedSince(since)) {
            userStream.forEach(user -> {
                consumer.accept(user);
                entityManager.detach(user);  // Prevent memory leak
            });
        }
    }
}
```

### Batch Operations

```java
@Service
@RequiredArgsConstructor
public class UserBatchService {

    private final EntityManager entityManager;

    @Value("${app.batch.size:50}")
    private int batchSize;

    @Transactional
    public void batchInsertUsers(List<User> users) {
        for (int i = 0; i < users.size(); i++) {
            entityManager.persist(users.get(i));

            if (i > 0 && i % batchSize == 0) {
                entityManager.flush();
                entityManager.clear();
            }
        }
        entityManager.flush();
        entityManager.clear();
    }

    @Transactional
    public void batchUpdateLastActive(Map<String, LocalDateTime> userTimestamps) {
        String sql = "UPDATE users SET last_active_at = ? WHERE id = ?";

        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {

            int count = 0;
            for (Map.Entry<String, LocalDateTime> entry : userTimestamps.entrySet()) {
                ps.setTimestamp(1, Timestamp.valueOf(entry.getValue()));
                ps.setString(2, entry.getKey());
                ps.addBatch();

                if (++count % batchSize == 0) {
                    ps.executeBatch();
                }
            }
            ps.executeBatch();
        }
    }
}
```

### Hibernate Second-Level Cache with Redis

```java
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public RedissonClient redissonClient() {
        Config config = new Config();
        config.useSingleServer()
            .setAddress("redis://${REDIS_HOST:localhost}:6379")
            .setConnectionPoolSize(10)
            .setConnectionMinimumIdleSize(5);
        return Redisson.create(config);
    }
}

// Entity with caching
@Entity
@Table(name = "users")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE, region = "users")
public class User {

    @Id
    private String id;

    // ... fields

    @OneToOne(mappedBy = "user", fetch = FetchType.LAZY)
    @Cache(usage = CacheConcurrencyStrategy.READ_WRITE, region = "user-settings")
    private UserSettings settings;
}

// Cache regions configuration
// redisson-hibernate.yml
hibernate:
  cache:
    users:
      ttl: 3600000      # 1 hour
      maxIdleTime: 1800000
      maxSize: 10000
    user-settings:
      ttl: 7200000      # 2 hours
      maxIdleTime: 3600000
      maxSize: 10000
    query-cache:
      ttl: 300000       # 5 minutes
      maxSize: 1000
```

### MySQL Replication Configuration

```yaml
# Primary server (my.cnf)
[mysqld]
server-id = 1
log_bin = mysql-bin
binlog_format = ROW
binlog_row_image = FULL
gtid_mode = ON
enforce_gtid_consistency = ON
sync_binlog = 1
innodb_flush_log_at_trx_commit = 1

# Performance tuning
innodb_buffer_pool_size = 4G
innodb_log_file_size = 1G
innodb_flush_method = O_DIRECT
innodb_io_capacity = 2000
innodb_io_capacity_max = 4000

# Connection settings
max_connections = 500
thread_cache_size = 50

# Query cache (MySQL 8.0+ uses different approach)
# Use ProxySQL or application-level caching instead
```

```yaml
# Replica server (my.cnf)
[mysqld]
server-id = 2
relay_log = relay-bin
read_only = ON
super_read_only = ON
gtid_mode = ON
enforce_gtid_consistency = ON

# Replication settings
replica_parallel_workers = 4
replica_parallel_type = LOGICAL_CLOCK
replica_preserve_commit_order = ON

# Same InnoDB settings as primary
innodb_buffer_pool_size = 4G
```

### Docker Compose Configuration

```yaml
version: '3.8'

services:
  mysql-primary:
    image: mysql:8.0
    container_name: quikapp-mysql-primary
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: quikapp_users
      MYSQL_USER: quikapp
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
    ports:
      - "3306:3306"
    volumes:
      - mysql_primary_data:/var/lib/mysql
      - ./mysql/primary.cnf:/etc/mysql/conf.d/primary.cnf
      - ./mysql/init:/docker-entrypoint-initdb.d
    command: >
      --default-authentication-plugin=caching_sha2_password
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
      --innodb-buffer-pool-size=1G
      --max-connections=200
    networks:
      - quikapp-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 5

  mysql-replica:
    image: mysql:8.0
    container_name: quikapp-mysql-replica
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    ports:
      - "3307:3306"
    volumes:
      - mysql_replica_data:/var/lib/mysql
      - ./mysql/replica.cnf:/etc/mysql/conf.d/replica.cnf
    command: >
      --default-authentication-plugin=caching_sha2_password
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
      --innodb-buffer-pool-size=1G
      --read-only=ON
    depends_on:
      mysql-primary:
        condition: service_healthy
    networks:
      - quikapp-network

  proxysql:
    image: proxysql/proxysql:2.5.0
    container_name: quikapp-proxysql
    ports:
      - "6033:6033"   # MySQL Protocol
      - "6032:6032"   # Admin interface
    volumes:
      - ./proxysql/proxysql.cnf:/etc/proxysql.cnf
    depends_on:
      - mysql-primary
      - mysql-replica
    networks:
      - quikapp-network

volumes:
  mysql_primary_data:
  mysql_replica_data:

networks:
  quikapp-network:
    external: true
```

### ProxySQL Configuration for Read/Write Splitting

```sql
-- proxysql.cnf / admin interface setup

-- Define MySQL servers
INSERT INTO mysql_servers (hostgroup_id, hostname, port, weight) VALUES
    (10, 'mysql-primary', 3306, 1000),   -- Writer hostgroup
    (20, 'mysql-replica', 3306, 1000);   -- Reader hostgroup

-- Define query rules for read/write splitting
INSERT INTO mysql_query_rules (rule_id, active, match_pattern, destination_hostgroup, apply) VALUES
    (1, 1, '^SELECT .* FOR UPDATE', 10, 1),        -- SELECT FOR UPDATE -> Primary
    (2, 1, '^SELECT', 20, 1),                       -- SELECT -> Replica
    (3, 1, '.*', 10, 1);                           -- Everything else -> Primary

-- Define users
INSERT INTO mysql_users (username, password, default_hostgroup) VALUES
    ('quikapp', 'password', 10);

-- Load configuration
LOAD MYSQL SERVERS TO RUNTIME;
LOAD MYSQL QUERY RULES TO RUNTIME;
LOAD MYSQL USERS TO RUNTIME;
SAVE MYSQL SERVERS TO DISK;
SAVE MYSQL QUERY RULES TO DISK;
SAVE MYSQL USERS TO DISK;
```

### Kubernetes MySQL Operator (Percona XtraDB Cluster)

```yaml
apiVersion: pxc.percona.com/v1
kind: PerconaXtraDBCluster
metadata:
  name: quikapp-mysql
  namespace: quikapp
spec:
  crVersion: 1.13.0
  secretsName: quikapp-mysql-secrets

  pxc:
    size: 3
    image: percona/percona-xtradb-cluster:8.0.32

    resources:
      requests:
        memory: 2Gi
        cpu: "1"
      limits:
        memory: 4Gi
        cpu: "2"

    volumeSpec:
      persistentVolumeClaim:
        storageClassName: fast-ssd
        resources:
          requests:
            storage: 100Gi

    configuration: |
      [mysqld]
      innodb_buffer_pool_size=2G
      max_connections=500
      character-set-server=utf8mb4
      collation-server=utf8mb4_unicode_ci

    affinity:
      antiAffinityTopologyKey: "kubernetes.io/hostname"

  haproxy:
    enabled: true
    size: 2
    image: percona/percona-xtradb-cluster-operator:1.13.0-haproxy

    resources:
      requests:
        memory: 256Mi
        cpu: "100m"

    exposePrimary:
      enabled: true
      type: ClusterIP

  proxysql:
    enabled: true
    size: 2
    image: percona/percona-xtradb-cluster-operator:1.13.0-proxysql

    resources:
      requests:
        memory: 256Mi
        cpu: "100m"

  backup:
    image: percona/percona-xtradb-cluster-operator:1.13.0-pxc8.0-backup
    storages:
      s3-backup:
        type: s3
        s3:
          bucket: quikapp-mysql-backups
          region: us-east-1
          credentialsSecret: aws-s3-secret

    schedule:
      - name: daily-backup
        schedule: "0 2 * * *"
        keep: 7
        storageName: s3-backup

---
apiVersion: v1
kind: Secret
metadata:
  name: quikapp-mysql-secrets
  namespace: quikapp
type: Opaque
stringData:
  root: ${MYSQL_ROOT_PASSWORD}
  xtrabackup: ${XTRABACKUP_PASSWORD}
  monitor: ${MONITOR_PASSWORD}
  clustercheck: ${CLUSTERCHECK_PASSWORD}
  proxyadmin: ${PROXYADMIN_PASSWORD}
  operator: ${OPERATOR_PASSWORD}
  replication: ${REPLICATION_PASSWORD}
```

### Database Migration with Flyway

```java
@Configuration
public class FlywayConfig {

    @Bean
    public Flyway flyway(DataSource dataSource) {
        Flyway flyway = Flyway.configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration")
            .baselineOnMigrate(true)
            .validateOnMigrate(true)
            .outOfOrder(false)
            .table("flyway_schema_history")
            .load();

        flyway.migrate();
        return flyway;
    }
}
```

```sql
-- V1__create_users_table.sql
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(50) NOT NULL UNIQUE,
    -- ... rest of schema
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- V2__add_user_settings.sql
CREATE TABLE user_settings (
    user_id VARCHAR(36) PRIMARY KEY,
    -- ... settings columns
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- V3__add_fulltext_index.sql
CREATE FULLTEXT INDEX ft_users_search ON users(display_name, username, bio);
```

### Monitoring and Metrics

```java
@Configuration
public class MySQLMetricsConfig {

    @Bean
    public MeterBinder hikariMetrics(HikariDataSource dataSource) {
        return new HikariCPMetrics(dataSource);
    }
}

@Component
@Slf4j
public class MySQLHealthIndicator implements HealthIndicator {

    private final DataSource dataSource;

    @Override
    public Health health() {
        try (Connection conn = dataSource.getConnection()) {
            try (PreparedStatement ps = conn.prepareStatement("SELECT 1")) {
                ps.executeQuery();
            }

            // Check replication lag
            try (PreparedStatement ps = conn.prepareStatement(
                    "SHOW SLAVE STATUS")) {
                ResultSet rs = ps.executeQuery();
                if (rs.next()) {
                    int lag = rs.getInt("Seconds_Behind_Master");
                    if (lag > 30) {
                        return Health.down()
                            .withDetail("replication_lag_seconds", lag)
                            .build();
                    }
                }
            }

            return Health.up()
                .withDetail("database", "MySQL")
                .withDetail("status", "connected")
                .build();

        } catch (SQLException e) {
            return Health.down()
                .withException(e)
                .build();
        }
    }
}
```

### Environment Variables

```bash
# MySQL Connection
MYSQL_HOST=mysql-primary
MYSQL_PORT=3306
MYSQL_DATABASE=quikapp_users
MYSQL_USER=quikapp
MYSQL_PASSWORD=secure-password
MYSQL_ROOT_PASSWORD=root-secure-password

# Replica (for read splitting)
MYSQL_REPLICA_HOST=mysql-replica
MYSQL_REPLICA_PORT=3306

# ProxySQL
PROXYSQL_HOST=proxysql
PROXYSQL_PORT=6033

# Connection Pool
HIKARI_MAX_POOL_SIZE=20
HIKARI_MIN_IDLE=5

# Flyway
FLYWAY_ENABLED=true
FLYWAY_BASELINE_ON_MIGRATE=true
```
