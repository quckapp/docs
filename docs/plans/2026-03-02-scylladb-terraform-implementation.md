# ScyllaDB EC2 Terraform Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Terraform module for provisioning self-managed ScyllaDB clusters on AWS EC2 instances, filling the gap vs existing RDS/ElastiCache/DynamoDB modules.

**Architecture:** EC2 Auto Scaling Group with ScyllaDB AMI and i3 NVMe instances, security groups for CQL/internode/Prometheus traffic, IAM roles for CloudWatch/S3/SSM access, and CloudWatch alarms. Follows the same locals/variables/outputs patterns as the existing RDS and ElastiCache modules.

**Tech Stack:** Terraform (>= 1.5), AWS provider (>= 5.0), EC2, ASG, IAM, CloudWatch, S3

---

## Task 1: Create Module Foundation (versions.tf + locals.tf)

**Files:**
- Create: `terraform/modules/scylladb/versions.tf`
- Create: `terraform/modules/scylladb/locals.tf`

**Step 1: Create versions.tf**

Create `terraform/modules/scylladb/versions.tf`:

```hcl
# =============================================================================
# ScyllaDB EC2 Cluster - Provider Requirements
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0"
    }
  }
}
```

**Step 2: Create locals.tf**

Create `terraform/modules/scylladb/locals.tf`:

```hcl
# =============================================================================
# ScyllaDB EC2 Cluster - Local Values
# =============================================================================

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  common_tags = merge(var.tags, {
    Module      = "scylladb"
    Environment = var.environment
    ManagedBy   = "terraform"
  })

  identifier = var.identifier != null ? var.identifier : "quckapp-${var.environment}"

  # CQL native port (always 9042)
  cql_port = 9042

  # Shard-aware driver port
  shard_aware_port = 19042

  # Internode ports
  internode_port     = 7000
  internode_tls_port = 7001

  # Management ports
  jmx_port        = 7199
  prometheus_port = 9180
  rest_api_port   = 10000

  # SSH port (optional)
  ssh_port = 22

  # Seed nodes: first N nodes in the cluster
  seed_count = min(var.seed_count, var.cluster_size)

  # Account ID for IAM
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
}
```

**Step 3: Commit**

```bash
cd infrastructure
git add terraform/modules/scylladb/versions.tf terraform/modules/scylladb/locals.tf
git commit -m "feat(terraform): add ScyllaDB module foundation (versions + locals)"
```

---

## Task 2: Create Variables (variables.tf)

**Files:**
- Create: `terraform/modules/scylladb/variables.tf`

**Step 1: Create variables.tf**

Create `terraform/modules/scylladb/variables.tf`:

```hcl
# =============================================================================
# ScyllaDB EC2 Cluster - Input Variables
# =============================================================================

# -----------------------------------------------------------------------------
# General Configuration
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Environment name (dev, staging, production, live)"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "production", "live"], var.environment)
    error_message = "Environment must be dev, staging, production, or live."
  }
}

variable "identifier" {
  description = "Cluster identifier. Defaults to quckapp-{environment}"
  type        = string
  default     = null
}

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}

# -----------------------------------------------------------------------------
# Instance Configuration
# -----------------------------------------------------------------------------

variable "instance_type" {
  description = "EC2 instance type. i3 family recommended for NVMe SSDs"
  type        = string
  default     = "i3.xlarge"

  validation {
    condition     = can(regex("^(i3|i3en|i4i|c5d|m5d|r5d)", var.instance_type))
    error_message = "Instance type should be from i3, i3en, i4i, or NVMe-capable families."
  }
}

variable "cluster_size" {
  description = "Number of ScyllaDB nodes in the cluster"
  type        = number
  default     = 3

  validation {
    condition     = var.cluster_size >= 1 && var.cluster_size <= 20
    error_message = "Cluster size must be between 1 and 20."
  }
}

variable "ami_id" {
  description = "ScyllaDB AMI ID. Use ScyllaDB official AMIs from AWS Marketplace"
  type        = string
}

variable "key_pair_name" {
  description = "EC2 key pair name for SSH access. Set null to disable SSH"
  type        = string
  default     = null
}

variable "root_volume_size" {
  description = "Root EBS volume size in GB (OS only — data uses NVMe)"
  type        = number
  default     = 50
}

variable "root_volume_type" {
  description = "Root EBS volume type"
  type        = string
  default     = "gp3"
}

# -----------------------------------------------------------------------------
# Network Configuration
# -----------------------------------------------------------------------------

variable "vpc_id" {
  description = "VPC ID where ScyllaDB nodes will be deployed"
  type        = string
}

variable "subnet_ids" {
  description = "List of private subnet IDs (one per AZ for distribution)"
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 1
    error_message = "At least one subnet is required."
  }
}

variable "create_security_group" {
  description = "Whether to create a security group for ScyllaDB"
  type        = bool
  default     = true
}

variable "security_group_ids" {
  description = "Existing security group IDs (used when create_security_group is false)"
  type        = list(string)
  default     = []
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to connect to CQL port (9042)"
  type        = list(string)
  default     = []
}

variable "allowed_security_group_ids" {
  description = "Security group IDs allowed to connect to CQL port (9042)"
  type        = list(string)
  default     = []
}

variable "monitoring_cidr_blocks" {
  description = "CIDR blocks allowed to scrape Prometheus metrics (9180)"
  type        = list(string)
  default     = []
}

variable "monitoring_security_group_ids" {
  description = "Security group IDs allowed to scrape Prometheus metrics (9180)"
  type        = list(string)
  default     = []
}

variable "bastion_security_group_id" {
  description = "Bastion/jump host security group ID for SSH access"
  type        = string
  default     = null
}

variable "create_nlb" {
  description = "Whether to create an NLB for CQL load balancing"
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# ScyllaDB Configuration
# -----------------------------------------------------------------------------

variable "scylla_version" {
  description = "ScyllaDB version (informational — actual version is in the AMI)"
  type        = string
  default     = "5.4"
}

variable "seed_count" {
  description = "Number of seed nodes (should not exceed cluster_size)"
  type        = number
  default     = 2
}

variable "snitch_type" {
  description = "ScyllaDB snitch type for topology awareness"
  type        = string
  default     = "Ec2Snitch"

  validation {
    condition     = contains(["Ec2Snitch", "Ec2MultiRegionSnitch", "GossipingPropertyFileSnitch", "SimpleSnitch"], var.snitch_type)
    error_message = "Snitch must be Ec2Snitch, Ec2MultiRegionSnitch, GossipingPropertyFileSnitch, or SimpleSnitch."
  }
}

variable "datacenter_name" {
  description = "Datacenter name for GossipingPropertyFileSnitch"
  type        = string
  default     = "datacenter1"
}

variable "rack_prefix" {
  description = "Rack name prefix (appended with AZ letter, e.g., rack-a)"
  type        = string
  default     = "rack"
}

variable "smp_threads" {
  description = "Number of SMP threads (0 = auto-detect based on CPU count)"
  type        = number
  default     = 0
}

variable "memory_allocation" {
  description = "Memory allocation for ScyllaDB (e.g., '28G'). Null = auto-detect"
  type        = string
  default     = null
}

variable "overprovisioned" {
  description = "Set true for shared/dev instances (disables I/O scheduler tuning)"
  type        = bool
  default     = false
}

variable "authenticator" {
  description = "ScyllaDB authenticator class"
  type        = string
  default     = "AllowAllAuthenticator"

  validation {
    condition     = contains(["AllowAllAuthenticator", "PasswordAuthenticator", "com.scylladb.auth.TransitionalAuthenticator"], var.authenticator)
    error_message = "Authenticator must be AllowAllAuthenticator, PasswordAuthenticator, or TransitionalAuthenticator."
  }
}

variable "authorizer" {
  description = "ScyllaDB authorizer class"
  type        = string
  default     = "AllowAllAuthorizer"

  validation {
    condition     = contains(["AllowAllAuthorizer", "CassandraAuthorizer", "com.scylladb.auth.TransitionalAuthorizer"], var.authorizer)
    error_message = "Authorizer must be AllowAllAuthorizer, CassandraAuthorizer, or TransitionalAuthorizer."
  }
}

# -----------------------------------------------------------------------------
# Security Configuration
# -----------------------------------------------------------------------------

variable "encrypt_at_rest" {
  description = "Enable EBS encryption for root volume"
  type        = bool
  default     = true
}

variable "kms_key_arn" {
  description = "KMS key ARN for EBS encryption. Null = AWS-managed key"
  type        = string
  default     = null
}

variable "enable_internode_encryption" {
  description = "Enable TLS encryption for internode communication (port 7001)"
  type        = bool
  default     = false
}

variable "enable_client_encryption" {
  description = "Enable TLS encryption for client CQL connections"
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# Backup Configuration
# -----------------------------------------------------------------------------

variable "enable_s3_backup" {
  description = "Enable automated snapshot backups to S3"
  type        = bool
  default     = false
}

variable "backup_s3_bucket" {
  description = "S3 bucket name for snapshot backups"
  type        = string
  default     = null
}

variable "backup_schedule" {
  description = "Cron expression for backup schedule (default: every 6 hours)"
  type        = string
  default     = "0 */6 * * *"
}

variable "backup_retention_days" {
  description = "Number of days to retain backup snapshots"
  type        = number
  default     = 7
}

# -----------------------------------------------------------------------------
# Monitoring Configuration
# -----------------------------------------------------------------------------

variable "create_cloudwatch_alarms" {
  description = "Whether to create CloudWatch alarms"
  type        = bool
  default     = false
}

variable "create_cloudwatch_dashboard" {
  description = "Whether to create a CloudWatch dashboard"
  type        = bool
  default     = false
}

variable "alarm_actions" {
  description = "List of SNS topic ARNs for alarm notifications"
  type        = list(string)
  default     = []
}

variable "enhanced_monitoring" {
  description = "Enable detailed EC2 monitoring (1-minute intervals)"
  type        = bool
  default     = false
}

variable "alarm_cpu_threshold" {
  description = "CPU utilization alarm threshold (percent)"
  type        = number
  default     = 80
}

variable "alarm_evaluation_periods" {
  description = "Number of periods before alarm triggers"
  type        = number
  default     = 3
}
```

