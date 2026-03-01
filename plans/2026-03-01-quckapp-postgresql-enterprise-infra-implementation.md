# QuckApp PostgreSQL Enterprise Infrastructure — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 13 enterprise-grade directories (~65 files) to `database/quckapp-postgresql/` covering infrastructure, cluster management, schemas, migrations, extensions, partitioning, sharding, replication, security, auditing, performance, warehouse, observability, automation, compliance, and documentation.

**Architecture:** PostgreSQL 16 with native declarative partitioning, Citus for horizontal sharding, Patroni for HA, pgAudit for compliance-grade auditing, native Row-Level Security for tenant isolation. All work in the `database/quckapp-postgresql` git submodule (on `master` branch).

**Tech Stack:** PostgreSQL 16, Citus, Patroni, PgBouncer, PgPool-II, pgAudit, pgcrypto, Terraform, Kubernetes (Zalando operator), Prometheus

---

## Context

- **Submodule path**: `D:\Learning\QuckApp\database\quckapp-postgresql` (branch: `master`)
- **Existing databases**: `quckapp_realtime`, `quckapp_go_bff`
- **7 domain schemas**: auth, users, workspaces, messaging, files, notifications, admin
- **Existing core tables** (public): users, media, conversations, conversation_participants, messages, notifications, user_devices, audit_logs
- **Existing messaging tables**: messaging.conversations, participants, user_settings, blocked_users, call_records, call_participants
- **PK convention**: UUID (uuid_generate_v4() or gen_random_uuid())
- **Empty dirs to remove**: `permissions/`, `roles/`, `schema/` (with empty subdirs)
- All work happens inside the submodule directory. Commit there first, parent repo submodule reference updated at the end.

---

### Task 1: Infrastructure — Terraform

**Files:**
- Create: `infrastructure/terraform/main.tf`
- Create: `infrastructure/terraform/variables.tf`
- Create: `infrastructure/terraform/outputs.tf`

**What to build:**

`main.tf` — Terraform module for AWS RDS/Aurora PostgreSQL:
- `aws_rds_cluster` for Aurora PostgreSQL 16 (multi-AZ)
- `aws_rds_cluster_instance` for writer + reader instances
- `aws_db_subnet_group` for VPC placement
- `aws_security_group` for port 5432 ingress rules
- Parameter group with QuckApp-specific settings (shared_preload_libraries = 'pg_stat_statements,pgaudit', wal_level = 'logical', max_replication_slots = 10)
- Tags: project=quckapp, managed-by=terraform

`variables.tf` — Configurable parameters:
- `environment` (dev/qa/staging/prod)
- `instance_class` (db.r6g.large default)
- `engine_version` (16.x)
- `database_name` (quckapp)
- `master_username`
- `storage_encrypted` (true)
- `backup_retention_period` (7 default, 35 for prod)
- `deletion_protection` (true for prod)
- `vpc_id`, `subnet_ids`, `allowed_cidr_blocks`

`outputs.tf` — Exposed values:
- `cluster_endpoint`, `reader_endpoint`, `port`
- `cluster_id`, `security_group_id`

**Step 1:** Create all 3 files with complete Terraform HCL.
**Step 2:** Commit: `feat(postgresql): add Terraform infrastructure for Aurora PostgreSQL`

---

### Task 2: Infrastructure — Kubernetes & Networking

**Files:**
- Create: `infrastructure/kubernetes/postgres-operator.yml`
- Create: `infrastructure/kubernetes/cluster-crd.yml`
- Create: `infrastructure/kubernetes/backup-schedule.yml`
- Create: `infrastructure/networking/pg_hba.conf`
- Create: `infrastructure/networking/ssl_config.md`
- Create: `infrastructure/networking/network_policies.yml`

**What to build:**

`postgres-operator.yml` — Zalando Postgres Operator deployment:
- Operator namespace, ServiceAccount, ClusterRole, Deployment
- ConfigMap with operator configuration (enable_team_id_clustername_prefix, docker_image for spilo)

