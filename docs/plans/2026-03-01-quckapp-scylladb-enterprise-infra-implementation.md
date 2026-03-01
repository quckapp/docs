# ScyllaDB Enterprise Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add enterprise infrastructure to the quckapp-scylladb submodule — data modeling docs, cluster management, security, monitoring, backup, performance tuning, operations, compliance, and documentation.

**Architecture:** 9 independent directories each covering one enterprise concern. The submodule manages a ScyllaDB keyspace `quckapp` with 8 tables for the go-bff chat messaging service.

**Tech Stack:** ScyllaDB 5.4, CQL, Prometheus, Grafana, YAML, Bash, Markdown

---

### Task 1: Data Modeling Documentation (4 files)

**Context:** ScyllaDB's data model is query-driven. The go-bff service has 8 tables, each designed for specific access patterns. Key design choices: partition by conversation_id for messages, denormalize messages_by_sender for moderation queries, use TWCS on messages for time-series writes.

**Existing tables and their partition/clustering keys:**
- messages: PK=conversation_id, CK=(created_at DESC, message_id DESC)
- message_reactions: PK=(conversation_id, message_id), CK=(emoji, user_id)
- read_receipts: PK=conversation_id, CK=user_id
- delivery_receipts: PK=(conversation_id, message_id), CK=user_id
- starred_messages: PK=user_id, CK=(starred_at DESC, message_id DESC)
- pinned_messages: PK=conversation_id, CK=(pinned_at DESC, message_id DESC)
- scheduled_messages: PK=user_id, CK=(scheduled_for ASC, message_id ASC)
- messages_by_sender: PK=sender_id, CK=(created_at DESC, message_id DESC)

**Files:**
- Create: `data-modeling/access-patterns.md`
- Create: `data-modeling/partition-design.md`
- Create: `data-modeling/denormalization.md`
- Create: `data-modeling/capacity-planning.md`

**Spec:**

1. **access-patterns.md** (~120 lines)
   - Complete access pattern table for go-bff service:
     - Q1: Get messages in conversation (paginated, newest first) → messages table
     - Q2: Get reactions for a message → message_reactions table
     - Q3: Get read receipt for user in conversation → read_receipts table
     - Q4: Check if message delivered to user → delivery_receipts table
     - Q5: Get user's starred messages → starred_messages table
     - Q6: Get pinned messages in conversation → pinned_messages table
     - Q7: Get user's scheduled messages (next first) → scheduled_messages table
     - Q8: Get all messages by sender (moderation) → messages_by_sender table
     - Q9: Send a message → INSERT into messages + messages_by_sender (dual write)
     - Q10: Add/remove reaction → INSERT/DELETE on message_reactions
     - Q11: Update read receipt → INSERT (upsert) on read_receipts
     - Q12: Mark message delivered → INSERT on delivery_receipts
   - Each pattern: query description, table used, CQL query, consistency level, expected latency

2. **partition-design.md** (~100 lines)
   - Partition key selection rationale per table
   - Partition sizing analysis:
     - messages: partition = 1 conversation, risk of hot partition for large group chats
     - message_reactions: compound partition (conversation_id, message_id) to prevent wide rows
     - starred_messages: partition = 1 user, bounded by user behavior
   - Partition size limits: target <100MB per partition
   - Estimated partition sizes at 100K users with typical messaging patterns
   - Mitigation for large partitions: bucketing strategy for high-volume conversations

3. **denormalization.md** (~80 lines)
   - Why messages_by_sender exists: moderation/admin queries need sender-centric view
   - Dual-write pattern: application writes to both messages and messages_by_sender
   - Consistency considerations: eventual consistency between the two tables
   - When to add more denormalized tables (future query patterns)
   - Trade-offs: write amplification vs read performance
   - Anti-patterns: trying to use secondary indexes instead of denormalized tables

4. **capacity-planning.md** (~80 lines)
   - Storage estimation per table at 100K/500K/1M users
   - messages table: avg message size × messages/day × retention × replication factor
   - Write throughput estimates: messages/sec, reactions/sec, receipts/sec
   - Read throughput: messages fetched/sec, receipts checked/sec
   - Cluster sizing: nodes needed per scale tier
   - Growth planning: when to add nodes, when to add DCs

**Commit message:** `feat(data-modeling): add access patterns, partition design, denormalization, capacity planning`

---

### Task 2: Cluster Management (4 files)

**Context:** ScyllaDB runs a 3-node cluster with NetworkTopologyStrategy. Local dev uses 3 ScyllaDB nodes via Docker Compose. Production uses 3 replicas in datacenter1.

