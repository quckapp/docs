# ScyllaDB EC2 Terraform Module Design

## Context

The `infrastructure/scylladb/` directory has a single `schema.cql` file — a reference copy of the 8-table message storage schema. The comprehensive operational configs (cluster management, security, monitoring, backups, CDC, multi-region) already live in the `database/quckapp-scylladb/` git submodule with 100+ files. However, there is no Terraform module for provisioning ScyllaDB clusters, unlike RDS (PostgreSQL/MySQL), ElastiCache (Redis), and DynamoDB which all have modules in `infrastructure/terraform/modules/`.

## Existing State

- **ScyllaDB submodule** (`database/quckapp-scylladb/`): Enterprise-ready with cluster configs, security roles, monitoring dashboards, backup scripts, K8s manifests, CDC, multi-region failover
- **Schema** (`infrastructure/scylladb/schema.cql`): 8 tables — messages, reactions, read/delivery receipts, starred, pinned, scheduled, messages_by_sender
- **Terraform modules** (`infrastructure/terraform/modules/`): 16 modules (rds, elasticache, dynamodb, vpc, etc.) but no scylladb
- **Go BFF** (`services/go-bff/`): Primary consumer via gocql driver, LOCAL_QUORUM reads, token-aware routing
- **Docker dev cluster** (`database/quckapp-scylladb/tools/docker-compose.yml`): 3-node ScyllaDB 5.4 cluster

## Decisions

- **EC2 self-managed**: ScyllaDB has no AWS managed service (unlike RDS/ElastiCache). Deploy on i3/i3en instances with NVMe SSDs for optimal shard-per-core performance
- **ASG-based**: Auto Scaling Group for instance replacement (not auto-scaling — database clusters scale manually)
- **Seed discovery via tags**: EC2 tags identify seed nodes, user data script configures `seeds` list on bootstrap
- **Follow existing patterns**: Same variable/output/locals structure as RDS and ElastiCache modules
- **4 environments**: dev, staging, production, live — matching existing Terraform environment configs

## Architecture

```
                         VPC (private subnets)
                              |
                    +---------+---------+
                    |                   |
              +-----v-----+     +------v-----+
              |  NLB       |     | Seed Node  |
              | (optional) |     | Discovery  |
              | :9042 CQL  |     | (EC2 tags) |
              +-----+-----+     +------+-----+
                    |                   |
        +-----------+-----------+-------+
        |           |           |
   +----v----+ +---v----+ +---v----+
   | ScyllaDB| |ScyllaDB| |ScyllaDB|
   | Node 1  | | Node 2 | | Node 3 |
   | (seed)  | |        | |        |
   | i3.xl   | | i3.xl  | | i3.xl  |
   +---------+ +--------+ +--------+
        |           |           |
   NVMe SSD    NVMe SSD    NVMe SSD
   (ephemeral) (ephemeral) (ephemeral)
```

## Module Structure

Following existing patterns (RDS/ElastiCache), 5 files:

| File | Purpose | ~Lines |
|------|---------|--------|
| `main.tf` | Launch template, ASG, security groups, IAM, CloudWatch | ~400 |
| `variables.tf` | Instance type, cluster size, network, security, backup, monitoring | ~500 |
| `outputs.tf` | Endpoints, security group IDs, IAM role ARN, connection config | ~150 |
| `locals.tf` | Common tags, identifier, computed values | ~50 |
| `versions.tf` | AWS provider >= 5.0, Terraform >= 1.5 | ~15 |

## Resources

### Launch Template

| Setting | Value |
|---------|-------|
| AMI | ScyllaDB 5.4 AMI (`${var.ami_id}`) |
| Instance type | `${var.instance_type}` (default: i3.xlarge) |
| Key pair | `${var.key_pair_name}` |
| IAM instance profile | Auto-created role |
| User data | Bootstrap script: configure seeds, snitch, rack-dc, start scylla |
| Metadata | IMDSv2 required |
| Monitoring | Enhanced (if enabled) |

### Auto Scaling Group

| Setting | Value |
|---------|-------|
| Min/Max/Desired | `${var.cluster_size}` (all same — no auto-scaling) |
| AZ distribution | Spread across `${var.subnet_ids}` |
| Health check | EC2 (not ELB) |
| Termination policy | OldestInstance |
| New instances protected | Yes (prevent accidental termination) |
| Suspended processes | ReplaceUnhealthy (manual DB node replacement) |

### Security Group

