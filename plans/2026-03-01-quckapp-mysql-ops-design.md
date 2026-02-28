# QuckApp MySQL Operational Infrastructure Design

## Context

The `database/quckapp-mysql/` directory has Flyway migrations for 10 services, seed scripts, tooling, and environment configs. It lacks operational infrastructure — auditing, backup/restore, performance tooling, testing, monitoring, data warehousing, and documentation.

This design adds 7 new top-level directories covering those concerns.

## Decisions

- **Audit scope:** All 10 MySQL services (auth, admin, audit, permission, security, user, channel, thread, workspace, notification)
- **Audit isolation:** Each service database gets its own `audit_log` table (no cross-database writes)
- **Backup strategy:** Both RDS (managed) and self-hosted (Percona XtraBackup / mysqldump) patterns
- **Data warehouse focus:** User analytics & engagement (DAU/MAU, feature adoption, retention)
- **Testing scope:** Full suite — schema validation, migration safety, seed verification, performance benchmarks
- **Test runner:** Shell scripts using `mysql` CLI client

## Directory Structure

```
quckapp-mysql/
├── auditing/
│   ├── audit_triggers.sql         — AFTER INSERT/UPDATE/DELETE triggers, all 10 services
│   ├── immutable_logs.sql         — Append-only audit_log tables, monthly partitioning
│   └── mysql_audit_plugin.conf    — MySQL Enterprise Audit plugin configuration
│
├── backup_restore/
│   ├── logical_backup.sh          — mysqldump per-database (local/dev)
│   ├── physical_backup.sh         — Percona XtraBackup + RDS snapshot API
│   ├── binlog_restore.md          — Point-in-time recovery (self-hosted + RDS PITR)
│   └── recovery_playbook.md       — Step-by-step full/partial recovery runbook
│
├── performance/
│   ├── indexing_strategy.md       — Index design principles per service
│   ├── slow_query_analysis.sql    — performance_schema / sys schema queries
│   ├── query_plans/               — Saved EXPLAIN ANALYZE for critical queries
│   └── benchmark/                 — sysbench configs and custom benchmark scripts
│
├── testing/
│   ├── integration/               — FK integrity, column types, cross-service consistency
│   ├── performance/               — Concurrent connections, query throughput under load
│   └── data_validation/           — Seed verification, migration idempotency, rollback safety
│
├── monitoring/
│   ├── metrics.sql                — Connection count, buffer pool, InnoDB ops, table sizes
│   ├── replication_lag.sql        — Replica lag monitoring, Seconds_Behind_Source alerts
│   └── alerts/                    — Prometheus/Grafana alert rules
│
├── data_warehouse/
│   ├── staging/                   — Raw extraction views from auth, channel, workspace
│   ├── data_vault/                — Hub/link/satellite tables (Data Vault 2.0)
│   └── marts/                     — DAU, feature adoption, retention cohorts, message volume
│
└── docs/
    ├── erd/                       — Mermaid ERD diagrams per service + combined view
    ├── lineage/                   — Data lineage maps (writers → tables → consumers)
    ├── compliance/                — PII inventory, retention policies, GDPR deletion
    └── runbooks/                  — Failover, scaling, migration troubleshooting
```

## Auditing Detail

### audit_triggers.sql

Generates `AFTER INSERT`, `AFTER UPDATE`, `AFTER DELETE` triggers for every table across all 10 service databases. Each trigger writes to a per-database `audit_log` table.

Trigger naming: `trg_{table}_after_{insert|update|delete}`

Captured fields:
- `table_name`, `operation` (INSERT/UPDATE/DELETE)
- `row_id` (primary key value)
- `old_values` (JSON, NULL for INSERT)
- `new_values` (JSON, NULL for DELETE)
- `changed_by` (from `@current_user` session variable)
- `changed_at` (CURRENT_TIMESTAMP)

### immutable_logs.sql

Creates the `audit_log` table per database:
- `BINARY(16)` UUID primary key
- Monthly `RANGE` partitioning on `changed_at`
- No UPDATE/DELETE grants — append-only enforced at permission level
- Retention: 13 months of partitions, with `ALTER TABLE DROP PARTITION` for rotation

## Backup/Restore Detail

### logical_backup.sh

- Iterates all 10 `quckapp_*` databases
- `mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF`
- Compresses with `gzip`, timestamps output files
- Uploads to S3 bucket (configurable via env var)

### physical_backup.sh

- **Self-hosted path:** Percona XtraBackup full + incremental, streaming to S3
- **RDS path:** `aws rds create-db-snapshot`, `aws rds create-db-cluster-snapshot`
- Retention tagging for lifecycle policies

## Data Warehouse Detail

### Staging

Raw views extracting from OLTP tables:
- `stg_users` — from `quckapp_auth.auth_users`
- `stg_sessions` — from `quckapp_auth.user_sessions`
- `stg_channels` — from `quckapp_channel.channels`
- `stg_workspaces` — from `quckapp_workspace.workspaces`
- `stg_messages` — message counts from channel/thread metadata

### Data Vault (Hub/Link/Satellite)

- `hub_users` (user_hk, user_id, load_date, source)
- `hub_channels` (channel_hk, channel_id, load_date, source)
- `link_user_channel` (user_channel_hk, user_hk, channel_hk, load_date)
- `sat_user_activity` (user_hk, login_count, message_count, last_active, load_date)
- `sat_channel_metrics` (channel_hk, member_count, message_count, load_date)

### Marts

- `mart_daily_active_users` — DAU/WAU/MAU by workspace
- `mart_feature_adoption` — feature usage rates (calls, threads, reactions, files)
- `mart_retention_cohorts` — weekly/monthly retention by signup cohort
- `mart_message_volume` — messages per channel/workspace per day

## Testing Detail

### integration/

- `test_schema_integrity.sh` — validates all FK constraints resolve, no orphaned references
- `test_column_types.sh` — checks column types match expected definitions across services
- `test_cross_service.sh` — verifies shared tables (promotion_records) exist in all databases

### data_validation/

- `test_seed_data.sh` — runs seeds, validates expected row counts and key data
- `test_migration_idempotency.sh` — applies each migration twice, verifies no errors
- `test_rollback_safety.sh` — tests that migrations can be reversed cleanly

### performance/

- `test_concurrent_connections.sh` — sysbench OLTP read/write with scaling connections
- `test_query_throughput.sh` — benchmark critical queries under concurrent load

## Monitoring Detail

### metrics.sql

Key queries:
- Active connections vs `max_connections`
- InnoDB buffer pool hit ratio
- Row operations (reads, inserts, updates, deletes) per second
- Table and index sizes per database
- Temporary table usage (disk vs memory)

### replication_lag.sql

- `SHOW REPLICA STATUS` parsed for `Seconds_Behind_Source`
- GTID-based lag detection
- Alert thresholds: warning at 5s, critical at 30s

### alerts/

Prometheus alerting rules:
- `MySQLConnectionsExhausted` — connections > 80% of max
- `MySQLReplicationLag` — lag > 30s
- `MySQLDiskUsage` — data dir > 85%
- `MySQLSlowQueries` — slow query rate > 10/min
