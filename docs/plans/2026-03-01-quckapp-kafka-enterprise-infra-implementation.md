# Kafka Enterprise Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add enterprise infrastructure to the quckapp-kafka submodule — complete missing event schemas, add schema registry docs, security, monitoring, performance tuning, disaster recovery, Kafka Connect patterns, compliance, and documentation.

**Architecture:** 9 independent directories each covering one enterprise concern. Missing event schemas go in the existing `services/schemas/` directory following the established flat-file naming convention. All other directories are new top-level directories in the submodule.

**Tech Stack:** Kafka (Confluent 7.5.0), JSON Schema Draft-07, Prometheus, Grafana, YAML, Bash, Markdown

---

### Task 1: Complete Missing Event Schemas (14 files)

**Context:** The repo has 16 topics but only 2 schemas (message-sent.json, user-registered.json). Per CLAUDE.md rule #2: "Every new topic must have a corresponding JSON Schema in services/schemas/." All schemas use the standard envelope: `{eventId, eventType, timestamp, version, data, metadata}` with JSON Schema Draft-07.

**Files:**
- Create: `services/schemas/user-login.json`
- Create: `services/schemas/password-reset.json`
- Create: `services/schemas/profile-updated.json`
- Create: `services/schemas/status-changed.json`
- Create: `services/schemas/message-edited.json`
- Create: `services/schemas/message-deleted.json`
- Create: `services/schemas/message-reaction.json`
- Create: `services/schemas/channel-created.json`
- Create: `services/schemas/channel-member-added.json`
- Create: `services/schemas/workspace-created.json`
- Create: `services/schemas/notification-push.json`
- Create: `services/schemas/notification-email.json`
- Create: `services/schemas/audit-event.json`
- Create: `services/schemas/analytics-event.json`

**Spec for each schema:**

All schemas MUST follow the exact same envelope pattern as `message-sent.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PascalCaseEventName",
  "type": "object",
  "required": ["eventId", "eventType", "timestamp", "version", "data"],
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "eventType": { "type": "string", "const": "domain.event-type" },
    "timestamp": { "type": "string", "format": "date-time" },
    "version": { "type": "string", "enum": ["1.0"] },
    "data": { ... domain-specific fields ... },
    "metadata": {
      "type": "object",
      "properties": {
        "source": { "type": "string" },
        "correlationId": { "type": "string" }
      }
    }
  }
}
```

**Domain-specific data fields per schema:**

1. **user-login.json** (`eventType: "auth.user-login"`)
   - Required: userId (uuid), loginMethod (enum: password, oauth2, sso, api_key), ipAddress (string), userAgent (string)
   - Optional: workspaceId (uuid), deviceId (string), mfaUsed (boolean)

2. **password-reset.json** (`eventType: "auth.password-reset"`)
   - Required: userId (uuid), resetMethod (enum: email, sms, admin), status (enum: requested, completed, expired)
   - Optional: ipAddress (string), expiresAt (date-time)

3. **profile-updated.json** (`eventType: "user.profile-updated"`)
   - Required: userId (uuid), updatedFields (array of strings)
   - Optional: displayName (string), avatarUrl (uri), timezone (string), locale (string)

4. **status-changed.json** (`eventType: "user.status-changed"`)
   - Required: userId (uuid), status (enum: online, offline, away, dnd, invisible)
   - Optional: customStatus (string, maxLength 100), expiresAt (date-time or null)

5. **message-edited.json** (`eventType: "message.edited"`)
   - Required: messageId (uuid), channelId (uuid), workspaceId (uuid), userId (uuid), previousContent (object with type/body), newContent (object with type/body)
   - Optional: editedAt (date-time)

6. **message-deleted.json** (`eventType: "message.deleted"`)
   - Required: messageId (uuid), channelId (uuid), workspaceId (uuid), deletedBy (uuid)
   - Optional: deletionType (enum: soft, hard, admin), reason (string)

7. **message-reaction.json** (`eventType: "message.reaction"`)
   - Required: messageId (uuid), channelId (uuid), userId (uuid), emoji (string), action (enum: added, removed)
   - Optional: workspaceId (uuid)

8. **channel-created.json** (`eventType: "channel.created"`)
   - Required: channelId (uuid), workspaceId (uuid), createdBy (uuid), name (string), type (enum: public, private, direct, group)
   - Optional: description (string), isArchived (boolean, default false)

