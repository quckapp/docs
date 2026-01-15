---
sidebar_position: 2
---

# Terraform Infrastructure

This document covers Terraform infrastructure management for all QuckApp environments.

## Environment Structure

```
terraform/
├── backend/                 # S3 backend configuration
├── modules/                 # Reusable Terraform modules
│   ├── s3/
│   ├── kms/
│   ├── iam/
│   ├── dynamodb/
│   ├── sqs/
│   ├── sns/
│   ├── vpc/
│   ├── rds/
│   ├── elasticache/
│   ├── cognito/
│   ├── cloudfront/
│   ├── api-gateway/
│   └── lambda/
└── environments/
    ├── dev/                 # Development
    ├── qa/                  # QA Testing
    ├── uat1/                # UAT Team A
    ├── uat2/                # UAT Team B
    ├── uat3/                # UAT External/Security
    ├── staging/             # Pre-production
    ├── prod/                # Production
    └── live/                # Live (Full HA/DR)
```

## Quick Reference

| Environment | Command | Description |
|-------------|---------|-------------|
| **dev** | `make dev-apply` | Apply dev infrastructure |
| **qa** | `make qa-apply` | Apply QA infrastructure |
| **uat1** | `make uat1-apply` | Apply UAT1 infrastructure |
| **uat2** | `make uat2-apply` | Apply UAT2 infrastructure |
| **uat3** | `make uat3-apply` | Apply UAT3 infrastructure |
| **staging** | `make staging-apply` | Apply staging infrastructure |
| **live** | `make live-apply` | Apply live (requires confirmation) |

## Makefile Commands

### Backend Setup

```bash
# Initialize backend (S3 + DynamoDB for state)
make backend-init
make backend-apply
```

### Environment Operations

```bash
# Generic commands (ENV=dev|qa|uat1|uat2|uat3|staging|live|prod)
make init ENV=qa       # Initialize environment
make plan ENV=qa       # Generate execution plan
make apply ENV=qa      # Apply changes
make destroy ENV=qa    # Destroy infrastructure
make output ENV=qa     # Show outputs
```

### Environment Shortcuts

```bash
# Development
make dev-init && make dev-plan && make dev-apply

# QA
make qa-init && make qa-plan && make qa-apply

# UAT Environments
make uat1-init && make uat1-plan && make uat1-apply
make uat2-init && make uat2-plan && make uat2-apply
make uat3-init && make uat3-plan && make uat3-apply

# Staging
make staging-init && make staging-plan && make staging-apply

# Live Production (requires confirmation)
make live-init && make live-plan && make live-apply
```

### Validation Commands

```bash
make fmt              # Format Terraform files
make validate ENV=qa  # Validate configuration
make lint             # Run TFLint
make security         # Run security scan (tfsec)
make cost ENV=qa      # Estimate costs (Infracost)
```

### State Management

```bash
make state-list ENV=qa                          # List resources
make state-show ENV=qa RESOURCE=module.s3       # Show resource details
make state-pull ENV=qa                          # Pull state locally
make unlock ENV=qa ID=<lock-id>                 # Force unlock state
```

## Environment Configurations

### Dev Environment

```hcl
# terraform/environments/dev/dev.tfvars
environment = "dev"
aws_region  = "us-east-1"

# S3 - Minimal retention
enable_versioning      = true
transition_to_ia_days  = 90
expiration_days        = 365

# Database - Small instance
enable_rds        = true
instance_class    = "db.t3.small"
multi_az          = false

# Cache - Single node
enable_elasticache = true
node_type          = "cache.t3.micro"
num_cache_nodes    = 1
```

### QA Environment

```hcl
# terraform/environments/qa/qa.tfvars
environment = "qa"
aws_region  = "us-east-1"

# S3 - Short retention for test data
enable_versioning       = true
transition_to_ia_days   = 60
expiration_days         = 180

# Database - Medium for testing
enable_rds              = true
instance_class          = "db.t3.medium"
allocated_storage       = 50
multi_az                = false
backup_retention_period = 7

# Cache - Single node
enable_elasticache = true
node_type          = "cache.t3.small"
num_cache_nodes    = 1
```

### UAT1/UAT2/UAT3 Environments

```hcl
# terraform/environments/uat1/uat1.tfvars (similar for uat2, uat3)
environment = "uat1"
aws_region  = "us-east-1"

# Production-like but smaller scale
enable_versioning       = true
transition_to_ia_days   = 60

# Database - Production-like
enable_rds              = true
instance_class          = "db.t3.medium"
allocated_storage       = 50
multi_az                = false
backup_retention_period = 7

# Cache
enable_elasticache = true
node_type          = "cache.t3.small"
```

### Staging Environment

