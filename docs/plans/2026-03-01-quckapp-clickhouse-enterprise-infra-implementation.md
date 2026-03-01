# ClickHouse Enterprise Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add enterprise infrastructure to the quckapp-clickhouse submodule — cluster docs, query optimization, security, monitoring, backup, performance tuning, data pipelines, compliance, and documentation.

**Architecture:** 9 independent directories each covering one enterprise concern. The submodule manages a cloud-hosted ClickHouse (ClickHouse Cloud) analytics database `quckapp_analytics` with 5 MergeTree tables and 2 SummingMergeTree materialized views.

**Tech Stack:** ClickHouse 24.x (Cloud), SQL, Prometheus, Grafana, YAML, Bash, Markdown

---

### Task 1: Cluster Architecture Documentation (4 files)

**Context:** ClickHouse is hosted on ClickHouse Cloud (managed service) with 4 environments (dev, qa, staging, production) all using port 9440 (native TLS). This task documents the architecture, sharding concepts, replication strategy, and cloud configuration.

**Files:**
- Create: `cluster/architecture.md`
- Create: `cluster/sharding-strategy.md`
- Create: `cluster/replication.md`
- Create: `cluster/cloud-config.md`

**Spec:**

1. **architecture.md** (~120 lines)
   - ClickHouse Cloud architecture: serverless/dedicated tiers, automatic scaling
   - QuckApp analytics data flow: services → Kafka → ClickHouse (or direct HTTP insert)
   - Per-environment topology table:
     - dev: ClickHouse Cloud Development tier, 1 replica
     - qa: ClickHouse Cloud Development tier, 2 replicas
     - staging: ClickHouse Cloud Production tier, 3 replicas
     - production: ClickHouse Cloud Production tier, 3 replicas, dedicated resources
   - Database schema overview: `quckapp_analytics` with 5 tables, 2 materialized views
   - Connection endpoints table (from environments/*.env): host, port (9440), user

2. **sharding-strategy.md** (~80 lines)
   - Sharding concepts in ClickHouse: Distributed tables, sharding keys
   - QuckApp sharding strategy: shard by workspace_id (most queries filter by workspace)
   - When to shard: data volume thresholds (>1TB per table)
   - Shard key selection rationale per table:
     - message_events: workspace_id (natural tenant boundary)
     - api_metrics: service_name (for per-service performance queries)
   - ClickHouse Cloud auto-sharding vs manual Distributed table approach
   - Current state: single-shard (sufficient for current scale), when to migrate

3. **replication.md** (~80 lines)
   - ClickHouse replication: ReplicatedMergeTree, ZooKeeper/ClickHouse Keeper
   - ClickHouse Cloud: managed replication (transparent to users)
   - Replication factor per environment (from env files)
   - Consistency model: eventual consistency for reads, strong consistency for writes
   - Monitoring replication lag: `system.replicas` table queries
   - Failover behavior: automatic in ClickHouse Cloud

4. **cloud-config.md** (~80 lines)
   - ClickHouse Cloud service configuration
   - Scaling policies: min/max resources per environment
   - Idle scaling (auto-pause in dev/qa, always-on in staging/prod)
   - Networking: IP allowlisting, private endpoints
   - Credential management: AWS Secrets Manager (GitHub), Azure Key Vault (Azure)
   - Cost optimization: development tier for dev/qa, production tier for staging/prod
   - Backup configuration (managed backups in ClickHouse Cloud)

**Commit message:** `feat(cluster): add architecture, sharding, replication, and cloud configuration docs`

---

### Task 2: Query Optimization (4 files)

**Context:** ClickHouse performance depends on proper ORDER BY keys, projections, materialized views, and skip indices. The existing tables have ORDER BY keys but no projections or skip indices. 2 materialized views exist (daily_message_counts, daily_active_users) but common query patterns may need more.

**Existing table ORDER BY keys:**
- message_events: (workspace_id, event_date, event_time)
- user_activity: (workspace_id, activity_date, user_id)
- search_events: (workspace_id, search_date, query_hash)
- api_metrics: (service_name, metric_date, endpoint)
- file_events: (workspace_id, event_date, file_type)

**Files:**
- Create: `query-optimization/projections.sql`
- Create: `query-optimization/materialized-views.sql`
- Create: `query-optimization/skip-indices.sql`
- Create: `query-optimization/query-patterns.md`

**Spec:**

1. **projections.sql** (~80 lines)
   - ALTER TABLE ADD PROJECTION statements for common query patterns:
   - message_events: projection by (user_id, event_date) for "messages sent by user" queries
   - message_events: projection by (channel_id, event_type) for "channel activity breakdown"
   - user_activity: projection by (activity_type, activity_date) for "activity type distribution"
   - api_metrics: projection by (status_code, metric_date) for "error rate over time"
   - api_metrics: projection by (endpoint, method) for "endpoint performance ranking"
   - file_events: projection by (user_id, event_type) for "user file activity"
   - Each projection: ALTER TABLE ... ADD PROJECTION proj_name (SELECT ... ORDER BY ...)
   - Include ALTER TABLE ... MATERIALIZE PROJECTION statements

2. **materialized-views.sql** (~100 lines)
   - Additional SummingMergeTree materialized views beyond the existing 2:
   - hourly_api_error_rates: source api_metrics WHERE status_code >= 400, GROUP BY service_name, endpoint, hour
   - daily_search_analytics: source search_events, GROUP BY workspace_id, search_type, date
   - daily_file_stats: source file_events, GROUP BY workspace_id, file_type, event_type, date
   - weekly_workspace_summary: source message_events + user_activity, per-workspace weekly aggregation
   - Each view: CREATE MATERIALIZED VIEW ... TO target_table ENGINE = SummingMergeTree

3. **skip-indices.sql** (~60 lines)
   - Data skipping indices for faster filtering:
   - message_events: bloom_filter on user_id, set index on event_type
   - user_activity: bloom_filter on session_id, set index on device_type
   - search_events: tokenbf_v1 on query_text (for text search), bloom_filter on user_id
   - api_metrics: bloom_filter on user_id, set index on method, minmax on response_time_ms
   - file_events: bloom_filter on file_id, set index on file_type
   - Each index: ALTER TABLE ... ADD INDEX idx_name expression TYPE index_type GRANULARITY N

4. **query-patterns.md** (~100 lines)
   - Documented query patterns with optimal ClickHouse SQL:
   - Dashboard queries: DAU over time, message volume trends, API error rates
   - Workspace analytics: per-workspace activity summary, top channels, active users
   - Performance monitoring: p95/p99 response times per endpoint, slow query identification
   - Search analytics: popular queries, zero-result queries, search performance
   - Each query: description, SQL, which ORDER BY/projection/index it uses, expected performance
   - Anti-patterns: SELECT *, unfiltered scans, JOINs without GLOBAL

**Commit message:** `feat(query-optimization): add projections, materialized views, skip indices, query patterns`

---

### Task 3: Security (5 files)

**Context:** ClickHouse supports RBAC (users, roles, row-level policies, quotas). QuckApp needs per-service access control and workspace-level data isolation.

**Files:**
- Create: `security/rbac/users.sql`
- Create: `security/rbac/roles.sql`
- Create: `security/row-policies/workspace-isolation.sql`
- Create: `security/quotas/resource-quotas.sql`
- Create: `security/network/network-security.md`

**Spec:**

1. **users.sql** (~60 lines)
   - CREATE USER statements for QuckApp service accounts:
     - analytics_writer: INSERT access for analytics pipeline (Kafka consumer)
     - analytics_reader: SELECT access for dashboard queries
     - admin_user: full DDL + DML access for migrations
     - grafana_reader: SELECT access for monitoring dashboards (system tables included)
     - export_user: SELECT access for data export jobs
   - Each user: identified by sha256_hash, with appropriate host restrictions
   - Default database: quckapp_analytics
   - IF NOT EXISTS for idempotency

2. **roles.sql** (~60 lines)
   - CREATE ROLE statements:
     - writer_role: INSERT on all analytics tables, SELECT on nothing
     - reader_role: SELECT on all tables + materialized views
     - admin_role: ALL on quckapp_analytics database
     - monitoring_role: SELECT on system.metrics, system.query_log, system.parts, system.replicas
   - GRANT role TO user mappings
   - Principle of least privilege per service

3. **workspace-isolation.sql** (~50 lines)
   - CREATE ROW POLICY for workspace-level data isolation
   - Policies per table: WHERE workspace_id = currentUser() for multi-tenant scenarios
   - Admin bypass: USING (1) for admin_role
   - Policy applied to reader_role users
   - Enables workspace admins to only see their own data

4. **resource-quotas.sql** (~50 lines)
   - CREATE QUOTA statements to prevent runaway queries:
     - reader_quota: max 100 queries/hour, max 10GB read rows, max 60s execution time
     - writer_quota: max 1000 queries/hour (high-throughput inserts), max 100GB read rows
     - admin_quota: higher limits for migration operations
     - grafana_quota: max 200 queries/hour (dashboard refresh)
   - APPLY TO role/user assignments
   - Quota intervals: per hour and per day

5. **network-security.md** (~80 lines)
   - ClickHouse Cloud network configuration
   - IP allowlisting per environment
   - Private Link/PrivateLink setup (AWS PrivateLink, Azure Private Endpoint)
   - TLS configuration (enforced by ClickHouse Cloud on port 9440)
   - VPC peering for internal service access
   - Per-environment network policy table

**Commit message:** `feat(security): add RBAC users/roles, row policies, quotas, and network security`

---

### Task 4: Monitoring & Alerting (6 files)

**Context:** ClickHouse exposes metrics via system tables (system.metrics, system.events, system.query_log, system.parts). Prometheus clickhouse-exporter can scrape these. Key concerns: query performance, merge operations, replication lag, disk usage.

**Files:**
- Create: `monitoring/prometheus/clickhouse-exporter.yml`
- Create: `monitoring/prometheus/recording-rules.yml`
- Create: `monitoring/grafana/dashboard.json`
- Create: `monitoring/alerts/cluster-alerts.yml`
- Create: `monitoring/alerts/query-alerts.yml`
- Create: `monitoring/system-queries/diagnostic-queries.md`

**Spec:**

1. **clickhouse-exporter.yml** (~60 lines)
   - Kubernetes Deployment + Service for ClickHouse Prometheus exporter
   - Image: f1yegor/clickhouse-exporter or equivalent
   - Args: -scrape_uri=http://clickhouse:8123
   - Port: 9116
   - Prometheus scrape annotations
   - Resource limits: 128Mi memory, 100m CPU

2. **recording-rules.yml** (~50 lines)
   - Prometheus recording rules:
     - clickhouse:queries_per_second:rate5m
     - clickhouse:insert_rows_per_second:rate5m
     - clickhouse:merge_rows_per_second:rate5m
     - clickhouse:active_merges:count
     - clickhouse:parts_count:max (per table)
     - clickhouse:disk_usage:ratio

3. **dashboard.json** (~250 lines)
   - Grafana dashboard with 4 rows:
     - Cluster Health: uptime, connections, memory usage, disk usage, active merges
     - Query Performance: queries/sec, query duration p50/p99, failed queries, read/written rows
     - Table Statistics: rows per table, parts per table, disk usage per table, merge activity
     - Ingestion: insert rows/sec, insert bytes/sec, buffer table flush rate, async insert queue
   - Variables: $instance, $database, $table
   - Dashboard uid: "quckapp-clickhouse-overview"

4. **cluster-alerts.yml** (~70 lines)
   - Prometheus alerting rules:
     - ClickHouseDown: instance not responding for 1m (critical)
     - ClickHouseDiskUsageHigh: >80% warning, >90% critical
     - ClickHouseMemoryUsageHigh: >85% of max_memory_usage (warning)
     - ClickHouseTooManyParts: >300 parts per table (warning) — indicates merge backlog
     - ClickHouseReplicaLag: replica lag >60s (warning)
     - ClickHouseActiveMergesHigh: >10 concurrent merges (warning)

5. **query-alerts.yml** (~70 lines)
   - Prometheus alerting rules:
     - ClickHouseSlowQueries: queries >10s for 5m (warning)
     - ClickHouseFailedQueries: error rate >1% for 5m (warning)
     - ClickHouseInsertFailures: insert error rate >0 for 2m (critical)
     - ClickHouseQueryQueueFull: >50 queued queries (warning)
     - ClickHouseMaxPartitionsExceeded: partition count >100 per table (warning)

6. **diagnostic-queries.md** (~100 lines)
   - Useful system table queries for troubleshooting:
   - Running queries: SELECT * FROM system.processes
   - Slow query log: system.query_log filtered by duration
   - Table sizes: system.parts grouped by table
   - Active merges: system.merges
   - Replication status: system.replicas
   - Part statistics: system.parts_columns for column-level compression ratios
   - Memory usage: system.metrics filtered by memory
   - Each query: purpose, SQL, how to interpret results, when to use

**Commit message:** `feat(monitoring): add Prometheus exporter, Grafana dashboard, cluster and query alerts`

---

### Task 5: Backup & Restore (4 files)

**Context:** ClickHouse Cloud provides managed backups. For additional safety, BACKUP/RESTORE SQL commands and S3 export provide self-managed backup options.

**Files:**
- Create: `backup/backup-config.md`
- Create: `backup/scripts/backup-tables.sh`
- Create: `backup/scripts/restore-tables.sh`
- Create: `backup/disaster-recovery.md`

**Spec:**

1. **backup-config.md** (~100 lines)
   - ClickHouse Cloud managed backup features (automatic daily backups, retention)
   - BACKUP/RESTORE SQL commands (ClickHouse 23.3+):
     - `BACKUP TABLE quckapp_analytics.message_events TO S3('s3://bucket/path')`
     - Full database backup: `BACKUP DATABASE quckapp_analytics TO S3(...)`
   - S3 backup destination configuration per environment
   - Backup schedule: daily full, hourly incremental for production
   - Retention: 30 days for all environments
   - Backup verification: RESTORE with STRUCTURE_ONLY

2. **backup-tables.sh** (~80 lines, executable bash)
   - Parameters: --host, --database, --table (or "all"), --s3-bucket, --dry-run
   - Uses clickhouse-client to execute BACKUP TABLE/DATABASE commands
   - Output: S3 path with timestamp: s3://bucket/backups/YYYY-MM-DD/
   - Supports individual table or full database backup
   - Logs backup progress and final size
   - Usage examples in header

3. **restore-tables.sh** (~80 lines, executable bash)
   - Parameters: --host, --database, --table, --s3-path, --dry-run
   - Uses clickhouse-client to execute RESTORE commands
   - Safety: validates backup exists, --dry-run for preview
   - Options: STRUCTURE_ONLY (schema only) or full restore
   - Post-restore verification: row count comparison

4. **disaster-recovery.md** (~80 lines)
   - DR strategy: RPO/RTO targets
     - Analytics data: RPO <1hr, RTO <2hr (non-critical, can be rebuilt from Kafka)
     - Audit/compliance data: RPO <1hr, RTO <1hr
   - Recovery scenarios:
     - ClickHouse Cloud outage: wait for managed recovery (SLA-backed)
     - Data corruption: restore from S3 backup
     - Full rebuild: replay events from Kafka (data pipeline architecture)
   - Post-recovery verification checklist

**Commit message:** `feat(backup): add backup configuration, scripts, and disaster recovery procedures`

---

### Task 6: Performance Tuning (4 files)

**Context:** ClickHouse performance depends on compression codecs, MergeTree settings, buffer tables for high-throughput ingestion, and proper INSERT batching. QuckApp ingests analytics events from Kafka and HTTP API calls.

**Files:**
- Create: `performance/compression.md`
- Create: `performance/merge-tree-tuning.md`
- Create: `performance/buffer-tables.md`
- Create: `performance/ingestion-optimization.md`

**Spec:**

1. **compression.md** (~80 lines)
   - ClickHouse compression codecs: LZ4 (default), ZSTD, Delta, DoubleDelta, Gorilla, T64
   - Per-column codec recommendations for QuckApp tables:
     - Timestamps (DateTime): Delta + ZSTD (time-series data)
     - UUIDs: LZ4 (not very compressible)
     - Enum8 columns: ZSTD (small cardinality, great compression)
     - Numeric metrics (response_time_ms, file_size): DoubleDelta + ZSTD
     - String columns (endpoint, query_text): ZSTD
   - ALTER TABLE MODIFY COLUMN with CODEC examples
   - Compression ratio monitoring via system.parts_columns
   - Estimated storage savings per codec

2. **merge-tree-tuning.md** (~80 lines)
   - MergeTree settings that affect performance:
     - index_granularity (default 8192, when to adjust)
     - merge_max_block_size, max_bytes_to_merge_at_max_space_in_pool
     - parts_to_throw_insert (max parts before rejecting inserts)
     - min_bytes_for_wide_part (when to use wide vs compact format)
   - QuckApp table-specific tuning:
     - message_events (high volume): increase merge frequency
     - api_metrics (short TTL, 30d): aggressive merge for faster cleanup
   - TTL MOVE/DELETE optimization
   - Partition pruning: why monthly partitioning works for QuckApp query patterns

3. **buffer-tables.md** (~80 lines)
   - Buffer engine for high-throughput ingestion:
     - CREATE TABLE ... Engine = Buffer(quckapp_analytics, target_table, ...)
   - Buffer parameters: num_layers, min/max_time, min/max_rows, min/max_bytes
   - QuckApp use case: buffer tables for api_metrics (highest insert frequency)
   - Trade-offs: data visibility delay vs insert throughput
   - Alternative: async_insert setting (ClickHouse 22.x+) — recommended over Buffer
   - async_insert configuration: async_insert=1, wait_for_async_insert=0
   - When to use Buffer vs async_insert vs batch HTTP inserts

4. **ingestion-optimization.md** (~80 lines)
   - Batch INSERT best practices: optimal batch size (1000–100000 rows)
   - HTTP API insert: FORMAT JSONEachRow, compression headers
   - Native protocol insert: clickhouse-client with --max_insert_block_size
   - Avoiding "too many parts" error: batch size, insert frequency, merge monitoring
   - QuckApp ingestion patterns:
     - Analytics events from Kafka: batch consumer with 5000-row batches
     - API metrics from services: async HTTP insert with JSONEachRow
     - Search events: batch insert every 10 seconds
   - Insert deduplication: insert_deduplication setting for exactly-once
   - Monitoring ingestion: InsertedRows, InsertedBytes metrics

**Commit message:** `feat(performance): add compression, MergeTree tuning, buffer tables, ingestion optimization`

---

### Task 7: Data Pipelines (4 files)

**Context:** QuckApp uses Kafka for event streaming (16 topics). ClickHouse can consume directly from Kafka using the Kafka engine + materialized views for ETL. Analytics and audit events should flow from Kafka topics into ClickHouse tables.

**Files:**
- Create: `data-pipelines/kafka-engine/kafka-tables.sql`
- Create: `data-pipelines/kafka-engine/kafka-materialized-views.sql`
- Create: `data-pipelines/s3-export/s3-export-config.md`
- Create: `data-pipelines/pipeline-architecture.md`

**Spec:**

1. **kafka-tables.sql** (~80 lines)
   - CREATE TABLE statements for Kafka engine tables (intermediate staging):
   - kafka_message_events: reads from QuckApp.message.sent, QuckApp.message.edited, QuckApp.message.deleted, QuckApp.message.reaction
     - Engine = Kafka, kafka_broker_list, kafka_topic_list, kafka_group_name = 'clickhouse-analytics', kafka_format = 'JSONEachRow'
   - kafka_user_activity: reads from QuckApp.auth.user-login, QuckApp.auth.user-registered, QuckApp.user.status-changed
   - kafka_api_metrics: reads from QuckApp.analytics.event (filtered to api metrics)
   - kafka_search_events: reads from QuckApp.analytics.event (filtered to search events)
   - kafka_file_events: reads from QuckApp.analytics.event (filtered to file events)
   - Each: kafka_num_consumers, kafka_max_block_size, kafka_skip_broken_messages settings
   - Comments explaining that Kafka engine tables are virtual — data flows through but isn't stored

2. **kafka-materialized-views.sql** (~80 lines)
   - CREATE MATERIALIZED VIEW statements that consume from Kafka engine tables and INSERT into target MergeTree tables:
   - mv_kafka_message_events: FROM kafka_message_events → message_events (with field mapping/transformation)
   - mv_kafka_user_activity: FROM kafka_user_activity → user_activity
   - mv_kafka_api_metrics: FROM kafka_api_metrics → api_metrics
   - mv_kafka_search_events: FROM kafka_search_events → search_events
   - mv_kafka_file_events: FROM kafka_file_events → file_events
   - Each: SELECT with field extraction from JSON, type casting, default values
   - Error handling: kafka_skip_broken_messages for malformed events

3. **s3-export-config.md** (~80 lines)
   - Exporting ClickHouse data to S3 for long-term archival:
   - INSERT INTO FUNCTION s3(...) SELECT ... FROM table
   - Partitioned export: by month/year for efficient archival
   - Format: Parquet (best for analytics) or JSONEachRow
   - Compression: gzip or zstd
   - Scheduled export via cron or ClickHouse scheduled tasks
   - QuckApp export schedule:
     - api_metrics: export monthly (30-day TTL, archive before deletion)
     - search_events: export monthly (90-day TTL)
     - message_events/file_events: export yearly (365-day TTL)
   - Reading back from S3: CREATE TABLE ... Engine = S3(...)

4. **pipeline-architecture.md** (~100 lines)
   - End-to-end data pipeline ASCII diagram:
     - Services → Kafka topics → ClickHouse Kafka engine → MergeTree tables → Materialized views → Grafana dashboards
   - Alternative architectures: Kafka Connect ClickHouse sink, direct HTTP insert
   - Comparison table: Kafka engine vs Kafka Connect vs direct insert (latency, complexity, exactly-once)
   - Error handling: dead letter topics, kafka_skip_broken_messages
   - Backfill procedure: replay from Kafka or import from S3 archive
   - Schema evolution: how to handle new fields in Kafka events

**Commit message:** `feat(data-pipelines): add Kafka engine tables, materialized views, S3 export, pipeline architecture`

---

### Task 8: Compliance (3 files)

**Context:** GDPR requires data deletion capability. ClickHouse supports ALTER TABLE DELETE (lightweight deletes in 23.x+) and TTL-based automatic deletion. The api_metrics table has 30-day TTL, message_events has 365-day TTL.

**Files:**
- Create: `compliance/gdpr/data-deletion.md`
- Create: `compliance/data-retention/ttl-policies.md`
- Create: `compliance/audit/query-audit.md`

**Spec:**

1. **data-deletion.md** (~100 lines)
   - GDPR right-to-erasure in ClickHouse
   - Deletion methods:
     - ALTER TABLE DELETE WHERE user_id = '...' (lightweight delete, ClickHouse 23.3+)
     - ALTER TABLE UPDATE ... WHERE (for anonymization instead of deletion)
     - TTL-based: let data expire naturally if retention < 30 days
   - QuckApp PII analysis per table:
     - message_events: user_id, content metadata — DELETE WHERE user_id
     - user_activity: user_id, ip_address, session_id — DELETE WHERE user_id
     - search_events: user_id, query_text — DELETE WHERE user_id
     - api_metrics: user_id — DELETE WHERE user_id
     - file_events: user_id — DELETE WHERE user_id
   - Deletion workflow: receive request → identify tables → execute DELETE → verify → log
   - Materialized view handling: must also delete from target tables
   - Performance considerations: lightweight deletes are async, check system.mutations

2. **ttl-policies.md** (~80 lines)
   - Current TTL configuration per table (from 01-init.sql):
     - message_events: 365 days on event_time
     - user_activity: 180 days on activity_time
     - search_events: 90 days on search_time
     - api_metrics: 30 days on metric_time
     - file_events: 365 days on event_time
   - TTL implementation: TTL column + INTERVAL N DAY/MONTH
   - TTL MOVE vs TTL DELETE: tiered storage (hot → cold → delete)
   - Monitoring TTL: system.parts with remove_time
   - Changing TTL: ALTER TABLE MODIFY TTL
   - Compliance mapping: GDPR (storage limitation), SOC 2 (data retention)
   - S3 export before TTL deletion for long-term archival

3. **query-audit.md** (~80 lines)
   - ClickHouse query logging via system.query_log
   - Configuration: query_log settings in config.xml
   - What gets logged: query text, user, client, duration, read rows/bytes, written rows/bytes
   - Audit queries: who accessed what data, when, from where
   - Sensitive query detection: queries touching PII columns
   - Log retention: system.query_log TTL (default 30 days, recommend 90 days for compliance)
   - Integration with SIEM: exporting query_log to external systems

**Commit message:** `feat(compliance): add GDPR data deletion, TTL policies, and query audit documentation`

---

### Task 9: Documentation, Runbooks & Cleanup (5 files + 4 dirs removed)

**Context:** Final task adds architecture documentation, operational runbooks, and removes empty legacy directories.

**Files:**
- Create: `documentation/architecture.md`
- Create: `documentation/runbooks/scaling.md`
- Create: `documentation/runbooks/migration.md`
- Create: `documentation/runbooks/disaster-recovery.md`
- Create: `documentation/best-practices.md`
- Remove: `permissions/` (empty)
- Remove: `roles/` (empty)
- Remove: `scripts/` (empty)
- Remove: `schema/` (empty tree: functions/, tables/, triggers/, views/)

**Spec:**

1. **architecture.md** (~120 lines)
   - ASCII diagram: services → Kafka → ClickHouse Kafka engine → MergeTree tables → Grafana
   - Database schema: 5 tables with columns, engines, partitioning, TTL summary
   - Materialized views: 2 existing + additional from query-optimization/
   - Data volume estimates at 100K users
   - Per-environment topology from environments/*.env
   - Integration points: Kafka (data pipelines), Grafana (monitoring), S3 (archival/export)
   - Cross-references to all enterprise directories

2. **runbooks/scaling.md** (~100 lines)
   - When to scale: query latency increasing, disk >80%, merge backlog growing
   - ClickHouse Cloud scaling: adjust service resources (CPU, memory, storage)
   - Vertical scaling: increase instance size
   - Horizontal scaling: add shards (when data exceeds single-node capacity)
   - Table-level optimization: add projections, adjust ORDER BY
   - Partition management: monthly partition pruning, OPTIMIZE TABLE
   - QuckApp scaling milestones: 100K → 500K → 1M users

3. **runbooks/migration.md** (~80 lines)
   - Adding new tables: create SQL in services/analytics/, naming convention
   - Schema changes: ALTER TABLE for columns, indices, projections
   - Migration procedure: test locally → validate in CI → deploy to dev → promote
   - Rollback: DROP TABLE / ALTER TABLE DROP COLUMN (caution: data loss)
   - Data backfill after schema change: INSERT ... SELECT
   - Reference to tools/migrate.sh and Dockerfile

4. **runbooks/disaster-recovery.md** (~80 lines)
   - ClickHouse Cloud outage: SLA coverage, expected recovery
   - Data corruption: restore from backup (reference backup/scripts/)
   - Full rebuild from Kafka: replay all events via Kafka engine tables
   - Post-recovery verification: row counts, materialized view consistency
   - Communication template

5. **best-practices.md** (~100 lines)
   - Schema design: choose ORDER BY wisely (most filtered columns first), use LowCardinality
   - Query patterns: filter by partition key, avoid SELECT *, use PREWHERE
   - Ingestion: batch inserts, avoid single-row inserts, use async_insert
   - Materialized views: prefer SummingMergeTree/AggregatingMergeTree for pre-aggregation
   - TTL: always set TTL on event tables, archive before deletion
   - Anti-patterns: JOINs on large tables, ORDER BY on non-indexed columns, too many partitions
   - Cross-references to performance/, query-optimization/ directories

**Cleanup:**
- `rmdir permissions/`
- `rmdir roles/`
- `rmdir scripts/`
- `rm -rf schema/` (has empty subdirs: functions/, tables/, triggers/, views/)

**Commit message:** `feat(documentation): add architecture docs, runbooks, best practices; remove empty dirs`

---

## Summary

| Task | Directory | Files | Focus |
|------|-----------|-------|-------|
| 1 | cluster/ | 4 | Architecture, sharding, replication, cloud config |
| 2 | query-optimization/ | 4 | Projections, materialized views, skip indices |
| 3 | security/ | 5 | RBAC, row policies, quotas, network |
| 4 | monitoring/ | 6 | Prometheus, Grafana, cluster & query alerts |
| 5 | backup/ | 4 | BACKUP/RESTORE, scripts, DR |
| 6 | performance/ | 4 | Compression, MergeTree, buffer tables, ingestion |
| 7 | data-pipelines/ | 4 | Kafka engine, S3 export, pipeline architecture |
| 8 | compliance/ | 3 | GDPR deletion, TTL policies, query audit |
| 9 | documentation/ + cleanup | 5 + 4 dirs | Architecture, runbooks, best practices |
| **Total** | | **~39** | |
