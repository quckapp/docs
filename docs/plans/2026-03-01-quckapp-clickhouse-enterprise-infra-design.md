# QuckApp ClickHouse Enterprise Infrastructure Design

## Context

The `database/quckapp-clickhouse/` submodule manages ClickHouse analytics tables for the QuckApp platform. It contains 5 MergeTree tables (message_events, user_activity, search_events, api_metrics, file_events), 2 SummingMergeTree materialized views (daily_message_counts, daily_active_users), monthly partitioning, and TTL-based retention (30–365 days). ClickHouse is cloud-hosted (ClickHouse Cloud) across 4 environments. This phase adds 9 new directories covering enterprise concerns: cluster/architecture documentation, query optimization, security, monitoring, backup/restore, performance tuning, data pipelines (Kafka integration), compliance, and documentation.

## Existing State

- **Submodule**: `database/quckapp-clickhouse` on `master` branch
- **Database**: `quckapp_analytics`
- **5 tables**: message_events (365d TTL), user_activity (180d), search_events (90d), api_metrics (30d), file_events (365d)
- **2 materialized views**: daily_message_counts (SummingMergeTree), daily_active_users (SummingMergeTree)
- **Partitioning**: All tables use monthly (toYYYYMM)
- **Engine**: MergeTree (tables), SummingMergeTree (materialized views)
- **Hosting**: ClickHouse Cloud (port 9440 native TLS)
- **Local dev**: `tools/docker-compose.yml` (clickhouse-server:24, ports 8123/9000)
- **CI/CD**: GitHub Actions + Azure Pipelines (SQL validation, dry-run, manual deploy)
- **Credentials**: AWS Secrets Manager (GitHub), Azure Key Vault (Azure)
- **Seeds**: `services/analytics/02-seed-data.sql` (dev data for all 5 tables)
- **Empty dirs to remove**: `permissions/`, `roles/`, `scripts/`, `schema/` (with empty SQL subdirs)

## Decisions

- **Cluster architecture**: Document ClickHouse Cloud topology, shard/replica concepts, even though infrastructure is managed
- **Query optimization**: Add projections for common query patterns, additional materialized views, skip indices
- **Security**: ClickHouse RBAC (users, roles, row policies, quotas), network restrictions
- **Monitoring**: system.metrics/query_log queries, Prometheus clickhouse-exporter, Grafana dashboards
- **Backup**: ClickHouse Cloud backup features, BACKUP/RESTORE commands, S3 export
- **Performance**: Compression codecs, buffer tables for high-throughput ingestion, MergeTree tuning
- **Data pipelines**: Kafka engine tables for direct Kafka consumption, materialized views for ETL
- **Compliance**: GDPR via ALTER TABLE DELETE, TTL-based retention, audit logging
- **Security consolidation**: Remove empty `permissions/`, `roles/`, `scripts/`, `schema/` dirs

## Directory Structure

```
quckapp-clickhouse/
├── (keep) CLAUDE.md, README.md, Dockerfile, docker-entrypoint.sh
├── (keep) services/analytics/, shared/promotion-gate/
├── (keep) environments/, tools/, k8s/

├── cluster/
│   ├── architecture.md
│   ├── sharding-strategy.md
│   ├── replication.md
│   └── cloud-config.md
│
├── query-optimization/
│   ├── projections.sql
│   ├── materialized-views.sql
│   ├── skip-indices.sql
│   └── query-patterns.md
│
├── security/
│   ├── rbac/
│   │   ├── users.sql
│   │   └── roles.sql
│   ├── row-policies/
│   │   └── workspace-isolation.sql
│   ├── quotas/
│   │   └── resource-quotas.sql
│   └── network/
│       └── network-security.md
│
├── monitoring/
│   ├── prometheus/
│   │   ├── clickhouse-exporter.yml
│   │   └── recording-rules.yml
│   ├── grafana/
│   │   └── dashboard.json
│   ├── alerts/
│   │   ├── cluster-alerts.yml
│   │   └── query-alerts.yml
│   └── system-queries/
│       └── diagnostic-queries.md
│
├── backup/
│   ├── backup-config.md
│   ├── scripts/
│   │   ├── backup-tables.sh
│   │   └── restore-tables.sh
│   └── disaster-recovery.md
│
├── performance/
│   ├── compression.md
│   ├── merge-tree-tuning.md
│   ├── buffer-tables.md
│   └── ingestion-optimization.md
│
├── data-pipelines/
│   ├── kafka-engine/
│   │   ├── kafka-tables.sql
│   │   └── kafka-materialized-views.sql
│   ├── s3-export/
│   │   └── s3-export-config.md
│   └── pipeline-architecture.md
│
├── compliance/
│   ├── gdpr/
│   │   └── data-deletion.md
│   ├── data-retention/
│   │   └── ttl-policies.md
│   └── audit/
│       └── query-audit.md
│
├── documentation/
│   ├── architecture.md
│   ├── runbooks/
│   │   ├── scaling.md
│   │   ├── migration.md
│   │   └── disaster-recovery.md
│   └── best-practices.md
│
├── permissions/    ← REMOVE
├── roles/          ← REMOVE
├── scripts/        ← REMOVE
└── schema/         ← REMOVE (with empty subdirs)
```

## File Count

~42 new files across 9 new directories, plus cleanup of 4 empty directories.