**Files:**
- Create: `cluster/topology.md`
- Create: `cluster/snitch-config.md`
- Create: `cluster/multi-dc.md`
- Create: `cluster/rack-awareness.md`

**Spec:**

1. **topology.md** (~100 lines)
   - Cluster topology per environment:
     - dev: 3-node Docker (localhost, 750MB each, 1 SMP)
     - qa: 3-node cluster, datacenter1
     - staging: 3-node cluster, datacenter1
     - production: 3+ nodes, datacenter1 (expandable to multi-DC)
   - Node roles in ScyllaDB: all nodes are equal (no master/slave)
   - Token ring and consistent hashing explanation
   - Seed node configuration
   - Inter-node communication ports: 7000 (storage), 7001 (SSL storage), 9042 (CQL), 9180 (Prometheus)

2. **snitch-config.md** (~80 lines)
   - Snitch types: SimpleSnitch (dev), GossipingPropertyFileSnitch (production), Ec2Snitch (AWS)
   - Configuration per environment
   - cassandra-rackdc.properties file format
   - Impact on replication placement: how snitch affects replica distribution
   - Migration between snitch types

3. **multi-dc.md** (~80 lines)
   - Multi-datacenter replication with NetworkTopologyStrategy
   - Current: single DC (datacenter1: 3)
   - Future: adding datacenter2 for DR (ALTER KEYSPACE)
   - Cross-DC consistency: LOCAL_QUORUM vs EACH_QUORUM
   - Network requirements: inter-DC latency, bandwidth
   - Data center failover procedure

4. **rack-awareness.md** (~60 lines)
   - Rack-aware replica placement
   - Configuration via cassandra-rackdc.properties
   - Cloud provider rack mapping (AWS AZs, Azure AZs)
   - Impact on availability: survive rack/AZ failure
   - Current setup: single rack per DC (development), 3 racks per DC (production recommendation)

**Commit message:** `feat(cluster): add topology, snitch configuration, multi-DC, and rack awareness docs`

---

### Task 3: Security (5 files)

**Context:** ScyllaDB supports authentication (PasswordAuthenticator), authorization (CassandraAuthorizer), and TLS. The go-bff service needs specific permissions on the quckapp keyspace.

**Files:**
- Create: `security/authentication/auth-config.md`
- Create: `security/authorization/roles.cql`
- Create: `security/authorization/permissions.cql`
- Create: `security/tls/tls-config.md`
- Create: `security/network/network-security.md`

**Spec:**

1. **auth-config.md** (~100 lines)
   - Enabling authentication: `authenticator: PasswordAuthenticator` in scylla.yaml
   - Default superuser (cassandra/cassandra) and why to change it immediately
   - Creating service accounts via CQL:
     - go_bff_service: application read/write access
     - admin_user: DDL + superuser for migrations
     - monitoring_user: SELECT on system tables
     - backup_user: SELECT for snapshot operations
   - Per-environment auth configuration (dev: AllowAllAuthenticator, qa/staging/prod: PasswordAuthenticator)
   - Password rotation procedure
   - Client driver auth configuration (Go gocql example)

2. **roles.cql** (~50 lines)
   - CREATE ROLE IF NOT EXISTS statements:
     - app_writer: LOGIN=true (for go-bff writes)
     - app_reader: LOGIN=true (for read-only queries)
     - admin_role: LOGIN=true, SUPERUSER=true (for migrations)
     - monitoring_role: LOGIN=true (for metrics)
     - backup_role: LOGIN=true (for snapshots)
   - Password hashes as placeholders (inject from secrets manager)

3. **permissions.cql** (~60 lines)
   - GRANT statements per role:
     - app_writer: SELECT, INSERT, UPDATE, DELETE on quckapp keyspace (all 8 tables)
     - app_reader: SELECT only on quckapp keyspace
     - admin_role: ALL PERMISSIONS on quckapp keyspace
     - monitoring_role: SELECT on system.local, system.peers, system_schema.tables
     - backup_role: SELECT on quckapp keyspace (for snapshot reads)
   - Principle of least privilege

4. **tls-config.md** (~80 lines)
   - Client-to-node encryption (native_transport)
   - Node-to-node encryption (internode)
   - scylla.yaml TLS configuration sections
   - Certificate generation with openssl
   - Per-environment: dev=none, qa=client-only, staging/prod=both client and internode
   - Go gocql TLS configuration example
   - Certificate rotation procedure

