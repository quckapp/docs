# QuckApp Elasticsearch Enterprise Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ~40 enterprise infrastructure files across 9 new directories to the `database/quckapp-elasticsearch/` submodule, covering cluster management, index lifecycle, security, search optimization, monitoring, snapshots/backup, performance tuning, compliance, and documentation. Also remove 4 empty legacy directories.

**Architecture:** Elasticsearch 8.11.0 enterprise infrastructure. 4 existing search indices (messages, channels, files, users) + audit log template with ILM. This plan adds the operational layer: cluster topology, RBAC security, search optimization, Prometheus/Grafana monitoring, S3 snapshot policies, GDPR compliance, and per-environment configuration.

**Tech Stack:** Elasticsearch 8.11.0, JSON (index mappings, ILM policies, RBAC), YAML (Prometheus/Grafana), shell scripts (bash), Node.js (compliance scripts), Markdown (documentation)

---

### Task 1: Cluster Management

**Files:**
- Create: `database/quckapp-elasticsearch/cluster/topology.md`
- Create: `database/quckapp-elasticsearch/cluster/node-roles.yml`
- Create: `database/quckapp-elasticsearch/cluster/discovery-config.yml`
- Create: `database/quckapp-elasticsearch/cluster/allocation-rules.yml`

**topology.md** — Document production cluster topology:
- ASCII diagram: 3 master-eligible nodes, 2+ data nodes (hot/warm tiers), 1 coordinating/ingest node
- Node sizing: master (2 vCPU, 4GB), data-hot (8 vCPU, 32GB, NVMe SSD), data-warm (4 vCPU, 16GB, HDD), coordinating (4 vCPU, 8GB)
- Per-environment topology: dev (single-node), staging (3 nodes all-role), production (dedicated roles)
- Network diagram showing client connections through coordinating node

**node-roles.yml** — Kubernetes StatefulSet node role configurations:
- Master-eligible: `node.roles: [master]`, 3 replicas, anti-affinity
- Data-hot: `node.roles: [data_hot, data_content, ingest]`, 2+ replicas, SSD storage class
- Data-warm: `node.roles: [data_warm]`, 2+ replicas, HDD storage class
- Coordinating: `node.roles: []`, 2 replicas behind Service

**discovery-config.yml** — Elasticsearch discovery settings:
- `discovery.seed_hosts` for multi-node clusters
- `cluster.initial_master_nodes` for bootstrapping
- `discovery.type: single-node` for dev environments

**allocation-rules.yml** — Shard allocation awareness:
- `cluster.routing.allocation.awareness.attributes: zone`
- Forced awareness to prevent all replicas on same AZ
- Hot/warm tier allocation with `index.routing.allocation.require.data: hot|warm`
- QuckApp-specific: search indices on hot tier, audit indices transition hot→warm

**Commit:** `feat(cluster): add cluster topology, node roles, and allocation configuration`

---

### Task 2: Index Lifecycle Management

**Files:**
- Create: `database/quckapp-elasticsearch/index-lifecycle/search-ilm-policy.json`
- Create: `database/quckapp-elasticsearch/index-lifecycle/messages-rollover-template.json`
- Create: `database/quckapp-elasticsearch/index-lifecycle/reindex-script.sh`
- Create: `database/quckapp-elasticsearch/index-lifecycle/index-patterns.md`

**search-ilm-policy.json** — ILM policy for search indices (messages, channels, files, users):
- Hot phase: rollover at 30GB or 7 days, priority 100
- Warm phase (30d): shrink to 1 shard, forcemerge to 1 segment, readonly, move to warm tier
- Cold phase (90d): searchable snapshot (optional)
- Delete phase (365d): delete
- Different from audit-log-ilm which deletes at 90d — search data retained longer

**messages-rollover-template.json** — Index template for rolling message indices:
- Pattern: `quckapp-messages-*`
- Applies search-ilm-policy
- Rollover alias: `quckapp-messages`
- Inherits message_analyzer settings from existing 01-messages-index.json
- 2 shards, 1 replica for production (vs current 1 shard, 0 replica)

**reindex-script.sh** — Shell script for reindexing:
- Accept source index, target index, and optional transform script
- Use `_reindex` API with `wait_for_completion=false` for large indices
- Monitor task progress via `_tasks` API
- Support scroll size configuration
- Handle mapping migration (reindex with new mappings)