| Rule | Port | Source | Purpose |
|------|------|--------|---------|
| CQL native | 9042 | `allowed_cidr_blocks` + `allowed_security_group_ids` | Client connections |
| CQL shard-aware | 19042 | Same as CQL | Shard-aware driver connections |
| Internode | 7000 | Self | Gossip/streaming (unencrypted) |
| Internode TLS | 7001 | Self | Gossip/streaming (encrypted) |
| JMX | 7199 | Self | Nodetool management |
| Prometheus | 9180 | Monitoring SG / CIDR | Metrics scraping |
| REST API | 10000 | Self | ScyllaDB REST API |
| SSH | 22 | Bastion SG (optional) | Emergency access |

### IAM Role

| Permission | Resource | Purpose |
|-----------|----------|---------|
| `logs:CreateLogGroup`, `logs:PutLogEvents` | CloudWatch | System logs |
| `s3:PutObject`, `s3:GetObject` | Backup S3 bucket | Snapshot uploads/restores |
| `ssm:GetParameter` | SSM params | Secrets (auth credentials) |
| `ec2:DescribeInstances` | Self | Seed node discovery |
| `ec2:DescribeTags` | Self | Tag-based configuration |

### CloudWatch Alarms

| Alarm | Metric | Threshold |
|-------|--------|-----------|
| High CPU | CPUUtilization | > 80% for 5 min |
| Status check | StatusCheckFailed | >= 1 for 3 min |
| Network in | NetworkIn | > 1 GB/s for 5 min |
| Disk read ops | DiskReadOps | Depends on instance |

## Environment Overrides

| Setting | Dev | Staging | Production | Live |
|---------|-----|---------|------------|------|
| Instance type | i3.xlarge | i3.xlarge | i3.2xlarge | i3.4xlarge |
| Cluster size | 3 | 3 | 3 | 6 |
| AZ count | 2 | 2 | 3 | 3 |
| Enhanced monitoring | No | Yes | Yes | Yes |
| S3 backup | Disabled | Daily | Every 6h | Every 6h |
| EBS encryption | No | Yes | Yes | Yes |
| CloudWatch alarms | No | Yes | Yes | Yes |
| CloudWatch dashboard | No | No | Yes | Yes |
| SSH access | Bastion SG | Bastion SG | Disabled | Disabled |

## Variable Groups

### General Configuration
- `environment` (required) — dev, staging, production, live
- `identifier` (optional, default: `quckapp-${environment}`)
- `tags` (optional, map)

### Instance Configuration
- `instance_type` (default: i3.xlarge)
- `cluster_size` (default: 3)
- `ami_id` (required — ScyllaDB AMI)
- `key_pair_name` (optional)
- `root_volume_size` (default: 50 GB)

### Network Configuration
- `vpc_id` (required)
- `subnet_ids` (required, list)
- `create_security_group` (default: true)
- `allowed_cidr_blocks` (list)
- `allowed_security_group_ids` (list)
- `create_nlb` (default: false)

### ScyllaDB Configuration
- `scylla_version` (default: "5.4")
- `seed_count` (default: 2)
- `snitch_type` (default: Ec2Snitch)
- `datacenter_name` (default: datacenter1)
- `rack_prefix` (default: rack)
- `smp_threads` (default: 0 — auto-detect)
- `memory_allocation` (default: null — auto)
- `overprovisioned` (default: false — true for dev)

### Security Configuration
- `encrypt_at_rest` (default: true)
- `kms_key_arn` (optional)
- `enable_internode_encryption` (default: false)
- `enable_client_encryption` (default: false)

### Backup Configuration
- `enable_s3_backup` (default: false)
- `backup_s3_bucket` (optional)
- `backup_schedule` (default: "0 */6 * * *")
- `backup_retention_days` (default: 7)

### Monitoring Configuration
- `create_cloudwatch_alarms` (default: false)
- `create_cloudwatch_dashboard` (default: false)
- `alarm_actions` (list of SNS topic ARNs)
- `enhanced_monitoring` (default: false)

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| `cluster_instance_ids` | list(string) | EC2 instance IDs |
| `seed_node_ips` | list(string) | Private IPs of seed nodes |
| `security_group_id` | string | SG for allowing app access |
| `iam_role_arn` | string | Instance IAM role |
| `iam_instance_profile_arn` | string | Instance profile |
| `asg_name` | string | Auto Scaling Group name |
| `asg_arn` | string | ASG ARN |
| `nlb_dns_name` | string | NLB endpoint (if created) |
| `connection_config` | object | Structured: hosts, port, datacenter, keyspace |

## File Count

5 files in `terraform/modules/scylladb/`, plus environment config additions to existing `terraform/environments/*/main.tf`.