9. **channel-member-added.json** (`eventType: "channel.member-added"`)
   - Required: channelId (uuid), workspaceId (uuid), userId (uuid), addedBy (uuid), role (enum: member, admin, owner)
   - Optional: inviteMethod (enum: direct, link, admin)

10. **workspace-created.json** (`eventType: "workspace.created"`)
    - Required: workspaceId (uuid), name (string), createdBy (uuid), plan (enum: free, pro, enterprise)
    - Optional: domain (string), maxMembers (integer)

11. **notification-push.json** (`eventType: "notification.push"`)
    - Required: notificationId (uuid), userId (uuid), title (string), body (string, maxLength 4096), type (enum: message, mention, reaction, channel_invite, system)
    - Optional: channelId (uuid), messageId (uuid), actionUrl (string), badge (integer)

12. **notification-email.json** (`eventType: "notification.email"`)
    - Required: notificationId (uuid), userId (uuid), email (email), templateId (string), subject (string)
    - Optional: templateData (object), priority (enum: low, normal, high)

13. **audit-event.json** (`eventType: "audit.event"`)
    - Required: auditId (uuid), action (string), resourceType (string), resourceId (string), actorId (uuid), actorType (enum: user, system, api_key)
    - Optional: workspaceId (uuid), ipAddress (string), userAgent (string), previousState (object), newState (object), result (enum: success, failure, denied)

14. **analytics-event.json** (`eventType: "analytics.event"`)
    - Required: eventName (string), userId (uuid), properties (object)
    - Optional: sessionId (string), workspaceId (uuid), deviceType (enum: web, mobile, desktop, api), platform (string), appVersion (string)

**Commit message:** `feat(schemas): add 14 missing event schemas for all Kafka topics`

---

### Task 2: Schema Registry & Evolution Documentation (4 files)

**Context:** Kafka best practice is to use a Schema Registry for schema evolution. QuckApp uses JSON Schema Draft-07 already. This task documents how to integrate Confluent Schema Registry and manage schema evolution.

**Files:**
- Create: `schema-registry/registry-config.md`
- Create: `schema-registry/compatibility-rules.md`
- Create: `schema-registry/evolution-guide.md`
- Create: `schema-registry/docker-compose.schema-registry.yml`

**Spec:**

1. **registry-config.md** (~120 lines)
   - Purpose and why: centralized schema management for 16+ topics
   - Confluent Schema Registry architecture (separate service, backed by `_schemas` topic)
   - Per-environment configuration table (dev: localhost:8081, qa/staging/prod: schema-registry.quckapp.internal)
   - Integration with producers/consumers: `value.serializer=io.confluent.kafka.serializers.json.JsonSchemaSerializer`
   - REST API reference: register schema, get schema by ID, check compatibility
   - Subject naming strategy: `TopicNameStrategy` (default, subject = topic name + `-value`)

2. **compatibility-rules.md** (~100 lines)
   - Compatibility modes table: BACKWARD (default), FORWARD, FULL, NONE — with description and use cases
   - Per-topic compatibility recommendations:
     - High-volume topics (message.sent, analytics.event): BACKWARD (consumers can read old + new)
     - Audit topics: FULL (both backward and forward compatible)
     - Notification topics: BACKWARD (transient, 1-day retention)
   - How to set per-subject compatibility via REST API
   - Compatibility check workflow before deploying schema changes

3. **evolution-guide.md** (~100 lines)
   - Safe changes: add optional fields, add new enum values at end
   - Unsafe changes: remove required fields, rename fields, change field types
   - Migration patterns: dual-write for breaking changes, version field usage
   - CI/CD integration: `--compatibility-check` step in validate pipeline
   - Real examples using QuckApp schemas (e.g., adding a `threadId` to message-edited)

4. **docker-compose.schema-registry.yml** (~40 lines)
   - Extends local dev stack with Confluent Schema Registry container
   - Image: `confluentinc/cp-schema-registry:7.5.0`
   - Port: 8081
   - Environment: `SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS=kafka:29092`
   - Depends on: kafka service from `tools/docker-compose.yml`

**Commit message:** `feat(schema-registry): add schema registry configuration and evolution documentation`

---

