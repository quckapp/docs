# QuckApp MongoDB Enterprise Infrastructure Design

## Context

The `database/quckapp-mongodb/` submodule has basic structure: 11 service migrations (backend-gateway, attachment, file, media, reminder, message, presence, call, huddle, notification-orchestrator, event-broadcast), shared promotion gate, environments, tools, and k8s configs. This phase adds 14 new directories covering the full enterprise MongoDB stack: infrastructure, cluster management, schema governance, sharding, replication, security, auditing, performance, observability, automation, compliance, multi-tenant, and documentation.

## Existing State

- **Submodule**: `database/quckapp-mongodb` on `master` branch
- **11 services**: backend-gateway (NestJS/Mongoose, 34 schemas), 4 Go services (attachment, file, media, reminder), 6 Elixir services (message, presence, call, huddle, notification-orchestrator, event-broadcast)
- **Collections**: users, messages, conversations, channels, workspaces, workspace_members, channel_members, files, calls, huddles, sessions, audit_logs, presence, reminders, notifications, events, attachments, media, reactions
- **TTL indexes**: 24h (presence), 7d (events), 30d (messages/files/huddles), 90d (notifications/reminders), 365d (calls)
- **Empty dirs to remove**: `permissions/`, `roles/`, `schema/` (with empty subdirs tables/, functions/, views/, triggers/), `scripts/`

## Decisions

- **Services**: Use QuckApp's existing 11 MongoDB services and their collections
- **Sharding**: Zone-based sharding with workspace_id as primary shard key for most collections, user_id for auth collections
- **HA stack**: MongoDB replica set (PSA: Primary-Secondary-Arbiter) with mongos query routers for sharded deployment
- **Infrastructure**: Include both infrastructure/ (Terraform, K8s, networking) and cluster-management/
- **Security consolidation**: Remove empty `permissions/`, `roles/`, `schema/`, `scripts/` dirs; `security/` becomes canonical
- **Schema governance**: MongoDB JSON Schema validation rules per domain area
- **Auditing**: MongoDB native audit log + change stream-based audit triggers + immutable capped collection
- **Encryption**: Client-Side Field Level Encryption (CSFLE) for PII fields

## Directory Structure

```
quckapp-mongodb/
├── (keep) CLAUDE.md, README.md, Dockerfile, docker-entrypoint.sh
├── (keep) services/*, shared/promotion-gate/
├── (keep) environments/, tools/, k8s/
│
├── infrastructure/
│   ├── terraform/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── kubernetes/
│   │   ├── mongodb-operator.yml
│   │   ├── replicaset-crd.yml
│   │   └── backup-schedule.yml
│   └── networking/
│       ├── mongod.conf
│       └── network_policies.yml
│
├── cluster-management/
│   ├── replica-set/
│   │   ├── rs_initiate.js
│   │   └── rs_config.js
│   ├── config-servers/
│   │   └── config_rs.js
│   ├── mongos/
│   │   └── mongos.conf
│   └── failover/
│       └── automatic_failover.md
│
├── schema-governance/
│   ├── validation/
│   │   ├── messaging_validation.js
│   │   ├── collaboration_validation.js
│   │   ├── realtime_validation.js
│   │   ├── system_validation.js
│   │   └── validation_runner.js
│   ├── indexes/
│   │   ├── compound_indexes.js
│   │   ├── text_indexes.js
│   │   ├── ttl_indexes.js
│   │   └── wildcard_indexes.js
│   └── migrations/
│       ├── schema_versioning.js
│       └── backward_compat.md
│
├── sharding/
│   ├── shard_keys/
│   │   ├── shard_key_analysis.js
│   │   └── shard_key_definitions.js
│   ├── zones/
│   │   ├── zone_config.js
│   │   └── zone_ranges.js
│   ├── balancer/
│   │   ├── balancer_config.js
│   │   └── chunk_management.js
│   └── topology/
│       └── shard_map.md
│
├── replication/
│   ├── oplog/
│   │   ├── oplog_sizing.js
│   │   └── oplog_monitoring.js
│   ├── read_preference.js
│   ├── write_concern.js
│   └── change_streams.js
│
├── security/
│   ├── authentication/
│   │   ├── scram_users.js
│   │   └── x509_config.md
│   ├── authorization/
│   │   ├── custom_roles.js
│   │   └── role_assignments.js
│   ├── encryption/
│   │   ├── tls_config.conf
│   │   ├── encryption_at_rest.md
│   │   └── field_level_encryption.js
│   ├── network/
│   │   └── ip_whitelist.js
│   └── audit/
│       └── audit_filter.json
│
├── auditing/
│   ├── audit_log_config.conf
│   ├── immutable_audit.js
│   └── change_stream_triggers.js
│
├── performance/
│   ├── indexes/
│   │   ├── index_advisor.js
│   │   └── covered_queries.js
│   ├── aggregation/
│   │   ├── pipeline_optimization.md
│   │   └── sample_pipelines.js
│   ├── profiling/
│   │   ├── profiler_config.js
│   │   └── slow_query_analysis.js
│   └── capacity/
│       ├── wiredtiger_tuning.conf
│       └── storage_forecast.js
│
├── observability/
│   ├── prometheus/
│   │   ├── mongodb_exporter.yml
│   │   └── recording_rules.yml
│   ├── grafana/
│   │   └── dashboard.json
│   ├── queries/
│   │   ├── server_status.js
│   │   ├── current_op.js
│   │   ├── connection_pool.js
│   │   └── replication_status.js
│   └── alerts/
│       ├── connection_alerts.yml
│       ├── replication_alerts.yml
│       ├── storage_alerts.yml
│       └── performance_alerts.yml
│
├── automation/
│   ├── backup/
│   │   ├── mongodump_backup.sh
│   │   ├── oplog_backup.sh
│   │   └── pitr_restore.md
│   ├── maintenance/
│   │   ├── compact_schedule.js
│   │   └── reindex_schedule.js
│   └── scripts/
│       ├── health_check.sh
│       └── rs_stepdown.sh
│
├── compliance/
│   ├── audit/
│   │   ├── audit_policy.json
│   │   └── immutable_ledger.js
│   ├── gdpr/
│   │   └── right_to_be_forgotten.js
│   ├── pci/
│   │   └── field_encryption_pci.js
│   └── access_review/
│       └── quarterly_access_audit.js
│
├── multi-tenant/
│   ├── tenant_isolation.js
│   ├── connection_pooling.js
│   └── data_lifecycle.js
│
├── documentation/
│   ├── architecture.md
│   ├── runbooks/
│   │   ├── failover.md
│   │   ├── scaling.md
│   │   └── disaster_recovery.md
│   └── collection_catalog/
│       └── collection_schemas.md
│
├── permissions/    ← REMOVE
├── roles/          ← REMOVE
├── schema/         ← REMOVE (empty tables/, functions/, views/, triggers/)
└── scripts/        ← REMOVE
```

## File Count

~80 new files across 14 new directories, plus cleanup of 4 empty directories.