**Step 2: Validate syntax**

```bash
cd infrastructure/terraform/modules/scylladb
terraform fmt -check
```

Expected: No errors (files already formatted).

**Step 3: Commit**

```bash
cd infrastructure
git add terraform/modules/scylladb/variables.tf
git commit -m "feat(terraform): add ScyllaDB module variables"
```

---

## Task 3: Create Main Resources (main.tf)

**Files:**
- Create: `terraform/modules/scylladb/main.tf`

**Step 1: Create main.tf**

Create `terraform/modules/scylladb/main.tf`:

```hcl
# =============================================================================
# ScyllaDB EC2 Cluster - Main Resources
# =============================================================================
# Self-managed ScyllaDB cluster on EC2 instances with NVMe SSDs.
# Provisions: Launch Template, ASG, Security Groups, IAM, CloudWatch.
# =============================================================================

# -----------------------------------------------------------------------------
# Security Group
# -----------------------------------------------------------------------------

resource "aws_security_group" "scylladb" {
  count = var.create_security_group ? 1 : 0

  name_prefix = "${local.identifier}-scylladb-"
  description = "Security group for ScyllaDB cluster"
  vpc_id      = var.vpc_id

  tags = merge(local.common_tags, {
    Name = "${local.identifier}-scylladb-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# CQL native transport (9042) - from application subnets
resource "aws_security_group_rule" "cql_cidr" {
  count = var.create_security_group && length(var.allowed_cidr_blocks) > 0 ? 1 : 0

  type              = "ingress"
  from_port         = local.cql_port
  to_port           = local.cql_port
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidr_blocks
  security_group_id = aws_security_group.scylladb[0].id
  description       = "CQL native transport from allowed CIDRs"
}

resource "aws_security_group_rule" "cql_sg" {
  for_each = var.create_security_group ? toset(var.allowed_security_group_ids) : toset([])

  type                     = "ingress"
  from_port                = local.cql_port
  to_port                  = local.cql_port
  protocol                 = "tcp"
  source_security_group_id = each.value
  security_group_id        = aws_security_group.scylladb[0].id
  description              = "CQL native transport from application SG"
}

# Shard-aware driver port (19042) - same sources as CQL
resource "aws_security_group_rule" "shard_aware_cidr" {
  count = var.create_security_group && length(var.allowed_cidr_blocks) > 0 ? 1 : 0

  type              = "ingress"
  from_port         = local.shard_aware_port
  to_port           = local.shard_aware_port
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidr_blocks
  security_group_id = aws_security_group.scylladb[0].id
  description       = "Shard-aware CQL driver port from allowed CIDRs"
}

resource "aws_security_group_rule" "shard_aware_sg" {
  for_each = var.create_security_group ? toset(var.allowed_security_group_ids) : toset([])

  type                     = "ingress"
  from_port                = local.shard_aware_port
  to_port                  = local.shard_aware_port
  protocol                 = "tcp"
  source_security_group_id = each.value
  security_group_id        = aws_security_group.scylladb[0].id
  description              = "Shard-aware CQL driver port from application SG"
}

# Internode communication (7000/7001) - cluster self
resource "aws_security_group_rule" "internode" {
  count = var.create_security_group ? 1 : 0

  type              = "ingress"
  from_port         = local.internode_port
  to_port           = local.internode_tls_port
  protocol          = "tcp"
  self              = true
  security_group_id = aws_security_group.scylladb[0].id
  description       = "Internode gossip and streaming (self)"
}

# JMX management (7199) - cluster self
resource "aws_security_group_rule" "jmx" {
  count = var.create_security_group ? 1 : 0

  type              = "ingress"
  from_port         = local.jmx_port
  to_port           = local.jmx_port
  protocol          = "tcp"
  self              = true
  security_group_id = aws_security_group.scylladb[0].id
  description       = "JMX management (self)"
}

# REST API (10000) - cluster self
resource "aws_security_group_rule" "rest_api" {
  count = var.create_security_group ? 1 : 0

  type              = "ingress"
  from_port         = local.rest_api_port
  to_port           = local.rest_api_port
  protocol          = "tcp"
  self              = true
  security_group_id = aws_security_group.scylladb[0].id
  description       = "ScyllaDB REST API (self)"
}

# Prometheus metrics (9180) - from monitoring
resource "aws_security_group_rule" "prometheus_cidr" {
  count = var.create_security_group && length(var.monitoring_cidr_blocks) > 0 ? 1 : 0

  type              = "ingress"
  from_port         = local.prometheus_port
  to_port           = local.prometheus_port
  protocol          = "tcp"
  cidr_blocks       = var.monitoring_cidr_blocks
  security_group_id = aws_security_group.scylladb[0].id
  description       = "Prometheus metrics scraping from monitoring CIDRs"
}

resource "aws_security_group_rule" "prometheus_sg" {
  for_each = var.create_security_group ? toset(var.monitoring_security_group_ids) : toset([])

  type                     = "ingress"
  from_port                = local.prometheus_port
  to_port                  = local.prometheus_port
  protocol                 = "tcp"
  source_security_group_id = each.value
  security_group_id        = aws_security_group.scylladb[0].id
  description              = "Prometheus metrics from monitoring SG"
}

# SSH access (22) - from bastion only
resource "aws_security_group_rule" "ssh" {
  count = var.create_security_group && var.bastion_security_group_id != null ? 1 : 0

  type                     = "ingress"
  from_port                = local.ssh_port
  to_port                  = local.ssh_port
  protocol                 = "tcp"
  source_security_group_id = var.bastion_security_group_id
  security_group_id        = aws_security_group.scylladb[0].id
  description              = "SSH from bastion host"
}

# Egress - allow all outbound
resource "aws_security_group_rule" "egress" {
  count = var.create_security_group ? 1 : 0

  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.scylladb[0].id
  description       = "Allow all outbound traffic"
}

# -----------------------------------------------------------------------------
# IAM Role + Instance Profile
# -----------------------------------------------------------------------------

resource "aws_iam_role" "scylladb" {
  name_prefix = "${local.identifier}-scylladb-"
  description = "IAM role for ScyllaDB EC2 instances"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${local.identifier}-scylladb-role"
  })
}

resource "aws_iam_instance_profile" "scylladb" {
  name_prefix = "${local.identifier}-scylladb-"
  role        = aws_iam_role.scylladb.name

  tags = local.common_tags
}

# CloudWatch Logs policy
resource "aws_iam_role_policy" "cloudwatch_logs" {
  name = "cloudwatch-logs"
  role = aws_iam_role.scylladb.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/scylladb/${local.identifier}*"
      }
    ]
  })
}

# EC2 describe (for seed node discovery)
resource "aws_iam_role_policy" "ec2_describe" {
  name = "ec2-describe"
  role = aws_iam_role.scylladb.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeTags"
        ]
        Resource = "*"
      }
    ]
  })
}

# SSM Parameter Store (for secrets)
resource "aws_iam_role_policy" "ssm_read" {
  name = "ssm-read"
  role = aws_iam_role.scylladb.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = "arn:aws:ssm:${local.region}:${local.account_id}:parameter/scylladb/${local.identifier}/*"
      }
    ]
  })
}

# S3 backup access (conditional)
resource "aws_iam_role_policy" "s3_backup" {
  count = var.enable_s3_backup && var.backup_s3_bucket != null ? 1 : 0

  name = "s3-backup"
  role = aws_iam_role.scylladb.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:DeleteObject"
        ]
        Resource = [
          "arn:aws:s3:::${var.backup_s3_bucket}",
          "arn:aws:s3:::${var.backup_s3_bucket}/scylladb/${local.identifier}/*"
        ]
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Launch Template
# -----------------------------------------------------------------------------

resource "aws_launch_template" "scylladb" {
  name_prefix   = "${local.identifier}-scylladb-"
  description   = "Launch template for ScyllaDB ${var.scylla_version} cluster"
  image_id      = var.ami_id
  instance_type = var.instance_type
  key_name      = var.key_pair_name

  iam_instance_profile {
    arn = aws_iam_instance_profile.scylladb.arn
  }

  monitoring {
    enabled = var.enhanced_monitoring
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  # Root volume (OS only — data uses instance NVMe SSDs)
  block_device_mappings {
    device_name = "/dev/sda1"

    ebs {
      volume_size           = var.root_volume_size
      volume_type           = var.root_volume_type
      encrypted             = var.encrypt_at_rest
      kms_key_id            = var.kms_key_arn
      delete_on_termination = true
    }
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups = var.create_security_group ? [aws_security_group.scylladb[0].id] : var.security_group_ids
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh.tpl", {
    cluster_name       = local.identifier
    scylla_version     = var.scylla_version
    snitch_type        = var.snitch_type
    datacenter_name    = var.datacenter_name
    rack_prefix        = var.rack_prefix
    seed_count         = local.seed_count
    smp_threads        = var.smp_threads
    memory_allocation  = var.memory_allocation
    overprovisioned    = var.overprovisioned
    authenticator      = var.authenticator
    authorizer         = var.authorizer
    internode_encryption = var.enable_internode_encryption
    client_encryption    = var.enable_client_encryption
    environment        = var.environment
    region             = local.region
  }))

  tag_specifications {
    resource_type = "instance"
    tags = merge(local.common_tags, {
      Name           = "${local.identifier}-scylladb"
      ScyllaCluster  = local.identifier
      ScyllaVersion  = var.scylla_version
    })
  }

  tag_specifications {
    resource_type = "volume"
    tags = merge(local.common_tags, {
      Name = "${local.identifier}-scylladb-vol"
    })
  }

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

# -----------------------------------------------------------------------------
# Auto Scaling Group
# -----------------------------------------------------------------------------

resource "aws_autoscaling_group" "scylladb" {
  name_prefix         = "${local.identifier}-scylladb-"
  min_size            = var.cluster_size
  max_size            = var.cluster_size
  desired_capacity    = var.cluster_size
  vpc_zone_identifier = var.subnet_ids

  launch_template {
    id      = aws_launch_template.scylladb.id
    version = "$Latest"
  }

  health_check_type         = "EC2"
  health_check_grace_period = 600
  default_cooldown          = 300

  # Spread instances across AZs
  termination_policies = ["OldestInstance"]

  # Protect database instances from accidental termination
  protect_from_scale_in = true

  # Suspend auto-replacement — database nodes need manual intervention
  suspended_processes = ["ReplaceUnhealthy"]

  # Instance refresh for rolling updates (manual trigger only)
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 66
      instance_warmup        = 600
    }
  }

  dynamic "tag" {
    for_each = merge(local.common_tags, {
      Name          = "${local.identifier}-scylladb"
      ScyllaCluster = local.identifier
    })
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  lifecycle {
    ignore_changes = [desired_capacity]
  }
}

# -----------------------------------------------------------------------------
# Network Load Balancer (Optional)
# -----------------------------------------------------------------------------

resource "aws_lb" "scylladb" {
  count = var.create_nlb ? 1 : 0

  name_prefix        = "scylla"
  internal           = true
  load_balancer_type = "network"
  subnets            = var.subnet_ids

  enable_cross_zone_load_balancing = true

  tags = merge(local.common_tags, {
    Name = "${local.identifier}-scylladb-nlb"
  })
}

resource "aws_lb_target_group" "cql" {
  count = var.create_nlb ? 1 : 0

  name_prefix = "scylla"
  port        = local.cql_port
  protocol    = "TCP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  health_check {
    protocol            = "TCP"
    port                = local.cql_port
    healthy_threshold   = 3
    unhealthy_threshold = 3
    interval            = 30
  }

  tags = merge(local.common_tags, {
    Name = "${local.identifier}-scylladb-cql-tg"
  })
}

resource "aws_lb_listener" "cql" {
  count = var.create_nlb ? 1 : 0

  load_balancer_arn = aws_lb.scylladb[0].arn
  port              = local.cql_port
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.cql[0].arn
  }
}

resource "aws_autoscaling_attachment" "nlb" {
  count = var.create_nlb ? 1 : 0

  autoscaling_group_name = aws_autoscaling_group.scylladb.name
  lb_target_group_arn    = aws_lb_target_group.cql[0].arn
}

# -----------------------------------------------------------------------------
# CloudWatch Alarms (Optional)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  count = var.create_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${local.identifier}-scylladb-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.alarm_evaluation_periods
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = var.alarm_cpu_threshold
  alarm_description   = "ScyllaDB cluster CPU utilization above ${var.alarm_cpu_threshold}%"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.scylladb.name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "status_check" {
  count = var.create_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${local.identifier}-scylladb-status-check"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Maximum"
  threshold           = 1
  alarm_description   = "ScyllaDB instance status check failed"
  alarm_actions       = var.alarm_actions

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.scylladb.name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "network_in" {
  count = var.create_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${local.identifier}-scylladb-network-in-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.alarm_evaluation_periods
  metric_name         = "NetworkIn"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 1073741824
  alarm_description   = "ScyllaDB cluster network ingress above 1 GB/s"
  alarm_actions       = var.alarm_actions

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.scylladb.name
  }

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# CloudWatch Dashboard (Optional)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_dashboard" "scylladb" {
  count = var.create_cloudwatch_dashboard ? 1 : 0

  dashboard_name = "${local.identifier}-scylladb"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "CPU Utilization"
          metrics = [["AWS/EC2", "CPUUtilization", "AutoScalingGroupName", aws_autoscaling_group.scylladb.name]]
          period  = 300
          stat    = "Average"
          region  = local.region
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "Network I/O"
          metrics = [
            ["AWS/EC2", "NetworkIn", "AutoScalingGroupName", aws_autoscaling_group.scylladb.name],
            ["AWS/EC2", "NetworkOut", "AutoScalingGroupName", aws_autoscaling_group.scylladb.name]
          ]
          period = 300
          stat   = "Average"
          region = local.region
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Disk Read/Write Ops"
          metrics = [
            ["AWS/EC2", "DiskReadOps", "AutoScalingGroupName", aws_autoscaling_group.scylladb.name],
            ["AWS/EC2", "DiskWriteOps", "AutoScalingGroupName", aws_autoscaling_group.scylladb.name]
          ]
          period = 300
          stat   = "Sum"
          region = local.region
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Status Check Failed"
          metrics = [["AWS/EC2", "StatusCheckFailed", "AutoScalingGroupName", aws_autoscaling_group.scylladb.name]]
          period  = 300
          stat    = "Maximum"
          region  = local.region
        }
      }
    ]
  })
}
```