### Task 3: Security Configuration (5 files)

**Context:** Kafka security covers authentication (SASL/SCRAM), encryption (TLS), and authorization (ACLs). QuckApp has 15+ microservices that need per-service access control to specific topics.

**Files:**
- Create: `security/sasl/sasl-config.md`
- Create: `security/tls/tls-config.md`
- Create: `security/acls/service-acls.sh`
- Create: `security/acls/acl-reference.md`
- Create: `security/encryption/encryption-at-rest.md`

**Spec:**

1. **sasl-config.md** (~120 lines)
   - SASL/SCRAM-SHA-512 authentication setup
   - Broker configuration (`sasl.mechanism.inter.broker.protocol`, `listener.security.protocol.map`)
   - Per-environment JAAS configuration
   - Client configuration for producers/consumers
   - User creation via `kafka-configs.sh --alter --add-config`
   - QuckApp service accounts table: auth-service, message-service, notification-service, audit-service, analytics-service, search-service, realtime-service, etc.

2. **tls-config.md** (~100 lines)
   - TLS/SSL encryption for inter-broker and client connections
   - Certificate generation with `keytool` and `openssl`
   - Broker `server.properties` additions for SSL
   - Per-environment certificates (dev: self-signed, staging/prod: CA-signed)
   - Client truststore/keystore configuration
   - Certificate rotation procedure

3. **service-acls.sh** (~120 lines, executable bash script)
   - Per-service ACL definitions using `kafka-acls.sh`
   - Must define READ/WRITE/DESCRIBE per topic per service
   - Services and their topic access:
     - `auth-service`: WRITE to auth.*, READ from nothing
     - `message-service`: WRITE to message.*, READ from nothing
     - `notification-service`: READ from message.sent, message.reaction, user.status-changed, notification.*; WRITE to notification.*
     - `audit-service`: READ from audit.event; WRITE to audit.event
     - `analytics-service`: READ from analytics.event, message.sent, user.status-changed; WRITE to analytics.event
     - `search-indexer`: READ from message.sent/edited/deleted, channel.created, user.profile-updated
     - `realtime-broadcaster`: READ from message.sent/edited, message.reaction, user.status-changed
     - `admin-service`: READ/WRITE to promotion.service-promoted; DESCRIBE on all topics
   - Idempotent (uses `--add` which is additive)

4. **acl-reference.md** (~80 lines)
   - ACL operations reference table: READ, WRITE, CREATE, DELETE, ALTER, DESCRIBE, CLUSTER_ACTION
   - Service-to-topic access matrix (table format)
   - How to audit ACLs: `kafka-acls.sh --list`
   - Common troubleshooting: `TOPIC_AUTHORIZATION_FAILED`

5. **encryption-at-rest.md** (~60 lines)
   - Kafka log segment encryption options
   - Disk-level encryption (dm-crypt/LUKS on Linux, BitLocker on Windows)
   - Cloud-managed encryption (AWS EBS encryption, Azure Disk Encryption)
   - KMS integration for key management
   - Per-environment recommendations

**Commit message:** `feat(security): add SASL, TLS, ACL, and encryption configuration`

---

### Task 4: Monitoring & Alerting (6 files)

**Context:** Kafka monitoring uses JMX metrics exported via Prometheus kafka_exporter. Key metrics: broker health, under-replicated partitions, consumer lag, request latency. QuckApp has 5 consumer groups to monitor.

**Files:**
- Create: `monitoring/prometheus/kafka-exporter.yml`
- Create: `monitoring/prometheus/recording-rules.yml`
- Create: `monitoring/grafana/dashboard.json`
- Create: `monitoring/alerts/broker-alerts.yml`
- Create: `monitoring/alerts/consumer-lag-alerts.yml`
- Create: `monitoring/consumer-lag/lag-monitoring.md`

**Spec:**

1. **kafka-exporter.yml** (~60 lines)
   - Prometheus `kafka_exporter` (danielqsj/kafka-exporter) deployment config
   - Kubernetes Deployment + Service manifest
   - Args: `--kafka.server=kafka:9092`, `--topic.filter=QuckApp.*`, `--group.filter=.*`
   - Port: 9308
   - Annotations for Prometheus scraping
   - Per-environment bootstrap server configuration

