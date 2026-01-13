# Environment Configurations

This document describes the Terraform environment configurations for QuikApp infrastructure.

## Overview

QuikApp uses a multi-environment Terraform structure with environment-specific configurations:

```
terraform/
├── modules/           # Reusable infrastructure modules
└── environments/
    ├── dev/           # Development environment
    └── prod/          # Production environment
```

## Environment Comparison

| Feature | Dev | Prod |
|---------|-----|------|
| Availability Zones | 2 | 3 |
| NAT Gateways | 1 (shared) | 3 (per AZ) |
| VPC Endpoints | Gateway only | Gateway + Interface |
| S3 Replication | Disabled | Cross-region |
| CloudFront | Optional | Enabled |
| RDS | Single instance | Aurora cluster |
| ElastiCache | Single node | Replication group |
| DynamoDB | On-demand | Provisioned + Auto-scaling |
| Monitoring | Basic | Full + alarms |
| Backup Retention | 7 days | 35 days |
| Deletion Protection | Disabled | Enabled |

## Development Environment

### Purpose

- Local development and testing
- Feature branch deployments
- Cost-optimized infrastructure
- Fast iteration cycles

### Configuration

```hcl
# terraform/environments/dev/main.tf

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "QuikApp"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}
```

### Key Settings

#### VPC (Optional)

```hcl
module "vpc" {
  count  = var.enable_vpc ? 1 : 0
  source = "../../modules/vpc"

  az_count = 2  # Only 2 AZs for cost savings

  # Single NAT Gateway (not HA, but cheaper)
  enable_nat_gateway = var.enable_nat_gateway
  single_nat_gateway = true

  # Only free gateway endpoints
  create_s3_endpoint       = true
  create_dynamodb_endpoint = true
  create_interface_endpoints = false  # Cost savings

  # No flow logs for dev
  enable_flow_logs = false
}
```

#### KMS

```hcl
module "kms" {
  enable_key_rotation      = true
  enable_multi_region      = false  # No cross-region for dev
  key_deletion_window_days = 7      # Shorter for dev
}
```

#### S3

```hcl
module "s3" {
  environment = "dev"

  # Versioning but no replication
  enable_versioning          = true
  enable_cross_region_replication = false

  # Simple lifecycle
  standard_ia_transition_days = 90
  glacier_transition_days     = null  # No Glacier for dev

  # Relaxed settings
  enable_deletion_protection = false
}
```

#### RDS

```hcl
module "rds" {
  count = var.enable_rds ? 1 : 0

  instance_class = "db.t3.micro"
  multi_az       = false  # No Multi-AZ for dev

  backup_retention_period = 7
  deletion_protection     = false
}
```

#### DynamoDB

```hcl
module "dynamodb" {
  count = var.enable_dynamodb ? 1 : 0

  billing_mode = "PAY_PER_REQUEST"  # On-demand for variable dev usage
  enable_point_in_time_recovery = false
  enable_deletion_protection    = false
}
```

#### ElastiCache

```hcl
module "elasticache" {
  count = var.enable_elasticache ? 1 : 0

  node_type = "cache.t3.micro"
  create_replication_group = false  # Single node
  transit_encryption_enabled = false  # Simpler for dev
}
```

### Feature Flags

```hcl
# terraform/environments/dev/variables.tf

variable "enable_vpc" {
  default = false  # VPC optional for dev
}

variable "enable_rds" {
  default = false
}

variable "enable_dynamodb" {
  default = true
}

variable "enable_elasticache" {
  default = false
}

variable "enable_cloudfront" {
  default = false
}
```

### Deployment

```bash
cd terraform/environments/dev

# Initialize
terraform init

# Plan
terraform plan -var-file="dev.tfvars"

# Apply
terraform apply -var-file="dev.tfvars"
```

## Production Environment

### Purpose

- Production workloads
- High availability and disaster recovery
- Full security and compliance
- Comprehensive monitoring

### Configuration

```hcl
# terraform/environments/prod/main.tf

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "QuikApp"
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}

# Secondary region for disaster recovery
provider "aws" {
  alias  = "replica"
  region = var.replica_region
}

# US-East-1 for Lambda@Edge (CloudFront)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
```

### Key Settings

#### VPC

```hcl
module "vpc" {
  source = "../../modules/vpc"

  az_count = 3  # 3 AZs for high availability

  # NAT Gateway per AZ for HA
  enable_nat_gateway = true
  single_nat_gateway = false

  # Gateway endpoints (free)
  create_s3_endpoint       = true
  create_dynamodb_endpoint = true

  # Interface endpoints for security
  create_interface_endpoints     = true
  create_ecr_endpoint            = true
  create_secretsmanager_endpoint = true
  create_ssm_endpoint            = true
  create_logs_endpoint           = true
  create_kms_endpoint            = true
  create_sqs_endpoint            = true

  # VPC Flow Logs
  enable_flow_logs       = true
  flow_log_retention_days = 30
}
```

#### KMS

