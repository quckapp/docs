# QuckApp PostgreSQL Enterprise Infrastructure Design

## Context

The `database/quckapp-postgresql/` submodule has basic structure: 2 service migrations (go-bff, realtime-service), core schema with 7 domain schemas, seeds, environments, tools, and k8s configs. This phase adds 13 new directories covering the full enterprise PostgreSQL stack: infrastructure, cluster management, domain schemas, migrations, extensions, partitioning, sharding (Citus), replication, security, auditing, performance, warehouse, observability, automation, compliance, and documentation.

## Existing State

- **Submodule**: `database/quckapp-postgresql` on `master` branch
- **Databases**: `quckapp_realtime`, `quckapp_go_bff`
- **7 schemas**: auth, users, workspaces, messaging, files, notifications, admin
- **Core tables**: users, media, conversations, messages, notifications, user_devices, audit_logs (public schema), plus messaging.conversations, participants, user_settings, blocked_users, call_records, call_participants
- **Extensions**: uuid-ossp, pgcrypto, pg_trgm
- **Empty dirs to remove**: `permissions/`, `roles/`, `schema/` (with empty subdirs tables/, functions/, views/, triggers/)

## Decisions

- **Schemas**: Use QuckApp's existing 7 domain schemas (auth, users, workspaces, messaging, files, notifications, admin)
- **Sharding**: Citus-specific SQL (create_distributed_table, reference tables, shard rebalancing)
- **HA stack**: Full enterprise — Patroni + PgBouncer + PgPool
- **Infrastructure**: Include both infrastructure/ (Terraform, K8s, networking) and cluster-management/
- **Security consolidation**: Remove empty `permissions/`, `roles/`, `schema/` dirs; `security/` becomes canonical
- **RLS**: Native PostgreSQL Row-Level Security (not views-based like MySQL)
- **Partitioning**: Native declarative — RANGE for time-series, HASH for tenants
- **Auditing**: pgAudit extension + immutable event store + triggers

## Directory Structure

```
quckapp-postgresql/
├── (keep) CLAUDE.md, README.md, Dockerfile, docker-entrypoint.sh
├── (keep) services/go-bff/, services/realtime-service/
├── (keep) shared/core-schema/, shared/promotion-gate/
├── (keep) seeds/, environments/, tools/, k8s/
│
├── infrastructure/
│   ├── terraform/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── kubernetes/
│   │   ├── postgres-operator.yml
│   │   ├── cluster-crd.yml
│   │   └── backup-schedule.yml
│   └── networking/
│       ├── pg_hba.conf
│       ├── ssl_config.md
│       └── network_policies.yml
│
├── cluster-management/
│   ├── patroni/
│   │   ├── patroni.yml
│   │   └── etcd_config.yml
│   ├── pgbouncer/
│   │   ├── pgbouncer.ini
│   │   └── pooler_rules.sql
│   ├── pgpool/
│   │   ├── pgpool.conf
│   │   └── pool_hba.conf
│   └── failover/
│       └── automatic_failover.md
│
├── schemas/
│   ├── auth/tables.sql
│   ├── users/tables.sql
│   ├── workspaces/tables.sql
│   ├── messaging/tables.sql
│   ├── files/tables.sql
│   ├── notifications/tables.sql
│   ├── admin/tables.sql
│   └── shared/common_types.sql
│
├── migrations/
│   ├── online_changes/
│   │   ├── expand_contract_pattern.sql
│   │   └── concurrent_index.sql
│   └── rollback/
│       └── rollback_patterns.md
│
├── extensions/
│   ├── required_extensions.sql
│   ├── citus_setup.sql
│   └── pgaudit_setup.sql
│
├── partitioning/
│   ├── range/
│   │   ├── messages_by_month.sql
│   │   └── audit_logs_by_day.sql
│   ├── hash/
│   │   └── tenant_hash_partition.sql
│   └── maintenance/
│       └── auto_partition_rotation.sql
│
├── sharding/
│   ├── citus/
│   │   ├── distributed_tables.sql
│   │   ├── reference_tables.sql
│   │   └── shard_rebalance.sql
│   ├── tenant_distribution.sql
│   └── shard_map.sql
│
├── replication/
│   ├── streaming/
│   │   ├── primary.conf
│   │   └── replica.conf
│   ├── logical/
│   │   ├── publisher.sql
│   │   └── subscriber.sql
│   └── monitoring/
│       └── replication_lag.sql
│
├── security/
│   ├── roles/
│   │   ├── role_matrix.sql
│   │   └── service_roles.sql
│   ├── rls/
│   │   └── tenant_isolation.sql
│   ├── encryption/
│   │   ├── ssl.conf
│   │   └── pgcrypto.sql
│   ├── secrets/
│   │   └── vault_integration.md
│   └── policies/
│       └── least_privilege.md
│
├── auditing/
│   ├── pgaudit.conf
│   ├── immutable_event_store.sql
│   └── audit_triggers.sql
│
├── performance/
│   ├── indexing/
│   │   ├── btree.sql
│   │   ├── gin_jsonb.sql
│   │   └── partial_indexes.sql
│   ├── query_plans/
│   │   └── explain_analyze_samples.sql
│   ├── vacuum/
│   │   └── autovacuum_tuning.conf
│   └── capacity/
│       └── storage_forecast.sql
│
├── warehouse/
│   ├── staging/
│   │   └── stg_views.sql
│   ├── materialized_views/
│   │   └── analytics_views.sql
│   └── fdw/
│       └── foreign_data_wrapper.sql
│
├── observability/
│   ├── pg_stat_statements.sql
│   ├── long_running_queries.sql
│   ├── blocking_sessions.sql
│   ├── wal_monitoring.sql
│   └── alerts/
│       ├── connection_alerts.yml
│       ├── replication_alerts.yml
│       ├── storage_alerts.yml
│       └── performance_alerts.yml
│
├── automation/
│   ├── backup/
│   │   ├── pg_basebackup.sh
│   │   ├── pg_dump_logical.sh
│   │   └── pitr_restore.md
│   ├── maintenance/
│   │   ├── vacuum_schedule.sql
│   │   └── reindex_schedule.sql
│   └── scripts/
│       └── health_check.sh
│
├── compliance/
│   ├── audit/
│   │   ├── pgaudit_policy.conf
│   │   └── immutable_ledger.sql
│   ├── gdpr/
│   │   └── right_to_be_forgotten.sql
│   ├── pci/
│   │   └── card_tokenization.sql
│   └── access_review/
│       └── quarterly_access_audit.sql
│
├── documentation/
│   ├── architecture.md
│   ├── runbooks/
│   │   ├── failover.md
│   │   ├── scaling.md
│   │   └── disaster_recovery.md
│   └── erd/
│       └── schema_diagrams.md
│
├── permissions/    ← REMOVE
├── roles/          ← REMOVE
└── schema/         ← REMOVE (empty tables/, functions/, views/, triggers/)
```

## File Count

~65 new files across 13 new directories, plus cleanup of 3 empty directories.