`cluster-crd.yml` — postgresql CRD for QuckApp:
- `apiVersion: acid.zalan.do/v1`, `kind: postgresql`
- Team: quckapp, 3 instances, PostgreSQL 16
- Volume: 100Gi, resources (cpu/memory limits)
- Users: quckapp_app, quckapp_readonly with database grants
- Databases: quckapp_go_bff, quckapp_realtime

`backup-schedule.yml` — CronJob:
- Schedule: `0 2 * * *` (daily 2 AM)
- pg_basebackup to S3 via WAL-G
- Retention: 7 daily, 4 weekly

`pg_hba.conf` — Host-based authentication:
- local connections: md5
- Replication: scram-sha-256 from replication subnet
- Application tier: scram-sha-256 from app CIDR
- Monitoring: scram-sha-256 from monitoring CIDR
- Reject all others

`ssl_config.md` — TLS setup guide:
- Certificate generation, CA chain
- postgresql.conf SSL params (ssl=on, ssl_cert_file, ssl_key_file, ssl_ca_file)
- Client certificate authentication

`network_policies.yml` — K8s NetworkPolicy:
- Allow ingress on 5432 from app namespace
- Allow ingress on 5432 from monitoring namespace
- Deny all other ingress

**Step 1:** Create all 6 files.
**Step 2:** Commit: `feat(postgresql): add Kubernetes operator and networking configs`

---

### Task 3: Cluster Management — Patroni, PgBouncer, PgPool, Failover

**Files:**
- Create: `cluster-management/patroni/patroni.yml`
- Create: `cluster-management/patroni/etcd_config.yml`
- Create: `cluster-management/pgbouncer/pgbouncer.ini`
- Create: `cluster-management/pgbouncer/pooler_rules.sql`
- Create: `cluster-management/pgpool/pgpool.conf`
- Create: `cluster-management/pgpool/pool_hba.conf`
- Create: `cluster-management/failover/automatic_failover.md`

**What to build:**

`patroni.yml` — Patroni HA configuration:
- scope: quckapp-cluster
- DCS: etcd (host, protocol)
- bootstrap.dcs: loop_wait=10, ttl=30, retry_timeout=10, maximum_lag_on_failover=1048576
- bootstrap.initdb: encoding=UTF-8, data-checksums
- postgresql.parameters: max_connections=200, shared_buffers=2GB, effective_cache_size=6GB, wal_level=logical, max_wal_senders=10, max_replication_slots=10, hot_standby=on, shared_preload_libraries='pg_stat_statements,pgaudit'
- postgresql.pg_hba: replication entries, app entries
- tags: nofailover=false, noloadbalance=false, clonefrom=false

`etcd_config.yml` — etcd cluster:
- 3-node cluster endpoints
- Authentication, TLS settings

`pgbouncer.ini` — Connection pooling:
- [databases] section: quckapp_go_bff, quckapp_realtime with host/port
- [pgbouncer]: listen_port=6432, pool_mode=transaction, max_client_conn=1000, default_pool_size=25, reserve_pool_size=5, server_tls_sslmode=require, auth_type=scram-sha-256

`pooler_rules.sql` — Auth query + database routing:
- auth_query function for pgbouncer userlist
- Comments explaining pool mode tradeoffs (session vs transaction vs statement)

`pgpool.conf` — PgPool-II:
- backend_hostname/port for primary + replicas
- load_balance_mode=on, master_slave_mode=on, master_slave_sub_mode=stream
- health_check_period=5, health_check_timeout=3
- sr_check_period=5 (streaming replication check)
- num_init_children=200, max_pool=4

`pool_hba.conf` — PgPool authentication (mirrors pg_hba.conf pattern)

`automatic_failover.md` — Failover playbook:
- Patroni automatic failover flow
- Manual failover with patronictl
- Switchover (planned maintenance)
- Split-brain prevention
- RTO/RPO targets per environment
- Post-failover verification checklist