2. **recording-rules.yml** (~60 lines)
   - Prometheus recording rules for pre-computed metrics:
     - `kafka:messages_per_second:rate5m` — message throughput per topic
     - `kafka:consumer_lag:sum` — total lag per consumer group
     - `kafka:consumer_lag:rate5m` — lag growth rate (is lag increasing?)
     - `kafka:under_replicated_partitions:sum` — cluster health
     - `kafka:active_controllers:count` — should always be 1
     - `kafka:offline_partitions:count` — should always be 0
     - `kafka:isr_shrinks:rate5m` — ISR shrink rate (potential data loss)

3. **dashboard.json** (~300 lines)
   - Grafana dashboard with 5 rows:
     - **Cluster Health**: active controllers, offline partitions, under-replicated partitions, ISR shrinks/expands
     - **Throughput**: messages in/out per second per topic, bytes in/out per broker
     - **Consumer Lag**: lag per consumer group (notification-service, audit-service, analytics-service, search-indexer, realtime-broadcaster), lag trend
     - **Latency**: produce request latency (p50/p99), fetch request latency, request queue time
     - **Storage**: log size per topic, disk usage per broker, log segment count
   - Variables: `$cluster`, `$broker`, `$topic`, `$consumer_group`
   - Time range: last 6 hours default

4. **broker-alerts.yml** (~80 lines)
   - Prometheus alerting rules for broker health:
     - `KafkaNoActiveController` — 0 active controllers for 1m (critical)
     - `KafkaOfflinePartitions` — any offline partitions for 1m (critical)
     - `KafkaUnderReplicatedPartitions` — >0 under-replicated for 5m (warning)
     - `KafkaBrokerDown` — broker not responding for 2m (critical)
     - `KafkaISRShrinking` — ISR shrink rate >0 for 5m (warning)
     - `KafkaDiskUsageHigh` — disk >80% (warning), >90% (critical)
     - `KafkaProduceLatencyHigh` — p99 >500ms for 5m (warning)
     - `KafkaRequestQueueFull` — request queue >80% capacity (warning)

5. **consumer-lag-alerts.yml** (~80 lines)
   - Per-consumer-group lag alerts:
     - `KafkaConsumerLagCritical` — lag >10000 for any group for 5m (critical)
     - `KafkaConsumerLagWarning` — lag >1000 for 5m (warning)
     - `KafkaConsumerLagGrowing` — lag rate increasing for 15m (warning)
     - `KafkaConsumerGroupInactive` — no commits for 30m (warning)
   - Per-group thresholds table:
     - notification-service: critical >5000 (real-time requirement)
     - realtime-broadcaster: critical >1000 (WebSocket latency)
     - search-indexer: critical >50000 (batch-tolerant)
     - audit-service: critical >10000 (compliance requirement)
     - analytics-service: critical >100000 (batch-tolerant)

6. **lag-monitoring.md** (~80 lines)
   - Consumer lag concepts: what it means, why it matters
   - Monitoring tools: kafka_exporter, Burrow, Kafka UI
   - Lag investigation workflow: identify group, check partition assignment, check consumer throughput
   - Common causes: slow consumer, rebalancing, network issues, poison pills
   - Remediation: scale consumers, increase partitions, check deserializer errors

**Commit message:** `feat(monitoring): add Prometheus exporter, Grafana dashboard, broker and consumer lag alerts`

---

### Task 5: Performance Tuning Documentation (4 files)

**Context:** Kafka performance depends on producer, consumer, and broker tuning. QuckApp has high-volume topics (message.sent at 12 partitions, analytics.event at 12 partitions) and low-latency requirements (realtime-broadcaster, notification-service).

**Files:**
- Create: `performance/producer-tuning.md`
- Create: `performance/consumer-tuning.md`
- Create: `performance/broker-tuning.md`
- Create: `performance/compression.md`

**Spec:**

1. **producer-tuning.md** (~100 lines)
   - `acks` configuration: 0 (fire-and-forget), 1 (leader only), all (ISR) — recommendation per topic type
   - `batch.size` and `linger.ms`: tradeoff between latency and throughput
   - `buffer.memory` and `max.block.ms`: backpressure behavior
   - `retries` and `delivery.timeout.ms`: retry semantics
   - Idempotent producer: `enable.idempotence=true` for exactly-once per partition
   - QuckApp-specific recommendations table:
     - message.sent: acks=all, linger.ms=5, batch.size=32768 (reliability > latency)
     - notification.push: acks=1, linger.ms=0 (latency > throughput)
     - analytics.event: acks=1, linger.ms=50, batch.size=65536 (throughput > latency)
     - audit.event: acks=all, enable.idempotence=true (exactly-once, compliance)

