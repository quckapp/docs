# QuckApp DynamoDB Enterprise Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ~45 enterprise infrastructure files across 9 new directories to the `database/quckapp-dynamodb/` submodule, covering access pattern documentation, per-service IAM policies, CloudWatch monitoring, backup automation, security hardening, DynamoDB Streams event processing, compliance, multi-environment tfvars, and documentation. Also remove 4 empty legacy directories.

**Architecture:** AWS-native DynamoDB enterprise infrastructure. 6 existing tables (media-metadata, user-sessions, notifications, export-jobs, rate-limiting, conversations) already have Terraform with GSIs, autoscaling, KMS encryption, PITR, TTL, and DynamoDB Streams. This plan adds the operational layer: IAM least-privilege, CloudWatch alarms, backup scripts, VPC endpoints, Lambda stream handlers, GDPR compliance, and per-environment configuration.

**Tech Stack:** Terraform (HCL), AWS CloudWatch, AWS IAM, AWS Lambda (Node.js), AWS Backup, shell scripts (bash), YAML (Grafana/alerts), Markdown (documentation)

---

### Task 1: Single-Table Design Documentation

**Files:**
- Create: `database/quckapp-dynamodb/single-table-design/access-patterns.md`
- Create: `database/quckapp-dynamodb/single-table-design/pk-sk-patterns.md`
- Create: `database/quckapp-dynamodb/single-table-design/gsi-design.md`
- Create: `database/quckapp-dynamodb/single-table-design/capacity-planning.md`

**Context:** QuckApp uses 6 separate DynamoDB tables (not single-table design), but access pattern documentation is critical for understanding the data model. The existing tables are:

| Table | HK | RK | GSIs |
|-------|----|----|------|
| media-metadata | media_id (S) | upload_timestamp (N) | user-index, conversation-index, media-type-index, status-index |
| user-sessions | session_id (S) | — | user-sessions-index, device-sessions-index |
| notifications | user_id (S) | notification_id (S) | unread-index + LSI: created-at-index |
| export-jobs | job_id (S) | — | user-jobs-index, status-index |
| rate-limiting | rate_key (S) | window_start (N) | none |
| conversations | conversation_id (S) | — | participant-index |

**access-patterns.md** — Document all access patterns for each table. Include columns: Access Pattern, Table, Key Condition, Index Used, Frequency. Cover at least 6 patterns per table (e.g., "Get media by ID", "List user's uploads", "Find unread notifications", "Check rate limit window", etc.).

**pk-sk-patterns.md** — Document partition key and sort key design rationale for each table. Explain why media_metadata uses composite key (media_id + upload_timestamp), why notifications use user_id + notification_id for user-scoped queries, why rate_limiting uses rate_key + window_start for sliding windows.

**gsi-design.md** — Document all 11 GSIs and 1 LSI across the 6 tables. Include: GSI name, base table, hash key, range key, projection type, use case. Explain design trade-offs (ALL projection vs KEYS_ONLY).

**capacity-planning.md** — Document capacity planning guidance. Include: table size estimation formulas, item size calculations per table, read/write capacity estimation based on QuckApp user counts (1K, 10K, 100K users), autoscaling thresholds (currently 70% target utilization), PAY_PER_REQUEST vs PROVISIONED decision matrix, hot partition detection.

**Commit:** `feat(single-table-design): add access pattern and capacity planning docs`

---

### Task 2: IAM Policies Per Service

**Files:**
- Create: `database/quckapp-dynamodb/iam/media-service-policy.json`
- Create: `database/quckapp-dynamodb/iam/session-service-policy.json`
- Create: `database/quckapp-dynamodb/iam/notification-service-policy.json`
- Create: `database/quckapp-dynamodb/iam/export-service-policy.json`
- Create: `database/quckapp-dynamodb/iam/rate-limiting-policy.json`
- Create: `database/quckapp-dynamodb/iam/conversation-service-policy.json`
- Create: `database/quckapp-dynamodb/iam/readonly-policy.json`

