# KMS Module

Creates KMS keys for encrypting S3 objects, application secrets, and database data with proper access policies.

## Features

- S3 media encryption key
- Application secrets key
- Database encryption key
- Automatic key rotation
- Multi-region keys
- Cross-region replica keys
- Service-specific policies
- Admin and application role access
- Key aliases for easy reference

## Usage

```hcl
module "kms" {
  source = "../../modules/kms"

  environment = "prod"

  # Key rotation
  enable_key_rotation     = true
  key_deletion_window_days = 30

  # Multi-region for disaster recovery
  enable_multi_region = true
  create_replica_key  = true

  # Access control
  admin_role_arns = [
    "arn:aws:iam::123456789012:role/admin"
  ]
  application_role_arns = [
    module.iam.media_service_role_arn,
    module.iam.lambda_thumbnail_role_arn
  ]

  # Optional keys
  create_secrets_key  = true
  create_database_key = true

  tags = var.tags
}

# Provider for replica region
provider "aws" {
  alias  = "replica"
  region = "us-west-2"
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       KMS Keys                               │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │   S3 Media Key  │  │  Secrets Key    │  │ Database Key│  │
│  │                 │  │                 │  │             │  │
│  │  alias/quckapp- │  │  alias/quckapp- │  │alias/quckapp│  │
│  │  s3-media-{env} │  │  secrets-{env}  │  │-db-{env}    │  │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘  │
│           │                    │                   │         │
└───────────┼────────────────────┼───────────────────┼─────────┘
            │                    │                   │
    ┌───────▼───────┐    ┌───────▼───────┐   ┌──────▼───────┐
    │  S3 Buckets   │    │   Secrets     │   │  RDS/Aurora  │
    │  CloudFront   │    │   Manager     │   │  DynamoDB    │
    └───────────────┘    └───────────────┘   └──────────────┘
```

## Keys

### S3 Media Encryption Key

Primary key for encrypting media objects in S3:

```hcl
key {
  description         = "QuckApp S3 media encryption key"
  enable_key_rotation = true
  multi_region        = true  # For cross-region replication

  # Service access
  allowed_services = ["s3.amazonaws.com", "cloudfront.amazonaws.com"]
}

alias {
  name = "alias/quckapp-s3-media-{env}"
}
```

### Application Secrets Key

For encrypting secrets in Secrets Manager:

```hcl
key {
  description         = "QuckApp application secrets key"
  enable_key_rotation = true

  # Secrets Manager access
  allowed_services = ["secretsmanager.amazonaws.com"]
}

alias {
  name = "alias/quckapp-secrets-{env}"
}
```

### Database Encryption Key

For encrypting RDS, Aurora, and DynamoDB:

```hcl
key {
  description         = "QuckApp database encryption key"
  enable_key_rotation = true

  # Database service access
  allowed_services = ["rds.amazonaws.com", "dynamodb.amazonaws.com"]
}

alias {
  name = "alias/quckapp-db-{env}"
}
```

## Key Policies

### Root Account Access

```json
{
  "Sid": "RootAccountAccess",
  "Effect": "Allow",
  "Principal": {
    "AWS": "arn:aws:iam::123456789012:root"
  },
  "Action": "kms:*",
  "Resource": "*"
}
```

### Service Access (S3)

```json
{
  "Sid": "AllowS3ServiceUse",
  "Effect": "Allow",
  "Principal": {
    "Service": "s3.amazonaws.com"
  },
  "Action": [
    "kms:Encrypt",
    "kms:Decrypt",
    "kms:ReEncrypt*",
    "kms:GenerateDataKey*",
    "kms:DescribeKey"
  ],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "kms:CallerAccount": "123456789012"
    }
  }
}
```

### Admin Role Access