2. **consumer-tuning.md** (~100 lines)
   - `max.poll.records` and `max.poll.interval.ms`: poll loop tuning
   - `fetch.min.bytes` and `fetch.max.wait.ms`: fetch efficiency
   - `auto.offset.reset`: earliest vs latest — recommendation per consumer group
   - Consumer group rebalancing: `partition.assignment.strategy` (cooperative sticky)
   - Static group membership: `group.instance.id` to avoid rebalances on restarts
   - QuckApp consumer group tuning table:
     - realtime-broadcaster: max.poll.records=100, fetch.max.wait.ms=100 (low latency)
     - search-indexer: max.poll.records=500, fetch.max.wait.ms=500 (batch efficiency)
     - analytics-service: max.poll.records=1000 (high throughput)

3. **broker-tuning.md** (~100 lines)
   - Network threads (`num.network.threads=8`) and I/O threads (`num.io.threads=16`)
   - Log flush: `log.flush.interval.messages` vs OS page cache
   - Replica fetch tuning: `replica.fetch.max.bytes`, `replica.lag.time.max.ms`
   - Socket buffer sizes: `socket.send.buffer.bytes`, `socket.receive.buffer.bytes`
   - JVM heap sizing: 6GB recommended for production (no more than 50% of RAM)
   - OS tuning: `vm.swappiness=1`, file descriptor limits, `net.core.wmem_max`
   - Reference to existing `services/config/server.properties` with commentary on current settings

4. **compression.md** (~80 lines)
   - Compression codecs: none, gzip, snappy, lz4, zstd
   - Comparison table: compression ratio, CPU cost, latency impact
   - Broker vs producer compression: `compression.type=producer` (current setting)
   - QuckApp recommendations per topic:
     - message.sent (text-heavy): zstd (best ratio for text)
     - analytics.event (JSON): lz4 (good ratio, low CPU)
     - audit.event (compliance): zstd (storage efficiency, 90-day retention)
     - notification.push/email (transient): lz4 or none (1-day retention, latency matters)
   - End-to-end compression: producer compresses, broker stores compressed, consumer decompresses
   - Benchmarking methodology

**Commit message:** `feat(performance): add producer, consumer, broker tuning and compression documentation`

---

### Task 6: Disaster Recovery (5 files)

**Context:** Kafka disaster recovery covers cross-datacenter replication (MirrorMaker 2), topic backup/restore, and cluster recovery procedures.

**Files:**
- Create: `disaster-recovery/mirrormaker2/mm2-config.md`
- Create: `disaster-recovery/scripts/backup-topics.sh`
- Create: `disaster-recovery/scripts/restore-topics.sh`
- Create: `disaster-recovery/disaster-recovery.md`
- Create: `disaster-recovery/retention-calculator.md`

**Spec:**

1. **mm2-config.md** (~120 lines)
   - MirrorMaker 2 architecture: source cluster → MM2 connectors → target cluster
   - Configuration properties file for MM2:
     - `clusters=primary,dr`
     - `primary.bootstrap.servers=kafka.quckapp.internal:9092`
     - `dr.bootstrap.servers=kafka-dr.quckapp.internal:9092`
     - `primary->dr.enabled=true`
     - Topic filter: `topics=QuckApp\..*` (all QuckApp topics)
     - `replication.factor=3`, `sync.topic.configs.enabled=true`
   - Consumer group offset sync: `sync.group.offsets.enabled=true`
   - Monitoring MM2: connector status, replication lag, checkpoint lag
   - Failover procedure: stop producers → verify MM2 caught up → switch consumers to DR cluster

2. **backup-topics.sh** (~80 lines, executable bash)
   - Uses `kafka-console-consumer.sh` to dump topic contents to JSON files
   - Parameters: `--topic`, `--from-beginning`, `--timeout-ms`
   - Output: `backups/YYYY-MM-DD/{topic-name}.jsonl`
   - Supports selective topic backup or all topics
   - Metadata capture: partition count, replication factor, topic config
   - Compression: gzip the output files
   - Usage: `./backup-topics.sh --bootstrap-server kafka:9092 --topics "QuckApp.message.sent,QuckApp.audit.event"`