**Context:** Each QuckApp microservice should have a least-privilege IAM policy granting access only to the DynamoDB tables it needs. Table names follow the pattern `quckapp-{table-name}-{environment}` and table ARNs use `arn:aws:dynamodb:${Region}:${AccountId}:table/quckapp-{table-name}-${Environment}`.

**Per-service policies (6 files):**
Each policy JSON follows AWS IAM policy format with:
- `Version: "2012-10-17"`
- Statements granting specific DynamoDB actions (GetItem, PutItem, UpdateItem, DeleteItem, Query, Scan, BatchGetItem, BatchWriteItem) to specific table ARNs
- Separate statement for index access (`table/*/index/*`)
- Use `${Region}`, `${AccountId}`, `${Environment}` as substitution variables
- Actions scoped to what each service actually needs:
  - **media-service**: Full CRUD on media-metadata table + all 4 GSIs
  - **session-service**: Full CRUD on user-sessions table + 2 GSIs, read-only on rate-limiting
  - **notification-service**: Full CRUD on notifications table + GSI + LSI
  - **export-service**: Full CRUD on export-jobs table + 2 GSIs, read-only on all other tables (for data export)
  - **rate-limiting**: Full CRUD on rate-limiting table only (no GSIs needed)
  - **conversation-service**: Full CRUD on conversations table + participant GSI

**readonly-policy.json:** Read-only access (GetItem, Query, Scan, BatchGetItem, DescribeTable) to all 6 tables and all indexes. For monitoring dashboards and admin read access.

**Commit:** `feat(iam): add per-service least-privilege IAM policies`

---

### Task 3: Monitoring + Observability

**Files:**
- Create: `database/quckapp-dynamodb/monitoring/terraform/cloudwatch-alarms.tf`
- Create: `database/quckapp-dynamodb/monitoring/terraform/cloudwatch-dashboard.tf`
- Create: `database/quckapp-dynamodb/monitoring/terraform/variables.tf`
- Create: `database/quckapp-dynamodb/monitoring/grafana/dashboard.json`
- Create: `database/quckapp-dynamodb/monitoring/alerts/throttling-alerts.yml`
- Create: `database/quckapp-dynamodb/monitoring/alerts/capacity-alerts.yml`

**cloudwatch-alarms.tf** — Terraform resources for CloudWatch alarms covering all 6 tables:
- `ReadThrottleEvents > 0` for 1 minute (per table)
- `WriteThrottleEvents > 0` for 1 minute (per table)
- `SystemErrors > 0` for 5 minutes (per table)
- `UserErrors > 50` for 5 minutes (per table)
- `ConsumedReadCapacityUnits > 80%` of provisioned (for PROVISIONED tables)
- `ConsumedWriteCapacityUnits > 80%` of provisioned (for PROVISIONED tables)
- `SuccessfulRequestLatency > 20ms` average for 5 minutes
- SNS topic for alarm notifications
- Use `for_each` over a local map of table names to avoid repetition

**cloudwatch-dashboard.tf** — Terraform `aws_cloudwatch_dashboard` resource with JSON body containing:
- 4 rows: Capacity & Throughput, Latency, Errors & Throttling, Stream Metrics
- Widgets for all 6 tables using `AWS/DynamoDB` namespace
- Metrics: ConsumedReadCapacityUnits, ConsumedWriteCapacityUnits, ReadThrottleEvents, WriteThrottleEvents, SuccessfulRequestLatency, SystemErrors

**variables.tf** — Variables for alarm thresholds, SNS topic ARN, environment, table names, enable/disable flags.

**grafana/dashboard.json** — Grafana dashboard JSON using CloudWatch data source:
- 4 rows matching CloudWatch dashboard layout
- Panels: capacity utilization (gauge), throughput (time series), latency p50/p99 (time series), throttle events (bar chart), error rates (stat)
- Template variables for environment and table name

