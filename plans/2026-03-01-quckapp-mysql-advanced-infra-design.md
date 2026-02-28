# QuckApp MySQL Advanced Infrastructure Design

## Context

The `database/quckapp-mysql/` directory now has operational tooling (auditing, backup, performance, testing, monitoring, data warehouse, docs). This phase adds 4 more directories covering multi-tenant archival, replication, sharding, and security — plus consolidating the empty `permissions/` and `roles/` directories into the new `security/` directory.

## Decisions

- **Tenant archival:** Workspace-based archival with configurable retention per tier (free/pro/enterprise)
- **Replication:** All three topologies (primary-replica, multi-source, group replication) get full configs and SQL scripts
- **Security consolidation:** Remove empty `permissions/` and `roles/` dirs; `security/` becomes the canonical location
- **Sharding:** Workspace-id as primary shard key for most tables, user-id for auth tables

## Directory Structure

```
quckapp-mysql/
├── tenant_based/
│   └── archive_strategy.sql         — Tenant-based archival procedures, scheduled events
│
├── replication/
│   ├── primary_replica/             — Async/semi-sync replication setup configs
│   ├── multi_source/                — Multi-source replication per-channel configs
│   ├── group_replication/           — InnoDB Group Replication bootstrap/member scripts
│   └── failover_strategy.md         — Failover decision matrix across all topologies
│
├── sharding/
│   ├── shard_map.sql                — Shard key definitions, shard-to-database mapping
│   ├── routing_logic.sql            — Shard routing functions, consistent hashing
│   └── rebalance_plan.md            — Zero-downtime rebalancing runbook
│
├── security/
│   ├── users.sql                    — MySQL user account definitions per environment
│   ├── roles.sql                    — MySQL 8.0 role definitions and privileges
│   ├── grants.sql                   — GRANT statements per service user per database
│   ├── row_level_security_patterns.md — RLS via views + session variables
│   ├── masking/                     — Dynamic data masking for non-prod environments
│   └── encryption/                  — TDE and column-level encryption config
│
├── permissions/                     — REMOVE (consolidated into security/)
└── roles/                           — REMOVE (consolidated into security/)
```

## Tenant-Based Archival Detail

### archive_strategy.sql

Stored procedures for workspace-based data lifecycle management:
- `archive_tenant_data(workspace_id, cutoff_date)` — moves rows older than cutoff to `_archived` suffix tables
- `purge_archived_data(workspace_id, retention_days)` — permanently deletes from archive tables
- `get_archive_policy(workspace_id)` — returns retention config based on workspace tier

Target tables for archival:
- `quckapp_auth.active_sessions` (90 days free, 1 year pro)
- `quckapp_auth.login_history` (90 days free, 1 year pro)
- `quckapp_auth.audit_logs` (13 months all tiers)
- `quckapp_thread.threads` / `thread_replies` (1 year free, indefinite pro)
- `quckapp_channel.channel_pins` (1 year free, indefinite pro)

Scheduled MySQL event for nightly automated archival.

## Replication Detail

### primary_replica/

- `primary.cnf` — `server-id`, `log-bin`, `binlog-format=ROW`, `gtid_mode=ON`, `enforce-gtid-consistency=ON`, `rpl_semi_sync_source_enabled=1`
- `replica.cnf` — `server-id`, `relay-log`, `read_only=ON`, `super_read_only=ON`, semi-sync replica plugin
- `setup_replication.sql` — `CHANGE REPLICATION SOURCE TO` with GTID auto-positioning
- `verify_replication.sql` — health check queries

### multi_source/

- `channel_config.sql` — per-channel `CHANGE REPLICATION SOURCE` for multiple primaries
- `filter_rules.sql` — `CHANGE REPLICATION FILTER` per channel (database-level filtering)
- `conflict_resolution.md` — strategies for handling write conflicts across sources

### group_replication/

- `bootstrap.sql` — first member bootstrap with `group_replication_bootstrap_group=ON`
- `member_join.sql` — joining an existing group
- `group_config.cnf` — `group_replication_group_name`, `group_replication_single_primary_mode=ON`, communication ports
- `consistency_levels.md` — BEFORE/AFTER/BEFORE_AND_AFTER consistency explained

## Sharding Detail

### shard_map.sql

- `shard_config` table — shard_id, host, port, database_name, status, weight
- `shard_key_map` table — table_name, shard_key_column, shard_algorithm
- Shard assignments: workspace_id for channel/thread/workspace tables, user_id for auth tables
- `get_shard(shard_key_value)` function using consistent hashing

### routing_logic.sql

- `compute_shard_id(key, total_shards)` — consistent hash ring implementation
- `route_query(table_name, key_value)` — returns target shard connection info
- Cross-shard query patterns with FEDERATED engine or application-level fan-out

## Security Detail

### users.sql

MySQL user accounts per environment:
- `quckapp_app` — application user (INSERT/SELECT/UPDATE/DELETE on service tables)
- `quckapp_readonly` — read-only for monitoring/analytics
- `quckapp_migration` — DDL privileges for Flyway
- `quckapp_backup` — SELECT/LOCK/RELOAD for backup scripts
- `quckapp_monitor` — PROCESS/REPLICATION CLIENT for monitoring
- `quckapp_audit` — INSERT/SELECT only on audit_log tables

### roles.sql

MySQL 8.0 roles with `CREATE ROLE` and privilege assignments.

### grants.sql

Per-service GRANT statements following principle of least privilege.

### masking/

- `masking_functions.sql` — UDFs for masking email (`j***@example.com`), phone (`***-***-1234`), tokens (first 4 chars)
- `masked_views.sql` — views over PII tables exposing masked columns for dev/QA environments

### encryption/

- `tde_setup.sql` — Tablespace encryption for PII-heavy databases
- `column_encryption.md` — `AES_ENCRYPT`/`AES_DECRYPT` patterns with keyring integration
- `keyring_config.cnf` — `keyring_file` or `keyring_aws_kms` plugin configuration