3. **restore-topics.sh** (~80 lines, executable bash)
   - Recreates topic from backup (create topic + produce messages)
   - Uses `kafka-console-producer.sh` to replay messages from backup files
   - Restores topic configuration from metadata
   - Parameters: `--backup-dir`, `--topic`, `--bootstrap-server`
   - Safety: `--dry-run` flag to preview without executing
   - Validates topic doesn't already exist (or `--force` to overwrite)

4. **disaster-recovery.md** (~100 lines)
   - DR strategy overview: RPO and RTO targets per topic category
     - Critical (audit, messages): RPO <1min, RTO <15min
     - Important (channels, users): RPO <5min, RTO <30min
     - Transient (notifications): RPO N/A (acceptable loss), RTO <1hr
   - DR scenarios: single broker failure, full cluster failure, datacenter failure
   - Recovery procedures per scenario with step-by-step commands
   - Post-recovery verification: consumer group offsets, topic configs, ACLs
   - Communication template for incidents

5. **retention-calculator.md** (~60 lines)
   - Storage estimation formula: `messages/sec × avg_size × retention_seconds × replication_factor`
   - QuckApp topic storage estimates table (based on 100K active users):
     - message.sent: 12 partitions × 30 days ≈ X GB
     - audit.event: 6 partitions × 90 days ≈ X GB
     - analytics.event: 12 partitions × 30 days ≈ X GB
   - Capacity planning for growth: 2x/year scaling factor
   - When to adjust retention vs when to add brokers

**Commit message:** `feat(disaster-recovery): add MirrorMaker 2 config, backup/restore scripts, DR procedures`

---

### Task 7: Kafka Connect Patterns (5 files)

**Context:** Kafka Connect enables streaming data between Kafka and external systems. QuckApp needs sinks to Elasticsearch (for search indexing), S3 (for analytics archival), and JDBC sources for CDC.

**Files:**
- Create: `connect/connectors/elasticsearch-sink.json`
- Create: `connect/connectors/s3-sink.json`
- Create: `connect/connectors/jdbc-source.json`
- Create: `connect/docker-compose.connect.yml`
- Create: `connect/connect-guide.md`

**Spec:**

1. **elasticsearch-sink.json** (~50 lines)
   - Confluent Elasticsearch Sink Connector configuration
   - `connector.class=io.confluent.connect.elasticsearch.ElasticsearchSinkConnector`
   - Topics: `QuckApp.message.sent,QuckApp.message.edited,QuckApp.message.deleted,QuckApp.channel.created,QuckApp.user.profile-updated`
   - Connection: `connection.url=http://elasticsearch:9200`
   - Index naming: `type.name=_doc`, use topic name as index
   - Key handling: `key.ignore=false` (use message key for document ID)
   - Error handling: `errors.tolerance=all`, `errors.deadletterqueue.topic.name=QuckApp.connect.dlq`
   - Transforms: extract timestamp, route to environment-specific indices

2. **s3-sink.json** (~50 lines)
   - Confluent S3 Sink Connector for analytics/audit archival
   - `connector.class=io.confluent.connect.s3.S3SinkConnector`
   - Topics: `QuckApp.analytics.event,QuckApp.audit.event`
   - S3 bucket: `quckapp-kafka-archive-{env}`
   - Partitioning: `partitioner.class=io.confluent.connect.storage.partitioner.TimeBasedPartitioner`
   - Time partition: hourly (`path.format='year'=YYYY/'month'=MM/'day'=dd/'hour'=HH`)
   - Format: `format.class=io.confluent.connect.s3.format.json.JsonFormat`
   - Flush: every 1000 records or every 60 seconds

3. **jdbc-source.json** (~40 lines)
   - JDBC Source Connector for CDC from relational databases
   - `connector.class=io.confluent.connect.jdbc.JdbcSourceConnector`
   - Mode: `incrementing+timestamp` for change detection
   - Poll interval: 5000ms
   - Topic prefix: `QuckApp.cdc.`
   - Table whitelist example: `users,workspaces`
   - Transforms: rename topic, add metadata headers