**throttling-alerts.yml** — Prometheus alerting rules (for CloudWatch exporter) with alerts:
- `DynamoDBReadThrottled` — read throttle events > 0 for 2m
- `DynamoDBWriteThrottled` — write throttle events > 0 for 2m
- `DynamoDBHighLatency` — p99 latency > 50ms for 5m
- Labels: severity, table, environment

**capacity-alerts.yml** — Prometheus alerting rules:
- `DynamoDBCapacityWarning` — consumed capacity > 70% for 10m
- `DynamoDBCapacityCritical` — consumed capacity > 90% for 5m
- `DynamoDBAutoScalingMaxReached` — provisioned capacity at max for 15m

**Commit:** `feat(monitoring): add CloudWatch alarms, dashboard, and Grafana observability`

---

### Task 4: Backup + Data Lifecycle

**Files:**
- Create: `database/quckapp-dynamodb/backup/terraform/backup-plan.tf`
- Create: `database/quckapp-dynamodb/backup/scripts/on-demand-backup.sh`
- Create: `database/quckapp-dynamodb/backup/scripts/s3-export.sh`
- Create: `database/quckapp-dynamodb/backup/scripts/restore-table.sh`
- Create: `database/quckapp-dynamodb/backup/pitr-restore.md`

**backup-plan.tf** — Terraform resources for AWS Backup:
- `aws_backup_vault` — dedicated vault with KMS encryption
- `aws_backup_plan` — daily backups with 35-day retention, weekly with 90-day, monthly with 365-day
- `aws_backup_selection` — select all 6 DynamoDB tables by tag
- `aws_iam_role` + `aws_iam_role_policy_attachment` for backup service role
- Variables for retention periods, schedule expressions, vault name

**on-demand-backup.sh** — Shell script for creating on-demand DynamoDB backups:
- Accept table name and environment as arguments
- Use `aws dynamodb create-backup` with timestamp-based backup name
- Wait for backup completion with `aws dynamodb describe-backup`
- List recent backups with `aws dynamodb list-backups`
- Error handling and usage message

**s3-export.sh** — Shell script for DynamoDB table export to S3:
- Use `aws dynamodb export-table-to-point-in-time`
- Accept table ARN, S3 bucket, export format (DYNAMODB_JSON or ION) as arguments
- Support incremental exports with time range
- Monitor export status

**restore-table.sh** — Shell script for restoring from backup:
- Accept backup ARN and target table name
- Use `aws dynamodb restore-table-from-backup`
- Support PITR restore via `aws dynamodb restore-table-to-point-in-time`
- Wait for table to become ACTIVE
- Warning prompts before restore

**pitr-restore.md** — Documentation for Point-in-Time Recovery:
- How PITR works (already enabled in main.tf)
- Step-by-step restore procedure
- Restore to same or different table
- Post-restore checklist (re-enable streams, update IAM, verify GSIs)
- Recovery time expectations by table size

**Commit:** `feat(backup): add AWS Backup plan, backup/restore scripts, and PITR docs`

---

### Task 5: Security + Encryption

**Files:**
- Create: `database/quckapp-dynamodb/security/kms/kms-key.tf`
- Create: `database/quckapp-dynamodb/security/vpc-endpoint/dynamodb-endpoint.tf`
- Create: `database/quckapp-dynamodb/security/encryption/encryption-at-rest.md`
- Create: `database/quckapp-dynamodb/security/fine-grained-access/condition-keys.md`

**kms-key.tf** — Terraform for dedicated KMS key:
- `aws_kms_key` with description, rotation enabled, deletion window 30 days
- `aws_kms_alias` with alias `alias/quckapp-dynamodb-${environment}`
- Key policy granting:
  - Root account full access
  - DynamoDB service principal `dynamodb.amazonaws.com` for encrypt/decrypt
  - Backup service for vault operations
- Output the key ARN for use in main.tf's `kms_key_arn` variable

**dynamodb-endpoint.tf** — Terraform for VPC Gateway Endpoint:
- `aws_vpc_endpoint` of type "Gateway" for `com.amazonaws.${region}.dynamodb`
- Route table associations
- VPC endpoint policy restricting access to QuckApp tables only (Resource ARN pattern)
- Variables for VPC ID, route table IDs, region