**Step 2: Create user data template**

Create `terraform/modules/scylladb/user_data.sh.tpl`:

```bash
#!/bin/bash
# =============================================================================
# ScyllaDB Node Bootstrap Script
# =============================================================================
# Configures ScyllaDB on first boot: seed discovery, snitch, rack-dc, tuning.
# Runs as user_data on EC2 launch via the Launch Template.
# =============================================================================

set -euo pipefail

INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)
AZ=$(curl -s http://169.254.169.254/latest/meta-data/placement/availability-zone)
RACK="${rack_prefix}-$${AZ: -1}"

echo "=== ScyllaDB Bootstrap ==="
echo "  Instance:   $INSTANCE_ID"
echo "  Private IP: $PRIVATE_IP"
echo "  AZ:         $AZ"
echo "  Rack:       $RACK"
echo "  Cluster:    ${cluster_name}"

# --- Discover seed nodes via EC2 tags ---
SEEDS=$(aws ec2 describe-instances \
  --region ${region} \
  --filters \
    "Name=tag:ScyllaCluster,Values=${cluster_name}" \
    "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].PrivateIpAddress' \
  --output text | tr '\t' ',' | cut -d',' -f1-${seed_count})

# Fallback: if no other nodes found, this node is the first seed
if [ -z "$SEEDS" ]; then
  SEEDS="$PRIVATE_IP"
fi

echo "  Seeds:      $SEEDS"

# --- Configure scylla.yaml ---
cat > /etc/scylla/scylla.yaml <<SCYLLA_YAML
cluster_name: '${cluster_name}'
listen_address: $PRIVATE_IP
rpc_address: $PRIVATE_IP
broadcast_rpc_address: $PRIVATE_IP
seed_provider:
  - class_name: org.apache.cassandra.locator.SimpleSeedProvider
    parameters:
      - seeds: "$SEEDS"
endpoint_snitch: ${snitch_type}
authenticator: ${authenticator}
authorizer: ${authorizer}
api_address: $PRIVATE_IP
api_port: 10000
prometheus_address: $PRIVATE_IP
prometheus_port: 9180
%{ if internode_encryption }
server_encryption_options:
  internode_encryption: all
  certificate: /etc/scylla/certs/node.crt
  keyfile: /etc/scylla/certs/node.key
  truststore: /etc/scylla/certs/ca.crt
%{ endif }
%{ if client_encryption }
client_encryption_options:
  enabled: true
  certificate: /etc/scylla/certs/node.crt
  keyfile: /etc/scylla/certs/node.key
  truststore: /etc/scylla/certs/ca.crt
%{ endif }
SCYLLA_YAML

# --- Configure rack/dc properties ---
%{ if snitch_type == "GossipingPropertyFileSnitch" }
cat > /etc/scylla/cassandra-rackdc.properties <<RACKDC
dc=${datacenter_name}
rack=$RACK
prefer_local=true
RACKDC
%{ endif }

# --- Configure I/O and tuning ---
%{ if overprovisioned }
echo "SCYLLA_ARGS=\"--overprovisioned\"" >> /etc/default/scylla-server
%{ endif }
%{ if smp_threads > 0 }
echo "SCYLLA_ARGS=\"$${SCYLLA_ARGS:-} --smp ${smp_threads}\"" >> /etc/default/scylla-server
%{ endif }
%{ if memory_allocation != null }
echo "SCYLLA_ARGS=\"$${SCYLLA_ARGS:-} --memory ${memory_allocation}\"" >> /etc/default/scylla-server
%{ endif }

# --- Start ScyllaDB ---
systemctl enable scylla-server
systemctl start scylla-server

echo "=== ScyllaDB Bootstrap Complete ==="
```