4. **docker-compose.connect.yml** (~50 lines)
   - Kafka Connect worker container for local development
   - Image: `confluentinc/cp-kafka-connect:7.5.0`
   - Port: 8083 (Connect REST API)
   - Plugin path with connector JARs
   - Depends on: kafka from `tools/docker-compose.yml`
   - Environment: bootstrap servers, key/value converters, group.id

5. **connect-guide.md** (~100 lines)
   - Kafka Connect architecture: workers, connectors, tasks
   - Standalone vs distributed mode
   - Deploying connectors via REST API (`POST /connectors`)
   - Monitoring connectors: status endpoint, failed task handling
   - Dead letter queue pattern for poison messages
   - QuckApp connector inventory table with status (planned vs active)
   - Best practices: idempotent sinks, exactly-once delivery, SMTs (Single Message Transforms)

**Commit message:** `feat(connect): add Elasticsearch sink, S3 sink, JDBC source connectors and guide`

---

### Task 8: Compliance (3 files)

**Context:** GDPR requires ability to delete user data. Kafka's append-only log makes deletion non-trivial — requires topic compaction or producing tombstone records. QuckApp's audit.event topic has 90-day retention for compliance.

**Files:**
- Create: `compliance/gdpr/pii-deletion.md`
- Create: `compliance/data-retention/retention-policies.md`
- Create: `compliance/audit/audit-config.md`

**Spec:**

1. **pii-deletion.md** (~100 lines)
   - GDPR right-to-erasure challenges in Kafka (append-only log)
   - Strategy 1: Topic compaction with tombstone records (key=userId, value=null)
   - Strategy 2: Wait for retention-based deletion (if retention < GDPR deadline)
   - Strategy 3: Encryption with key rotation (crypto-shredding)
   - QuckApp PII topic analysis table — which topics contain PII:
     - message.sent: userId, content (PII) — 30-day retention, use compaction for immediate deletion
     - user.profile-updated: displayName, email fields — 7-day retention, wait for expiry
     - auth.user-registered: email, displayName — 7-day retention, wait for expiry
     - auth.user-login: userId, ipAddress — 1-day retention, expires quickly
     - audit.event: actorId — 90-day retention, crypto-shredding recommended
   - Implementation: deletion request workflow (receive GDPR request → identify topics → produce tombstones → verify)
   - Consumer-side: consumers must handle tombstone records gracefully

2. **retention-policies.md** (~80 lines)
   - Retention strategy per topic (reference to existing topic creation script)
   - Retention categories:
     - Transient (1 day): auth.user-login, password-reset, notification.push, notification.email
     - Short-term (7 days): user.profile-updated, status-changed, message.edited/deleted/reaction, channel.member-added
     - Medium-term (30 days): message.sent, channel.created, workspace.created, analytics.event, promotion events
     - Long-term (90 days): audit.event
   - Retention vs compaction: when to use each
   - Storage cost implications per retention tier
   - Compliance requirements mapping: GDPR (30-day max for PII without consent), SOC 2 (audit trail retention)
   - Monitoring retention: topic size alerts, approaching quota

3. **audit-config.md** (~80 lines)
   - Kafka broker audit logging: `authorizer.class.name`, log4j appender config
   - What gets audited: topic creation/deletion, ACL changes, authentication failures, authorization denials
   - Audit log format and destination (separate log file, shipped to audit.event topic)
   - QuckApp audit requirements: all admin operations logged, all ACL changes logged
   - Audit log retention: 1 year for compliance
   - Integration with enterprise SIEM (Splunk, ELK) via log shipping

**Commit message:** `feat(compliance): add GDPR PII deletion, retention policies, and audit configuration`

---

### Task 9: Documentation, Runbooks & Cleanup (5 files + 4 dirs removed)

**Context:** Final task adds architecture documentation, operational runbooks, and removes empty legacy directories.

**Files:**
- Create: `documentation/architecture.md`
- Create: `documentation/runbooks/scaling.md`
- Create: `documentation/runbooks/rebalancing.md`
- Create: `documentation/runbooks/disaster-recovery.md`
- Create: `documentation/best-practices.md`
- Remove: `permissions/` (empty directory)
- Remove: `roles/` (empty directory)
- Remove: `scripts/` (empty directory)
- Remove: `schema/` (empty directory tree with empty SQL subdirs: functions/, tables/, triggers/, views/)