**Step 1:** Create all 7 files.
**Step 2:** Commit: `feat(postgresql): add cluster management with Patroni, PgBouncer, PgPool`

---

### Task 4: Domain Schemas

**Files:**
- Create: `schemas/auth/tables.sql`
- Create: `schemas/users/tables.sql`
- Create: `schemas/workspaces/tables.sql`
- Create: `schemas/messaging/tables.sql`
- Create: `schemas/files/tables.sql`
- Create: `schemas/notifications/tables.sql`
- Create: `schemas/admin/tables.sql`
- Create: `schemas/shared/common_types.sql`

**What to build:**

Each `tables.sql` defines tables for that domain schema. Reference existing tables from `shared/core-schema/` and extend with enterprise features.

`schemas/shared/common_types.sql` — Shared types:
- `CREATE TYPE workspace_tier AS ENUM ('free', 'pro', 'enterprise');`
- `CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted');`
- `CREATE TYPE audit_action AS ENUM ('INSERT', 'UPDATE', 'DELETE');`
- `CREATE DOMAIN email_address AS VARCHAR(255) CHECK (VALUE ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');`
- `CREATE DOMAIN positive_int AS INTEGER CHECK (VALUE > 0);`

`schemas/auth/tables.sql` — Auth schema tables:
- `auth.sessions` (id, user_id, token_hash, ip_address, user_agent, expires_at, created_at)
- `auth.refresh_tokens` (id, user_id, token_hash, device_id, expires_at, revoked_at, created_at)
- `auth.login_history` (id, user_id, ip_address, user_agent, success, failure_reason, created_at)
- `auth.password_reset_tokens` (id, user_id, token_hash, expires_at, used_at, created_at)

`schemas/users/tables.sql` — User schema:
- `users.profiles` (user_id PK, display_name, bio, timezone, locale, avatar_url, metadata, updated_at)
- `users.preferences` (user_id PK, theme, notification_settings JSONB, privacy_settings JSONB, updated_at)

`schemas/workspaces/tables.sql` — Workspace schema:
- `workspaces.workspaces` (id, name, slug, owner_id, tier, settings JSONB, created_at, updated_at)
- `workspaces.members` (workspace_id, user_id, role, joined_at, invited_by)
- `workspaces.invitations` (id, workspace_id, email, role, token, expires_at, accepted_at, created_at)

`schemas/messaging/tables.sql` — Reference existing messaging tables from 03-conversations.sql. Add:
- `messaging.message_reactions` (message_id, user_id, emoji, created_at)
- `messaging.message_attachments` (id, message_id, file_id, created_at)
- `messaging.typing_indicators` (conversation_id, user_id, started_at) — unlogged table for performance

`schemas/files/tables.sql` — Files schema:
- `files.file_metadata` (id, workspace_id, uploader_id, filename, mime_type, size_bytes, s3_key, s3_bucket, checksum, scan_status, created_at)
- `files.file_versions` (id, file_id, version_number, s3_key, size_bytes, created_by, created_at)

`schemas/notifications/tables.sql` — Notifications schema:
- `notifications.templates` (id, name, channel, subject_template, body_template, created_at)
- `notifications.preferences` (user_id, workspace_id, channel, enabled, quiet_hours JSONB)
- `notifications.delivery_log` (id, notification_id, channel, status, provider_id, sent_at, delivered_at, failed_at, error)

`schemas/admin/tables.sql` — Admin schema:
- `admin.feature_flags` (id, name, description, enabled, rollout_percentage, conditions JSONB, created_at, updated_at)
- `admin.system_settings` (key PK, value JSONB, description, updated_by, updated_at)
- `admin.maintenance_windows` (id, title, scheduled_start, scheduled_end, status, affected_services, created_by, created_at)

**Step 1:** Create all 8 files with full CREATE TABLE, indexes, and comments.
**Step 2:** Commit: `feat(postgresql): add enterprise domain schema definitions`