**encryption-at-rest.md** — Documentation covering:
- AWS-owned keys vs customer-managed KMS keys (current setup uses customer KMS)
- Key rotation (automatic annual rotation)
- Encryption scope (all data at rest including table data, LSIs, GSIs, streams, backups)
- Cross-region replication encryption considerations
- Compliance mapping (SOC2, HIPAA, PCI-DSS)

**condition-keys.md** — Documentation for DynamoDB fine-grained access control:
- IAM condition keys: `dynamodb:LeadingKeys`, `dynamodb:Attributes`, `dynamodb:Select`
- Example policies for row-level security (restrict by partition key value)
- Example: user can only access their own sessions (`dynamodb:LeadingKeys` = `${aws:userid}`)
- Attribute-level restrictions (hide PII columns from certain roles)

**Commit:** `feat(security): add KMS key, VPC endpoint, and security documentation`

---

### Task 6: DynamoDB Streams + Events

**Files:**
- Create: `database/quckapp-dynamodb/streams/terraform/lambda-triggers.tf`
- Create: `database/quckapp-dynamodb/streams/handlers/audit-handler.js`
- Create: `database/quckapp-dynamodb/streams/handlers/notification-handler.js`
- Create: `database/quckapp-dynamodb/streams/handlers/sync-handler.js`
- Create: `database/quckapp-dynamodb/streams/patterns/cdc-patterns.md`

**lambda-triggers.tf** — Terraform for Lambda stream consumers:
- `aws_lambda_function` resources for 3 handlers (audit, notification, sync)
- `aws_lambda_event_source_mapping` connecting each Lambda to the appropriate DynamoDB stream
- `aws_iam_role` + `aws_iam_policy` for Lambda execution (DynamoDB Streams read, CloudWatch Logs write)
- `aws_cloudwatch_log_group` for each Lambda with 14-day retention
- Lambda configuration: Node.js 20.x runtime, 256MB memory, 30s timeout
- Batch size 100, maximum batching window 5 seconds, bisect on error, retry 3 times
- DLQ (SQS) for failed records
- Variables for enabling/disabling each handler

**audit-handler.js** — Lambda function for audit trail:
- Process DynamoDB Stream events (INSERT, MODIFY, REMOVE)
- Extract old/new images from `NEW_AND_OLD_IMAGES` stream view
- Write audit records to CloudWatch Logs in structured JSON format
- Include: table name, event type, timestamp, changed attributes (diff), user context
- Handle batch processing with partial failure reporting (use `batchItemFailures` response)

**notification-handler.js** — Lambda function for cross-service notifications:
- Listen to notifications table stream
- On INSERT: publish to SNS topic for real-time delivery
- On MODIFY (is_read changed): update unread count in cache
- Include error handling and DLQ routing for undeliverable events

**sync-handler.js** — Lambda function for cross-table synchronization:
- Listen to conversations table stream
- On MODIFY (participant added/removed): sync to related tables
- On REMOVE: cascade cleanup to related media-metadata entries
- Idempotent processing using event ID deduplication

**cdc-patterns.md** — Documentation for Change Data Capture patterns:
- DynamoDB Streams overview (24-hour retention, at-least-once delivery)
- Stream view types and when to use each
- Lambda trigger patterns (fan-out, aggregation, materialized views)
- Error handling: DLQ, bisect-on-error, retry strategies
- Ordering guarantees (per-partition ordering within a shard)
- Cross-region replication via Global Tables vs Streams

**Commit:** `feat(streams): add Lambda stream handlers and CDC patterns`

---

### Task 7: Compliance + GDPR

**Files:**
- Create: `database/quckapp-dynamodb/compliance/gdpr/item-deletion.js`
- Create: `database/quckapp-dynamodb/compliance/audit/audit-trail.md`
- Create: `database/quckapp-dynamodb/compliance/data-retention/ttl-policies.md`
- Create: `database/quckapp-dynamodb/compliance/access-review/quarterly-audit.js`

