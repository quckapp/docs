# IAM Module

Creates IAM roles and policies for secure access to AWS resources with least-privilege principles.

## Features

- Media service role (EKS Pod Identity)
- Lambda thumbnail role
- CDN service role
- CI/CD deployment role (GitHub Actions OIDC)
- S3 access policies
- KMS encryption policies
- CloudFront invalidation access
- Cross-account access patterns

## Usage

```hcl
module "iam" {
  source = "../../modules/iam"

  environment = "prod"

  # Roles to create
  create_media_service_role    = true
  create_lambda_thumbnail_role = true
  create_cdn_service_role      = true
  create_cicd_role             = true

  # EKS configuration (for pod identity)
  eks_oidc_provider_arn = module.eks.oidc_provider_arn
  eks_oidc_provider     = module.eks.oidc_provider
  kubernetes_namespace  = "quckapp"

  # S3 buckets
  media_bucket_arn      = module.s3.media_bucket_arn
  thumbnails_bucket_arn = module.s3.thumbnails_bucket_arn
  logs_bucket_arn       = module.s3.logs_bucket_arn

  # KMS key
  kms_key_arn = module.kms.s3_media_key_arn

  # CloudFront
  cloudfront_distribution_arn = module.cloudfront.distribution_arn

  # CI/CD (GitHub Actions)
  github_repo_pattern = "repo:myorg/quckapp:*"

  tags = var.tags
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       IAM Roles                              │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ Media Service   │  │ Lambda Thumbnail│  │ CDN Service │  │
│  │ (EKS Pod)       │  │                 │  │ (EKS Pod)   │  │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘  │
│           │                    │                   │         │
│  ┌────────▼────────┐  ┌────────▼────────┐  ┌──────▼──────┐  │
│  │ S3: Read/Write  │  │ S3: Read Media  │  │ S3: Read    │  │
│  │ KMS: Encrypt    │  │ S3: Write Thumb │  │ CloudFront  │  │
│  └─────────────────┘  │ CloudWatch Logs │  └─────────────┘  │
│                       └─────────────────┘                    │
│                                                              │
│  ┌─────────────────┐                                        │
│  │ CI/CD Deploy    │─── GitHub Actions OIDC                 │
│  │                 │                                        │
│  └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```

## Roles

### Media Service Role

For EKS pods that handle media uploads/downloads:

```hcl
role {
  name = "quckapp-media-service-{env}"

  # EKS Pod Identity (IRSA)
  assume_role_policy = {
    Principal = { Federated = eks_oidc_provider_arn }
    Action    = "sts:AssumeRoleWithWebIdentity"
    Condition = {
      StringEquals = {
        "${oidc_provider}:sub" = "system:serviceaccount:quckapp:media-service"
      }
    }
  }
}

policy {
  # Full access to media bucket
  actions = [
    "s3:GetObject",
    "s3:PutObject",
    "s3:DeleteObject",
    "s3:GetObjectVersion",
    "s3:GetObjectTagging",
    "s3:PutObjectTagging"
  ]
  resources = ["${media_bucket_arn}/*"]

  # KMS access
  actions   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"]
  resources = [kms_key_arn]
}
```

### Lambda Thumbnail Role

For Lambda functions that generate thumbnails:

```hcl
role {
  name = "quckapp-lambda-thumbnail-{env}"

  assume_role_policy = {
    Principal = { Service = "lambda.amazonaws.com" }
    Action    = "sts:AssumeRole"
  }
}

policy {
  # Read from media bucket (specific paths)
  actions   = ["s3:GetObject", "s3:GetObjectVersion"]
  resources = [
    "${media_bucket_arn}/photos/*",
    "${media_bucket_arn}/videos/*",
    "${media_bucket_arn}/avatars/*"
  ]

  # Write to thumbnails bucket
  actions   = ["s3:PutObject", "s3:PutObjectTagging"]
  resources = ["${thumbnails_bucket_arn}/*"]

  # CloudWatch Logs
  actions = [
    "logs:CreateLogGroup",
    "logs:CreateLogStream",
    "logs:PutLogEvents"
  ]
}

# Attach managed policy
attachment {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
```

### CDN Service Role

For services managing CloudFront and serving content:

```hcl
role {
  name = "quckapp-cdn-service-{env}"

  # EKS Pod Identity
  assume_role_policy = {
    Principal = { Federated = eks_oidc_provider_arn }
    Condition = {
      StringEquals = {
        "${oidc_provider}:sub" = "system:serviceaccount:quckapp:cdn-service"
      }
    }
  }
}

policy {
  # Read-only S3 access
  actions   = ["s3:GetObject", "s3:GetObjectVersion"]
  resources = ["${media_bucket_arn}/*", "${thumbnails_bucket_arn}/*"]

  # CloudFront invalidation
  actions = [
    "cloudfront:CreateInvalidation",
    "cloudfront:GetInvalidation",
    "cloudfront:ListInvalidations"
  ]
  resources = [cloudfront_distribution_arn]
}
```

### CI/CD Deployment Role

For GitHub Actions with OIDC authentication:

```hcl
role {
  name = "quckapp-cicd-deployment-{env}"

  # GitHub Actions OIDC
  assume_role_policy = {
    Principal = {
      Federated = "arn:aws:iam::${account_id}:oidc-provider/token.actions.githubusercontent.com"
    }
    Action = "sts:AssumeRoleWithWebIdentity"
    Condition = {
      StringEquals = {
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
      }
      StringLike = {
        "token.actions.githubusercontent.com:sub" = "repo:myorg/quckapp:*"
      }
    }
  }
}

policy {
  # S3 deployment access
  actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
  resources = ["${media_bucket_arn}/*"]

  # ECR push access
  actions = [
    "ecr:GetAuthorizationToken",
    "ecr:BatchCheckLayerAvailability",
    "ecr:PutImage"
  ]
}
```

## EKS Pod Identity (IRSA)

### Kubernetes Service Account

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: media-service
  namespace: quckapp
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/quckapp-media-service-prod
```

### Pod Configuration

```yaml
apiVersion: v1
kind: Pod
spec:
  serviceAccountName: media-service
  containers:
  - name: app
    # AWS SDK automatically uses the IAM role
```

## GitHub Actions OIDC

### Workflow Configuration

```yaml
name: Deploy
on: push

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/quckapp-cicd-deployment-prod
          aws-region: us-east-1

      - name: Deploy to S3
        run: aws s3 sync ./dist s3://bucket-name/
```

## Policy Patterns

### Least Privilege S3 Access

```json
{
  "Sid": "RestrictedPaths",
  "Effect": "Allow",
  "Action": ["s3:GetObject"],
  "Resource": [
    "arn:aws:s3:::bucket/photos/*",
    "arn:aws:s3:::bucket/videos/*"
  ]
}
```

### Conditional KMS Access

```json
{
  "Sid": "KMSWithCondition",
  "Effect": "Allow",
  "Action": ["kms:Decrypt"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "kms:CallerAccount": "123456789012"
    }
  }
}
```

### Resource-Based Conditions

```json
{
  "Sid": "OnlyOwnObjects",
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::bucket/${aws:userid}/*"
}
```

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `environment` | Environment name | string | - |
| `create_media_service_role` | Create media service role | bool | `true` |
| `create_lambda_thumbnail_role` | Create Lambda role | bool | `true` |
| `create_cdn_service_role` | Create CDN role | bool | `true` |
| `create_cicd_role` | Create CI/CD role | bool | `false` |
| `eks_oidc_provider_arn` | EKS OIDC provider ARN | string | `null` |
| `media_bucket_arn` | Media bucket ARN | string | - |
| `kms_key_arn` | KMS key ARN | string | `null` |
| `github_repo_pattern` | GitHub repo for OIDC | string | `null` |

## Outputs

| Name | Description |
|------|-------------|
| `media_service_role_arn` | Media service role ARN |
| `media_service_role_name` | Media service role name |
| `lambda_thumbnail_role_arn` | Lambda thumbnail role ARN |
| `cdn_service_role_arn` | CDN service role ARN |
| `cicd_deployment_role_arn` | CI/CD deployment role ARN |

## Security Best Practices

1. **Use OIDC**: Prefer OIDC over long-lived credentials
2. **Least Privilege**: Grant minimum required permissions
3. **Resource Constraints**: Always specify resource ARNs
4. **Conditions**: Use conditions to further restrict access
5. **Regular Audits**: Review permissions with IAM Access Analyzer
6. **No Wildcards**: Avoid `*` in actions and resources
7. **Separate Roles**: Different roles for different services
8. **Rotation**: Use temporary credentials (STS)