```hcl
module "kms" {
  enable_key_rotation      = true
  enable_multi_region      = true   # For cross-region replication
  create_replica_key       = true
  key_deletion_window_days = 30     # Longer for safety
}
```

#### S3

```hcl
module "s3" {
  environment = "prod"

  # Full versioning and replication
  enable_versioning          = true
  enable_cross_region_replication = true
  replica_region             = var.replica_region
  replica_kms_key_arn        = module.kms.replica_key_arn

  # Full lifecycle
  standard_ia_transition_days = 30
  glacier_transition_days     = 90
  expiration_days             = 365

  # Protection
  enable_deletion_protection = true
}
```

#### CloudFront

```hcl
module "cloudfront" {
  source = "../../modules/cloudfront"

  enable_waf              = true
  enable_geo_restriction  = true
  enable_field_level_encryption = true
  enable_realtime_logs    = true

  price_class = "PriceClass_All"
}
```

#### RDS (Aurora)

```hcl
module "rds" {
  source = "../../modules/rds"

  create_aurora_cluster = true
  engine               = "aurora-postgresql"

  aurora_instances = {
    writer   = { instance_class = "db.r6g.large", promotion_tier = 0 }
    reader-1 = { instance_class = "db.r6g.large", promotion_tier = 1 }
    reader-2 = { instance_class = "db.r6g.large", promotion_tier = 2 }
  }

  # Auto-scaling
  enable_autoscaling       = true
  autoscaling_min_capacity = 1
  autoscaling_max_capacity = 5

  # Protection
  backup_retention_period = 35
  deletion_protection     = true

  # Monitoring
  performance_insights_enabled = true
  monitoring_interval          = 60
}
```

#### DynamoDB

```hcl
module "dynamodb" {
  source = "../../modules/dynamodb"

  billing_mode = "PAY_PER_REQUEST"  # or "PROVISIONED" with auto-scaling

  enable_point_in_time_recovery = true
  enable_deletion_protection    = true

  # Streams for CDC
  enable_streams   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  # Global tables for DR
  enable_global_tables = true
  replica_region       = var.replica_region
}
```

#### ElastiCache

```hcl
module "elasticache" {
  source = "../../modules/elasticache"

  create_replication_group = true
  node_type                = var.redis_node_type
  num_cache_clusters       = var.redis_num_cache_clusters

  automatic_failover_enabled = true
  multi_az_enabled           = true
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true

  # Snapshots
  snapshot_retention_limit = 7
}
```

#### Cognito

```hcl
module "cognito" {
  source = "../../modules/cognito"

  mfa_configuration = "ON"  # Required MFA

  password_minimum_length    = 12
  password_require_lowercase = true
  password_require_uppercase = true
  password_require_numbers   = true
  password_require_symbols   = true

  # Advanced security
  enable_advanced_security = true
  advanced_security_mode   = "ENFORCED"

  create_identity_pool = true
}
```

### Monitoring

```hcl
# CloudWatch alarms for all critical services
enable_cloudwatch_alarms = true
alarm_actions = [module.sns.alerts_topic_arn]

# Alert subscriptions
alert_email_endpoints = [
  "ops-team@company.com",
  "on-call@company.com"
]
```

### Deployment

```bash
cd terraform/environments/prod

# Initialize with backend
terraform init -backend-config="backend.hcl"

# Plan with production values
terraform plan -var-file="prod.tfvars" -out=tfplan

# Review plan carefully before applying
terraform apply tfplan
```

## State Management

### Remote State (Recommended)

```hcl
# backend.hcl
bucket         = "quikapp-terraform-state"
key            = "${environment}/terraform.tfstate"
region         = "us-east-1"
encrypt        = true
dynamodb_table = "quikapp-terraform-locks"
```

### State Locking

DynamoDB table for state locking:

```hcl
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "quikapp-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}
```

## Cost Estimates

### Development Environment

| Resource | Monthly Cost |
|----------|-------------|
| S3 (10 GB) | ~$0.25 |
| DynamoDB (on-demand) | ~$5-20 |
| KMS (1 key) | $1.00 |
| NAT Gateway (optional) | ~$32 |
| **Total** | **~$40-55** |

### Production Environment

| Resource | Monthly Cost |
|----------|-------------|
| VPC (3 NAT Gateways) | ~$96 |
| S3 (100 GB + replication) | ~$5-10 |
| CloudFront | ~$50-200 |
| Aurora (3 instances) | ~$300-500 |
| ElastiCache (3 nodes) | ~$150-300 |
| DynamoDB (provisioned) | ~$50-200 |
| KMS (3 keys) | $3.00 |
| VPC Endpoints | ~$70 |
| **Total** | **~$750-1400** |

## Best Practices

1. **Use Feature Flags**: Enable/disable modules with count
2. **Environment Parity**: Keep dev structure similar to prod
3. **Separate State Files**: One per environment
4. **Use Variables**: Environment-specific values in tfvars
5. **Tag Everything**: Use default_tags in provider
6. **Enable Deletion Protection**: Always in production
7. **Review Plans**: Carefully check terraform plan before apply
8. **Use Workspaces Sparingly**: Prefer separate directories