**index-patterns.md** — Documentation:
- Index naming conventions: `quckapp-{type}` for static, `quckapp-{type}-YYYY.MM.dd` for time-based
- Current indices vs recommended rollover pattern
- Migration path from static to rolling indices for messages
- ILM policy comparison table: audit-log-ilm vs search-ilm
- Alias management for zero-downtime reindexing

**Commit:** `feat(index-lifecycle): add search ILM policy, rollover template, and reindex tooling`

---

### Task 3: Security

**Files:**
- Create: `database/quckapp-elasticsearch/security/tls/tls-config.md`
- Create: `database/quckapp-elasticsearch/security/rbac/roles.json`
- Create: `database/quckapp-elasticsearch/security/rbac/role-mappings.json`
- Create: `database/quckapp-elasticsearch/security/api-keys/api-key-management.md`
- Create: `database/quckapp-elasticsearch/security/field-security/field-level-security.json`

**tls-config.md** — TLS/SSL configuration documentation:
- Transport layer TLS (node-to-node): required in production
- HTTP layer TLS (client-to-node): recommended
- Certificate generation with `elasticsearch-certutil`
- Kubernetes cert-manager integration
- elasticsearch.yml snippets for TLS configuration
- Certificate rotation procedure

**roles.json** — Custom Elasticsearch RBAC roles:
- `search_service_role`: read/write on `quckapp-messages*`, `quckapp-channels*`, `quckapp-files*`, `quckapp-users*`
- `audit_service_role`: read/write on `quckapp-audit-*`, manage ILM
- `readonly_role`: read-only on all `quckapp-*` indices
- `admin_role`: full cluster management
- `monitoring_role`: read `_cluster/health`, `_nodes/stats`, `_cat/*`
- Each role with specific index privileges and cluster privileges

**role-mappings.json** — Map roles to backend users/services:
- search-service → search_service_role
- audit-service → audit_service_role
- monitoring → monitoring_role
- admin → admin_role
- Uses native realm mapping format

**api-key-management.md** — Documentation:
- Creating API keys per service
- API key with role restrictions
- Key rotation procedure
- Key invalidation
- Best practices: short-lived keys, per-service keys, never share keys

**field-level-security.json** — Field-level and document-level security:
- Restrict PII fields (email, ipAddress) from readonly_role
- Document-level security: workspaceId-based access control
- Example: user can only search within their workspace's indices
- anonymize `userAgent` and `ipAddress` for non-admin roles in audit indices

**Commit:** `feat(security): add TLS config, RBAC roles, API keys, and field-level security`

---

### Task 4: Search Optimization

**Files:**
- Create: `database/quckapp-elasticsearch/search/analyzers/custom-analyzers.json`
- Create: `database/quckapp-elasticsearch/search/analyzers/synonyms.txt`
- Create: `database/quckapp-elasticsearch/search/queries/message-search.json`
- Create: `database/quckapp-elasticsearch/search/queries/user-search.json`
- Create: `database/quckapp-elasticsearch/search/queries/multi-index-search.json`
- Create: `database/quckapp-elasticsearch/search/relevance/relevance-tuning.md`

**custom-analyzers.json** — Enhanced analyzers beyond the existing message_analyzer:
- `autocomplete_analyzer`: edge_ngram tokenizer (min 2, max 20) for search-as-you-type
- `username_analyzer`: standard tokenizer + lowercase + ascii folding for usernames
- `filename_analyzer`: pattern tokenizer (split on dots, hyphens, underscores) for file search
- `multilingual_analyzer`: ICU tokenizer + ICU folding for international text support
- Each analyzer with tokenizer, char_filter, and filter definitions

**synonyms.txt** — Synonym file for search enhancement:
- QuckApp domain synonyms: `dm, direct message, private message`, `channel, room, group`, `workspace, organization, team`
- Common abbreviations: `msg => message`, `usr => user`, `cfg => config`
- Emoji synonyms: `:thumbsup:, +1, approve`, `:fire:, lit, amazing`
- Format: Solr synonym format (comma-separated equivalents)

**message-search.json** — Elasticsearch query template for message search:
- Multi-match across `content` with message_analyzer boosting
- Filter by channelId, workspaceId, date range
- Highlight on content field with pre/post tags
- Pagination with search_after for deep pagination
- Aggregations: by channel, by sender, by date histogram