**Spec:**

1. **architecture.md** (~150 lines)
   - ASCII diagram: producers (15+ services) → Kafka cluster (3 brokers) → consumers (5 groups) → downstream (ES, S3, WebSocket)
   - Topic domain map: 6 domains with topic list and owning service
   - Data flow diagrams for key event chains:
     - Message flow: message-service → message.sent → notification-service, search-indexer, realtime-broadcaster, analytics-service
     - Auth flow: auth-service → user-registered → notification-service, search-indexer
   - Per-environment topology: dev (single broker), qa (2 brokers), staging/prod (3 brokers)
   - Integration points: Schema Registry, Kafka Connect, MirrorMaker 2
   - Cross-references to all enterprise config directories

2. **runbooks/scaling.md** (~100 lines)
   - When to scale: consumer lag growing, broker disk >80%, produce latency increasing
   - Horizontal scaling: add brokers, reassign partitions
   - Partition scaling: increase partitions (never decrease), using `kafka-topics.sh --alter`
   - Consumer scaling: add consumer instances (up to partition count)
   - QuckApp scaling scenarios:
     - message.sent lag growing → add consumers to search-indexer/realtime-broadcaster groups
     - analytics.event throughput doubling → increase partitions from 12 to 24
   - `kafka-reassign-partitions.sh` procedure with throttling

3. **runbooks/rebalancing.md** (~80 lines)
   - Consumer group rebalancing: what triggers it, impact (stop-the-world vs cooperative)
   - Cooperative sticky assignment: reduce rebalance impact
   - Static group membership: `group.instance.id` to avoid rebalances on rolling restarts
   - Partition reassignment: moving partitions between brokers during scaling
   - Preferred leader election: `kafka-leader-election.sh`
   - Monitoring during rebalance: consumer lag spikes, JoinGroup/SyncGroup metrics

4. **runbooks/disaster-recovery.md** (~100 lines)
   - Single broker failure: automatic leader election, ISR handling, no data loss if `min.insync.replicas=2`
   - Full cluster recovery: restore from MirrorMaker 2 DR site, consumer offset restoration
   - Topic restoration from backup: reference to `disaster-recovery/scripts/restore-topics.sh`
   - Post-recovery checklist: verify all topics, check consumer groups, validate ACLs, test producers
   - Communication template: incident start, status updates, resolution

5. **best-practices.md** (~100 lines)
   - Topic design: naming convention, partition count selection, retention strategy
   - Producer best practices: idempotence, proper key selection, error handling
   - Consumer best practices: commit strategy (manual vs auto), poison pill handling, consumer lag monitoring
   - Schema best practices: always use schemas, backward compatibility, versioning
   - Operations: never decrease partitions, monitor ISR, keep Kafka version current
   - Anti-patterns: using Kafka as a database, unbounded retention, too many small topics
   - Cross-references to performance/, monitoring/, security/ directories

**Cleanup:**
- `rmdir permissions/` — empty, never used
- `rmdir roles/` — empty, never used
- `rmdir scripts/` — empty, never used
- `rm -rf schema/` — empty directory tree (schema/functions/, schema/tables/, schema/triggers/, schema/views/) — leftover from SQL database template

**Commit message:** `feat(documentation): add architecture docs, runbooks, best practices; remove empty dirs`

---

## Summary

| Task | Directory | Files | Focus |
|------|-----------|-------|-------|
| 1 | services/schemas/ | 14 | Complete all missing event schemas |
| 2 | schema-registry/ | 4 | Schema Registry integration & evolution |
| 3 | security/ | 5 | SASL, TLS, ACLs, encryption |
| 4 | monitoring/ | 6 | Prometheus, Grafana, broker & consumer lag alerts |
| 5 | performance/ | 4 | Producer, consumer, broker tuning |
| 6 | disaster-recovery/ | 5 | MirrorMaker 2, backup/restore, DR procedures |
| 7 | connect/ | 5 | Elasticsearch sink, S3 sink, JDBC source |
| 8 | compliance/ | 3 | GDPR, retention policies, audit config |
| 9 | documentation/ + cleanup | 5 + 4 dirs | Architecture, runbooks, best practices |
| **Total** | | **~51** | |