5. **network-security.md** (~70 lines)
   - Firewall rules: which ports to expose (9042 CQL, 9180 metrics) vs internal-only (7000/7001 internode)
   - Network segmentation: ScyllaDB nodes in private subnet
   - VPC/VNet configuration
   - IP allowlisting for CQL access
   - Per-environment network policy table

**Commit message:** `feat(security): add authentication, authorization roles/permissions, TLS, and network security`

---

### Task 4: Monitoring & Alerting (5 files)

**Context:** ScyllaDB exposes Prometheus metrics natively on port 9180 (no exporter needed). Key metrics: read/write latency, compaction, repair, cache hit rates. The Docker Compose already exposes port 9180.

**Files:**
- Create: `monitoring/prometheus/scylla-targets.yml`
- Create: `monitoring/prometheus/recording-rules.yml`
- Create: `monitoring/grafana/dashboard.json`
- Create: `monitoring/alerts/cluster-alerts.yml`
- Create: `monitoring/alerts/table-alerts.yml`

**Spec:**

1. **scylla-targets.yml** (~40 lines)
   - Prometheus static_configs for ScyllaDB nodes
   - Per-environment target list (dev: localhost:9180, production: node1:9180, node2:9180, node3:9180)
   - Labels: cluster, dc, rack
   - Scrape interval: 15s
   - No exporter needed — ScyllaDB has native Prometheus endpoint

2. **recording-rules.yml** (~50 lines)
   - Recording rules:
     - scylla:read_latency_p99:rate5m
     - scylla:write_latency_p99:rate5m
     - scylla:compaction_pending:sum
     - scylla:cache_hit_rate:ratio
     - scylla:storage_used:bytes
     - scylla:live_nodes:count

3. **dashboard.json** (~250 lines)
   - Grafana dashboard with 4 rows:
     - Cluster Health: node status, uptime, load, storage used/available
     - Latency: read/write p50/p95/p99 per node, coordinator latency
     - Throughput: reads/writes per second, operations per table
     - Compaction & Repair: pending compactions, compaction throughput, repair progress
   - Variables: $cluster, $node, $keyspace, $table
   - Dashboard uid: "quckapp-scylladb-overview"

4. **cluster-alerts.yml** (~80 lines)
   - Prometheus alerting rules:
     - ScyllaNodeDown: node not responding for 1m (critical)
     - ScyllaHighReadLatency: p99 >10ms for 5m (warning)
     - ScyllaHighWriteLatency: p99 >5ms for 5m (warning)
     - ScyllaDiskUsageHigh: >80% warning, >90% critical
     - ScyllaCompactionBacklog: pending >100 for 10m (warning)
     - ScyllaCacheHitRateLow: <80% for 10m (warning)
     - ScyllaRepairOverdue: no repair in >7 days (warning)

5. **table-alerts.yml** (~60 lines)
   - Per-table alerting:
     - ScyllaLargePartition: partition >100MB detected (warning) — especially for messages table
     - ScyllaTombstoneWarning: tombstone ratio >20% (warning) — especially for message_reactions
     - ScyllaSSTableCountHigh: >32 SSTables per table (warning)
     - ScyllaDroppedMutations: any dropped mutations (critical)

**Commit message:** `feat(monitoring): add Prometheus targets, Grafana dashboard, cluster and table alerts`

---

### Task 5: Backup & Restore (4 files)

**Context:** ScyllaDB uses nodetool snapshot for backups (creates hard links to SSTables). Restore uses sstableloader. Each node must be backed up individually.

**Files:**
- Create: `backup/backup-config.md`
- Create: `backup/scripts/snapshot-backup.sh`
- Create: `backup/scripts/restore-snapshot.sh`
- Create: `backup/disaster-recovery.md`

**Spec:**

1. **backup-config.md** (~100 lines)
   - ScyllaDB backup strategies: nodetool snapshot, incremental backup, ScyllaDB Manager
   - nodetool snapshot creates consistent point-in-time hard links
   - Backup procedure: must snapshot each node independently
   - Backup destinations: local disk → S3/Azure Blob (rsync or s3 sync)
   - Schedule: daily snapshots, retain 7 days
   - Snapshot naming: `snapshot-YYYY-MM-DD-HH`
   - Which keyspaces to backup: quckapp (skip system keyspaces for new cluster)
   - Backup verification: load SSTables into test cluster