---

### Task 5: Migrations & Extensions

**Files:**
- Create: `migrations/online_changes/expand_contract_pattern.sql`
- Create: `migrations/online_changes/concurrent_index.sql`
- Create: `migrations/rollback/rollback_patterns.md`
- Create: `extensions/required_extensions.sql`
- Create: `extensions/citus_setup.sql`
- Create: `extensions/pgaudit_setup.sql`

**What to build:**

`expand_contract_pattern.sql` — Zero-downtime migration patterns:
- Phase 1 (Expand): ADD COLUMN with DEFAULT, dual-write trigger
- Phase 2 (Migrate): Backfill old data
- Phase 3 (Contract): DROP old column, remove trigger
- Complete example: renaming `users.username` to `users.handle`

`concurrent_index.sql` — Non-blocking index operations:
- `CREATE INDEX CONCURRENTLY` examples for each schema
- `REINDEX CONCURRENTLY` for index rebuilds
- `DROP INDEX CONCURRENTLY` for cleanup
- Monitoring progress via `pg_stat_progress_create_index`

`rollback_patterns.md` — Rollback strategies:
- Transactional DDL (PostgreSQL advantage)
- Forward-fix vs rollback decision matrix
- Example rollback scripts
- Flyway undo migrations

`required_extensions.sql` — Extension installation:
- uuid-ossp, pgcrypto, pg_trgm (existing)
- pg_stat_statements (performance)
- pgaudit (auditing)
- btree_gist (exclusion constraints)
- citext (case-insensitive text)
- pg_partman (partition management — optional)

`citus_setup.sql` — Citus bootstrap:
- `CREATE EXTENSION citus;`
- Coordinator node setup
- Worker node addition
- Verify cluster status

`pgaudit_setup.sql` — pgAudit configuration:
- `CREATE EXTENSION pgaudit;`
- `ALTER SYSTEM SET pgaudit.log = 'write, ddl, role';`
- Per-role audit settings
- Log format configuration

**Step 1:** Create all 6 files.
**Step 2:** Commit: `feat(postgresql): add migration patterns and extension configurations`

---

### Task 6: Partitioning

**Files:**
- Create: `partitioning/range/messages_by_month.sql`
- Create: `partitioning/range/audit_logs_by_day.sql`
- Create: `partitioning/hash/tenant_hash_partition.sql`
- Create: `partitioning/maintenance/auto_partition_rotation.sql`

**What to build:**

`messages_by_month.sql` — Range partitioning for messages:
- `CREATE TABLE messages_partitioned (...) PARTITION BY RANGE (created_at);`
- Function to auto-create monthly partitions
- Partition for current month + 12 ahead
- Indexes per partition
- Partition pruning verification with EXPLAIN

`audit_logs_by_day.sql` — Daily partitioning for audit tables:
- `CREATE TABLE audit_logs_partitioned (...) PARTITION BY RANGE (created_at);`
- Daily partitions for high-volume audit data
- 90-day retention with partition drops
- pg_partman integration for automated management

`tenant_hash_partition.sql` — Hash partitioning by workspace:
- `CREATE TABLE workspace_data (...) PARTITION BY HASH (workspace_id);`
- 16 hash partitions
- Example for conversations, files tables
- Even distribution verification

`auto_partition_rotation.sql` — Maintenance procedures:
- `create_future_partitions()` — creates next N partitions
- `drop_old_partitions(retention_days)` — drops expired partitions
- `pg_cron` scheduled job for daily execution
- Monitoring: partition count, size per partition

**Step 1:** Create all 4 files with complete SQL.
**Step 2:** Commit: `feat(postgresql): add declarative partitioning strategies`

---

### Task 7: Sharding (Citus)

**Files:**
- Create: `sharding/citus/distributed_tables.sql`
- Create: `sharding/citus/reference_tables.sql`
- Create: `sharding/citus/shard_rebalance.sql`
- Create: `sharding/tenant_distribution.sql`
- Create: `sharding/shard_map.sql`