**item-deletion.js** — GDPR Right-to-be-Forgotten script:
- Accept user_id as argument
- Scan all 6 tables for items belonging to the user:
  - media-metadata: Query user-index GSI by user_id
  - user-sessions: Query user-sessions-index GSI by user_id
  - notifications: Query by user_id (hash key)
  - export-jobs: Query user-jobs-index GSI by user_id
  - rate-limiting: Scan with filter on rate_key containing user_id
  - conversations: Query participant-index GSI by participant_id
- Delete all found items using BatchWriteItem (25-item batches)
- Log deletion counts per table
- Generate compliance report (JSON) with timestamps and item counts
- Dry-run mode (--dry-run flag)

**audit-trail.md** — Documentation for DynamoDB audit trail:
- How DynamoDB Streams provides audit capability (combined with audit-handler Lambda)
- CloudTrail integration for API-level auditing (CreateTable, DeleteTable, UpdateTable)
- Data-level audit via Streams (item-level changes)
- Audit log retention requirements (streams: 24h, CloudWatch: configurable, S3 archival)
- Compliance mapping: SOX (7 years), GDPR (erasure proof), HIPAA (6 years)

**ttl-policies.md** — Documentation for TTL-based data retention:
- Current TTL setup: all tables use `expires_at` attribute
- Recommended TTL values by table:
  - user-sessions: 24 hours (active session timeout)
  - rate-limiting: 1 hour (sliding window expiry)
  - notifications: 90 days
  - export-jobs: 30 days (after completion)
  - media-metadata: no TTL (permanent until explicit delete)
  - conversations: no TTL (permanent)
- How TTL works (background deletion, no RCU/WCU cost, eventual)
- TTL + Streams for archival before deletion
- Setting TTL values in application code

**quarterly-audit.js** — Automated quarterly access audit script:
- List all IAM roles/users with DynamoDB access via `aws iam` commands
- Compare actual permissions against per-service policy baselines (from iam/ directory)
- Detect overprivileged access (permissions beyond what the policy allows)
- Check for unused tables (no read/write activity via CloudWatch metrics)
- Generate HTML report with findings, recommendations, and compliance status
- Exit code indicates pass (0) or findings (1) for CI integration

**Commit:** `feat(compliance): add GDPR deletion, audit trail, TTL policies, and quarterly audit`

---

### Task 8: Multi-Environment Tfvars

**Files:**
- Create: `database/quckapp-dynamodb/environments/terraform/dev.tfvars`
- Create: `database/quckapp-dynamodb/environments/terraform/staging.tfvars`
- Create: `database/quckapp-dynamodb/environments/terraform/production.tfvars`

**Context:** The existing `services/terraform/variables.tf` defines all configurable inputs. These tfvars files provide per-environment overrides. Reference the existing variables: environment, billing_mode, per-table capacities, autoscaling settings, TTL, PITR, deletion protection, streams, global tables.

**dev.tfvars:**
- `environment = "dev"`
- `billing_mode = "PAY_PER_REQUEST"` (no capacity planning needed in dev)
- `deletion_protection_enabled = false` (allow easy teardown)
- `point_in_time_recovery_enabled = false` (save cost)
- `streams_enabled = true` (test stream handlers)
- `ttl_enabled = true`
- `autoscaling_enabled = false`
- `global_tables_enabled = false`
- `kms_key_arn = null` (use AWS-owned key in dev)
- Tags: `{ Project = "quckapp", Environment = "dev", Team = "platform" }`

**staging.tfvars:**
- `environment = "staging"`
- `billing_mode = "PROVISIONED"` (match production billing mode)
- `deletion_protection_enabled = true`
- `point_in_time_recovery_enabled = true`
- `streams_enabled = true`
- `ttl_enabled = true`
- `autoscaling_enabled = true`
- Capacity: 50% of production values
- Autoscaling: min 5, max 50, target 70%
- `global_tables_enabled = false`
- Tags: `{ Project = "quckapp", Environment = "staging", Team = "platform" }`