2. **snapshot-backup.sh** (~100 lines, executable bash)
   - Parameters: --keyspace, --tag (snapshot name), --output-dir, --nodes (comma-separated)
   - Uses `nodetool snapshot` on each node (via SSH or kubectl exec)
   - Copies snapshot files to output directory
   - Optional S3 upload: `aws s3 sync`
   - Clears old snapshots: `nodetool clearsnapshot`
   - Logging and error handling

3. **restore-snapshot.sh** (~100 lines, executable bash)
   - Parameters: --keyspace, --snapshot-dir, --nodes, --dry-run
   - Uses `sstableloader` to stream SSTables back into cluster
   - Target: specific node(s) or full cluster
   - Pre-restore: verify schema exists (run migrations first)
   - Post-restore: run `nodetool repair` to ensure consistency
   - Safety: --dry-run flag

4. **disaster-recovery.md** (~80 lines)
   - DR strategy: RPO/RTO targets
     - Messages: RPO <1hr, RTO <2hr (critical for chat)
     - Receipts/reactions: RPO <1hr, RTO <4hr (rebuild from client state)
   - Scenarios: single node failure (automatic), multi-node, full cluster
   - Recovery procedures per scenario
   - Post-recovery: repair, verify consistency
   - Communication template

**Commit message:** `feat(backup): add backup configuration, snapshot/restore scripts, disaster recovery`

---

### Task 6: Performance Tuning (4 files)

**Context:** ScyllaDB performance depends on compaction strategy, repair scheduling, cache tuning, and driver configuration. The messages table uses TWCS (time-series), all others use default STCS. gc_grace_seconds is 864000 (10 days) on messages.

**Files:**
- Create: `performance/compaction-tuning.md`
- Create: `performance/repair-procedures.md`
- Create: `performance/cache-tuning.md`
- Create: `performance/driver-tuning.md`

**Spec:**

1. **compaction-tuning.md** (~100 lines)
   - Compaction strategies: STCS, LCS, TWCS, ICS
   - Current configuration per table:
     - messages: TimeWindowCompactionStrategy (1-day window) — correct for append-heavy time-series
     - All others: SizeTieredCompactionStrategy (default)
   - When to switch strategies:
     - message_reactions: consider LCS if heavy update/delete workload
     - read_receipts: consider LCS (upsert-heavy, read-heavy)
   - TWCS tuning: compaction_window_size, compaction_window_unit
   - gc_grace_seconds: why 10 days on messages (tombstone cleanup)
   - Monitoring compaction: nodetool compactionstats, Prometheus metrics

2. **repair-procedures.md** (~100 lines)
   - Why repair is needed: anti-entropy, consistent hashing, hinted handoff limits
   - Repair types: full, incremental, subrange
   - Repair scheduling: must complete within gc_grace_seconds (10 days for messages)
   - ScyllaDB Manager for automated repair scheduling
   - Manual repair: `nodetool repair quckapp` per node
   - Repair impact on performance: throttling with `--job-threads`
   - Monitoring repair: nodetool netstats, Prometheus repair metrics
   - Recommended schedule: weekly repair of all keyspaces

3. **cache-tuning.md** (~80 lines)
   - ScyllaDB cache architecture: row cache, key cache
   - Row cache: useful for read-heavy tables (read_receipts, pinned_messages)
   - Key cache: enabled by default, saves index lookups
   - Cache configuration per table: ALTER TABLE ... WITH caching = {'keys': 'ALL', 'rows_per_partition': 'N'}
   - QuckApp recommendations:
     - read_receipts: high row cache (frequently read, small rows)
     - messages: key cache only (rows too large for row cache)
     - message_reactions: moderate row cache
   - Monitoring cache: cache hit/miss rates via Prometheus
   - Memory allocation: cache vs memtable balance

4. **driver-tuning.md** (~80 lines)
   - Go gocql driver tuning for go-bff service:
     - Connection pool size: NumConns per host
     - Consistency level: LOCAL_QUORUM for production, ONE for dev
     - Retry policy: ExponentialBackoffRetryPolicy
     - Load balancing: DCAwareRoundRobinPolicy + TokenAwareHostPolicy
     - Timeout: ConnectTimeout, Timeout
     - Prepared statements: always use (avoid query parsing overhead)
   - Batch operations: when to use LOGGED vs UNLOGGED batches
   - Pagination: PageSize for message listing queries
   - Connection keepalive and reconnection settings

**Commit message:** `feat(performance): add compaction tuning, repair procedures, cache and driver tuning`

---

### Task 7: Operations (4 files)