**Step 3: Commit**

```bash
cd infrastructure
git add terraform/modules/scylladb/main.tf terraform/modules/scylladb/user_data.sh.tpl
git commit -m "feat(terraform): add ScyllaDB module main resources and bootstrap script"
```

---

## Task 4: Create Outputs (outputs.tf)

**Files:**
- Create: `terraform/modules/scylladb/outputs.tf`

**Step 1: Create outputs.tf**

Create `terraform/modules/scylladb/outputs.tf`:

```hcl
# =============================================================================
# ScyllaDB EC2 Cluster - Outputs
# =============================================================================

# -----------------------------------------------------------------------------
# Auto Scaling Group
# -----------------------------------------------------------------------------

output "asg_name" {
  description = "Auto Scaling Group name"
  value       = aws_autoscaling_group.scylladb.name
}

output "asg_arn" {
  description = "Auto Scaling Group ARN"
  value       = aws_autoscaling_group.scylladb.arn
}

# -----------------------------------------------------------------------------
# Launch Template
# -----------------------------------------------------------------------------

output "launch_template_id" {
  description = "Launch template ID"
  value       = aws_launch_template.scylladb.id
}

output "launch_template_version" {
  description = "Latest launch template version"
  value       = aws_launch_template.scylladb.latest_version
}

# -----------------------------------------------------------------------------
# Security
# -----------------------------------------------------------------------------

output "security_group_id" {
  description = "Security group ID for ScyllaDB cluster"
  value       = var.create_security_group ? aws_security_group.scylladb[0].id : null
}

output "iam_role_arn" {
  description = "IAM role ARN for ScyllaDB instances"
  value       = aws_iam_role.scylladb.arn
}

output "iam_instance_profile_arn" {
  description = "IAM instance profile ARN"
  value       = aws_iam_instance_profile.scylladb.arn
}

# -----------------------------------------------------------------------------
# Network Load Balancer (when created)
# -----------------------------------------------------------------------------

output "nlb_dns_name" {
  description = "NLB DNS name for CQL connections"
  value       = var.create_nlb ? aws_lb.scylladb[0].dns_name : null
}

output "nlb_arn" {
  description = "NLB ARN"
  value       = var.create_nlb ? aws_lb.scylladb[0].arn : null
}

# -----------------------------------------------------------------------------
# Application Configuration
# -----------------------------------------------------------------------------

output "connection_config" {
  description = "ScyllaDB connection configuration for applications"
  value = {
    cluster_name  = local.identifier
    port          = local.cql_port
    datacenter    = var.datacenter_name
    keyspace      = "quckapp"
    nlb_endpoint  = var.create_nlb ? aws_lb.scylladb[0].dns_name : null
    asg_name      = aws_autoscaling_group.scylladb.name
    snitch        = var.snitch_type
    tls_enabled   = var.enable_client_encryption
    auth_enabled  = var.authenticator != "AllowAllAuthenticator"
  }
}

# -----------------------------------------------------------------------------
# Monitoring
# -----------------------------------------------------------------------------

output "cloudwatch_alarm_arns" {
  description = "CloudWatch alarm ARNs"
  value = var.create_cloudwatch_alarms ? [
    aws_cloudwatch_metric_alarm.cpu_high[0].arn,
    aws_cloudwatch_metric_alarm.status_check[0].arn,
    aws_cloudwatch_metric_alarm.network_in[0].arn,
  ] : []
}

output "cloudwatch_dashboard_arn" {
  description = "CloudWatch dashboard ARN"
  value       = var.create_cloudwatch_dashboard ? aws_cloudwatch_dashboard.scylladb[0].dashboard_arn : null
}
```

