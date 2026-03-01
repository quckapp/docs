# QuckApp Elasticsearch Enterprise Infrastructure Design

## Context

The `database/quckapp-elasticsearch/` submodule manages Elasticsearch 8.11.0 indices for two services: search-service (full-text search across messages, channels, files, users) and audit-service (time-based audit log indices). This phase adds 9 new directories covering enterprise concerns: cluster management, index lifecycle, security, search optimization, monitoring, snapshot/backup, performance tuning, compliance, and documentation.

## Existing State

- **Submodule**: `database/quckapp-elasticsearch` on `master` branch
- **4 search indices**: quckapp-messages (custom message_analyzer), quckapp-channels, quckapp-files, quckapp-users
- **1 index template**: audit-log-template (matches `quckapp-audit-*`)
- **1 ILM policy**: audit-log-ilm (hot→warm→delete at 30d/90d)
- **Custom analyzer**: message_analyzer (standard tokenizer + lowercase, stop, snowball)
- **Local dev**: `tools/docker-compose.yml`, `tools/migrate.sh`
- **Seeds**: `seeds/01-seed-data.json` (ndjson bulk format)
- **CI/CD**: GitHub Actions + Azure Pipelines
- **Empty dirs to remove**: `permissions/`, `roles/`, `schema/`, `scripts/`

## Decisions

- **Cluster**: Document multi-node topology (3 master-eligible, 2+ data, 1 coordinating) for production
- **Index lifecycle**: Add ILM policies for search indices, not just audit logs
- **Security**: Elasticsearch native security (RBAC, TLS, API keys, field-level security)
- **Search optimization**: Synonym lists, custom analyzers per locale, query templates
- **Monitoring**: Prometheus elasticsearch_exporter + Grafana dashboards + alerting rules
- **Snapshots**: S3 snapshot repository, automated snapshot policies, restore procedures
- **Performance**: JVM tuning, shard sizing guidelines, bulk indexing config
- **Compliance**: GDPR deletion via delete-by-query, data retention via ILM
- **Security consolidation**: Remove empty `permissions/`, `roles/`, `schema/`, `scripts/` dirs

## Directory Structure

```
quckapp-elasticsearch/
├── (keep) CLAUDE.md, README.md, Dockerfile, docker-entrypoint.sh
├── (keep) services/indices/, services/templates/, services/policies/
├── (keep) seeds/, tools/, environments/, k8s/
├── (keep) shared/promotion-gate/
│
├── cluster/
│   ├── topology.md
│   ├── node-roles.yml
│   ├── discovery-config.yml
│   └── allocation-rules.yml
│
├── index-lifecycle/
│   ├── search-ilm-policy.json
│   ├── messages-rollover-template.json
│   ├── reindex-script.sh
│   └── index-patterns.md
│
├── security/
│   ├── tls/
│   │   └── tls-config.md
│   ├── rbac/
│   │   ├── roles.json
│   │   └── role-mappings.json
│   ├── api-keys/
│   │   └── api-key-management.md
│   └── field-security/
│       └── field-level-security.json
│
├── search/
│   ├── analyzers/
│   │   ├── custom-analyzers.json
│   │   └── synonyms.txt
│   ├── queries/
│   │   ├── message-search.json
│   │   ├── user-search.json
│   │   └── multi-index-search.json
│   └── relevance/
│       └── relevance-tuning.md
│
├── monitoring/
│   ├── prometheus/
│   │   ├── elasticsearch-exporter.yml
│   │   └── recording-rules.yml
│   ├── grafana/
│   │   └── dashboard.json
│   ├── kibana/
│   │   └── cluster-dashboard.ndjson
│   └── alerts/
│       ├── cluster-alerts.yml
│       └── index-alerts.yml
│
├── snapshots/
│   ├── repository-config.json
│   ├── snapshot-policy.json
│   ├── scripts/
│   │   ├── create-snapshot.sh
│   │   └── restore-snapshot.sh
│   └── disaster-recovery.md
│
├── performance/
│   ├── jvm-options.md
│   ├── shard-sizing.md
│   ├── bulk-indexing.md
│   └── circuit-breakers.md
│
├── compliance/
│   ├── gdpr/
│   │   └── delete-by-query.js
│   ├── data-retention/
│   │   └── retention-policies.md
│   └── audit/
│       └── audit-config.md
│
├── documentation/
│   ├── architecture.md
│   ├── runbooks/
│   │   ├── scaling.md
│   │   ├── reindexing.md
│   │   └── disaster-recovery.md
│   └── best-practices.md
│
├── permissions/    ← REMOVE
├── roles/          ← REMOVE
├── schema/         ← REMOVE
└── scripts/        ← REMOVE
```

## File Count

~40 new files across 9 new directories, plus cleanup of 4 empty directories.