**Context:** ScyllaDB operations use nodetool for node management. Key operations: bootstrap new nodes, decommission, replace dead nodes, rolling restarts.

**Files:**
- Create: `operations/nodetool-reference.md`
- Create: `operations/node-operations.md`
- Create: `operations/streaming.md`
- Create: `operations/maintenance-windows.md`

**Spec:**

1. **nodetool-reference.md** (~100 lines)
   - Essential nodetool commands organized by category:
     - Cluster info: status, info, ring, describecluster
     - Table stats: tablestats, tablehistograms
     - Compaction: compactionstats, compact, setcompactionthroughput
     - Repair: repair, netstats
     - Snapshots: snapshot, clearsnapshot, listsnapshots
     - Streaming: netstats, setstreamthroughput
     - Cache: invalidatekeycache, invalidaterowcache
   - Each command: syntax, description, when to use, example output interpretation

2. **node-operations.md** (~100 lines)
   - Bootstrap new node: step-by-step procedure
     - Configure scylla.yaml (seeds, cluster_name, snitch)
     - Start node, monitor bootstrap progress
     - Run repair after bootstrap completes
   - Decommission node: nodetool decommission procedure
   - Replace dead node: `replace_address_first_boot` parameter
   - Rolling restart: one node at a time, verify UN status before proceeding
   - Emergency node removal: nodetool removenode (last resort)
   - Pre-checks before any operation: verify cluster health, check pending compactions

3. **streaming.md** (~60 lines)
   - What streaming is: data transfer between nodes (bootstrap, repair, rebuild)
   - Monitoring streaming: nodetool netstats
   - Throttling: setstreamthroughput (default 200MB/s)
   - Impact on production: when to throttle, off-peak scheduling
   - Common streaming scenarios: adding nodes, repair, rebuild after replace

4. **maintenance-windows.md** (~80 lines)
   - Recommended maintenance schedule:
     - Daily: monitor metrics, check for alerts
     - Weekly: run repair on all keyspaces
     - Monthly: review capacity, clean up old snapshots
     - Quarterly: version upgrades (rolling), security audit
   - Maintenance window procedure: drain connections, perform operation, verify, resume
   - Impact assessment per operation type
   - Communication template for planned maintenance

**Commit message:** `feat(operations): add nodetool reference, node operations, streaming, maintenance windows`

---

### Task 8: Compliance (3 files)

**Context:** GDPR requires data deletion. ScyllaDB uses DELETE statements which create tombstones (cleaned by compaction after gc_grace_seconds). The messages table has gc_grace_seconds=864000 (10 days). All tables store user_id or sender_id.

**Files:**
- Create: `compliance/gdpr/data-deletion.md`
- Create: `compliance/data-retention/ttl-policies.md`
- Create: `compliance/audit/audit-config.md`

**Spec:**

1. **data-deletion.md** (~100 lines)
   - GDPR right-to-erasure in ScyllaDB
   - Deletion method: DELETE FROM table WHERE partition_key = ... AND clustering_key = ...
   - Tombstone implications: deleted data creates tombstones, cleaned after gc_grace_seconds
   - PII analysis per table:
     - messages: sender_id, content → DELETE WHERE conversation_id AND created_at AND message_id
     - message_reactions: user_id → DELETE WHERE conversation_id AND message_id AND emoji AND user_id
     - read_receipts: user_id → DELETE WHERE conversation_id AND user_id
     - delivery_receipts: user_id → DELETE WHERE conversation_id AND message_id AND user_id
     - starred_messages: user_id (partition key) → DELETE entire partition
     - scheduled_messages: user_id (partition key) → DELETE entire partition
     - messages_by_sender: sender_id (partition key) → DELETE entire partition
   - Deletion workflow: identify all tables with user data → execute DELETEs → verify → run compaction
   - Challenge: finding all conversation_ids for a user in messages table (requires messages_by_sender lookup)
   - Post-deletion: `nodetool compact quckapp` to force tombstone cleanup

2. **ttl-policies.md** (~80 lines)
   - TTL support in ScyllaDB: per-row and per-column TTL via INSERT/UPDATE USING TTL
   - Current state: no TTLs set (messages retained indefinitely, gc_grace_seconds is for tombstones not data)
   - Recommended TTL policies:
     - messages: no default TTL (user expects persistence), but USING TTL on deleted messages
     - read_receipts: TTL 30 days (stale receipts not useful)
     - delivery_receipts: TTL 7 days (delivery confirmation is transient)
     - scheduled_messages: TTL on sent messages (auto-cleanup after delivery)
   - TTL interaction with TWCS: TTL must align with compaction window
   - Monitoring expired data: track tombstone metrics

