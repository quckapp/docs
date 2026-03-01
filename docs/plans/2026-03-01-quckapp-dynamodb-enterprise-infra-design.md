# QuckApp DynamoDB Enterprise Infrastructure Design

## Context

The `database/quckapp-dynamodb/` submodule already has a solid Terraform foundation: 6 tables (media-metadata, user-sessions, notifications, export-jobs, rate-limiting, conversations) with GSIs, autoscaling, KMS encryption, PITR, TTL, and DynamoDB Streams. This phase adds 9 new directories covering enterprise concerns: single-table design documentation, per-service IAM policies, CloudWatch monitoring, backup automation, security hardening, DynamoDB Streams event processing, compliance, multi-environment tfvars, and documentation.

## Existing State

- **Submodule**: `database/quckapp-dynamodb` on `master` branch
- **6 tables**: media-metadata, user-sessions, notifications, export-jobs, rate-limiting, conversations
- **Terraform**: `services/terraform/` with main.tf, variables.tf, outputs.tf, autoscaling.tf, versions.tf
- **Local dev**: `services/local/create-tables.sh`, `tools/docker-compose.yml`
- **CI/CD**: GitHub Actions + Azure Pipelines already configured
- **Empty dirs to remove**: `permissions/`, `roles/`, `schema/` (with empty subdirs), `scripts/`

## Decisions

- **Single-table design**: Document access patterns first, then PK/SK/GSI design — QuckApp uses 6 separate tables (not single-table), but access pattern documentation still applies
- **IAM**: Per-service IAM policies with least privilege — each QuckApp service gets only the tables it needs
- **Monitoring**: CloudWatch alarms via Terraform + Grafana dashboard JSON
- **Backup**: PITR already enabled in Terraform; add on-demand backup scripts and S3 export
- **Security consolidation**: Remove empty `permissions/`, `roles/`, `schema/`, `scripts/` dirs; `security/` becomes canonical
- **Streams**: Lambda trigger patterns for CDC, audit, and cross-service events
- **Compliance**: GDPR item-level deletion, audit trail via Streams, data retention policies

## Directory Structure

```
quckapp-dynamodb/
├── (keep) CLAUDE.md, README.md, Dockerfile, docker-entrypoint.sh
├── (keep) services/terraform/, services/local/
├── (keep) shared/promotion-gate/, environments/, tools/, k8s/
│
├── single-table-design/
│   ├── access-patterns.md
│   ├── pk-sk-patterns.md
│   ├── gsi-design.md
│   └── capacity-planning.md
│
├── iam/
│   ├── media-service-policy.json
│   ├── session-service-policy.json
│   ├── notification-service-policy.json
│   ├── export-service-policy.json
│   ├── rate-limiting-policy.json
│   ├── conversation-service-policy.json
│   └── readonly-policy.json
│
├── monitoring/
│   ├── terraform/
│   │   ├── cloudwatch-alarms.tf
│   │   ├── cloudwatch-dashboard.tf
│   │   └── variables.tf
│   ├── grafana/
│   │   └── dashboard.json
│   └── alerts/
│       ├── throttling-alerts.yml
│       └── capacity-alerts.yml
│
├── backup/
│   ├── terraform/
│   │   └── backup-plan.tf
│   ├── scripts/
│   │   ├── on-demand-backup.sh
│   │   ├── s3-export.sh
│   │   └── restore-table.sh
│   └── pitr-restore.md
│
├── security/
│   ├── kms/
│   │   └── kms-key.tf
│   ├── vpc-endpoint/
│   │   └── dynamodb-endpoint.tf
│   ├── encryption/
│   │   └── encryption-at-rest.md
│   └── fine-grained-access/
│       └── condition-keys.md
│
├── streams/
│   ├── terraform/
│   │   └── lambda-triggers.tf
│   ├── handlers/
│   │   ├── audit-handler.js
│   │   ├── notification-handler.js
│   │   └── sync-handler.js
│   └── patterns/
│       └── cdc-patterns.md
│
├── compliance/
│   ├── gdpr/
│   │   └── item-deletion.js
│   ├── audit/
│   │   └── audit-trail.md
│   ├── data-retention/
│   │   └── ttl-policies.md
│   └── access-review/
│       └── quarterly-audit.js
│
├── environments/
│   └── terraform/
│       ├── dev.tfvars
│       ├── staging.tfvars
│       └── production.tfvars
│
├── documentation/
│   ├── architecture.md
│   ├── runbooks/
│   │   ├── scaling.md
│   │   ├── throttling.md
│   │   └── disaster-recovery.md
│   └── best-practices.md
│
├── permissions/    ← REMOVE
├── roles/          ← REMOVE
├── schema/         ← REMOVE
└── scripts/        ← REMOVE
```

## File Count

~45 new files across 9 new directories, plus cleanup of 4 empty directories.
