# QuckApp MySQL Operational Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add auditing, backup/restore, performance, testing, monitoring, data warehouse, and documentation infrastructure to `database/quckapp-mysql/`.

**Architecture:** 7 new top-level directories under `database/quckapp-mysql/` containing SQL scripts, shell scripts, configuration files, and markdown documentation. All SQL targets MySQL 8.0 with InnoDB. Shell scripts use bash and expect `mysql` CLI and `aws` CLI in PATH.

**Tech Stack:** MySQL 8.0, Bash, Percona XtraBackup, AWS CLI (RDS), Prometheus/Grafana alerting rules, Data Vault 2.0 pattern.

**Design Doc:** `docs/plans/2026-03-01-quckapp-mysql-ops-design.md`

---

### Task 1: Create immutable audit log tables

**Files:**
- Create: `database/quckapp-mysql/auditing/immutable_logs.sql`

**Step 1: Create the file**

Create `auditing/immutable_logs.sql` with:
- A stored procedure `create_audit_log_table(db_name)` that creates an `audit_log` table in the given database
- Table schema: `id BINARY(16) PK`, `table_name VARCHAR(128)`, `operation ENUM('INSERT','UPDATE','DELETE')`, `row_id VARCHAR(255)`, `old_values JSON`, `new_values JSON`, `changed_by VARCHAR(255)`, `changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
- Monthly RANGE partitioning on `changed_at` — generate 13 partitions (current month + 12 ahead)
- Index on `(table_name, changed_at)` and `(changed_by, changed_at)`
- Call the procedure for all 10 databases: `quckapp_auth`, `quckapp_admin`, `quckapp_audit`, `quckapp_permission`, `quckapp_security`, `quckapp_user`, `quckapp_channel`, `quckapp_thread`, `quckapp_workspace`, `quckapp_notification`
- Add a `REVOKE DELETE, UPDATE ON audit_log` statement per database for the `quckapp` app user
- Add a partition maintenance procedure `rotate_audit_partitions()` that drops partitions older than 13 months and adds the next month's partition

**Step 2: Commit**

```bash
git add database/quckapp-mysql/auditing/immutable_logs.sql
git commit -m "feat(mysql): add immutable audit log tables with partition rotation"
```

---

### Task 2: Create audit triggers for all 10 services

**Files:**
- Create: `database/quckapp-mysql/auditing/audit_triggers.sql`

**Step 1: Create the file**

Create `auditing/audit_triggers.sql` with `AFTER INSERT`, `AFTER UPDATE`, `AFTER DELETE` triggers for every table across all 10 service databases (69 tables total, minus the `audit_log` tables themselves and the dropped `promotion_records` in admin-service V4).

Trigger naming: `trg_{table}_after_{insert|update|delete}`

Each trigger:
- Determines the primary key value (handle CHAR(36) via `HEX()`, BINARY(16) via `HEX()`, composite via `CONCAT_WS(':', col1, col2)`, BIGINT via `CAST`)
- Builds `old_values` and `new_values` as `JSON_OBJECT(...)` from all non-PK columns
- Inserts into the same database's `audit_log` table
- Uses `@audit_user` session variable for `changed_by` (fallback to `CURRENT_USER()`)

Group triggers by database with clear section headers:

```sql
-- ============================================================
-- quckapp_auth (31 tables)
-- ============================================================
USE quckapp_auth;
```

**Tables per database (exact counts):**
- `quckapp_auth`: 31 tables (V1-V9, excluding audit_log)
- `quckapp_admin`: 10 tables (V1-V3, promotion_records dropped in V4)
- `quckapp_audit`: 4 tables (V1-V2)
- `quckapp_permission`: 5 tables (V1-V2)
- `quckapp_security`: 11 tables (V1-V3)
- `quckapp_user`: 3 tables
- `quckapp_channel`: 3 tables
- `quckapp_thread`: 3 tables
- `quckapp_workspace`: 3 tables
- `quckapp_notification`: 3 tables

**Step 2: Commit**

```bash
git add database/quckapp-mysql/auditing/audit_triggers.sql
git commit -m "feat(mysql): add audit triggers for all 10 service databases"
```

---

### Task 3: Create MySQL audit plugin configuration

**Files:**
- Create: `database/quckapp-mysql/auditing/mysql_audit_plugin.conf`

**Step 1: Create the file**

Create `mysql_audit_plugin.conf` with MySQL Enterprise Audit plugin settings:
- `audit_log_format = JSON`
- `audit_log_policy = ALL` (connections + queries)
- `audit_log_strategy = ASYNCHRONOUS`
- `audit_log_buffer_size = 16M`
- `audit_log_rotate_on_size = 1073741824` (1GB)
- `audit_log_max_size = 10737418240` (10GB)
- Filter rules: exclude `SELECT` on `information_schema` and `performance_schema`, exclude `quckapp` user's health checks
- Include all DDL operations (CREATE, ALTER, DROP)
- Include all DML on PII tables (list the 26 PII tables identified in the design)

**Step 2: Commit**

```bash
git add database/quckapp-mysql/auditing/mysql_audit_plugin.conf
git commit -m "feat(mysql): add MySQL Enterprise Audit plugin configuration"
```

---

### Task 4: Create backup scripts

**Files:**
- Create: `database/quckapp-mysql/backup_restore/logical_backup.sh`
- Create: `database/quckapp-mysql/backup_restore/physical_backup.sh`

**Step 1: Create logical_backup.sh**

Shell script that:
- Accepts `--databases` flag (default: all 10 `quckapp_*` databases) and `--output-dir` (default: `./backups/logical`)
- Iterates each database, runs `mysqldump --single-transaction --routines --triggers --events --set-gtid-purged=OFF`
- Compresses with `gzip`, names files `{db}_{YYYY-MM-DD_HHMMSS}.sql.gz`
- Optionally uploads to S3 via `--s3-bucket` flag
- Logs progress to stdout, errors to stderr
- Returns exit code 0 on success, 1 on any failure
- Reads MySQL credentials from environment variables `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`

**Step 2: Create physical_backup.sh**

Shell script with two modes:
- `--mode=xtrabackup`: Percona XtraBackup full backup with `--backup --target-dir` and optional `--incremental-basedir`
- `--mode=rds`: `aws rds create-db-snapshot --db-instance-identifier $RDS_INSTANCE --db-snapshot-identifier quckapp-${DATE}`
- Both modes optionally stream/copy to S3 via `--s3-bucket`
- Validates required tools are installed before running
- Includes retention tagging for RDS snapshots (`--tags Key=Retention,Value=30days`)

**Step 3: Make scripts executable and commit**

```bash
chmod +x database/quckapp-mysql/backup_restore/logical_backup.sh
chmod +x database/quckapp-mysql/backup_restore/physical_backup.sh
git add database/quckapp-mysql/backup_restore/logical_backup.sh database/quckapp-mysql/backup_restore/physical_backup.sh
git commit -m "feat(mysql): add logical and physical backup scripts"
```

---

### Task 5: Create backup/restore documentation

**Files:**
- Create: `database/quckapp-mysql/backup_restore/binlog_restore.md`
- Create: `database/quckapp-mysql/backup_restore/recovery_playbook.md`

**Step 1: Create binlog_restore.md**

Document covering:
- Point-in-time recovery using `mysqlbinlog` (self-hosted): identify position, extract events, apply
- RDS PITR: `aws rds restore-db-instance-to-point-in-time` with `--restore-time` parameter
- Example commands for both paths
- Prerequisites (binlog retention, binary log format = ROW)
- Common pitfalls (timezone handling, GTID consistency)

**Step 2: Create recovery_playbook.md**

Operational runbook covering:
- Full recovery from logical backup (restore from `.sql.gz`, verify row counts)
- Full recovery from physical backup (XtraBackup prepare + copy-back, RDS snapshot restore)
- Partial table restore (single table extraction from mysqldump, `--tables` flag)
- Cross-region failover (RDS read replica promotion, DNS cutover steps)
- Verification checklist after each recovery type
- Escalation contacts and communication templates

**Step 3: Commit**

```bash
git add database/quckapp-mysql/backup_restore/binlog_restore.md database/quckapp-mysql/backup_restore/recovery_playbook.md
git commit -m "docs(mysql): add binlog restore guide and recovery playbook"
```

---

### Task 6: Create performance tooling

**Files:**
- Create: `database/quckapp-mysql/performance/indexing_strategy.md`
- Create: `database/quckapp-mysql/performance/slow_query_analysis.sql`
- Create: `database/quckapp-mysql/performance/query_plans/.gitkeep`
- Create: `database/quckapp-mysql/performance/benchmark/.gitkeep`

**Step 1: Create indexing_strategy.md**

Document covering:
- General index design principles for InnoDB (clustered index, secondary index internals)
- Per-service index audit: list existing indexes from migration files, note any missing indexes on FK columns
- Composite index ordering rules (equality → range → sort)
- When NOT to index (low-cardinality ENUM columns, tables < 1000 rows)
- Covering index patterns for common query shapes (auth login, channel member lookup, workspace listing)
- Index maintenance: `ANALYZE TABLE` schedule, `OPTIMIZE TABLE` for fragmented tables

**Step 2: Create slow_query_analysis.sql**

SQL queries against `performance_schema` and `sys` schema:
- Top 10 queries by total execution time (`sys.statements_with_runtimes_in_95th_percentile`)
- Top 10 queries by rows examined (`events_statements_summary_by_digest`)
- Unused indexes (`sys.schema_unused_indexes`)
- Redundant indexes (`sys.schema_redundant_indexes`)
- Tables with full table scans (`sys.schema_tables_with_full_table_scans`)
- Lock wait analysis (`sys.innodb_lock_waits`)
- Temporary table usage (disk vs memory temp tables)

**Step 3: Create placeholder directories and commit**

```bash
touch database/quckapp-mysql/performance/query_plans/.gitkeep
touch database/quckapp-mysql/performance/benchmark/.gitkeep
git add database/quckapp-mysql/performance/
git commit -m "feat(mysql): add indexing strategy and slow query analysis tools"
```

---

### Task 7: Create monitoring queries and alert rules

**Files:**
- Create: `database/quckapp-mysql/monitoring/metrics.sql`
- Create: `database/quckapp-mysql/monitoring/replication_lag.sql`
- Create: `database/quckapp-mysql/monitoring/alerts/connection_alerts.yml`
- Create: `database/quckapp-mysql/monitoring/alerts/replication_alerts.yml`
- Create: `database/quckapp-mysql/monitoring/alerts/storage_alerts.yml`
- Create: `database/quckapp-mysql/monitoring/alerts/performance_alerts.yml`

**Step 1: Create metrics.sql**

SQL queries for operational dashboards:
- Active connections vs `max_connections` (percentage)
- InnoDB buffer pool hit ratio (`Innodb_buffer_pool_read_requests` vs `Innodb_buffer_pool_reads`)
- InnoDB row operations per second (reads, inserts, updates, deletes)
- Table sizes per database (data + index size in MB)
- Temporary tables created on disk vs in memory
- Query cache hit ratio (if applicable)
- Open table count vs `table_open_cache`
- Thread cache hit ratio

**Step 2: Create replication_lag.sql**

SQL queries for replica monitoring:
- `SHOW REPLICA STATUS` key fields (Seconds_Behind_Source, Replica_IO_Running, Replica_SQL_Running)
- GTID-based lag detection (`gtid_subtract()`)
- Per-channel replication lag (for multi-source replication)
- Replication error detection and diagnostic queries

**Step 3: Create alert rule files**

Prometheus alerting rules in YAML format:

`connection_alerts.yml`:
- `MySQLConnectionsExhausted`: connections > 80% of max, warning
- `MySQLConnectionsNearLimit`: connections > 95% of max, critical
- `MySQLAbortedConnections`: aborted connections rate > 5/min

`replication_alerts.yml`:
- `MySQLReplicationLagWarning`: lag > 5s
- `MySQLReplicationLagCritical`: lag > 30s
- `MySQLReplicationStopped`: IO or SQL thread not running

`storage_alerts.yml`:
- `MySQLDiskUsageWarning`: data directory > 75%
- `MySQLDiskUsageCritical`: data directory > 85%
- `MySQLBinlogDiskUsage`: binlog directory > 50GB

`performance_alerts.yml`:
- `MySQLSlowQueryRate`: slow queries > 10/min
- `MySQLBufferPoolHitRatio`: hit ratio < 99%
- `MySQLDeadlockRate`: deadlocks > 1/min
- `MySQLTempDiskTables`: disk temp tables > 20% of total

**Step 4: Commit**

```bash
git add database/quckapp-mysql/monitoring/
git commit -m "feat(mysql): add monitoring queries and Prometheus alert rules"
```

---

### Task 8: Create testing infrastructure

**Files:**
- Create: `database/quckapp-mysql/testing/integration/test_schema_integrity.sh`
- Create: `database/quckapp-mysql/testing/integration/test_column_types.sh`
- Create: `database/quckapp-mysql/testing/integration/test_cross_service.sh`
- Create: `database/quckapp-mysql/testing/data_validation/test_seed_data.sh`
- Create: `database/quckapp-mysql/testing/data_validation/test_migration_idempotency.sh`
- Create: `database/quckapp-mysql/testing/performance/test_concurrent_connections.sh`
- Create: `database/quckapp-mysql/testing/performance/test_query_throughput.sh`

**Step 1: Create integration test scripts**

`test_schema_integrity.sh`:
- Connects to each of the 10 databases
- Queries `information_schema.KEY_COLUMN_USAGE` to find all FK constraints
- Verifies each FK's referenced table and column exist
- Checks for orphaned rows (FK values with no matching parent)
- Reports pass/fail per database, exits 1 on any failure

`test_column_types.sh`:
- Defines expected column types for key tables (auth_users.id = CHAR(36), system_settings.id = BINARY(16), etc.)
- Queries `information_schema.COLUMNS` to validate actual types
- Reports mismatches

`test_cross_service.sh`:
- Verifies the shared `promotion_records` table exists in all databases where expected (via the V999 shared migration)
- Validates the `flyway_schema_history` table exists per service
- Checks `flyway_schema_history_shared` exists where applicable

**Step 2: Create data validation test scripts**

`test_seed_data.sh`:
- Runs after `seeds/01-create-databases.sql` and `seeds/02-seed-data.sql`
- Validates all 10+ databases exist
- Checks expected row counts in seed data tables
- Verifies character set is `utf8mb4` per database

`test_migration_idempotency.sh`:
- For each service, runs Flyway `migrate` twice
- Verifies no errors on second run
- Validates `flyway_schema_history` shows same version count
- Uses a fresh Docker MySQL instance (references `tools/docker-compose.yml`)

**Step 3: Create performance test scripts**

`test_concurrent_connections.sh`:
- Uses `sysbench` with `oltp_read_write` workload
- Scales connections: 10, 50, 100, 200
- Reports transactions/sec and latency percentiles (p50, p95, p99)
- Accepts `--duration` and `--table-size` flags

`test_query_throughput.sh`:
- Benchmarks critical queries: auth user lookup by email, channel member listing, workspace search
- Runs each query N times (default 1000), reports avg/p95/p99 latency
- Uses `mysql` CLI with `\timing` or `BENCHMARK()` function

**Step 4: Make scripts executable and commit**

```bash
chmod +x database/quckapp-mysql/testing/integration/*.sh
chmod +x database/quckapp-mysql/testing/data_validation/*.sh
chmod +x database/quckapp-mysql/testing/performance/*.sh
git add database/quckapp-mysql/testing/
git commit -m "feat(mysql): add integration, validation, and performance test suites"
```

---

### Task 9: Create data warehouse — staging views

**Files:**
- Create: `database/quckapp-mysql/data_warehouse/staging/stg_users.sql`
- Create: `database/quckapp-mysql/data_warehouse/staging/stg_sessions.sql`
- Create: `database/quckapp-mysql/data_warehouse/staging/stg_channels.sql`
- Create: `database/quckapp-mysql/data_warehouse/staging/stg_workspaces.sql`
- Create: `database/quckapp-mysql/data_warehouse/staging/stg_messages.sql`

**Step 1: Create a `quckapp_warehouse` database creation header**

Each staging file should start with `CREATE DATABASE IF NOT EXISTS quckapp_warehouse ...` (idempotent).

**Step 2: Create staging views**

`stg_users.sql`: View extracting from `quckapp_auth.auth_users` — id, email (hashed for privacy), created_at, updated_at, is_verified, two_factor_enabled. JOIN with `quckapp_user.users` for display_name, status.

`stg_sessions.sql`: View from `quckapp_auth.active_sessions` — session_id, user_id, created_at, expires_at, ip_address, user_agent. Include `login_history` for login method and success/failure.

`stg_channels.sql`: View from `quckapp_channel.channels` — id, workspace_id, name, type, created_by, created_at. JOIN with `channel_members` for member_count aggregate.

`stg_workspaces.sql`: View from `quckapp_workspace.workspaces` — id, name, owner_id, created_at. JOIN with `workspace_members` for member_count.

`stg_messages.sql`: View from `quckapp_thread.threads` and `thread_replies` — thread counts and reply counts per channel, per day. Aggregate only (no message content).

**Step 3: Commit**

```bash
git add database/quckapp-mysql/data_warehouse/staging/
git commit -m "feat(mysql): add data warehouse staging views"
```

---

### Task 10: Create data warehouse — Data Vault and marts

**Files:**
- Create: `database/quckapp-mysql/data_warehouse/data_vault/hubs.sql`
- Create: `database/quckapp-mysql/data_warehouse/data_vault/links.sql`
- Create: `database/quckapp-mysql/data_warehouse/data_vault/satellites.sql`
- Create: `database/quckapp-mysql/data_warehouse/marts/mart_daily_active_users.sql`
- Create: `database/quckapp-mysql/data_warehouse/marts/mart_feature_adoption.sql`
- Create: `database/quckapp-mysql/data_warehouse/marts/mart_retention_cohorts.sql`
- Create: `database/quckapp-mysql/data_warehouse/marts/mart_message_volume.sql`

**Step 1: Create Data Vault tables**

`hubs.sql`:
- `hub_users` (user_hk BINARY(16) PK, user_id CHAR(36), load_date TIMESTAMP, source VARCHAR(64))
- `hub_channels` (channel_hk BINARY(16) PK, channel_id CHAR(36), load_date, source)
- `hub_workspaces` (workspace_hk BINARY(16) PK, workspace_id CHAR(36), load_date, source)

`links.sql`:
- `link_user_channel` (user_channel_hk BINARY(16) PK, user_hk, channel_hk, load_date)
- `link_user_workspace` (user_workspace_hk BINARY(16) PK, user_hk, workspace_hk, load_date)

`satellites.sql`:
- `sat_user_activity` (user_hk, login_count INT, message_count INT, last_active TIMESTAMP, load_date)
- `sat_channel_metrics` (channel_hk, member_count INT, message_count INT, pin_count INT, load_date)
- `sat_workspace_metrics` (workspace_hk, member_count INT, channel_count INT, load_date)

Hash keys generated via `UNHEX(MD5(CONCAT(...)))`.

**Step 2: Create mart tables**

`mart_daily_active_users.sql`:
- Table: `mart_daily_active_users` (date DATE, workspace_id, dau INT, wau INT, mau INT)
- Populated from `stg_sessions` grouped by date and workspace
- Includes the aggregation query as a stored procedure `refresh_mart_dau()`

`mart_feature_adoption.sql`:
- Table: `mart_feature_adoption` (date, workspace_id, feature VARCHAR(64), usage_count INT, unique_users INT)
- Features: threads, channels_created, file_uploads, reactions (derived from available tables)

`mart_retention_cohorts.sql`:
- Table: `mart_retention_cohorts` (cohort_week DATE, weeks_since_signup INT, users_active INT, cohort_size INT, retention_rate DECIMAL(5,2))
- Populated from `stg_users` (signup date) cross-joined with `stg_sessions` (activity dates)

`mart_message_volume.sql`:
- Table: `mart_message_volume` (date, workspace_id, channel_id, thread_count INT, reply_count INT)
- Populated from `stg_messages`

**Step 3: Commit**

```bash
git add database/quckapp-mysql/data_warehouse/data_vault/ database/quckapp-mysql/data_warehouse/marts/
git commit -m "feat(mysql): add Data Vault tables and analytics marts"
```

---

### Task 11: Create documentation — ERD and lineage

**Files:**
- Create: `database/quckapp-mysql/docs/erd/auth-service.md`
- Create: `database/quckapp-mysql/docs/erd/admin-service.md`
- Create: `database/quckapp-mysql/docs/erd/cross-service.md`
- Create: `database/quckapp-mysql/docs/lineage/data-lineage.md`

**Step 1: Create ERD documents**

Each ERD file uses Mermaid `erDiagram` syntax showing tables, columns, and relationships for that service.

`auth-service.md`: All 31 auth tables with FK relationships (user_profiles → auth_users, user_roles → roles, etc.)

`admin-service.md`: All 10 admin tables (system_settings, feature_flags, service_url_configs, version_configs, etc.)

`cross-service.md`: Combined view showing cross-database relationships — e.g., user_id references from channel_members, workspace_members, thread_participants all pointing to auth_users.id.

**Step 2: Create data lineage document**

`data-lineage.md`:
- Table showing which service WRITES to which tables
- Which services READ from which databases (cross-database queries, if any)
- Data flow from OLTP → staging → data vault → marts
- Mermaid flowchart diagram of the lineage

**Step 3: Commit**

```bash
git add database/quckapp-mysql/docs/erd/ database/quckapp-mysql/docs/lineage/
git commit -m "docs(mysql): add ERD diagrams and data lineage maps"
```

---

### Task 12: Create documentation — compliance and runbooks

**Files:**
- Create: `database/quckapp-mysql/docs/compliance/pii-inventory.md`
- Create: `database/quckapp-mysql/docs/compliance/retention-policies.md`
- Create: `database/quckapp-mysql/docs/compliance/gdpr-deletion.md`
- Create: `database/quckapp-mysql/docs/runbooks/failover.md`
- Create: `database/quckapp-mysql/docs/runbooks/scaling.md`
- Create: `database/quckapp-mysql/docs/runbooks/migration-troubleshooting.md`
- Create: `database/quckapp-mysql/docs/runbooks/emergency-maintenance.md`

**Step 1: Create compliance documents**

`pii-inventory.md`:
- Table of all 26 PII-containing tables with column names, data classification (email=PII, password_hash=SECRET, token=CREDENTIAL), and owning service

`retention-policies.md`:
- Per-table retention rules (audit_logs: 13 months, sessions: 90 days, OTPs: 24 hours, etc.)
- Partition-based retention for audit tables
- Event-based cleanup for expired tokens

`gdpr-deletion.md`:
- Step-by-step procedure for Right to Erasure (Article 17)
- Tables requiring deletion per user_id across all 10 databases
- Order of operations (delete dependents before parents, respect FK constraints)
- Verification queries to confirm complete deletion

**Step 2: Create runbook documents**

`failover.md`:
- RDS Multi-AZ failover procedure (automatic + manual trigger)
- Self-hosted failover with GTID-based replica promotion
- DNS/connection string update checklist
- Post-failover verification steps

`scaling.md`:
- Vertical scaling (RDS instance class change, downtime window)
- Read replica addition for read-heavy workloads
- Connection pooling configuration (ProxySQL / RDS Proxy)
- Table partitioning for large tables (audit_logs, login_history)

`migration-troubleshooting.md`:
- Common Flyway errors and fixes (checksum mismatch, out-of-order, failed migration)
- `flyway repair` usage guide
- Manual `flyway_schema_history` correction (last resort)
- Lock timeout during DDL on large tables

`emergency-maintenance.md`:
- Emergency read-only mode (`SET GLOBAL read_only = ON`)
- Kill long-running queries procedure
- Emergency disk space reclamation
- Communication templates for incident response

**Step 3: Commit**

```bash
git add database/quckapp-mysql/docs/compliance/ database/quckapp-mysql/docs/runbooks/
git commit -m "docs(mysql): add compliance documentation and operational runbooks"
```

---

### Task 13: Final commit — update parent repo submodule

**Step 1: Verify all files exist**

```bash
find database/quckapp-mysql/auditing database/quckapp-mysql/backup_restore database/quckapp-mysql/performance database/quckapp-mysql/testing database/quckapp-mysql/monitoring database/quckapp-mysql/data_warehouse database/quckapp-mysql/docs -type f | wc -l
```

Expected: ~40 files.

**Step 2: Verify directory structure matches design**

```bash
tree database/quckapp-mysql/ --dirsfirst -I 'node_modules|.git'
```

Verify all 7 new directories are present with their files.

**Step 3: No submodule update needed**

`database/quckapp-mysql/` is part of the main repo (not a submodule), so commits are already in the parent repo.