**user-search.json** — Query template for user search:
- Bool query: should match username (boosted 3x), fullName (boosted 2x), email (exact match)
- Fuzzy matching with fuzziness: "AUTO"
- Prefix query on username.keyword for autocomplete
- Filter by status (active/inactive)

**multi-index-search.json** — Cross-index search template:
- Search across messages, channels, files, users simultaneously
- Per-index boosting (messages 1.5x, channels 1.0x, files 0.8x, users 1.2x)
- `indices_boost` for relevance weighting
- Unified result format with source index identification
- Collapse by workspaceId with inner_hits

**relevance-tuning.md** — Documentation:
- Elasticsearch relevance scoring (BM25)
- Field boosting strategies for QuckApp search
- Function score for recency boosting (newer messages rank higher)
- Synonym impact on recall vs precision
- A/B testing search quality with rank evaluation API
- Common search quality issues and fixes

**Commit:** `feat(search): add custom analyzers, synonyms, query templates, and relevance tuning`

---

### Task 5: Monitoring + Observability

**Files:**
- Create: `database/quckapp-elasticsearch/monitoring/prometheus/elasticsearch-exporter.yml`
- Create: `database/quckapp-elasticsearch/monitoring/prometheus/recording-rules.yml`
- Create: `database/quckapp-elasticsearch/monitoring/grafana/dashboard.json`
- Create: `database/quckapp-elasticsearch/monitoring/kibana/cluster-dashboard.ndjson`
- Create: `database/quckapp-elasticsearch/monitoring/alerts/cluster-alerts.yml`
- Create: `database/quckapp-elasticsearch/monitoring/alerts/index-alerts.yml`

**elasticsearch-exporter.yml** — Kubernetes deployment for prometheus-elasticsearch-exporter:
- Uses `quay.io/prometheuscommunity/elasticsearch-exporter:v1.7.0`
- Scrape cluster health, node stats, index stats, shard allocation
- ServiceMonitor for Prometheus Operator discovery
- Environment-specific ES_URI configuration

**recording-rules.yml** — Prometheus recording rules:
- `elasticsearch:cluster_health_status` — cluster status numeric (0=green, 1=yellow, 2=red)
- `elasticsearch:jvm_heap_used_percent` — JVM heap utilization
- `elasticsearch:active_shards_percent` — shard allocation health
- `elasticsearch:indexing_rate` — documents indexed per second per node
- `elasticsearch:search_rate` — search queries per second
- `elasticsearch:query_latency_p99` — search latency percentiles

**grafana/dashboard.json** — Grafana dashboard:
- Row 1: Cluster Health (status, nodes, shards, pending tasks)
- Row 2: JVM Metrics (heap used, GC rate, GC duration)
- Row 3: Indexing (rate, latency, rejected threads)
- Row 4: Search (rate, latency, fetch latency)
- Row 5: Index Stats (store size, docs count per index)
- Template variables: cluster, node, index

**kibana/cluster-dashboard.ndjson** — Kibana saved objects:
- Dashboard with visualizations for cluster health, index patterns, search latency
- Export in ndjson format for Kibana import API
- Lens visualizations for key metrics

**cluster-alerts.yml** — Prometheus alerting rules:
- `ElasticsearchClusterRed`: cluster status red for 2m (critical)
- `ElasticsearchClusterYellow`: cluster status yellow for 15m (warning)
- `ElasticsearchJVMHeapHigh`: heap > 85% for 5m (warning)
- `ElasticsearchJVMHeapCritical`: heap > 95% for 2m (critical)
- `ElasticsearchNodeDown`: expected nodes missing for 2m (critical)
- `ElasticsearchPendingTasks`: pending tasks > 0 for 10m (warning)

**index-alerts.yml** — Prometheus alerting rules:
- `ElasticsearchUnassignedShards`: unassigned shards > 0 for 5m (warning)
- `ElasticsearchIndexingLatencyHigh`: indexing latency > 100ms for 5m (warning)
- `ElasticsearchSearchLatencyHigh`: search latency > 200ms for 5m (warning)
- `ElasticsearchDiskSpaceWarning`: disk usage > 80% (warning)
- `ElasticsearchDiskSpaceCritical`: disk usage > 90% (critical)