**What to build:**

`distributed_tables.sql` — Citus distributed table setup:
- `SELECT create_distributed_table('messaging.conversations', 'workspace_id');`
- Distribute: conversations, participants, messages, call_records, files, notifications by workspace_id
- Co-locate related tables: `SELECT create_distributed_table('messaging.participants', 'workspace_id', colocate_with => 'messaging.conversations');`

`reference_tables.sql` — Small lookup tables replicated to all nodes:
- `SELECT create_reference_table('workspaces.workspaces');`
- Reference: workspace tiers, feature flags, notification templates, system settings

`shard_rebalance.sql` — Rebalancing operations:
- `SELECT citus_rebalance_start();`
- Monitor rebalance progress
- Drain specific node before maintenance
- Shard count recommendations (2x CPU cores per node)

`tenant_distribution.sql` — Workspace-based distribution:
- Distribution key analysis (workspace_id cardinality, size distribution)
- Query patterns and join co-location requirements
- Tenant isolation level configuration
- Large tenant handling strategy

`shard_map.sql` — Shard topology:
- `SELECT * FROM citus_shards;` — current shard placement
- Node topology documentation
- Shard count, placement strategy
- Cross-shard query patterns and limitations

**Step 1:** Create all 5 files.
**Step 2:** Commit: `feat(postgresql): add Citus sharding infrastructure`

---

### Task 8: Replication

**Files:**
- Create: `replication/streaming/primary.conf`
- Create: `replication/streaming/replica.conf`
- Create: `replication/logical/publisher.sql`
- Create: `replication/logical/subscriber.sql`
- Create: `replication/monitoring/replication_lag.sql`

**What to build:**

`primary.conf` — Primary server WAL configuration:
- `wal_level = logical` (supports both streaming and logical)
- `max_wal_senders = 10`
- `max_replication_slots = 10`
- `wal_keep_size = '1GB'`
- `synchronous_standby_names` for sync replication
- `archive_mode = on`, `archive_command` for WAL archiving

`replica.conf` — Replica configuration:
- `hot_standby = on`
- `primary_conninfo` with connection string
- `primary_slot_name`
- `recovery_target_timeline = 'latest'`
- `hot_standby_feedback = on`
- `max_standby_streaming_delay = '30s'`

`publisher.sql` — Logical replication publications:
- `CREATE PUBLICATION quckapp_analytics FOR TABLE ...` — analytics-facing tables
- `CREATE PUBLICATION quckapp_audit FOR TABLE ...` — audit tables for compliance
- Per-schema publications
- Row filter examples: `WHERE workspace_tier = 'enterprise'`

`subscriber.sql` — Logical replication subscriptions:
- `CREATE SUBSCRIPTION sub_analytics CONNECTION '...' PUBLICATION quckapp_analytics;`
- Cross-region subscription setup
- Conflict handling
- Subscription monitoring

`replication_lag.sql` — Monitoring queries:
- `pg_stat_replication` — current replication status
- `pg_replication_slots` — slot status and lag
- `pg_stat_wal_receiver` — replica-side stats
- WAL accumulation monitoring
- Replication slot cleanup for disconnected replicas

**Step 1:** Create all 5 files.
**Step 2:** Commit: `feat(postgresql): add streaming and logical replication configs`

---

### Task 9: Security

**Files:**
- Create: `security/roles/role_matrix.sql`
- Create: `security/roles/service_roles.sql`
- Create: `security/rls/tenant_isolation.sql`
- Create: `security/encryption/ssl.conf`
- Create: `security/encryption/pgcrypto.sql`
- Create: `security/secrets/vault_integration.md`
- Create: `security/policies/least_privilege.md`

**What to build:**