**Step 2: Commit**

```bash
cd infrastructure
git add terraform/modules/scylladb/outputs.tf
git commit -m "feat(terraform): add ScyllaDB module outputs"
```

---

## Task 5: Add Module Call to Dev Environment

**Files:**
- Modify: `terraform/environments/dev/main.tf`
- Modify: `terraform/environments/dev/variables.tf`

**Step 1: Add ScyllaDB variables to dev/variables.tf**

Append to `terraform/environments/dev/variables.tf`:

```hcl

# ScyllaDB Configuration
variable "enable_scylladb" {
  description = "Enable ScyllaDB cluster (requires VPC)"
  type        = bool
  default     = false
}

variable "scylladb_ami_id" {
  description = "ScyllaDB AMI ID"
  type        = string
  default     = ""
}

variable "scylladb_instance_type" {
  description = "ScyllaDB EC2 instance type"
  type        = string
  default     = "i3.xlarge"
}

variable "scylladb_cluster_size" {
  description = "Number of ScyllaDB nodes"
  type        = number
  default     = 3
}
```

**Step 2: Add ScyllaDB module call to dev/main.tf**

Append to `terraform/environments/dev/main.tf`:

```hcl

# =============================================================================
# ScyllaDB Cluster
# =============================================================================

module "scylladb" {
  count  = var.enable_scylladb ? 1 : 0
  source = "../../modules/scylladb"

  environment   = "dev"
  identifier    = "quckapp"
  ami_id        = var.scylladb_ami_id
  instance_type = var.scylladb_instance_type
  cluster_size  = var.scylladb_cluster_size

  # Network
  vpc_id     = var.enable_vpc ? module.vpc[0].vpc_id : ""
  subnet_ids = var.enable_vpc ? module.vpc[0].database_subnet_ids : []

  # Dev-specific: relaxed security
  allowed_cidr_blocks = ["10.0.0.0/8"]
  overprovisioned     = true
  authenticator       = "AllowAllAuthenticator"
  authorizer          = "AllowAllAuthorizer"

  # Dev: minimal monitoring, no backups
  encrypt_at_rest           = false
  enhanced_monitoring       = false
  create_cloudwatch_alarms  = false
  create_cloudwatch_dashboard = false
  enable_s3_backup          = false

  tags = var.tags
}
```

**Step 3: Commit**

```bash
cd infrastructure
git add terraform/environments/dev/main.tf terraform/environments/dev/variables.tf
git commit -m "feat(terraform): add ScyllaDB module to dev environment"
```

---

## Task 6: Validate + Commit Docs + Update Parent Repo + Push

**Step 1: Run terraform fmt**

```bash
cd infrastructure/terraform/modules/scylladb
terraform fmt
```

Expected: All files formatted.

**Step 2: Run terraform validate (syntax only)**

```bash
cd infrastructure/terraform/modules/scylladb
terraform init -backend=false
terraform validate
```

Expected: "Success! The configuration is valid."

**Step 3: Commit implementation plan in docs submodule**

```bash
cd docs/
git add docs/plans/2026-03-02-scylladb-terraform-implementation.md
git commit -m "docs: add ScyllaDB Terraform module implementation plan"
```

**Step 4: Update parent repo submodule references**

```bash
cd ..
git add docs infrastructure
git commit -m "chore: update submodules (ScyllaDB Terraform module)"
```

**Step 5: Push all submodules**

```bash
cd infrastructure && git push && cd ..
cd docs && git push && cd ..
git push
```