**Commit:** `feat(monitoring): add Prometheus exporter, Grafana/Kibana dashboards, and alerting rules`

---

### Task 6: Snapshots + Backup

**Files:**
- Create: `database/quckapp-elasticsearch/snapshots/repository-config.json`
- Create: `database/quckapp-elasticsearch/snapshots/snapshot-policy.json`
- Create: `database/quckapp-elasticsearch/snapshots/scripts/create-snapshot.sh`
- Create: `database/quckapp-elasticsearch/snapshots/scripts/restore-snapshot.sh`
- Create: `database/quckapp-elasticsearch/snapshots/disaster-recovery.md`

**repository-config.json** — S3 snapshot repository configuration:
- Repository type: S3
- Bucket: `quckapp-elasticsearch-snapshots-${environment}`
- Base path: `snapshots/`
- Server-side encryption (SSE-S3)
- Chunk size: 1GB
- Max restore/snapshot bytes per sec: 40mb
- Register via `_snapshot/quckapp-backup` API

**snapshot-policy.json** — SLM (Snapshot Lifecycle Management) policy:
- Daily snapshots at 01:00 UTC
- Retention: min 7, max 30 snapshots, max age 30d
- Snapshot name: `<quckapp-daily-{now/d}>`
- Indices: `quckapp-*` (all QuckApp indices)
- Include global state: false

**create-snapshot.sh** — Shell script:
- Accept repository name, snapshot name, optional index pattern
- Use `_snapshot/{repo}/{snapshot}` API
- Monitor with `_snapshot/{repo}/{snapshot}/_status`
- Support partial snapshots (specific indices)
- Error handling and progress reporting

**restore-snapshot.sh** — Shell script:
- Accept repository name, snapshot name, optional rename pattern
- Close target indices before restore
- Use `_snapshot/{repo}/{snapshot}/_restore`
- Support index renaming (`rename_pattern`, `rename_replacement`)
- Wait for restore completion
- Post-restore verification (doc counts, cluster health)

**disaster-recovery.md** — DR documentation:
- RPO/RTO targets per environment
- Snapshot-based recovery procedures
- Cross-cluster restore for migration
- Searchable snapshots for cost optimization
- Full cluster rebuild from snapshots
- Post-recovery checklist (ILM, aliases, templates)

**Commit:** `feat(snapshots): add S3 repository config, SLM policy, backup/restore scripts`

---

### Task 7: Performance Tuning

**Files:**
- Create: `database/quckapp-elasticsearch/performance/jvm-options.md`
- Create: `database/quckapp-elasticsearch/performance/shard-sizing.md`
- Create: `database/quckapp-elasticsearch/performance/bulk-indexing.md`
- Create: `database/quckapp-elasticsearch/performance/circuit-breakers.md`

**jvm-options.md** — JVM configuration:
- Heap sizing: 50% of available RAM, max 31GB (compressed oops)
- Per-environment recommendations: dev (512MB), staging (4GB), production (16GB)
- GC configuration: G1GC (default in ES 8.x)
- JVM flags for production: disable swapping, mlockall
- Thread pool sizing for search, write, snapshot
- Monitoring JVM with `_nodes/stats/jvm`

**shard-sizing.md** — Shard sizing guidelines:
- Target: 10-50GB per shard
- QuckApp shard calculation per index at various scales
- Over-sharding risks (master node overhead, search latency)
- Under-sharding risks (single point of failure, slow recovery)
- Shard-per-node ratio: max 20 shards per GB of heap
- Recommended shard counts per environment and index

**bulk-indexing.md** — Bulk indexing optimization:
- Optimal bulk size: 5-15MB per request
- Refresh interval: increase to 30s during bulk loads (vs default 1s)
- Replica count: set to 0 during initial load, restore after
- Thread pool: monitor `write` thread pool rejections
- Client-side batching with `_bulk` API best practices
- Index buffer size configuration

**circuit-breakers.md** — Circuit breaker documentation:
- Parent breaker: 95% of JVM heap (default)
- Field data breaker: 40% of JVM heap
- Request breaker: 60% of JVM heap
- In-flight requests breaker: 100% of JVM heap
- When breakers trip: diagnosis and remediation
- QuckApp-specific: message search aggregations as fielddata risk

**Commit:** `feat(performance): add JVM, shard sizing, bulk indexing, and circuit breaker docs`

---

### Task 8: Compliance

