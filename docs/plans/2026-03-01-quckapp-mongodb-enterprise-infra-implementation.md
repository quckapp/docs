# QuckApp MongoDB Enterprise Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ~80 enterprise MongoDB infrastructure files across 14 new directories in the `database/quckapp-mongodb/` submodule, plus cleanup of 4 empty directories.

**Architecture:** Enterprise MongoDB stack covering infrastructure (Terraform, K8s), cluster management (replica sets, sharded clusters), schema governance (JSON Schema validation, indexes), sharding (zone-based), replication (oplog, change streams), security (SCRAM, x.509, CSFLE), auditing (native audit + change streams), performance, observability, automation, compliance, multi-tenant, and documentation.

**Tech Stack:** MongoDB 7, Terraform, Kubernetes, Percona MongoDB Exporter, Prometheus, Grafana, mongodump, mongorestore

---

## Context

- **Submodule**: `database/quckapp-mongodb` on `master` branch (it's a git submodule)
- **Working directory**: `D:\Learning\QuckApp\database\quckapp-mongodb`
- **Commit inside submodule first**, then `git add database/quckapp-mongodb` in parent
- **Design doc**: `docs/plans/2026-03-01-quckapp-mongodb-enterprise-infra-design.md`
- **11 services**: backend-gateway, attachment, file, media, reminder, message, presence, call, huddle, notification-orchestrator, event-broadcast
- **Key collections**: users, messages, conversations, channels, workspaces, workspace_members, channel_members, files, calls, huddles, sessions, audit_logs, presence, reminders, notifications, events, attachments, media, reactions
- **TTL indexes**: 24h (presence), 7d (events), 30d (messages/files/huddles), 90d (notifications/reminders), 365d (calls)

---

### Task 1: Infrastructure — Terraform

**Files:**
- Create: `infrastructure/terraform/main.tf`
- Create: `infrastructure/terraform/variables.tf`
- Create: `infrastructure/terraform/outputs.tf`

**Spec:**

`main.tf` — Self-hosted MongoDB 7 replica set on AWS:
- `aws_docdb_cluster` as reference (or EC2-based with MongoDB Community)
- 3-member replica set across 3 AZs
- WiredTiger storage engine, journaling enabled
- EBS gp3 volumes for data, io2 for journal
- Security group for port 27017 (internal VPC only)
- Parameter group: `mongod.conf` equivalents (oplog size, cache size, journal commit interval)
- Backup: automated snapshots, 7-day retention
- Tags: Environment, Service, ManagedBy

`variables.tf` — Input variables with validation:
- `environment` (enum: dev/qa/uat/staging/production/live)
- `instance_type` (default: r6g.xlarge)
- `storage_size_gb` (min: 100, max: 10000)
- `replica_count` (min: 3, max: 7)
- `mongodb_version` (default: "7.0")
- `vpc_id`, `subnet_ids`, `oplog_size_mb`, `cache_size_gb`
- `backup_retention_days`, `backup_window`, `maintenance_window`

`outputs.tf` — Connection string (mongodb+srv://), replica set name, instance endpoints, security group ID

**Commit:** `feat(infrastructure): add Terraform configs for MongoDB replica set`

---

### Task 2: Infrastructure — Kubernetes + Networking

**Files:**
- Create: `infrastructure/kubernetes/mongodb-operator.yml`
- Create: `infrastructure/kubernetes/replicaset-crd.yml`
- Create: `infrastructure/kubernetes/backup-schedule.yml`
- Create: `infrastructure/networking/mongod.conf`
- Create: `infrastructure/networking/network_policies.yml`

**Spec:**

`mongodb-operator.yml` — MongoDB Community Operator:
- Namespace: `mongodb-system`
- Operator deployment with RBAC (ServiceAccount, ClusterRole, ClusterRoleBinding)
- Image: `quay.io/mongodb/mongodb-community-operator:0.10.0`
- Resource limits: 256Mi memory, 200m CPU

`replicaset-crd.yml` — MongoDBCommunity CRD:
- 3 members, MongoDB 7.0.14
- WiredTiger storage: 50Gi PVC per member
- TLS enabled with cert-manager issuer
- SCRAM-SHA-256 authentication
- Resource requests/limits per member (2Gi memory, 1 CPU)
- Anti-affinity: one pod per node

`backup-schedule.yml` — CronJob for mongodump:
- Schedule: daily at 02:00 UTC
- mongodump to S3 (via aws-cli sidecar)
- Retention: 30 days
- ServiceAccount with S3 write permissions

`mongod.conf` — MongoDB configuration:
- `net.bindIp`: 0.0.0.0 with TLS required
- `net.tls.mode`: requireTLS
- `storage.wiredTiger.engineConfig.cacheSizeGB`: 0.5 * RAM
- `storage.journal.commitIntervalMs`: 100
- `replication.oplogSizeMB`: 10240
- `replication.replSetName`: quckapp-rs0
- `security.authorization`: enabled
- `security.clusterAuthMode`: x509
- `operationProfiling.mode`: slowOp (threshold 100ms)

`network_policies.yml` — 3 NetworkPolicies:
- `mongodb-ingress`: allow 27017 from app namespace pods
- `mongodb-egress`: allow DNS (53) and internal pod communication
- `mongodb-deny-external`: deny all external ingress

**Commit:** `feat(infrastructure): add Kubernetes operator, CRD, and networking configs`

---

### Task 3: Cluster Management

**Files:**
- Create: `cluster-management/replica-set/rs_initiate.js`
- Create: `cluster-management/replica-set/rs_config.js`
- Create: `cluster-management/config-servers/config_rs.js`
- Create: `cluster-management/mongos/mongos.conf`
- Create: `cluster-management/failover/automatic_failover.md`

**Spec:**

`rs_initiate.js` — Replica set initialization:
- `rs.initiate()` with 3-member PSA config (Primary, Secondary, Arbiter)
- Priority: primary=10, secondary=5, arbiter=0
- Votes: all members vote=1
- Comment each member's role and AZ placement
- Wait for election with `rs.status()` polling

`rs_config.js` — Advanced replica set configuration:
- Hidden member for analytics (priority: 0, hidden: true)
- Delayed member for disaster recovery (secondaryDelaySecs: 3600)
- `settings.heartbeatTimeoutSecs`: 10
- `settings.electionTimeoutMillis`: 10000
- `settings.chainingAllowed`: true
- Write concern defaults: `{w: "majority", wtimeout: 5000}`

`config_rs.js` — Config server replica set for sharded cluster:
- 3-member CSRS (Config Server Replica Set)
- `rs.initiate()` with `configsvr: true`
- Separate from data-bearing replica sets

`mongos.conf` — Query router config:
- `sharding.configDB`: config server connection string
- `net.port`: 27017
- `net.bindIp`: 0.0.0.0
- `systemLog.destination`: file, path, logRotate
- `security.keyFile` for inter-cluster auth

`automatic_failover.md` — Comprehensive failover documentation:
- Election mechanics (how MongoDB selects new primary)
- Priority-based vs catchup-based elections
- Step-down procedures (graceful primary step-down)
- Network partition handling (PSA vs PSS trade-offs)
- RTO/RPO targets: RTO < 30s, RPO = 0 (with w:majority)
- Monitoring replication lag during failover
- Application retry logic (retryable writes/reads)

**Commit:** `feat(cluster-management): add replica set, config server, and failover configs`

---

### Task 4: Schema Governance — Validation

**Files:**
- Create: `schema-governance/validation/messaging_validation.js`
- Create: `schema-governance/validation/collaboration_validation.js`
- Create: `schema-governance/validation/realtime_validation.js`
- Create: `schema-governance/validation/system_validation.js`
- Create: `schema-governance/validation/validation_runner.js`

**Spec:**

Each validation file uses `db.createCollection()` with `validator: { $jsonSchema: {...} }` or `db.runCommand({ collMod: ..., validator: ... })` for existing collections.

`messaging_validation.js` — conversations, messages, channels, reactions:
- conversations: required fields (workspace_id, type, participants, created_at), type enum (direct, group, channel), participants as array of ObjectId
- messages: required (conversation_id, sender_id, content, timestamp), content maxLength 10000, type enum (text, image, file, system)
- channels: required (workspace_id, name, type), type enum (public, private), name pattern ^[a-z0-9-]{1,80}$
- reactions: required (message_id, user_id, emoji, created_at)

`collaboration_validation.js` — workspaces, workspace_members, channel_members, files, attachments:
- workspaces: required (name, owner_id, plan), plan enum (free, pro, enterprise), name maxLength 100
- workspace_members: required (workspace_id, user_id, role), role enum (owner, admin, member, guest)
- channel_members: required (channel_id, user_id, joined_at)
- files: required (workspace_id, uploader_id, filename, size_bytes, mime_type), size_bytes min 0
- attachments: required (message_id, file_id, type), type enum (image, video, audio, document)

`realtime_validation.js` — calls, huddles, presence, sessions, events:
- calls: required (workspace_id, initiator_id, type, status), type enum (audio, video), status enum (ringing, active, ended)
- huddles: required (channel_id, participants, started_at), participants minItems 1
- presence: required (user_id, status, last_seen), status enum (online, away, dnd, offline)
- sessions: required (user_id, device_id, token, created_at, expires_at)
- events: required (type, source_service, payload, timestamp)

`system_validation.js` — users, notifications, reminders, audit_logs, media:
- users: required (email, display_name, created_at), email format, display_name maxLength 100
- notifications: required (user_id, type, title, created_at, read), type enum (mention, reply, invite, system)
- reminders: required (user_id, message_id, remind_at, created_at)
- audit_logs: required (action, actor_id, resource_type, resource_id, timestamp), additionalProperties true (for old_values/new_values)
- media: required (workspace_id, uploader_id, url, type, size_bytes)

`validation_runner.js` — Script to apply all validation rules:
- Accept `--env` parameter (dev/qa/staging/production)
- Connect to target MongoDB instance
- Apply each validation file in order
- Report success/failure per collection
- `--dry-run` mode to show what would be applied

**Commit:** `feat(schema-governance): add JSON Schema validation rules for all collections`

---

### Task 5: Schema Governance — Indexes + Migrations

**Files:**
- Create: `schema-governance/indexes/compound_indexes.js`
- Create: `schema-governance/indexes/text_indexes.js`
- Create: `schema-governance/indexes/ttl_indexes.js`
- Create: `schema-governance/indexes/wildcard_indexes.js`
- Create: `schema-governance/migrations/schema_versioning.js`
- Create: `schema-governance/migrations/backward_compat.md`

**Spec:**

`compound_indexes.js` — Multi-field indexes for common query patterns:
- messages: `{conversation_id: 1, timestamp: -1}` (message history)
- messages: `{sender_id: 1, timestamp: -1}` (user's messages)
- channels: `{workspace_id: 1, name: 1}` unique (channel lookup)
- workspace_members: `{workspace_id: 1, user_id: 1}` unique (membership check)
- channel_members: `{channel_id: 1, user_id: 1}` unique
- notifications: `{user_id: 1, read: 1, created_at: -1}` (unread notifications)
- files: `{workspace_id: 1, uploader_id: 1, created_at: -1}`
- audit_logs: `{resource_type: 1, resource_id: 1, timestamp: -1}`
- All with `background: true`

`text_indexes.js` — Full-text search indexes:
- messages: `{content: "text"}` with weights, default_language "english"
- channels: `{name: "text", description: "text"}`
- workspaces: `{name: "text", description: "text"}`
- users: `{display_name: "text", email: "text"}`

`ttl_indexes.js` — TTL index definitions (centralizes existing TTLs):
- presence: `{last_seen: 1}` expireAfterSeconds: 86400 (24h)
- events: `{timestamp: 1}` expireAfterSeconds: 604800 (7d)
- messages: `{timestamp: 1}` expireAfterSeconds: 2592000 (30d, free tier only)
- files: `{created_at: 1}` expireAfterSeconds: 2592000 (30d, free tier)
- huddles: `{ended_at: 1}` expireAfterSeconds: 2592000 (30d)
- notifications: `{created_at: 1}` expireAfterSeconds: 7776000 (90d)
- reminders: `{remind_at: 1}` expireAfterSeconds: 7776000 (90d)
- calls: `{ended_at: 1}` expireAfterSeconds: 31536000 (365d)
- sessions: `{expires_at: 1}` expireAfterSeconds: 0 (expire at field value)
- Comment: per-tier TTL requires application-level enforcement or separate databases

`wildcard_indexes.js` — Flexible schema indexes:
- audit_logs: `{"old_values.$**": 1}` for searching changed fields
- events: `{"payload.$**": 1}` for searching event payloads
- users: `{"preferences.$**": 1}` for user preference queries

`schema_versioning.js` — Schema version tracking:
- `_schema_versions` collection with `{collection_name, version, applied_at, description}`
- `applySchemaVersion(db, collectionName, version, migrationFn)` function
- Idempotent: skip if version already applied
- Transaction-safe version recording

`backward_compat.md` — Migration compatibility patterns:
- Additive-only changes (new fields with defaults)
- Dual-read pattern (read old + new field, prefer new)
- Lazy migration (update documents on read)
- Background migration scripts
- Rollback strategies

**Commit:** `feat(schema-governance): add index definitions and schema versioning`

---

### Task 6: Sharding

**Files:**
- Create: `sharding/shard_keys/shard_key_analysis.js`
- Create: `sharding/shard_keys/shard_key_definitions.js`
- Create: `sharding/zones/zone_config.js`
- Create: `sharding/zones/zone_ranges.js`
- Create: `sharding/balancer/balancer_config.js`
- Create: `sharding/balancer/chunk_management.js`
- Create: `sharding/topology/shard_map.md`

**Spec:**

`shard_key_analysis.js` — Cardinality and distribution analysis:
- Query each collection for cardinality of candidate shard keys
- Check write distribution: `{workspace_id: 1}` vs `{workspace_id: 1, _id: 1}` (hashed range)
- Measure query isolation (percentage of queries hitting single shard)
- Output recommendations per collection

`shard_key_definitions.js` — `sh.shardCollection()` for each collection:
- Workspace-scoped: conversations, messages, channels, channel_members, workspace_members, files, attachments, huddles, events → `{workspace_id: 1, _id: 1}`
- User-scoped: users, sessions, notifications, reminders, presence → `{user_id: "hashed"}`
- System-scoped: audit_logs → `{timestamp: 1, _id: 1}` (time-series pattern)
- Calls: `{workspace_id: 1, _id: 1}`
- Media: `{workspace_id: 1, _id: 1}`
- Pre-split commands for initial chunk distribution
- Enable sharding per database: `sh.enableSharding("quckapp_*")`

`zone_config.js` — Zone definitions:
- Geographic zones: us-east, us-west, eu-west, ap-southeast
- Tenant zones: enterprise tier → dedicated shards
- `sh.addShardTag("shard0001", "us-east")` etc.
- Zone assignment rationale comments

`zone_ranges.js` — Zone tag ranges:
- Workspace-based zone routing: enterprise workspace_ids → dedicated zone
- Geographic routing: user locale → nearest zone
- `sh.updateZoneKeyRange()` for each zone assignment

`balancer_config.js` — Balancer configuration:
- Balancer window: 02:00-06:00 UTC (low-traffic)
- `sh.setBalancerState(true)`
- Chunk size: 128MB (default, with rationale)
- `sh.startBalancer()` / `sh.stopBalancer()` helpers

`chunk_management.js` — Chunk operations:
- Pre-splitting for new shards: `sh.splitAt()` at known boundaries
- Jumbo chunk detection and resolution
- Manual chunk migration for rebalancing
- Chunk distribution analysis query

`shard_map.md` — Topology documentation:
- Shard-to-host mapping
- Capacity per shard (storage, connections, throughput)
- Collection-to-shard-key mapping table
- Cross-shard query patterns and limitations
- Scaling playbook: adding new shards

**Commit:** `feat(sharding): add zone-based sharding with workspace_id shard keys`

---

### Task 7: Replication

**Files:**
- Create: `replication/oplog/oplog_sizing.js`
- Create: `replication/oplog/oplog_monitoring.js`
- Create: `replication/read_preference.js`
- Create: `replication/write_concern.js`
- Create: `replication/change_streams.js`

**Spec:**

`oplog_sizing.js` — Oplog size calculation:
- Query `db.getReplicationInfo()` for current oplog stats
- Calculate required oplog size based on write rate
- Formula: `oplog_size = write_rate_per_hour * retention_hours`
- Target: 72 hours of oplog retention
- `db.adminCommand({replSetResizeOplog: 1, size: <MB>})`

`oplog_monitoring.js` — Oplog health monitoring:
- Oplog window (hours of data in oplog)
- Replication lag per secondary: `rs.printSecondaryReplicationInfo()`
- Oplog growth rate over time
- Alert thresholds: lag > 10s = warning, > 60s = critical

`read_preference.js` — Read preference per service:
- backend-gateway: `primaryPreferred` (real-time reads)
- message-service: `primaryPreferred` (consistency for new messages)
- presence-service: `secondaryPreferred` (eventual consistency OK)
- notification-orchestrator: `secondaryPreferred`
- event-broadcast-service: `secondaryPreferred`
- Analytics queries: `secondary` (offload to secondaries)
- Connection string examples with readPreference parameter

`write_concern.js` — Write concern per operation type:
- User authentication: `{w: "majority", j: true}` (critical data)
- Messages: `{w: "majority", wtimeout: 5000}` (durable)
- Presence updates: `{w: 1}` (speed over durability)
- Events: `{w: 1}` (ephemeral, TTL'd anyway)
- Audit logs: `{w: "majority", j: true}` (compliance requirement)
- File metadata: `{w: "majority"}` (important but not time-critical)

`change_streams.js` — Change stream patterns:
- Full-document lookup: `{fullDocument: "updateLookup"}`
- Resume token handling for crash recovery
- Watcher for messages collection (real-time delivery)
- Watcher for presence collection (online status broadcast)
- Watcher for audit_logs (compliance event stream)
- Error handling: `ChangeStreamInvalidate`, network errors
- Comment: these patterns are used by event-broadcast-service and presence-service

**Commit:** `feat(replication): add oplog, read preference, write concern, and change stream configs`

---

### Task 8: Security

**Files:**
- Create: `security/authentication/scram_users.js`
- Create: `security/authentication/x509_config.md`
- Create: `security/authorization/custom_roles.js`
- Create: `security/authorization/role_assignments.js`
- Create: `security/encryption/tls_config.conf`
- Create: `security/encryption/encryption_at_rest.md`
- Create: `security/encryption/field_level_encryption.js`
- Create: `security/network/ip_whitelist.js`
- Create: `security/audit/audit_filter.json`

**Spec:**

`scram_users.js` — SCRAM-SHA-256 user accounts per environment:
- `quckapp_app` — application user (readWrite on service databases)
- `quckapp_readonly` — read-only for monitoring/analytics (read on all)
- `quckapp_migration` — DDL privileges (dbAdmin on service databases)
- `quckapp_backup` — backup role (backup, restore)
- `quckapp_monitor` — monitoring (clusterMonitor)
- `quckapp_audit` — audit user (read on admin, insert on audit)
- Each user with `mechanisms: ["SCRAM-SHA-256"]`
- Passwords from environment variables (never hardcoded)
- `db.createUser()` with `roles` array

`x509_config.md` — x.509 certificate authentication:
- Certificate requirements (CN format, SAN entries)
- cert-manager integration for Kubernetes
- Inter-cluster authentication with x.509
- Client certificate authentication for services
- Certificate rotation procedures

`custom_roles.js` — Custom role definitions:
- `quckapp_service_rw`: find, insert, update, remove on service collections (no admin)
- `quckapp_analytics`: find, aggregate on all collections (read-only)
- `quckapp_migration_admin`: createCollection, dropCollection, createIndex, dropIndex
- `quckapp_audit_writer`: insert only on audit_logs collections
- `quckapp_replication_monitor`: replSetGetStatus, serverStatus
- Each role with `db.createRole()` and specific `privileges` array

`role_assignments.js` — Role-to-user assignments per service:
- backend-gateway → quckapp_service_rw on quckapp_gateway
- message-service → quckapp_service_rw on quckapp_messages
- presence-service → quckapp_service_rw on quckapp_presence
- call-service → quckapp_service_rw on quckapp_calls
- etc. for all 11 services
- Principle of least privilege: each service only accesses its own database

`tls_config.conf` — TLS configuration:
- `net.tls.mode: requireTLS`
- `net.tls.certificateKeyFile`: server cert + key PEM
- `net.tls.CAFile`: CA certificate
- `net.tls.clusterFile`: cluster member cert
- `net.tls.allowConnectionsWithoutCertificates: false`
- TLS 1.3 minimum: `net.tls.disabledProtocols: TLS1_0,TLS1_1,TLS1_2`

`encryption_at_rest.md` — WiredTiger encryption:
- `security.enableEncryption: true`
- KMIP integration for key management
- AWS KMS as external key provider
- Key rotation procedures
- Performance impact analysis

`field_level_encryption.js` — Client-Side Field Level Encryption:
- KMS provider config (AWS KMS or local for dev)
- Data encryption key (DEK) creation
- Schema map for automatic encryption:
  - users.email → deterministic (for querying)
  - users.phone → random (no querying needed)
  - users.ssn → deterministic
  - files.content → random
- `autoEncryption` connection options
- Query patterns with encrypted fields

`ip_whitelist.js` — IP allowlisting:
- Per-environment IP ranges (VPC CIDRs)
- `net.bindIp` configuration
- Security group / firewall rule equivalents
- Atlas-style IP access list management

`audit_filter.json` — MongoDB native audit filter:
- `filter` document for `auditLog` in mongod.conf
- Capture: authenticate, createUser, dropUser, createRole, dropRole
- Capture: insert/update/delete on critical collections (users, audit_logs)
- Exclude: reads on non-sensitive collections (events, presence)
- Output format: JSON to file

**Commit:** `feat(security): add authentication, authorization, encryption, and audit configs`

---

### Task 9: Auditing

**Files:**
- Create: `auditing/audit_log_config.conf`
- Create: `auditing/immutable_audit.js`
- Create: `auditing/change_stream_triggers.js`

**Spec:**

`audit_log_config.conf` — MongoDB audit log configuration:
- `auditLog.destination: file`
- `auditLog.format: JSON`
- `auditLog.path: /var/log/mongodb/audit.json`
- `auditLog.filter`: reference to `security/audit/audit_filter.json`
- Rotation: logrotate config snippet
- Compliance mapping: SOX, GDPR, PCI requirements covered

`immutable_audit.js` — Capped collection for immutable audit trail:
- `db.createCollection("audit_immutable", {capped: true, size: 10737418240, max: 50000000})`
- 10GB capped collection, ~50M documents
- Fields: action, actor_id, resource_type, resource_id, old_values, new_values, timestamp, ip_address, user_agent, checksum
- SHA-256 checksum of previous entry (hash chain for tamper detection)
- Insert-only: no update/delete operations
- TTL-free (capped collection handles lifecycle)
- Read-only role for audit consumers

`change_stream_triggers.js` — Change stream-based audit triggers:
- Watcher on users collection: track profile changes, role changes
- Watcher on workspaces collection: track membership changes, settings changes
- Watcher on channels collection: track creation, deletion, permission changes
- Each watcher:
  - Opens change stream with `fullDocumentBeforeChange: "required"` (MongoDB 6+)
  - Captures old and new document state
  - Writes to audit_immutable collection
  - Handles resume tokens for crash recovery
  - Error handling with exponential backoff

**Commit:** `feat(auditing): add audit log config, immutable audit, and change stream triggers`

---

### Task 10: Performance

**Files:**
- Create: `performance/indexes/index_advisor.js`
- Create: `performance/indexes/covered_queries.js`
- Create: `performance/aggregation/pipeline_optimization.md`
- Create: `performance/aggregation/sample_pipelines.js`
- Create: `performance/profiling/profiler_config.js`
- Create: `performance/profiling/slow_query_analysis.js`
- Create: `performance/capacity/wiredtiger_tuning.conf`
- Create: `performance/capacity/storage_forecast.js`

**Spec:**

`index_advisor.js` — Index analysis queries:
- `db.collection.aggregate([{$indexStats: {}}])` for all collections
- Detect unused indexes (0 accesses since server start)
- Detect redundant indexes (prefix duplicates)
- Index size analysis: `db.collection.stats().indexSizes`
- Recommendation output: drop unused, consolidate redundant

`covered_queries.js` — Covered query patterns:
- Explain plan analysis for key QuckApp queries
- Examples of queries that are fully covered by indexes
- Pattern: project only indexed fields → IXSCAN without FETCH
- Before/after comparisons showing performance improvement

`pipeline_optimization.md` — Aggregation pipeline optimization:
- $match early (filter before expensive stages)
- $project to reduce document size before $lookup
- $limit/$skip with sorted index
- allowDiskUse for large aggregations
- Explain plan interpretation for aggregation
- Common anti-patterns (unnecessary $unwind, large $group)

`sample_pipelines.js` — QuckApp-specific aggregation pipelines:
- Unread message count per user per workspace
- Channel activity leaderboard (messages per channel, last 7 days)
- User activity summary (messages sent, files shared, calls made)
- Workspace storage usage (total file sizes)
- Message search with relevance scoring ($text + $meta)
- Notification digest (group by type, count unread)

`profiler_config.js` — Database profiler settings:
- `db.setProfilingLevel(1, {slowms: 100, sampleRate: 1.0})` for production
- `db.setProfilingLevel(2)` for debugging (all operations)
- System profile collection analysis queries
- Top slow queries by execution time
- Top slow queries by documents examined vs returned ratio

`slow_query_analysis.js` — Slow query log analysis:
- Query system.profile for slow operations
- Group by query shape (namespace + query pattern)
- P50/P95/P99 latency per query shape
- Identify missing indexes from COLLSCAN entries
- Export recommendations as JSON

`wiredtiger_tuning.conf` — WiredTiger storage engine tuning:
- `cacheSizeGB`: 50% of available RAM (comments per instance size)
- `journalCompressor`: snappy
- `blockCompressor`: zstd (better compression ratio)
- `directoryForIndexes`: true (separate index files)
- Checkpoint interval: 60 seconds
- Eviction tuning: target 80%, trigger 95%, dirty target 5%
- Concurrent read/write tickets

`storage_forecast.js` — Storage capacity planning:
- Current storage usage per collection: `db.collection.stats()`
- Growth rate calculation (compare snapshots over time)
- Storage forecast: 30/60/90/180 day projections
- Index-to-data ratio analysis
- Compression ratio analysis
- Alert thresholds: 70% = plan, 85% = urgent, 95% = critical

**Commit:** `feat(performance): add index advisor, profiling, and WiredTiger tuning`

---

### Task 11: Observability

**Files:**
- Create: `observability/prometheus/mongodb_exporter.yml`
- Create: `observability/prometheus/recording_rules.yml`
- Create: `observability/grafana/dashboard.json`
- Create: `observability/queries/server_status.js`
- Create: `observability/queries/current_op.js`
- Create: `observability/queries/connection_pool.js`
- Create: `observability/queries/replication_status.js`
- Create: `observability/alerts/connection_alerts.yml`
- Create: `observability/alerts/replication_alerts.yml`
- Create: `observability/alerts/storage_alerts.yml`
- Create: `observability/alerts/performance_alerts.yml`

**Spec:**

`mongodb_exporter.yml` — Percona MongoDB Exporter deployment:
- Image: `percona/mongodb_exporter:0.40.0`
- Kubernetes Deployment + Service + ServiceMonitor
- Metrics port: 9216
- Connection URI from Secret
- Collectors: diagnosticdata, replicasetstatus, dbstats, collstats, indexstats, topmetrics
- Resource limits: 128Mi memory, 100m CPU

`recording_rules.yml` — Prometheus recording rules:
- `mongodb:connections:current` — current connections gauge
- `mongodb:opcounters:rate5m` — operations per second (insert, query, update, delete, command)
- `mongodb:replication:lag_seconds` — replication lag
- `mongodb:wiredtiger:cache_usage_percent` — cache fill percentage
- `mongodb:storage:data_size_bytes` — data size per database

`dashboard.json` — Grafana dashboard (JSON model):
- Overview row: connections, operations/sec, network I/O
- Replication row: lag per member, oplog window, election events
- Storage row: data size, index size, disk usage per database
- Performance row: slow queries, cache hit ratio, document metrics
- WiredTiger row: cache usage, evictions, dirty pages, checkpoints
- Variables: $cluster, $database, $collection, $interval

`server_status.js` — db.serverStatus() monitoring queries:
- Connections (current, available, totalCreated)
- Network (bytesIn, bytesOut, numRequests)
- Opcounters (insert, query, update, delete, getmore, command)
- WiredTiger cache (currently in cache, max configured, dirty, pages evicted)
- Locks (global, database, collection lock times)

`current_op.js` — Active operations monitoring:
- `db.currentOp({active: true, secs_running: {$gt: 5}})` — long-running operations
- Kill long-running operations: `db.killOp(opId)`
- Waiting operations: `db.currentOp({waitingForLock: true})`
- Operations by namespace breakdown

`connection_pool.js` — Connection pool monitoring:
- `db.serverStatus().connections` — current, available, totalCreated
- Connection per client IP: `db.currentOp()` grouped by client
- Connection churn rate
- Max connection threshold warnings

`replication_status.js` — Replica set health:
- `rs.status()` — member states, heartbeat, optime
- `rs.printReplicationInfo()` — oplog size and window
- `rs.printSecondaryReplicationInfo()` — lag per secondary
- Election history: `db.adminCommand({replSetGetStatus: 1})`

4 alert files (YAML, Prometheus AlertManager format):
- `connection_alerts.yml`: connections > 80% capacity, connection churn > 100/min
- `replication_alerts.yml`: lag > 10s warning, > 60s critical, member down
- `storage_alerts.yml`: disk > 80% warning, > 90% critical, oplog < 24h
- `performance_alerts.yml`: slow queries > 50/min, cache hit < 95%, lock % > 5%

**Commit:** `feat(observability): add Prometheus exporter, Grafana dashboard, and alerts`

---

### Task 12: Automation

**Files:**
- Create: `automation/backup/mongodump_backup.sh`
- Create: `automation/backup/oplog_backup.sh`
- Create: `automation/backup/pitr_restore.md`
- Create: `automation/maintenance/compact_schedule.js`
- Create: `automation/maintenance/reindex_schedule.js`
- Create: `automation/scripts/health_check.sh`
- Create: `automation/scripts/rs_stepdown.sh`

**Spec:**

`mongodump_backup.sh` — Logical backup script:
- `#!/usr/bin/env bash` with `set -euo pipefail`
- Parameters: `--host`, `--port`, `--authenticationDatabase`, `--out`
- mongodump with `--oplog` for consistent snapshot
- Compress with gzip
- Upload to S3: `aws s3 cp`
- Retention cleanup: delete backups older than 30 days
- Logging with timestamps
- Exit codes: 0=success, 1=dump failed, 2=upload failed, 3=cleanup failed

`oplog_backup.sh` — Continuous oplog backup:
- Tail oplog using `mongodump --query` on oplog.rs
- Store oplog slices to S3 every 5 minutes
- Track last timestamp for resume
- Enable PITR between full backups
- Prerequisite: mongodump_backup.sh must have run at least once

`pitr_restore.md` — Point-in-time recovery runbook:
- Step-by-step PITR procedure
- Restore from mongodump: `mongorestore --oplogReplay`
- Replay oplog slices to target timestamp
- Verification steps after restore
- RTO/RPO targets: RPO < 5 minutes, RTO < 1 hour

`compact_schedule.js` — Collection compaction:
- `db.runCommand({compact: "collection"})` per collection
- Schedule: weekly during maintenance window (Sunday 03:00 UTC)
- Priority order: largest collections first
- Check fragmentation before compacting (wiredTiger stats)
- Skip if fragmentation < 20%

`reindex_schedule.js` — Index rebuild:
- `db.collection.reIndex()` per collection
- Schedule: monthly
- Build in background (MongoDB 7 default)
- Index size comparison before/after
- Report space reclaimed

`health_check.sh` — Cluster health check:
- Check: mongod process running
- Check: replica set status (all members healthy)
- Check: replication lag < threshold
- Check: disk usage < 90%
- Check: connections < 80% capacity
- Check: no long-running operations (> 300s)
- Output: JSON health report
- Exit codes: 0=healthy, 1=degraded, 2=critical

`rs_stepdown.sh` — Graceful primary step-down:
- Pre-flight: verify secondaries are caught up (lag < 2s)
- `db.adminCommand({replSetStepDown: 300, secondaryCatchUpPeriodSecs: 120})`
- Wait for new primary election
- Verify cluster health post-step-down
- Use case: rolling maintenance, patching

**Commit:** `feat(automation): add backup, maintenance, and health check scripts`

---

### Task 13: Compliance + Multi-Tenant

**Files:**
- Create: `compliance/audit/audit_policy.json`
- Create: `compliance/audit/immutable_ledger.js`
- Create: `compliance/gdpr/right_to_be_forgotten.js`
- Create: `compliance/pci/field_encryption_pci.js`
- Create: `compliance/access_review/quarterly_access_audit.js`
- Create: `multi-tenant/tenant_isolation.js`
- Create: `multi-tenant/connection_pooling.js`
- Create: `multi-tenant/data_lifecycle.js`

**Spec:**

`audit_policy.json` — Audit event filter policy:
- SOX: all admin operations (createUser, dropUser, createRole, createCollection, dropCollection)
- GDPR: all operations on users collection
- PCI: all operations on payment-related fields
- General: all authentication events
- Format mapping to compliance frameworks

`immutable_ledger.js` — Hash-chain audit ledger:
- Insert function with SHA-256 checksum of previous entry
- Chain verification function (detect tampering)
- Periodic integrity check (verify full chain)
- Export function for compliance auditors
- Capped collection: 50GB, auto-rotation

`right_to_be_forgotten.js` — GDPR user anonymization:
- `anonymizeUser(userId)` function across all collections:
  - users: replace PII (email, display_name, phone) with anonymized values
  - messages: replace sender_id references, keep content (workspace owns it)
  - files: remove uploader_id association
  - notifications: delete all for user
  - sessions: delete all for user
  - presence: delete
  - reminders: delete all
  - audit_logs: anonymize actor_id (keep action record)
- Generate deletion certificate document
- Audit trail of the anonymization itself
- Irreversible: no way to recover PII after execution

`field_encryption_pci.js` — PCI-compliant field encryption:
- Client-Side FLE configuration for payment data
- Encrypted fields: card_last_four, billing_address, payment_token
- DEK rotation schedule
- Tokenization pattern: store token, encrypt reference
- PCI DSS requirement mapping

`quarterly_access_audit.js` — Access review queries:
- List all database users and their roles
- Identify over-privileged users (admin roles on production)
- Detect unused accounts (no auth events in 90 days)
- Role inheritance tree visualization
- Export audit report as JSON
- Remediation recommendations

`tenant_isolation.js` — Workspace-based document filtering:
- Middleware pattern: inject workspace_id filter on all queries
- Application-level tenant isolation (MongoDB has no native RLS)
- Validation: ensure workspace_id present on all tenant-scoped documents
- Cross-tenant access prevention patterns
- Admin override for support/debugging

`connection_pooling.js` — Per-tenant connection management:
- Connection pool sizing per workspace tier (free: 5, pro: 20, enterprise: 100)
- Connection string templates per tier
- Pool monitoring: active, idle, waiting connections
- Circuit breaker pattern for pool exhaustion
- Max connection enforcement

`data_lifecycle.js` — Tenant-based data lifecycle:
- Workspace archival procedure (move to cold storage)
- Per-tier retention policies:
  - Free: 30 days messages, 5GB files
  - Pro: 1 year messages, 100GB files
  - Enterprise: unlimited
- Scheduled cleanup jobs
- Workspace deletion procedure (permanent data removal)
- Data export before deletion (GDPR portability)

**Commit:** `feat(compliance): add audit, GDPR, PCI compliance and multi-tenant configs`

---

### Task 14: Documentation + Cleanup

**Files:**
- Create: `documentation/architecture.md`
- Create: `documentation/runbooks/failover.md`
- Create: `documentation/runbooks/scaling.md`
- Create: `documentation/runbooks/disaster_recovery.md`
- Create: `documentation/collection_catalog/collection_schemas.md`
- Remove: `permissions/` (empty directory)
- Remove: `roles/` (empty directory)
- Remove: `schema/` (empty directory with subdirs tables/, functions/, views/, triggers/)
- Remove: `scripts/` (empty directory)

**Spec:**

`architecture.md` — MongoDB cluster architecture:
- Cluster topology diagram (ASCII art)
- Service-to-database mapping table (11 services)
- Collection inventory per database
- Sharding topology (shard keys, zones)
- Replication topology (PSA configuration)
- Connection flow: application → mongos → shard → replica set
- Extension/feature stack: CSFLE, change streams, aggregation framework

`failover.md` — Failover runbook:
- Automatic failover (election timeout, priority-based)
- Manual failover (rs.stepDown, rs.freeze)
- Split-brain scenarios and resolution
- Application behavior during failover (retryable writes)
- Post-failover verification checklist
- Communication template for incidents

`scaling.md` — Scaling guide:
- Vertical scaling: instance size upgrades
- Horizontal scaling: adding shards
- Read scaling: adding secondaries
- Write scaling: shard key optimization
- Storage scaling: volume expansion
- Step-by-step procedures for each scaling type

`disaster_recovery.md` — DR procedures:
- RPO/RTO targets per tier
- Full cluster loss recovery
- Single member recovery
- Cross-region failover
- PITR procedure reference
- DR testing schedule and checklist

`collection_schemas.md` — Collection catalog:
- Table per collection: name, database, shard key, indexes, TTL, validation, estimated size
- Domain groupings: messaging, collaboration, real-time, system
- Service ownership mapping
- Data flow between collections

**Cleanup — Empty directory removal:**
- `permissions/` — empty, functionality in `security/`
- `roles/` — empty, functionality in `security/`
- `schema/` — empty subdirs (tables/, functions/, views/, triggers/), not applicable to MongoDB
- `scripts/` — empty, functionality in `automation/scripts/`

After all 14 tasks complete:
- Update parent repo submodule reference: `cd D:\Learning\QuckApp && git add database/quckapp-mongodb`
- Commit parent: `chore: update quckapp-mongodb submodule (enterprise infrastructure complete)`

**Commit:** `feat(documentation): add architecture docs, runbooks, and remove empty dirs`