```hcl
# terraform/environments/staging/staging.tfvars
environment = "staging"
aws_region  = "us-east-1"

# S3 - Production-like retention
enable_versioning      = true
enable_replication     = false
transition_to_ia_days  = 30
transition_to_glacier  = 90

# Database - Production-like sizing
enable_rds              = true
instance_class          = "db.r6g.large"
allocated_storage       = 200
multi_az                = true
backup_retention_period = 14

# Cache - Cluster mode
enable_elasticache         = true
node_type                  = "cache.r6g.large"
num_node_groups            = 2
replicas_per_node_group    = 1
automatic_failover_enabled = true

# CloudFront
enable_cloudfront = true
enable_waf        = true
```

### Live/Production Environment

```hcl
# terraform/environments/live/live.tfvars
environment = "live"
aws_region  = "us-east-1"
dr_region   = "us-west-2"

# S3 - Full retention with replication
enable_versioning          = true
enable_replication         = true
enable_access_logging      = true
transition_to_ia_days      = 30
transition_to_glacier_days = 90
expiration_days            = 2555  # 7 years

# Database - Full HA
enable_rds                        = true
engine                            = "aurora-postgresql"
instance_class                    = "db.r6g.xlarge"
instances_count                   = 3
multi_az                          = true
deletion_protection               = true
backup_retention_period           = 35
performance_insights_enabled      = true
enable_global_cluster             = true

# Cache - Full cluster mode
enable_elasticache             = true
node_type                      = "cache.r6g.xlarge"
num_node_groups                = 3
replicas_per_node_group        = 2
automatic_failover_enabled     = true
multi_az_enabled               = true
at_rest_encryption_enabled     = true
transit_encryption_enabled     = true

# CDN & Security
enable_cloudfront = true
enable_waf        = true
price_class       = "PriceClass_All"

# API Gateway
enable_api_gateway    = true
throttle_rate_limit   = 10000
throttle_burst_limit  = 5000
```

## Infrastructure Modules

### S3 Module

Creates media and thumbnails buckets with:
- Server-side encryption (KMS)
- Versioning
- Lifecycle policies
- CORS configuration
- Cross-region replication (live only)

### KMS Module

Creates encryption keys for:
- S3 buckets
- RDS databases
- SQS queues
- SNS topics
- Lambda functions

### IAM Module

Creates IAM roles for:
- EKS service accounts (IRSA)
- Lambda execution
- S3 access
- DynamoDB access

### VPC Module

Creates network infrastructure:
- VPC with configurable CIDR
- Public/private subnets across AZs
- NAT gateways (single for dev, multi for prod)
- VPC flow logs (staging/live)

### RDS Module

Creates database infrastructure:
- Aurora PostgreSQL (live)
- MySQL 8.0 (other envs)
- Multi-AZ deployment
- Read replicas
- Performance Insights

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/terraform.yml
name: Terraform

on:
  push:
    paths:
      - 'terraform/**'
  pull_request:
    paths:
      - 'terraform/**'

jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        run: make ci-init ENV=${{ github.event.inputs.environment }}

      - name: Terraform Plan
        run: make ci-plan ENV=${{ github.event.inputs.environment }}

      - name: Upload Plan
        uses: actions/upload-artifact@v4
        with:
          name: tfplan
          path: terraform/environments/${{ github.event.inputs.environment }}/tfplan
```

### Deployment Workflow

```
1. Developer creates Terraform changes
2. PR triggers: fmt-check, validate, plan
3. Plan output posted to PR
4. After merge, apply triggered (dev auto, others manual)
5. State stored in S3 with DynamoDB locking
```

## Best Practices

### State Management

- State stored in S3 with encryption
- DynamoDB for state locking
- Separate state file per environment
- Never commit state files

### Security

- Use IRSA for EKS workloads
- Encrypt all data at rest
- Enable VPC flow logs in staging/live
- Use WAF for public endpoints

### Cost Optimization

- Use `make cost ENV=<env>` before applying
- Review instance sizes quarterly
- Enable S3 lifecycle policies
- Use spot instances for dev/qa workers

## Troubleshooting

### State Lock Issues

```bash
# Force unlock (use with caution)
make unlock ENV=qa ID=<lock-id>

# Find lock ID
aws dynamodb scan --table-name quckapp-terraform-locks
```

### Import Existing Resources

```bash
make state-import ENV=qa \
  RESOURCE=aws_s3_bucket.media \
  ID=quckapp-media-qa
```

### Drift Detection

```bash
# Compare state with actual infrastructure
make refresh ENV=qa
make plan ENV=qa
```

## Related Documentation

- [Environments Overview](./overview.md) - All environment details
- [Kubernetes Environments](./kubernetes.md) - K8s configurations
- [CI/CD Pipelines](../cicd/github-actions.md) - Deployment pipelines