`role_matrix.sql` — Role hierarchy:
- `quckapp_admin` — superuser equivalent for emergencies
- `quckapp_app` — application role (CRUD on service tables)
- `quckapp_readonly` — read-only for analytics/monitoring
- `quckapp_migration` — DDL privileges for Flyway
- `quckapp_backup` — pg_dump, pg_basebackup privileges
- `quckapp_monitor` — pg_stat access, pg_monitor membership
- `quckapp_replication` — REPLICATION attribute
- Role inheritance: quckapp_app INHERITS quckapp_readonly

`service_roles.sql` — Per-service roles:
- `quckapp_go_bff` — access to messaging, users schemas
- `quckapp_realtime` — access to pending_messages, messaging schema
- `quckapp_notification` — access to notifications schema
- GRANT/REVOKE per schema, principle of least privilege

`tenant_isolation.sql` — Row-Level Security:
- Enable RLS on workspace-scoped tables
- `CREATE POLICY workspace_isolation ON messaging.conversations USING (workspace_id = current_setting('app.current_workspace_id')::uuid);`
- Policy for each schema's tables
- Bypass role for admin/migration users
- Session variable pattern: `SET app.current_workspace_id = '...'`

`ssl.conf` — TLS configuration:
- ssl = on
- ssl_cert_file, ssl_key_file, ssl_ca_file paths
- ssl_min_protocol_version = 'TLSv1.3'
- ssl_ciphers list
- Certificate rotation procedure

`pgcrypto.sql` — Column-level encryption:
- `pgp_sym_encrypt()/pgp_sym_decrypt()` for PII fields
- Key management with application-side key store
- Encrypted column examples: email, phone, SSN
- Performance impact notes

`vault_integration.md` — Secrets management:
- HashiCorp Vault PostgreSQL secrets engine
- Dynamic credential rotation
- AWS Secrets Manager integration
- Connection string templating
- Credential rotation procedure

`least_privilege.md` — Privilege matrix:
- Table of roles × schemas × privilege levels
- Default privilege settings
- Privilege audit queries
- Role membership review

**Step 1:** Create all 7 files.
**Step 2:** Commit: `feat(postgresql): add enterprise security with RLS and role hierarchy`

---

### Task 10: Auditing

**Files:**
- Create: `auditing/pgaudit.conf`
- Create: `auditing/immutable_event_store.sql`
- Create: `auditing/audit_triggers.sql`

**What to build:**

`pgaudit.conf` — pgAudit configuration:
- `pgaudit.log = 'write, ddl, role'`
- `pgaudit.log_catalog = off`
- `pgaudit.log_client = on`
- `pgaudit.log_level = 'log'`
- `pgaudit.log_parameter = on`
- `pgaudit.log_relation = on`
- `pgaudit.log_statement_once = off`
- Per-role audit overrides

`immutable_event_store.sql` — Append-only audit tables:
- `audit.events` table (id, schema_name, table_name, operation, row_id, old_data JSONB, new_data JSONB, changed_by, changed_at, client_ip INET, session_id)
- Monthly range partitioning on changed_at
- REVOKE UPDATE, DELETE on audit.events
- Immutability enforcement trigger (prevent any modifications)
- Retention policy: 13 months in-database, archive to S3

`audit_triggers.sql` — Generic audit trigger:
- `audit.log_changes()` trigger function using TG_OP, OLD, NEW, row_to_json()
- `audit.install_audit_triggers(schema_name, table_name)` — helper to install trigger on any table
- Install on all tables in auth, users, workspaces, messaging schemas
- Exclude high-volume/unlogged tables (typing_indicators)

**Step 1:** Create all 3 files.
**Step 2:** Commit: `feat(postgresql): add pgAudit configuration and immutable event store`

---

### Task 11: Performance

**Files:**
- Create: `performance/indexing/btree.sql`
- Create: `performance/indexing/gin_jsonb.sql`
- Create: `performance/indexing/partial_indexes.sql`
- Create: `performance/query_plans/explain_analyze_samples.sql`
- Create: `performance/vacuum/autovacuum_tuning.conf`
- Create: `performance/capacity/storage_forecast.sql`