**Files:**
- Create: `database/quckapp-elasticsearch/compliance/gdpr/delete-by-query.js`
- Create: `database/quckapp-elasticsearch/compliance/data-retention/retention-policies.md`
- Create: `database/quckapp-elasticsearch/compliance/audit/audit-config.md`

**delete-by-query.js** — GDPR Right-to-be-Forgotten script:
- Accept user_id and environment as arguments
- Delete user data from all 4 search indices + audit indices:
  - messages: `_delete_by_query` where senderId = user_id
  - channels: no deletion (channels are workspace-owned)
  - files: delete where userId = user_id
  - users: delete where id = user_id
  - audit: delete where userId = user_id (within retention window)
- Refresh indices after deletion
- Generate compliance report with deletion counts
- Dry-run mode (use `_count` instead of `_delete_by_query`)

**retention-policies.md** — Data retention documentation:
- ILM-based retention per index type:
  - Messages: 365 days (search-ilm)
  - Channels: no deletion (permanent)
  - Files: 365 days (follows message lifecycle)
  - Users: no deletion (permanent, use GDPR script for individual removal)
  - Audit logs: 90 days (audit-log-ilm)
- Environment overrides: dev (7d), staging (30d), production (as specified)
- Compliance mapping: SOX, GDPR, HIPAA retention requirements
- How ILM enforces retention automatically

**audit-config.md** — Elasticsearch audit logging configuration:
- `xpack.security.audit.enabled: true`
- Audit event types to log: authentication_success, authentication_failed, access_granted, access_denied
- Audit log output: file (default), index (for searchable audit)
- Log file rotation and retention
- What NOT to log (to avoid noise): system/internal actions
- Integration with existing audit-service and audit-log template

**Commit:** `feat(compliance): add GDPR deletion, data retention policies, and audit configuration`

---

### Task 9: Documentation + Cleanup

**Files:**
- Create: `database/quckapp-elasticsearch/documentation/architecture.md`
- Create: `database/quckapp-elasticsearch/documentation/runbooks/scaling.md`
- Create: `database/quckapp-elasticsearch/documentation/runbooks/reindexing.md`
- Create: `database/quckapp-elasticsearch/documentation/runbooks/disaster-recovery.md`
- Create: `database/quckapp-elasticsearch/documentation/best-practices.md`
- Remove: `database/quckapp-elasticsearch/permissions/` (empty)
- Remove: `database/quckapp-elasticsearch/roles/` (empty)
- Remove: `database/quckapp-elasticsearch/schema/` (empty)
- Remove: `database/quckapp-elasticsearch/scripts/` (empty)

**architecture.md** — QuckApp Elasticsearch architecture:
- ASCII diagram: search-service → ES cluster ← audit-service, with index routing
- Index-to-service mapping: which service owns which indices
- Data flow: application → ingest node → data node → shard → replica
- ILM lifecycle diagram: hot → warm → cold → delete
- Environment topology comparison (dev/staging/production)

**scaling.md** — Operational runbook:
- Horizontal scaling: add data nodes
- Vertical scaling: increase JVM heap, disk
- Shard rebalancing after adding nodes
- Index-level scaling: increase shard count (requires reindex)
- Monitoring scaling need: disk, heap, search latency, indexing rate

**reindexing.md** — Operational runbook:
- When to reindex: mapping changes, analyzer updates, shard count changes
- Zero-downtime reindexing with aliases
- Step-by-step: create new index → reindex → switch alias → delete old
- Reindex from remote cluster
- Monitoring reindex progress

**disaster-recovery.md** — DR runbook:
- Cross-reference to snapshots/disaster-recovery.md
- Full cluster rebuild procedure
- Single index recovery from snapshot
- Cross-cluster recovery
- Communication template

**best-practices.md** — QuckApp ES best practices:
- Mapping design (explicit vs dynamic, keyword vs text)
- Search query patterns (prefer filter context for exact match)
- Avoid wildcard queries on large indices
- Use aliases for zero-downtime operations
- Security: never expose 9200 publicly, use coordinating nodes
- Monitoring: always watch cluster health, JVM heap, disk

**Cleanup:** Remove empty `permissions/`, `roles/`, `schema/`, `scripts/` directories.

**Commit:** `feat(documentation): add architecture docs, runbooks, best practices; remove empty dirs`