```json
{
  "Sid": "AllowAdminRoleAccess",
  "Effect": "Allow",
  "Principal": {
    "AWS": "arn:aws:iam::123456789012:role/admin"
  },
  "Action": [
    "kms:Create*",
    "kms:Describe*",
    "kms:Enable*",
    "kms:List*",
    "kms:Put*",
    "kms:Update*",
    "kms:Revoke*",
    "kms:Disable*",
    "kms:Get*",
    "kms:Delete*",
    "kms:TagResource",
    "kms:UntagResource",
    "kms:ScheduleKeyDeletion",
    "kms:CancelKeyDeletion"
  ],
  "Resource": "*"
}
```

### Application Role Access

```json
{
  "Sid": "AllowApplicationRoleAccess",
  "Effect": "Allow",
  "Principal": {
    "AWS": "arn:aws:iam::123456789012:role/app-role"
  },
  "Action": [
    "kms:Encrypt",
    "kms:Decrypt",
    "kms:ReEncrypt*",
    "kms:GenerateDataKey*",
    "kms:DescribeKey"
  ],
  "Resource": "*"
}
```

## Multi-Region Keys

For cross-region replication and disaster recovery:

```hcl
# Primary key
key {
  multi_region = true
  # Created in primary region (us-east-1)
}

# Replica key
replica_key {
  primary_key_arn = primary_key.arn
  # Created in replica region (us-west-2)
}
```

### Cross-Region S3 Replication

```hcl
# S3 replication uses the replica key
replication_configuration {
  rule {
    destination {
      bucket             = replica_bucket_arn
      replica_kms_key_id = replica_key_arn
    }
    source_selection_criteria {
      sse_kms_encrypted_objects {
        status = "Enabled"
      }
    }
  }
}
```

## Key Rotation

Automatic annual rotation (AWS managed):

```hcl
enable_key_rotation = true
```

### How It Works

1. AWS generates new key material annually
2. Old key material retained for decryption
3. New encryptions use new key material
4. Transparent to applications
5. No re-encryption needed

## Using Keys in Other Modules

### S3 Bucket Encryption

```hcl
module "s3" {
  kms_key_arn = module.kms.s3_media_key_arn
}
```

### Secrets Manager

```hcl
resource "aws_secretsmanager_secret" "app" {
  kms_key_id = module.kms.app_secrets_key_arn
}
```

### RDS Encryption

```hcl
module "rds" {
  kms_key_id = module.kms.database_key_arn
}
```

### DynamoDB Encryption

```hcl
module "dynamodb" {
  kms_key_arn = module.kms.database_key_arn
}
```

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `environment` | Environment name | string | - |
| `enable_key_rotation` | Enable automatic rotation | bool | `true` |
| `key_deletion_window_days` | Deletion waiting period | number | `30` |
| `enable_multi_region` | Create multi-region key | bool | `false` |
| `create_replica_key` | Create replica in secondary region | bool | `false` |
| `create_secrets_key` | Create secrets encryption key | bool | `true` |
| `admin_role_arns` | ARNs of admin roles | list(string) | `null` |
| `application_role_arns` | ARNs of application roles | list(string) | `null` |

## Outputs

| Name | Description |
|------|-------------|
| `s3_media_key_arn` | S3 media key ARN |
| `s3_media_key_id` | S3 media key ID |
| `s3_media_key_alias` | S3 media key alias |
| `app_secrets_key_arn` | Secrets key ARN |
| `database_key_arn` | Database key ARN |
| `replica_key_arn` | Replica key ARN |

## Cost Considerations

### Pricing

| Item | Cost |
|------|------|
| Customer managed key | $1.00/month |
| Key operations (first 20K) | Free |
| Key operations (per 10K) | $0.03 |
| Multi-region key | $1.00/month per region |

### Optimization Tips

1. Use AWS managed keys for non-sensitive data
2. Consolidate keys where appropriate
3. Multi-region only for disaster recovery needs
4. Monitor key usage with CloudWatch

## Security Best Practices

1. **Least Privilege**: Grant minimal permissions needed
2. **Separation of Duties**: Different keys for different purposes
3. **Key Rotation**: Always enable automatic rotation
4. **Deletion Protection**: Use 30-day deletion window
5. **Audit Logging**: Monitor with CloudTrail
6. **Cross-Account**: Use conditions to restrict access