**What to build:**

`btree.sql` — B-tree index strategy:
- Per-schema index audit (what exists, what's missing)
- Composite index ordering (equality columns first, range columns last)
- Covering indexes with INCLUDE clause
- Index-only scan optimization
- Unused index detection: `pg_stat_user_indexes WHERE idx_scan = 0`

`gin_jsonb.sql` — GIN indexes for JSONB:
- `CREATE INDEX idx_users_metadata ON users USING GIN (metadata jsonb_path_ops);`
- Path-specific indexes: `CREATE INDEX ... ON ... USING GIN ((metadata -> 'tags'));`
- pg_trgm GIN for full-text: `CREATE INDEX ... USING GIN (content gin_trgm_ops);`
- GIN index size monitoring

`partial_indexes.sql` — Conditional indexes:
- `CREATE INDEX idx_active_sessions ON auth.sessions (user_id) WHERE expires_at > NOW();`
- `CREATE INDEX idx_unread_notifications ON notifications (user_id) WHERE read_at IS NULL;`
- `CREATE INDEX idx_pending_messages ON pending_messages (recipient_id) WHERE delivered_at IS NULL;`
- Size comparison: partial vs full index

`explain_analyze_samples.sql` — Query plan analysis:
- Key queries from go-bff (conversation list, message fetch, participant lookup)
- EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) wrappers
- Identifying seq scans, nested loops, hash joins
- Query plan comparison before/after index changes

`autovacuum_tuning.conf` — Per-table vacuum settings:
- High-churn tables (messages, sessions): lower threshold, higher scale factor
- Large tables: increased vacuum_cost_limit
- Global settings: autovacuum_max_workers=4, autovacuum_naptime=30s
- Table-level overrides with ALTER TABLE ... SET (autovacuum_vacuum_threshold = ...)
- Dead tuple monitoring queries

`storage_forecast.sql` — Capacity planning:
- Table + index sizes: `pg_total_relation_size()`
- Per-schema size aggregation
- Growth rate calculation (compare snapshots)
- Bloat estimation (pgstattuple)
- Toast table sizes
- Partition size distribution

**Step 1:** Create all 6 files.
**Step 2:** Commit: `feat(postgresql): add performance engineering configs`

---

### Task 12: Warehouse, Observability, Automation

**Files:**
- Create: `warehouse/staging/stg_views.sql`
- Create: `warehouse/materialized_views/analytics_views.sql`
- Create: `warehouse/fdw/foreign_data_wrapper.sql`
- Create: `observability/pg_stat_statements.sql`
- Create: `observability/long_running_queries.sql`
- Create: `observability/blocking_sessions.sql`
- Create: `observability/wal_monitoring.sql`
- Create: `observability/alerts/connection_alerts.yml`
- Create: `observability/alerts/replication_alerts.yml`
- Create: `observability/alerts/storage_alerts.yml`
- Create: `observability/alerts/performance_alerts.yml`
- Create: `automation/backup/pg_basebackup.sh`
- Create: `automation/backup/pg_dump_logical.sh`
- Create: `automation/backup/pitr_restore.md`
- Create: `automation/maintenance/vacuum_schedule.sql`
- Create: `automation/maintenance/reindex_schedule.sql`
- Create: `automation/scripts/health_check.sh`

**What to build:**

**Warehouse:**
- `stg_views.sql` — Staging views over operational tables (conversations, messages, users aggregated for analytics)
- `analytics_views.sql` — Materialized views: daily_active_users, message_volume_by_workspace, conversation_metrics. Include REFRESH CONCURRENTLY commands and pg_cron schedule.
- `foreign_data_wrapper.sql` — postgres_fdw setup for cross-database queries between quckapp_go_bff and quckapp_realtime

