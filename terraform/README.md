# QuckApp Terraform Infrastructure

This document provides comprehensive documentation for the QuckApp AWS infrastructure managed with Terraform.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Module Reference](#module-reference)
- [Environments](#environments)
- [Security](#security)
- [Monitoring](#monitoring)
- [Cost Optimization](#cost-optimization)
- [Troubleshooting](#troubleshooting)

## Overview

QuckApp uses a modular Terraform architecture to provision and manage AWS infrastructure. The infrastructure supports a messaging application with features including:

- **Media Storage**: S3 buckets for photos, videos, voice messages, and files
- **Content Delivery**: CloudFront CDN with signed URLs and WAF protection
- **Authentication**: Cognito User Pools with MFA and OAuth 2.0
- **API Layer**: API Gateway with JWT authorization
- **Compute**: Lambda functions for media processing
- **Messaging**: SQS queues and SNS topics for async processing
- **Databases**: RDS/Aurora for relational data, DynamoDB for NoSQL
- **Caching**: ElastiCache Redis for session and data caching
- **Networking**: VPC with public/private subnets, NAT Gateways, VPC endpoints

## Architecture

```
                                    ┌─────────────────┐
                                    │   CloudFront    │
                                    │   (CDN + WAF)   │
                                    └────────┬────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
            ┌───────▼───────┐       ┌───────▼───────┐       ┌───────▼───────┐
            │  S3 (Media)   │       │  API Gateway  │       │  S3 (Thumbs)  │
            └───────────────┘       └───────┬───────┘       └───────────────┘
                                            │
                                    ┌───────▼───────┐
                                    │    Cognito    │
                                    │  (Auth/JWT)   │
                                    └───────┬───────┘
                                            │
    ┌───────────────────────────────────────┼───────────────────────────────────────┐
    │                                   VPC │                                        │
    │  ┌─────────────────────────────────────────────────────────────────────────┐  │
    │  │                          Private Subnets                                 │  │
    │  │                                                                          │  │
    │  │   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐         │  │
    │  │   │  Lambda  │    │   ECS/   │    │   RDS/   │    │  Redis   │         │  │
    │  │   │Functions │    │   EKS    │    │  Aurora  │    │ (Cache)  │         │  │
    │  │   └────┬─────┘    └────┬─────┘    └──────────┘    └──────────┘         │  │
    │  │        │               │                                                 │  │
    │  │        └───────┬───────┘                                                 │  │
    │  │                │                                                         │  │
    │  │   ┌────────────▼────────────┐    ┌──────────────────────────────┐       │  │
    │  │   │      SQS Queues         │    │       DynamoDB Tables        │       │  │
    │  │   │  (Async Processing)     │    │    (Metadata, Sessions)      │       │  │
    │  │   └────────────┬────────────┘    └──────────────────────────────┘       │  │
    │  │                │                                                         │  │
    │  │   ┌────────────▼────────────┐                                           │  │
    │  │   │      SNS Topics         │                                           │  │
    │  │   │    (Notifications)      │                                           │  │
    │  │   └─────────────────────────┘                                           │  │
    │  └──────────────────────────────────────────────────────────────────────────┘  │
    └────────────────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Terraform**: >= 1.5.0
- **AWS CLI**: Configured with appropriate credentials
- **AWS Account**: With permissions to create resources
- **S3 Bucket**: For Terraform state (recommended)
- **DynamoDB Table**: For state locking (recommended)

### Required IAM Permissions

The IAM user/role running Terraform needs permissions for:
- EC2 (VPC, Security Groups, NAT Gateways)
- S3 (Buckets, Policies)
- CloudFront (Distributions, WAF)
- Lambda (Functions, Layers)
- RDS/Aurora (Clusters, Instances)
- ElastiCache (Clusters, Replication Groups)
- DynamoDB (Tables, Streams)
- SQS (Queues)
- SNS (Topics)
- Cognito (User Pools, Identity Pools)
- API Gateway (APIs, Authorizers)
- IAM (Roles, Policies)
- KMS (Keys)
- CloudWatch (Alarms, Dashboards, Logs)

## Quick Start

### 1. Clone and Configure

```bash
# Navigate to the environment
cd terraform/environments/dev

# Copy example variables
cp terraform.tfvars.example terraform.tfvars

# Edit variables
vim terraform.tfvars
```

### 2. Configure Backend (Recommended)

Uncomment and configure the S3 backend in `main.tf`:

```hcl
backend "s3" {
  bucket         = "quckapp-terraform-state"
  key            = "dev/terraform.tfstate"
  region         = "us-east-1"
  encrypt        = true
  dynamodb_table = "quckapp-terraform-locks"
}
```

### 3. Initialize and Apply

```bash
# Initialize Terraform
terraform init

# Review the plan
terraform plan

# Apply changes
terraform apply
```

### 4. Access Outputs

```bash
# View all outputs
terraform output

# Get specific output
terraform output -raw media_bucket_name
```

## Module Reference

| Module | Description | Documentation |
|--------|-------------|---------------|
| [VPC](modules/vpc.md) | Networking infrastructure | Subnets, NAT, Endpoints |
| [KMS](modules/kms.md) | Encryption keys | Multi-region, rotation |
| [S3](modules/s3.md) | Object storage | Media, thumbnails, logs |
| [CloudFront](modules/cloudfront.md) | CDN distribution | WAF, signed URLs |
| [IAM](modules/iam.md) | Identity & access | Roles, policies |
| [Lambda](modules/lambda.md) | Serverless functions | Thumbnails, optimization |
| [SQS](modules/sqs.md) | Message queues | Async processing |
| [SNS](modules/sns.md) | Notifications | Pub/sub, mobile push |
| [DynamoDB](modules/dynamodb.md) | NoSQL database | Metadata, sessions |
| [RDS](modules/rds.md) | Relational database | Aurora, replicas |
| [ElastiCache](modules/elasticache.md) | Redis caching | Sessions, data cache |
| [API Gateway](modules/api-gateway.md) | API management | HTTP/REST APIs |
| [Cognito](modules/cognito.md) | Authentication | OAuth, MFA |

## Environments

### Development (dev)

Optimized for cost and rapid iteration:

```hcl
# Minimal resources
enable_vpc         = false  # Optional
enable_rds         = false  # Optional
enable_elasticache = false  # Optional

# Cost savings
instance_class = "db.t3.micro"
node_type      = "cache.t3.micro"

# Relaxed security for testing
skip_final_snapshot = true
deletion_protection = false
```

### Production (prod)

Optimized for reliability and performance:

```hcl
# Full infrastructure
enable_vpc         = true
enable_rds         = true   # Aurora with replicas
enable_elasticache = true   # Redis replication group

# High availability
multi_az_enabled           = true
automatic_failover_enabled = true
num_cache_clusters         = 3

# Security
deletion_protection        = true
transit_encryption_enabled = true
```

See [environments.md](environments.md) for detailed configuration.

## Security

### Encryption

- **At Rest**: All data encrypted with KMS (S3, RDS, ElastiCache, DynamoDB)
- **In Transit**: TLS enforced for all connections
- **Key Rotation**: Automatic annual rotation enabled

### Network Security

- **VPC Isolation**: Private subnets for databases and compute
- **Security Groups**: Least-privilege access rules
- **VPC Endpoints**: Private connectivity to AWS services
- **NACLs**: Additional network filtering

### Authentication & Authorization

- **Cognito**: User authentication with MFA
- **IAM**: Role-based access control
- **API Gateway**: JWT validation
- **RDS IAM Auth**: Database access via IAM

### Secrets Management

- **Secrets Manager**: Database credentials auto-rotation
- **KMS**: Encryption key management
- **Parameter Store**: Configuration storage

## Monitoring

### CloudWatch Alarms

Each module creates relevant alarms:

| Resource | Metrics Monitored |
|----------|-------------------|
| RDS | CPU, Memory, Storage, Connections, Replica Lag |
| ElastiCache | CPU, Memory, Evictions, Connections |
| Lambda | Errors, Duration, Throttles |
| API Gateway | 5xx Errors, Latency |
| SQS | Queue Depth, DLQ Messages |

### Dashboards

Production environments create CloudWatch dashboards for:
- RDS/Aurora performance
- ElastiCache metrics
- Lambda execution stats

### Logging

- **VPC Flow Logs**: Network traffic analysis
- **CloudWatch Logs**: Application and service logs
- **S3 Access Logs**: Bucket access auditing
- **CloudFront Logs**: CDN request logging

## Cost Optimization

### Development Environment

| Service | Cost Savings |
|---------|--------------|
| VPC | Optional, single NAT Gateway |
| RDS | Single-AZ, t3.micro, no replicas |
| ElastiCache | Single node, no replication |
| Lambda | Reduced concurrency |
| CloudWatch | Alarms disabled |

### Production Environment

| Feature | Cost Control |
|---------|--------------|
| Auto Scaling | Right-size based on demand |
| Reserved Capacity | Commit for predictable workloads |
| S3 Lifecycle | Transition to cheaper storage tiers |
| Spot Instances | For fault-tolerant workloads |

### Estimated Costs

| Environment | Monthly Estimate |
|-------------|------------------|
| Dev (minimal) | $50-100 |
| Dev (full) | $200-400 |
| Prod (basic) | $500-1000 |
| Prod (HA) | $1500-3000 |

*Costs vary based on usage and region.*

## Troubleshooting

### Common Issues

#### Terraform State Lock

```bash
# Force unlock (use with caution)
terraform force-unlock LOCK_ID
```

#### Provider Version Conflicts

```bash
# Upgrade providers
terraform init -upgrade
```

#### Resource Already Exists

```bash
# Import existing resource
terraform import aws_s3_bucket.example bucket-name
```

### Debug Mode

```bash
# Enable debug logging
export TF_LOG=DEBUG
terraform apply
```

### Validate Configuration

```bash
# Validate syntax
terraform validate

# Format check
terraform fmt -check -recursive
```

## Contributing

1. Create a feature branch
2. Make changes to modules
3. Test in dev environment
4. Update documentation
5. Submit pull request

## Support

For issues and questions:
- Check [troubleshooting](#troubleshooting) section
- Review module-specific documentation
- Open a GitHub issue
