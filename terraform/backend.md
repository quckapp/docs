# Terraform Backend Configuration

This document describes the Terraform remote state backend setup for QuckApp infrastructure.

## Overview

Terraform state is stored remotely in AWS using:
- **S3** - State file storage with versioning and encryption
- **DynamoDB** - State locking to prevent concurrent modifications
- **KMS** (optional) - Customer-managed encryption key

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Terraform Backend Infrastructure                     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        S3 Bucket                                 │   │
│  │              quckapp-terraform-state-{account_id}                │   │
│  │                                                                  │   │
│  │  ┌──────────────────┐    ┌──────────────────┐                   │   │
│  │  │ dev/             │    │ prod/            │                   │   │
│  │  │ terraform.tfstate│    │ terraform.tfstate│                   │   │
│  │  └──────────────────┘    └──────────────────┘                   │   │
│  │                                                                  │   │
│  │  Features:                                                       │   │
│  │  ✓ Versioning enabled     ✓ Encryption (KMS/AES256)            │   │
│  │  ✓ Public access blocked  ✓ HTTPS enforced                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    DynamoDB Table                                │   │
│  │                quckapp-terraform-locks                           │   │
│  │                                                                  │   │
│  │  Purpose: State locking to prevent concurrent modifications      │   │
│  │  Mode: PAY_PER_REQUEST (on-demand)                              │   │
│  │  Features: Point-in-time recovery, encryption                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    KMS Key (Optional)                            │   │
│  │              alias/quckapp-terraform-state                       │   │
│  │                                                                  │   │
│  │  Purpose: Customer-managed encryption for S3 and DynamoDB        │   │
│  │  Features: Automatic rotation, audit logging                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Setup Instructions

### Step 1: Bootstrap Backend Infrastructure

First, create the S3 bucket and DynamoDB table:

```bash
cd terraform/backend

# Initialize (uses local state initially)
terraform init

# Review the plan
terraform plan

# Create backend infrastructure
terraform apply
```

This creates:
- S3 bucket: `quckapp-terraform-state-{account_id}`
- DynamoDB table: `quckapp-terraform-locks`
- KMS key (if enabled): `alias/quckapp-terraform-state`
- IAM policy for state access
- Backend configuration files for each environment

### Step 2: Configure Environments

After the backend is created, configuration files are generated:
- `terraform/environments/dev/backend.hcl`
- `terraform/environments/prod/backend.hcl`

### Step 3: Enable Backend in Environments

Edit the main.tf in each environment to uncomment the backend block:

```hcl
terraform {
  # ... provider requirements ...

  backend "s3" {
    # Configuration provided via backend.hcl file
  }
}
```

### Step 4: Initialize with Backend

```bash
# For dev environment
cd terraform/environments/dev
terraform init -backend-config=backend.hcl

# For prod environment
cd terraform/environments/prod
terraform init -backend-config=backend.hcl
```

If you have existing local state, Terraform will ask to migrate it:

```
Do you want to copy existing state to the new backend?
  Enter "yes" to copy and "no" to start with an empty state.
```

Answer `yes` to migrate existing state to S3.

## Backend Configuration Files

### backend.hcl Format

```hcl
bucket         = "quckapp-terraform-state-123456789012"
key            = "dev/terraform.tfstate"
region         = "us-east-1"
encrypt        = true
dynamodb_table = "quckapp-terraform-locks"
kms_key_id     = "arn:aws:kms:us-east-1:123456789012:key/xxx"  # Optional
```

### Configuration Options

| Option | Description | Required |
|--------|-------------|----------|
| `bucket` | S3 bucket name | Yes |
| `key` | State file path within bucket | Yes |
| `region` | AWS region | Yes |
| `encrypt` | Enable server-side encryption | Yes |
| `dynamodb_table` | DynamoDB table for locking | Yes |
| `kms_key_id` | KMS key ARN (if using KMS) | No |
| `role_arn` | IAM role to assume | No |
| `profile` | AWS profile to use | No |

## State File Structure

```
s3://quckapp-terraform-state-{account_id}/
├── dev/
│   └── terraform.tfstate
├── prod/
│   └── terraform.tfstate
└── backend/
    └── terraform.tfstate  (optional - self-managing backend)
```

## Security Features

### S3 Bucket Security

1. **Versioning** - All state changes are versioned for recovery
2. **Encryption** - Server-side encryption (AES256 or KMS)
3. **Public Access Blocked** - All public access is denied
4. **HTTPS Required** - Bucket policy enforces secure transport
5. **Lifecycle Rules** - Old versions expire after 90 days