**Observability:**
- `pg_stat_statements.sql` — Enable extension, top queries by total_exec_time, mean_exec_time, calls, shared_blks_hit ratio
- `long_running_queries.sql` — Active queries > 30s, idle-in-transaction detection, automatic cancellation
- `blocking_sessions.sql` — Lock tree visualization, deadlock detection, pg_locks analysis
- `wal_monitoring.sql` — WAL generation rate, archive status, slot lag
- 4 Prometheus alert YAMLs: connection pool (>80% used), replication lag (>10s), storage (>80% used, >90% critical), performance (cache hit <95%, dead tuples >10M, long queries >5min)

**Automation:**
- `pg_basebackup.sh` — Physical backup script with compression, S3 upload, WAL archiving
- `pg_dump_logical.sh` — Per-database logical backup with format=custom, parallel jobs
- `pitr_restore.md` — Point-in-time recovery runbook (WAL-G, pg_basebackup, timeline selection)
- `vacuum_schedule.sql` — pg_cron jobs for VACUUM ANALYZE on high-churn tables
- `reindex_schedule.sql` — REINDEX CONCURRENTLY on bloated indexes
- `health_check.sh` — Cluster health: connectivity, replication lag, disk space, connection count, WAL archiving status

**Step 1:** Create all 17 files.
**Step 2:** Commit: `feat(postgresql): add warehouse, observability, and automation layers`

---

### Task 13: Compliance & Documentation

**Files:**
- Create: `compliance/audit/pgaudit_policy.conf`
- Create: `compliance/audit/immutable_ledger.sql`
- Create: `compliance/gdpr/right_to_be_forgotten.sql`
- Create: `compliance/pci/card_tokenization.sql`
- Create: `compliance/access_review/quarterly_access_audit.sql`
- Create: `documentation/architecture.md`
- Create: `documentation/runbooks/failover.md`
- Create: `documentation/runbooks/scaling.md`
- Create: `documentation/runbooks/disaster_recovery.md`
- Create: `documentation/erd/schema_diagrams.md`

**What to build:**

**Compliance:**
- `pgaudit_policy.conf` — Compliance-specific audit policy: log all DDL, log writes to PII tables, log role changes, retention periods per regulation
- `immutable_ledger.sql` — SOX-compliant immutable ledger: financial events table with hash chain (previous_hash column), verification function
- `right_to_be_forgotten.sql` — GDPR erasure: `anonymize_user(user_id)` function that replaces PII with anonymized values across all schemas, generates deletion certificate
- `card_tokenization.sql` — PCI-DSS patterns: tokenization function, token vault table, detokenization with audit logging
- `quarterly_access_audit.sql` — Access review queries: all role memberships, privilege grants, unused roles, stale accounts, superuser audit

**Documentation:**
- `architecture.md` — PostgreSQL platform overview: cluster topology, service mapping, schema architecture, extension stack, environment matrix
- `runbooks/failover.md` — Step-by-step failover: Patroni auto-failover, manual promotion, DNS updates, application reconnection, verification
- `runbooks/scaling.md` — Horizontal (Citus add worker) and vertical (instance resize) scaling procedures, read replica addition, connection pool scaling
- `runbooks/disaster_recovery.md` — DR playbook: RPO/RTO targets, backup restoration, cross-region failover, data validation
- `erd/schema_diagrams.md` — Mermaid ERD for each domain schema (auth, users, workspaces, messaging, files, notifications, admin)

**Step 1:** Create all 10 files.
**Step 2:** Commit: `feat(postgresql): add compliance framework and platform documentation`

---

### Task 14: Cleanup & Final Verification

**What to do:**
1. Remove empty `permissions/` directory
2. Remove empty `roles/` directory
3. Remove empty `schema/` directory (with empty `tables/`, `functions/`, `views/`, `triggers/` subdirs)
4. Verify all ~65 new files exist across 13 directories
5. Commit cleanup if git tracks any of these removals
6. Update parent repo submodule reference: `cd D:\Learning\QuckApp && git add database/quckapp-postgresql && git commit`
