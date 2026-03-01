# QuckApp Kafka Enterprise Infrastructure Design

## Context

The `database/quckapp-kafka/` submodule manages 16 Kafka topics across 6 domains (auth, user, message, channel, workspace, notification, audit, analytics), 5 consumer groups, and 2 event schemas (14 topics lack schemas). It uses Confluent cp-kafka 7.5.0, has broker config for a 3-node cluster, Docker/K8s deployment, and CI/CD on both GitHub Actions and Azure Pipelines. This phase adds 9 new directories covering enterprise concerns: missing event schemas, schema registry/evolution, security, monitoring, performance tuning, disaster recovery, Kafka Connect/Streams patterns, compliance, and documentation.

## Existing State

- **Submodule**: `database/quckapp-kafka` on `master` branch
- **16 topics**: auth (3), user (2), message (4), channel (2), workspace (1), notification (2), audit (1), analytics (1)
- **2 event schemas**: `message-sent.json`, `user-registered.json` — 14 topics have no schema
- **5 consumer groups**: notification-service, audit-service, analytics-service, search-indexer, realtime-broadcaster
- **Broker config**: `server.properties` (3-node cluster, `unclean.leader.election.enable=false`, `min.insync.replicas=2`)
- **Local dev**: `tools/docker-compose.yml` (Zookeeper + Kafka + Kafka-UI)
- **CI/CD**: GitHub Actions + Azure Pipelines (shellcheck, schema validation, dry-run topic creation)
- **Empty dirs to remove**: `permissions/`, `roles/`, `scripts/`, `schema/` (with empty SQL subdirs)

## Decisions

- **Missing schemas**: Complete all 14 missing event schemas using existing JSON Schema Draft-07 envelope pattern
- **Schema registry**: Document Confluent Schema Registry integration, compatibility modes, evolution rules
- **Security**: Kafka SASL/SCRAM authentication, SSL/TLS encryption, per-topic ACLs per service
- **Monitoring**: JMX metrics via Prometheus kafka_exporter, Grafana dashboards, consumer lag alerting
- **Performance**: Producer tuning (acks, compression, batching), consumer tuning (fetch sizes), broker tuning
- **Disaster recovery**: MirrorMaker 2 for cross-DC replication, topic backup/restore procedures
- **Connect/Streams**: Kafka Connect sink connectors (Elasticsearch, S3), Kafka Streams topology patterns
- **Compliance**: GDPR via topic compaction for PII deletion, retention policy enforcement, audit trail
- **Security consolidation**: Remove empty `permissions/`, `roles/`, `scripts/`, `schema/` dirs

## Directory Structure

```
quckapp-kafka/
├── (keep) CLAUDE.md, README.md, Dockerfile, docker-entrypoint.sh
├── (keep) services/topics/, services/schemas/, services/consumer-groups/, services/config/
├── (keep) shared/promotion-gate/, environments/, tools/, k8s/, seeds/

├── schemas/
│   ├── auth/
│   │   ├── user-login.json
│   │   └── password-reset.json
│   ├── user/
│   │   ├── profile-updated.json
│   │   └── status-changed.json
│   ├── message/
│   │   ├── message-edited.json
│   │   ├── message-deleted.json
│   │   └── message-reaction.json
│   ├── channel/
│   │   ├── channel-created.json
│   │   └── channel-member-added.json
│   ├── workspace/
│   │   └── workspace-created.json
│   ├── notification/
│   │   ├── notification-push.json
│   │   └── notification-email.json
│   ├── audit/
│   │   └── audit-event.json
│   └── analytics/
│       └── analytics-event.json
│
├── schema-registry/
│   ├── registry-config.md
│   ├── compatibility-rules.md
│   ├── evolution-guide.md
│   └── docker-compose.schema-registry.yml
│
├── security/
│   ├── sasl/
│   │   └── sasl-config.md
│   ├── tls/
│   │   └── tls-config.md
│   ├── acls/
│   │   ├── service-acls.sh
│   │   └── acl-reference.md
│   └── encryption/
│       └── encryption-at-rest.md
│
├── monitoring/
│   ├── prometheus/
│   │   ├── kafka-exporter.yml
│   │   └── recording-rules.yml
│   ├── grafana/
│   │   └── dashboard.json
│   ├── alerts/
│   │   ├── broker-alerts.yml
│   │   └── consumer-lag-alerts.yml
│   └── consumer-lag/
│       └── lag-monitoring.md
│
├── performance/
│   ├── producer-tuning.md
│   ├── consumer-tuning.md
│   ├── broker-tuning.md
│   └── compression.md
│
├── disaster-recovery/
│   ├── mirrormaker2/
│   │   └── mm2-config.md
│   ├── scripts/
│   │   ├── backup-topics.sh
│   │   └── restore-topics.sh
│   └── disaster-recovery.md
│
├── connect/
│   ├── connectors/
│   │   ├── elasticsearch-sink.json
│   │   ├── s3-sink.json
│   │   └── jdbc-source.json
│   ├── docker-compose.connect.yml
│   └── connect-guide.md
│
├── compliance/
│   ├── gdpr/
│   │   └── pii-deletion.md
│   ├── data-retention/
│   │   └── retention-policies.md
│   └── audit/
│       └── audit-config.md
│
├── documentation/
│   ├── architecture.md
│   ├── runbooks/
│   │   ├── scaling.md
│   │   ├── rebalancing.md
│   │   └── disaster-recovery.md
│   └── best-practices.md
│
├── permissions/    ← REMOVE
├── roles/          ← REMOVE
├── scripts/        ← REMOVE
└── schema/         ← REMOVE (with empty SQL subdirs)
```

## File Count

~50 new files across 9 new directories, plus cleanup of 4 empty directories.