### DynamoDB Security

1. **Encryption** - Server-side encryption enabled
2. **Point-in-Time Recovery** - Enabled for data protection
3. **On-Demand Billing** - No capacity planning needed

### Access Control

The backend module creates an IAM policy for state access:

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetObject", "s3:PutObject"],
      "Resource": ["arn:aws:s3:::bucket", "arn:aws:s3:::bucket/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"],
      "Resource": "arn:aws:dynamodb:*:*:table/quckapp-terraform-locks"
    }
  ]
}
```

Attach this policy to:
- CI/CD roles (GitHub Actions)
- Developer roles
- Admin roles

## Operations

### Viewing State

```bash
# List state resources
terraform state list

# Show specific resource
terraform state show aws_s3_bucket.media

# Pull state to local file (for inspection)
terraform state pull > state.json
```

### State Locking

Terraform automatically locks state during operations:

```
Acquiring state lock. This may take a few moments...
```

If a lock is stuck (rare), force unlock:

```bash
# Get lock ID from error message
terraform force-unlock LOCK_ID
```

### State Recovery

To recover from a corrupted state:

1. **From S3 versioning:**
   ```bash
   # List versions
   aws s3api list-object-versions \
     --bucket quckapp-terraform-state-xxx \
     --prefix dev/terraform.tfstate

   # Restore previous version
   aws s3api copy-object \
     --bucket quckapp-terraform-state-xxx \
     --copy-source quckapp-terraform-state-xxx/dev/terraform.tfstate?versionId=VERSION_ID \
     --key dev/terraform.tfstate
   ```

2. **From backup:**
   ```bash
   # Push local state
   terraform state push backup.tfstate
   ```

### Moving State Between Backends

```bash
# Export current state
terraform state pull > state.json

# Reconfigure backend
terraform init -reconfigure -backend-config=new-backend.hcl

# Import state
terraform state push state.json
```

## Workspaces vs Separate State Files

QuckApp uses **separate state files** (recommended):

| Approach | Pros | Cons |
|----------|------|------|
| **Separate Files** | Clear isolation, different backends possible | More configuration |
| **Workspaces** | Single configuration | Shared backend, easy mistakes |

Our structure:
```
dev/terraform.tfstate   # Complete isolation
prod/terraform.tfstate  # Different permissions possible
```

## Troubleshooting

### "Error acquiring the state lock"

```
Error: Error acquiring the state lock
Lock Info:
  ID:        xxx
  Path:      ...
  Operation: OperationTypeApply
```

**Solution:**
1. Wait for the other operation to complete
2. If stuck, check who has the lock:
   ```bash
   aws dynamodb get-item \
     --table-name quckapp-terraform-locks \
     --key '{"LockID":{"S":"quckapp-terraform-state-xxx/dev/terraform.tfstate"}}'
   ```
3. Force unlock if necessary:
   ```bash
   terraform force-unlock LOCK_ID
   ```

### "Access Denied" to S3

**Causes:**
- Missing IAM permissions
- Wrong AWS profile/credentials
- Bucket policy blocking access

**Solution:**
1. Verify credentials: `aws sts get-caller-identity`
2. Check IAM permissions for S3 and DynamoDB
3. Ensure bucket policy allows your principal

### State Corruption

**Symptoms:**
- "Error loading state"
- "Inconsistent dependency"

**Solution:**
1. Try refreshing: `terraform refresh`
2. Restore from S3 version history
3. Manually edit state (last resort):
   ```bash
   terraform state pull > state.json
   # Edit state.json
   terraform state push state.json
   ```

## Cost Considerations

| Resource | Cost |
|----------|------|
| S3 Storage | ~$0.023/GB/month |
| S3 Requests | ~$0.005/1000 requests |
| DynamoDB | ~$0.25/million reads |
| KMS | $1/month + $0.03/10K requests |

**Estimated monthly cost:** < $5 for typical usage

## Best Practices

1. **Always use remote state** for team environments
2. **Enable versioning** for state recovery
3. **Use separate state files** per environment
4. **Enable encryption** (KMS for production)
5. **Restrict access** with IAM policies
6. **Never commit state files** to version control
7. **Use partial configuration** (backend.hcl) for secrets
8. **Enable locking** with DynamoDB
9. **Backup state** before major changes
10. **Monitor state changes** with S3 access logs
