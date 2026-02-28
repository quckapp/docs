# QuckApp MySQL Advanced Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add tenant-based archival, replication configs, sharding strategy, and consolidated security infrastructure to `database/quckapp-mysql/`.

**Architecture:** 4 new top-level directories under `database/quckapp-mysql/` plus cleanup of 2 empty directories (`permissions/`, `roles/`). All SQL targets MySQL 8.0 with InnoDB. Replication configs use GTID-based replication. Security follows principle of least privilege with MySQL 8.0 roles.

**Tech Stack:** MySQL 8.0, GTID replication, InnoDB Group Replication, consistent hashing, MySQL keyring encryption, dynamic data masking.

**Design Doc:** `docs/plans/2026-03-01-quckapp-mysql-advanced-infra-design.md`

**Submodule:** `database/quckapp-mysql/` is a git submodule on `master` branch. All commits happen inside it.

---

### Task 1: Create tenant-based archive strategy

**Files:**
- Create: `database/quckapp-mysql/tenant_based/archive_strategy.sql`

**Step 1: Create the file**

Create `tenant_based/archive_strategy.sql` with:

1. **Archive policy table** — `CREATE TABLE IF NOT EXISTS quckapp_admin.archive_policies`:
   - `id BINARY(16) PK DEFAULT (UUID_TO_BIN(UUID()))`
   - `workspace_id CHAR(36) NOT NULL`
   - `tier ENUM('free','pro','enterprise') NOT NULL DEFAULT 'free'`
   - `sessions_retention_days INT NOT NULL DEFAULT 90`
   - `login_history_retention_days INT NOT NULL DEFAULT 90`
   - `audit_retention_days INT NOT NULL DEFAULT 395` (13 months)
   - `thread_retention_days INT NOT NULL DEFAULT 365`
   - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
   - `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
   - `UNIQUE KEY uk_workspace (workspace_id)`

2. **`get_archive_policy(p_workspace_id)`** — stored procedure returning retention config. Falls back to tier defaults if no custom policy exists.

3. **`archive_tenant_data(p_workspace_id, p_cutoff_date)`** — stored procedure that:
   - Archives rows from `quckapp_auth.active_sessions` where `created_at < cutoff` into `quckapp_auth.active_sessions_archived`
   - Archives `quckapp_auth.login_history` → `login_history_archived`
   - Archives `quckapp_thread.threads` → `threads_archived` (with `thread_replies`)
   - Archives `quckapp_channel.channel_pins` → `channel_pins_archived`
   - Each operation: INSERT INTO archive SELECT, then DELETE from source, batched in 1000-row chunks to avoid long locks
   - Returns count of archived rows per table

4. **`purge_archived_data(p_workspace_id, p_retention_days)`** — permanently deletes from `_archived` tables where `archived_at < NOW() - INTERVAL retention_days DAY`

5. **`run_nightly_archival()`** — iterates all workspaces with policies, computes cutoff per table based on tier, calls `archive_tenant_data`. Designed for MySQL scheduled event.

6. **MySQL scheduled event** — `CREATE EVENT IF NOT EXISTS evt_nightly_archival ON SCHEDULE EVERY 1 DAY STARTS ...`

Use `DROP PROCEDURE IF EXISTS` before each `CREATE PROCEDURE` for idempotency.

**Step 2: Commit**

```bash
cd D:/Learning/QuckApp/database/quckapp-mysql
git add tenant_based/archive_strategy.sql
git commit -m "feat(mysql): add tenant-based archive strategy with scheduled event"
```

---

### Task 2: Create primary-replica replication setup

**Files:**
- Create: `database/quckapp-mysql/replication/primary_replica/primary.cnf`
- Create: `database/quckapp-mysql/replication/primary_replica/replica.cnf`
- Create: `database/quckapp-mysql/replication/primary_replica/setup_replication.sql`
- Create: `database/quckapp-mysql/replication/primary_replica/verify_replication.sql`

**Step 1: Create primary.cnf**

MySQL config for the primary server:
- `[mysqld]` section
- `server-id = 1`
- `log-bin = mysql-bin`
- `binlog-format = ROW`
- `binlog-row-image = FULL`
- `gtid_mode = ON`
- `enforce-gtid-consistency = ON`
- `sync_binlog = 1`
- `innodb_flush_log_at_trx_commit = 1`
- Semi-sync source plugin: `rpl_semi_sync_source_enabled = 1`, `rpl_semi_sync_source_timeout = 5000`
- `binlog_expire_logs_seconds = 604800` (7 days)
- Comments explaining each setting

**Step 2: Create replica.cnf**

MySQL config for the replica:
- `server-id = 2` (note: change per replica)
- `relay-log = relay-bin`
- `read_only = ON`
- `super_read_only = ON`
- `gtid_mode = ON`
- `enforce-gtid-consistency = ON`
- `log_replica_updates = ON`
- Semi-sync replica plugin: `rpl_semi_sync_replica_enabled = 1`
- `replica_parallel_workers = 4`
- `replica_parallel_type = LOGICAL_CLOCK`
- `replica_preserve_commit_order = ON`

**Step 3: Create setup_replication.sql**

SQL to configure replication:
- Create replication user on primary: `CREATE USER 'repl_user'@'%' IDENTIFIED BY '${REPL_PASSWORD}'`
- Grant: `GRANT REPLICATION SLAVE ON *.*`
- On replica: `CHANGE REPLICATION SOURCE TO SOURCE_HOST='${PRIMARY_HOST}', SOURCE_USER='repl_user', SOURCE_PASSWORD='${REPL_PASSWORD}', SOURCE_AUTO_POSITION=1`
- `START REPLICA`
- Comments noting placeholder variables

**Step 4: Create verify_replication.sql**

Health check queries:
- `SHOW REPLICA STATUS` key fields check
- Verify Replica_IO_Running = Yes, Replica_SQL_Running = Yes
- Check Seconds_Behind_Source
- GTID consistency check between primary and replica
- Semi-sync status verification

**Step 5: Commit**

```bash
cd D:/Learning/QuckApp/database/quckapp-mysql
git add replication/primary_replica/
git commit -m "feat(mysql): add primary-replica replication setup with GTID and semi-sync"
```

---

### Task 3: Create multi-source replication setup

**Files:**
- Create: `database/quckapp-mysql/replication/multi_source/channel_config.sql`
- Create: `database/quckapp-mysql/replication/multi_source/filter_rules.sql`
- Create: `database/quckapp-mysql/replication/multi_source/conflict_resolution.md`

**Step 1: Create channel_config.sql**

Multi-source replication setup:
- Per-channel `CHANGE REPLICATION SOURCE TO ... FOR CHANNEL 'channel_name'`
- Example channels: `shard_us`, `shard_eu`, `shard_apac` (regional shards feeding analytics replica)
- Each channel with its own source host, credentials, GTID auto-positioning
- `START REPLICA FOR CHANNEL 'channel_name'`
- Status check: `SELECT * FROM performance_schema.replication_connection_status`

**Step 2: Create filter_rules.sql**

Database-level replication filters:
- `CHANGE REPLICATION FILTER REPLICATE_DO_DB = (db1, db2) FOR CHANNEL 'channel_name'`
- Example: `shard_us` channel replicates only `quckapp_channel`, `quckapp_thread`
- Table-level filtering examples with `REPLICATE_DO_TABLE`
- Wildcard patterns with `REPLICATE_WILD_DO_TABLE`

**Step 3: Create conflict_resolution.md**

Document covering:
- Why conflicts happen in multi-source (same table written from multiple sources)
- Prevention strategies: shard key partitioning, non-overlapping auto-increment ranges
- Detection: `SHOW REPLICA STATUS FOR CHANNEL` error codes
- Resolution: skip transaction, manual data reconciliation
- Auto-increment offset configuration: `auto_increment_increment`, `auto_increment_offset`

**Step 4: Commit**

```bash
cd D:/Learning/QuckApp/database/quckapp-mysql
git add replication/multi_source/
git commit -m "feat(mysql): add multi-source replication channel configs and conflict resolution"
```

---

### Task 4: Create group replication setup

**Files:**
- Create: `database/quckapp-mysql/replication/group_replication/group_config.cnf`
- Create: `database/quckapp-mysql/replication/group_replication/bootstrap.sql`
- Create: `database/quckapp-mysql/replication/group_replication/member_join.sql`
- Create: `database/quckapp-mysql/replication/group_replication/consistency_levels.md`

**Step 1: Create group_config.cnf**

InnoDB Group Replication config:
- `plugin_load_add = 'group_replication.so'`
- `group_replication_group_name = '<UUID>'` (generate a fixed UUID)
- `group_replication_single_primary_mode = ON`
- `group_replication_start_on_boot = OFF`
- `group_replication_local_address = '${HOST}:33061'`
- `group_replication_group_seeds = 'host1:33061,host2:33061,host3:33061'`
- `group_replication_communication_stack = MYSQL`
- Transaction write set extraction: `transaction_write_set_extraction = XXHASH64`
- `group_replication_member_expel_timeout = 5`

**Step 2: Create bootstrap.sql**

First member bootstrap:
- `SET GLOBAL group_replication_bootstrap_group = ON`
- `START GROUP_REPLICATION`
- `SET GLOBAL group_replication_bootstrap_group = OFF`
- Create replication user
- Verify with `SELECT * FROM performance_schema.replication_group_members`

**Step 3: Create member_join.sql**

Joining members:
- Create replication user (same as bootstrap)
- `CHANGE REPLICATION SOURCE TO ... FOR CHANNEL 'group_replication_recovery'`
- `START GROUP_REPLICATION`
- Verify member status
- Graceful leave: `STOP GROUP_REPLICATION`

**Step 4: Create consistency_levels.md**

Document covering:
- `BEFORE` consistency (read-your-writes from any member)
- `AFTER` consistency (write confirmed on all members before returning)
- `BEFORE_AND_AFTER` (both)
- `EVENTUAL` (default, highest performance)
- Per-session: `SET @@SESSION.group_replication_consistency = 'BEFORE'`
- Trade-offs table: latency vs consistency per level
- When to use each level (financial transactions, user profile reads, analytics queries)

**Step 5: Commit**

```bash
cd D:/Learning/QuckApp/database/quckapp-mysql
git add replication/group_replication/
git commit -m "feat(mysql): add InnoDB Group Replication setup and consistency guide"
```

---

### Task 5: Create replication failover strategy

**Files:**
- Create: `database/quckapp-mysql/replication/failover_strategy.md`

**Step 1: Create the file**

Comprehensive failover document:
- **Decision matrix** — table mapping topology × failure type → recommended action
- **Primary-replica failover** — promote replica to primary (GTID-based), update ProxySQL routing, application reconnection
- **Multi-source failover** — per-channel recovery, re-pointing channels to new source
- **Group replication failover** — automatic primary election in single-primary mode, manual intervention scenarios
- **MySQL Router integration** — automatic failover routing with `--routing-strategy=first-available`
- **ProxySQL integration** — hostgroup configuration, health check scripts, automatic failover
- **Orchestrator integration** — topology discovery, automated failover with hooks
- **Post-failover checklist** — data verification, replication rebuild, monitoring reset, DNS updates
- **RTO/RPO targets** — table with targets per topology

**Step 2: Commit**

```bash
cd D:/Learning/QuckApp/database/quckapp-mysql
git add replication/failover_strategy.md
git commit -m "docs(mysql): add comprehensive replication failover strategy"
```

---

### Task 6: Create sharding infrastructure

**Files:**
- Create: `database/quckapp-mysql/sharding/shard_map.sql`
- Create: `database/quckapp-mysql/sharding/routing_logic.sql`
- Create: `database/quckapp-mysql/sharding/rebalance_plan.md`

**Step 1: Create shard_map.sql**

Shard mapping tables and configuration:
- `CREATE DATABASE IF NOT EXISTS quckapp_shard_meta`
- `shard_config` table — shard_id INT PK, shard_name VARCHAR(64), host VARCHAR(255), port INT, database_name VARCHAR(64), status ENUM('active','draining','inactive'), weight INT DEFAULT 1, created_at, updated_at
- `shard_key_map` table — table_name VARCHAR(128) PK, shard_key_column VARCHAR(64), shard_algorithm ENUM('hash','range','directory'), total_shards INT
- Seed data: default shard key assignments (workspace_id for channel/thread/workspace, user_id for auth)
- `get_shard_for_key(p_table_name, p_key_value)` function — returns shard connection info

**Step 2: Create routing_logic.sql**

Shard routing implementation:
- `compute_shard_id(p_key VARCHAR(255), p_total_shards INT)` — consistent hash using CRC32: `CRC32(p_key) MOD p_total_shards`
- `route_query(p_table_name, p_key_value)` — looks up shard_key_map, computes shard_id, returns shard_config row
- `get_shard_range(p_shard_id)` — for range-based sharding, returns key range boundaries
- Cross-shard query helper: `fan_out_query(p_sql_template)` — returns list of per-shard SQL to execute from application layer
- Virtual shard mapping for consistent hashing with rebalancing support (vnodes)

**Step 3: Create rebalance_plan.md**

Runbook for shard operations:
- **Adding a shard** — provision database, register in shard_config, set status to 'active', update total_shards, run data migration for affected key ranges
- **Removing a shard** — set status to 'draining', migrate data to remaining shards, verify zero rows, set 'inactive', remove
- **Split operation** — split one shard into two at a key boundary
- **Merge operation** — combine two adjacent shards
- **Zero-downtime migration** — dual-write approach: write to both old and new shard during transition, read from new, cutover, cleanup old
- **Monitoring during rebalance** — key metrics to watch (replication lag, query latency, connection count)
- **Rollback procedure** — how to undo a failed rebalance

**Step 4: Commit**

```bash
cd D:/Learning/QuckApp/database/quckapp-mysql
git add sharding/
git commit -m "feat(mysql): add sharding infrastructure with consistent hash routing"
```

---

### Task 7: Create security users, roles, and grants

**Files:**
- Create: `database/quckapp-mysql/security/users.sql`
- Create: `database/quckapp-mysql/security/roles.sql`
- Create: `database/quckapp-mysql/security/grants.sql`

**Step 1: Create users.sql**

MySQL user definitions:
- `quckapp_app` — main application user per environment (dev/qa/staging/prod host patterns)
- `quckapp_readonly` — read-only for dashboards and analytics
- `quckapp_migration` — Flyway migration user with DDL privileges
- `quckapp_backup` — backup scripts user (SELECT, LOCK TABLES, RELOAD, SHOW VIEW)
- `quckapp_monitor` — monitoring user (PROCESS, REPLICATION CLIENT, SELECT on performance_schema)
- `quckapp_audit` — audit-only user (INSERT, SELECT on audit_log tables only)
- Use `CREATE USER IF NOT EXISTS` for idempotency
- Password placeholders: `'${MYSQL_APP_PASSWORD}'` etc.
- Per-environment host patterns: `'%'` for dev, specific CIDR for prod

**Step 2: Create roles.sql**

MySQL 8.0 roles:
- `CREATE ROLE IF NOT EXISTS 'quckapp_app_role', 'quckapp_readonly_role', 'quckapp_admin_role', 'quckapp_backup_role', 'quckapp_monitor_role'`
- `quckapp_app_role` — SELECT, INSERT, UPDATE, DELETE on all `quckapp_*` service tables
- `quckapp_readonly_role` — SELECT only on all `quckapp_*` databases
- `quckapp_admin_role` — ALL PRIVILEGES on `quckapp_admin` database
- `quckapp_backup_role` — SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER on all databases
- `quckapp_monitor_role` — PROCESS, REPLICATION CLIENT, SELECT on performance_schema and sys

**Step 3: Create grants.sql**

GRANT statements following principle of least privilege:
- Map users to roles: `GRANT 'quckapp_app_role' TO 'quckapp_app'@'%'`
- Set default roles: `SET DEFAULT ROLE 'quckapp_app_role' TO 'quckapp_app'@'%'`
- Per-service granular grants where the role is too broad (e.g., auth-service user only needs quckapp_auth)
- Explicit REVOKE of dangerous privileges: FILE, SUPER, SHUTDOWN
- FLUSH PRIVILEGES at end

**Step 4: Commit**

```bash
cd D:/Learning/QuckApp/database/quckapp-mysql
git add security/users.sql security/roles.sql security/grants.sql
git commit -m "feat(mysql): add security users, roles, and least-privilege grants"
```

---

### Task 8: Create row-level security patterns and data masking

**Files:**
- Create: `database/quckapp-mysql/security/row_level_security_patterns.md`
- Create: `database/quckapp-mysql/security/masking/masking_functions.sql`
- Create: `database/quckapp-mysql/security/masking/masked_views.sql`

**Step 1: Create row_level_security_patterns.md**

Document covering:
- MySQL doesn't have native RLS — pattern uses views + session variables
- Set `@current_workspace_id` at connection time (application middleware sets it)
- Create filtered views: `CREATE VIEW v_channels AS SELECT * FROM channels WHERE workspace_id = @current_workspace_id`
- Grant app users SELECT on views only, not base tables
- Limitations: doesn't protect against direct table access if user has table-level grants
- Alternative: use ProxySQL query rules to inject WHERE clauses
- Examples for channels, workspace_members, threads

**Step 2: Create masking_functions.sql**

Stored functions for dynamic data masking:
- `mask_email(email VARCHAR(255))` → `j***@example.com` (keep first char + domain)
- `mask_phone(phone VARCHAR(20))` → `***-***-1234` (keep last 4 digits)
- `mask_token(token VARCHAR(255))` → `abcd****` (keep first 4 chars)
- `mask_name(name VARCHAR(255))` → `J*** D***` (keep first char of each word)
- `mask_ip(ip VARCHAR(45))` → `192.168.xxx.xxx` (keep first two octets)
- All functions are deterministic, returns same mask for same input

**Step 3: Create masked_views.sql**

Masked views over PII tables for dev/QA:
- `v_masked_auth_users` — calls `mask_email()` on email, hides password_hash entirely
- `v_masked_user_profiles` — masks phone_number, email
- `v_masked_login_history` — masks email, ip_address
- `v_masked_oauth_connections` — hides access_token, refresh_token entirely (returns NULL)
- `v_masked_devices` — masks device_token
- Create in `quckapp_warehouse` database for non-prod analytics access
- Each view references the production table but applies masking functions

**Step 4: Commit**

```bash
cd D:/Learning/QuckApp/database/quckapp-mysql
git add security/row_level_security_patterns.md security/masking/
git commit -m "feat(mysql): add RLS patterns and dynamic data masking for non-prod"
```

---

### Task 9: Create encryption configuration

**Files:**
- Create: `database/quckapp-mysql/security/encryption/tde_setup.sql`
- Create: `database/quckapp-mysql/security/encryption/column_encryption.md`
- Create: `database/quckapp-mysql/security/encryption/keyring_config.cnf`

**Step 1: Create tde_setup.sql**

Transparent Data Encryption setup:
- Enable tablespace encryption for PII-heavy databases: `ALTER TABLESPACE quckapp_auth ENCRYPTION='Y'`
- Apply to: quckapp_auth, quckapp_admin, quckapp_security, quckapp_user
- Verify: `SELECT NAME, ENCRYPTION FROM INFORMATION_SCHEMA.INNODB_TABLESPACES WHERE ENCRYPTION='Y'`
- `innodb_redo_log_encrypt = ON` for redo log encryption
- `innodb_undo_log_encrypt = ON` for undo log encryption
- Binary log encryption: `binlog_encryption = ON`

**Step 2: Create column_encryption.md**

Document covering:
- When to use column-level vs TDE (column: specific fields like tokens, TDE: entire database)
- `AES_ENCRYPT(data, @encryption_key)` / `AES_DECRYPT(data, @encryption_key)` patterns
- Key management: load from keyring at session start, never hardcode
- Example: encrypting `infrastructure_configs.password_encrypted` and `firebase_configs.private_key_encrypted`
- Performance impact: benchmarks showing overhead per encrypted column
- Migration pattern: add encrypted column, backfill, drop plaintext column, rename

**Step 3: Create keyring_config.cnf**

Keyring plugin configuration:
- `[mysqld]` section with `early-plugin-load` for keyring
- `keyring_file` for dev/local: `keyring_file_data = /var/lib/mysql-keyring/keyring`
- `keyring_aws` for production: `keyring_aws_region`, `keyring_aws_cmk_id` placeholders
- `keyring_encrypted_file` for staging: file-based with master password
- Comments explaining which to use per environment
- Key rotation procedure reference

**Step 4: Commit**

```bash
cd D:/Learning/QuckApp/database/quckapp-mysql
git add security/encryption/
git commit -m "feat(mysql): add TDE setup and keyring encryption configuration"
```

---

### Task 10: Cleanup empty directories and final verification

**Files:**
- Remove: `database/quckapp-mysql/permissions/`
- Remove: `database/quckapp-mysql/roles/`

**Step 1: Remove empty directories**

```bash
cd D:/Learning/QuckApp/database/quckapp-mysql
git rm -r permissions/ roles/
```

Note: `git rm -r` will fail if directories have no tracked files. In that case, just `rmdir` them — they're untracked empty dirs.

**Step 2: Verify all new files exist**

```bash
find tenant_based replication sharding security -type f | sort
```

Expected: ~20 files across 4 directories.

**Step 3: Verify directory structure**

```bash
ls -R tenant_based/ replication/ sharding/ security/
```

Verify all subdirectories match the design.

**Step 4: Commit cleanup**

```bash
git add -A
git commit -m "chore(mysql): remove empty permissions/ and roles/ dirs (consolidated into security/)"
```

**Step 5: Update parent repo submodule reference**

```bash
cd D:/Learning/QuckApp
git add database/quckapp-mysql
git commit -m "chore: update quckapp-mysql submodule (advanced infrastructure)"
```