3. **audit-config.md** (~70 lines)
   - ScyllaDB audit logging: system_auth.audit_log table
   - Enabling audit: `audit: table` or `audit: syslog` in scylla.yaml
   - What's audited: DDL changes, DML operations, login events
   - Audit categories: AUTH, DDL, DML, QUERY
   - QuckApp requirements: log all DDL, log failed auth, log admin queries
   - Audit log retention and rotation
   - Integration with SIEM

**Commit message:** `feat(compliance): add GDPR data deletion, TTL policies, and audit configuration`

---

### Task 9: Documentation, Runbooks & Cleanup (5 files + 4 dirs removed)

**Context:** Final task adds architecture documentation, operational runbooks, and removes empty legacy directories.

**Files:**
- Create: `documentation/architecture.md`
- Create: `documentation/runbooks/scaling.md`
- Create: `documentation/runbooks/repair.md`
- Create: `documentation/runbooks/disaster-recovery.md`
- Create: `documentation/best-practices.md`
- Remove: `permissions/` (empty)
- Remove: `roles/` (empty)
- Remove: `scripts/` (empty)
- Remove: `schema/` (empty tree with functions/, tables/, triggers/, views/)

**Spec:**

1. **architecture.md** (~120 lines)
   - ASCII diagram: go-bff service → ScyllaDB cluster (3 nodes) → client apps
   - Table inventory: 8 tables with partition key, clustering key, compaction strategy
   - Data flow: message send → dual write (messages + messages_by_sender), reaction add → message_reactions
   - Per-environment topology from environments/*.env
   - Integration points: go-bff (gocql driver), Prometheus (port 9180)
   - Cross-references to all enterprise directories

2. **runbooks/scaling.md** (~100 lines)
   - When to scale: disk >70%, latency increasing, throughput ceiling
   - Horizontal scaling: add nodes (ScyllaDB scales linearly)
   - Vertical scaling: increase node resources
   - Node addition procedure: configure, bootstrap, verify, repair
   - Data rebalancing: automatic via token ring
   - Scaling milestones: 3→6→9 nodes for 100K→500K→1M users

3. **runbooks/repair.md** (~80 lines)
   - Why repair: consistency after node failures, hinted handoff limits
   - Repair procedure: `nodetool repair quckapp -dc datacenter1`
   - Full vs incremental repair
   - Must complete within gc_grace_seconds (10 days for messages table)
   - ScyllaDB Manager automated repair
   - Troubleshooting: stuck repairs, impact mitigation

4. **runbooks/disaster-recovery.md** (~80 lines)
   - Single node failure: automatic (replicas serve reads)
   - Node replacement: replace_address_first_boot
   - Full cluster recovery from snapshots
   - Post-recovery: repair all keyspaces
   - Communication template

5. **best-practices.md** (~100 lines)
   - Data modeling: query-first design, partition sizing, denormalization
   - Writes: use prepared statements, batch within same partition only
   - Reads: avoid SELECT *, always include partition key, use paging
   - Operations: regular repair, monitor tombstones, clean snapshots
   - Anti-patterns: large partitions, too many tombstones, ALLOW FILTERING, secondary indexes on high-cardinality columns
   - Cross-references to performance/, operations/ directories

**Cleanup:**
- `rmdir permissions/`
- `rmdir roles/`
- `rmdir scripts/`
- `rm -rf schema/` (empty tree)

**Commit message:** `feat(documentation): add architecture docs, runbooks, best practices; remove empty dirs`

---

## Summary

| Task | Directory | Files | Focus |
|------|-----------|-------|-------|
| 1 | data-modeling/ | 4 | Access patterns, partition design, capacity |
| 2 | cluster/ | 4 | Topology, snitch, multi-DC, rack awareness |
| 3 | security/ | 5 | Auth, roles, permissions, TLS, network |
| 4 | monitoring/ | 5 | Prometheus, Grafana, cluster & table alerts |
| 5 | backup/ | 4 | Snapshot, restore, DR |
| 6 | performance/ | 4 | Compaction, repair, cache, driver tuning |
| 7 | operations/ | 4 | Nodetool, node ops, streaming, maintenance |
| 8 | compliance/ | 3 | GDPR, TTL, audit |
| 9 | documentation/ + cleanup | 5 + 4 dirs | Architecture, runbooks, best practices |
| **Total** | | **~38** | |
