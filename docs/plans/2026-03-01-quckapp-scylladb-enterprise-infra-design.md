# QuckApp ScyllaDB Enterprise Infrastructure Design

## Context

The `database/quckapp-scylladb/` submodule manages ScyllaDB tables for the go-bff service (high-throughput chat message storage). It contains 8 tables (messages, message_reactions, read_receipts, delivery_receipts, starred_messages, pinned_messages, scheduled_messages, messages_by_sender) in the `quckapp` keyspace with NetworkTopologyStrategy (3 replicas). ScyllaDB uses TimeWindowCompactionStrategy on the messages table and default STCS on others. This phase adds 9 new directories covering enterprise concerns: data modeling docs, cluster management, security, monitoring, backup/restore, performance tuning, operations, compliance, and documentation.

## Existing State

- **Submodule**: `database/quckapp-scylladb` on `master` branch
- **Keyspace**: `quckapp` with NetworkTopologyStrategy, `datacenter1: 3`
- **8 tables**: messages (TWCS), message_reactions, read_receipts, delivery_receipts, starred_messages, pinned_messages, scheduled_messages, messages_by_sender
- **Service**: go-bff (Go backend-for-frontend, handles chat messaging)
- **Local dev**: `tools/docker-compose.yml` (3-node ScyllaDB cluster, ports 9042/9180)
- **CI/CD**: GitHub Actions + Azure Pipelines (ScyllaDB 5.4 for validation)
- **Migrations**: Versioned CQL files (`V{NNN}__{description}.cql`)
- **Empty dirs to remove**: `permissions/`, `roles/`, `scripts/`, `schema/` (with empty SQL subdirs)

## Decisions

- **Data modeling**: Document access patterns, partition sizing, denormalization rationale for all 8 tables
- **Cluster management**: Multi-DC topology, snitch configuration, token ranges, rack awareness
- **Security**: ScyllaDB authentication (PasswordAuthenticator), role-based authorization, TLS
- **Monitoring**: ScyllaDB native Prometheus metrics (port 9180), Grafana dashboards, alerting
- **Backup**: Nodetool snapshot, sstableloader restore, scheduled backup automation
- **Performance**: Compaction strategy tuning, repair procedures, cache configuration, driver tuning
- **Operations**: Nodetool reference, node operations (bootstrap, decommission, replace), streaming
- **Compliance**: GDPR via DELETE statements, TTL-based retention, audit logging
- **Security consolidation**: Remove empty `permissions/`, `roles/`, `scripts/`, `schema/` dirs

## Directory Structure

```
quckapp-scylladb/
├── (keep) CLAUDE.md, README.md, Dockerfile, docker-entrypoint.sh
├── (keep) services/go-bff/, shared/promotion-gate/
├── (keep) environments/, tools/, k8s/

├── data-modeling/
│   ├── access-patterns.md
│   ├── partition-design.md
│   ├── denormalization.md
│   └── capacity-planning.md
│
├── cluster/
│   ├── topology.md
│   ├── snitch-config.md
│   ├── multi-dc.md
│   └── rack-awareness.md
│
├── security/
│   ├── authentication/
│   │   └── auth-config.md
│   ├── authorization/
│   │   ├── roles.cql
│   │   └── permissions.cql
│   ├── tls/
│   │   └── tls-config.md
│   └── network/
│       └── network-security.md
│
├── monitoring/
│   ├── prometheus/
│   │   ├── scylla-targets.yml
│   │   └── recording-rules.yml
│   ├── grafana/
│   │   └── dashboard.json
│   └── alerts/
│       ├── cluster-alerts.yml
│       └── table-alerts.yml
│
├── backup/
│   ├── backup-config.md
│   ├── scripts/
│   │   ├── snapshot-backup.sh
│   │   └── restore-snapshot.sh
│   └── disaster-recovery.md
│
├── performance/
│   ├── compaction-tuning.md
│   ├── repair-procedures.md
│   ├── cache-tuning.md
│   └── driver-tuning.md
│
├── operations/
│   ├── nodetool-reference.md
│   ├── node-operations.md
│   ├── streaming.md
│   └── maintenance-windows.md
│
├── compliance/
│   ├── gdpr/
│   │   └── data-deletion.md
│   ├── data-retention/
│   │   └── ttl-policies.md
│   └── audit/
│       └── audit-config.md
│
├── documentation/
│   ├── architecture.md
│   ├── runbooks/
│   │   ├── scaling.md
│   │   ├── repair.md
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