**production.tfvars:**
- `environment = "production"`
- `billing_mode = "PROVISIONED"`
- `deletion_protection_enabled = true`
- `point_in_time_recovery_enabled = true`
- `streams_enabled = true`
- `ttl_enabled = true`
- `autoscaling_enabled = true`
- Per-table capacities: media_metadata 50/30, user_sessions 100/50, notifications 30/20, export_jobs 10/10, conversations 100/50
- GSI capacities: read 30, write 20
- Autoscaling: min 10, max 500, target 70%
- `global_tables_enabled = false`
- `global_tables_replica_regions = []` (ready for future multi-region)
- Tags: `{ Project = "quckapp", Environment = "production", Team = "platform", CostCenter = "engineering" }`

**Commit:** `feat(environments): add dev, staging, and production tfvars`

---

### Task 9: Documentation + Cleanup

**Files:**
- Create: `database/quckapp-dynamodb/documentation/architecture.md`
- Create: `database/quckapp-dynamodb/documentation/runbooks/scaling.md`
- Create: `database/quckapp-dynamodb/documentation/runbooks/throttling.md`
- Create: `database/quckapp-dynamodb/documentation/runbooks/disaster-recovery.md`
- Create: `database/quckapp-dynamodb/documentation/best-practices.md`
- Remove: `database/quckapp-dynamodb/permissions/` (empty)
- Remove: `database/quckapp-dynamodb/roles/` (empty)
- Remove: `database/quckapp-dynamodb/schema/` (empty with subdirs: tables/, functions/, views/, triggers/)
- Remove: `database/quckapp-dynamodb/scripts/` (empty)

**architecture.md** — QuckApp DynamoDB architecture overview:
- ASCII diagram showing 6 tables, their relationships, and which services access them
- Table-to-service mapping matrix
- Data flow diagram: service → DynamoDB → Streams → Lambda → downstream
- Environment topology: dev (PAY_PER_REQUEST), staging (PROVISIONED 50%), production (PROVISIONED full)
- Integration points: KMS encryption, CloudWatch monitoring, AWS Backup, VPC endpoints

**scaling.md** — Operational runbook for scaling:
- When to scale: CloudWatch alarm triggers, capacity utilization > 80%
- How to scale with PROVISIONED mode: update tfvars, terraform apply
- How to scale with PAY_PER_REQUEST: automatic, monitor throttling
- Autoscaling tuning: adjust target utilization, min/max capacity
- GSI scaling: independent from base table, must scale separately
- Emergency scaling: temporarily switch to PAY_PER_REQUEST
- Capacity calculator reference

**throttling.md** — Operational runbook for throttling incidents:
- Detection: CloudWatch ReadThrottleEvents/WriteThrottleEvents alarms
- Immediate response: check hot partitions, check burst capacity
- Root causes: hot partition key, insufficient provisioned capacity, GSI backpressure
- Remediation steps for each root cause
- Prevention: adaptive capacity, partition key design review
- Escalation path

**disaster-recovery.md** — DR runbook:
- RPO/RTO targets per environment
- Recovery options: PITR (continuous, 35-day window), on-demand backups, S3 exports
- Step-by-step PITR restore procedure
- Step-by-step backup restore procedure
- Global Tables for multi-region DR (future)
- Post-recovery validation checklist
- Communication template for stakeholders

**best-practices.md** — QuckApp DynamoDB best practices:
- Partition key design (avoid hot partitions)
- Item size optimization (< 400KB limit)
- GSI design principles (sparse indexes, overloaded keys)
- Efficient query patterns (avoid Scan, use Query with key conditions)
- Error handling (exponential backoff, retry with jitter)
- Cost optimization (reserved capacity, on-demand for unpredictable)
- Security checklist (KMS, VPC endpoint, least-privilege IAM)

**Cleanup:** Remove empty legacy directories that were placeholders from initial scaffold.

**Commit:** `feat(documentation): add architecture docs, runbooks, best practices; remove empty dirs`
