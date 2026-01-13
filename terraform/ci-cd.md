# Terraform CI/CD with GitHub Actions

This document describes the GitHub Actions workflows for Terraform infrastructure management.

## Overview

QuikApp uses GitHub Actions for automated Terraform operations:

```
.github/workflows/
├── terraform-validate.yml    # PR validation, security scanning
├── terraform-deploy-dev.yml  # Dev environment deployment
├── terraform-deploy-prod.yml # Prod environment deployment (with approval)
└── terraform-drift.yml       # Scheduled drift detection
```

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Pull Request                                    │
│                                                                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐             │
│  │  Format  │──▶│ Validate │──▶│ Security │──▶│   Plan   │             │
│  │  Check   │   │          │   │   Scan   │   │          │             │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘             │
│                                                      │                   │
│                                              ┌───────▼───────┐          │
│                                              │ Cost Estimate │          │
│                                              │  (Infracost)  │          │
│                                              └───────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Merge
┌─────────────────────────────────────────────────────────────────────────┐
│                         Deployment                                       │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Dev (develop branch)                          │   │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐                     │   │
│  │  │   Plan   │──▶│  Apply   │──▶│  Notify  │                     │   │
│  │  └──────────┘   └──────────┘   └──────────┘                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Prod (main branch)                            │   │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │   │
│  │  │   Plan   │──▶│ Approval │──▶│  Apply   │──▶│  Verify  │     │   │
│  │  └──────────┘   └──────────┘   └──────────┘   └──────────┘     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Workflows

### 1. Terraform Validate (`terraform-validate.yml`)

Runs on every pull request to validate changes before merge.

**Trigger:**
- Pull requests to `main` or `develop` branches
- Changes to `terraform/**` or workflow files

**Jobs:**

| Job | Description |
|-----|-------------|
| `detect-changes` | Identifies which environments have changes |
| `format` | Checks `terraform fmt` compliance |
| `validate-dev` | Validates dev environment configuration |
| `validate-prod` | Validates prod environment configuration |
| `security-scan` | Runs tfsec and Checkov security scans |
| `plan-dev` | Generates plan for dev environment |
| `plan-prod` | Generates plan for prod environment |
| `cost-estimate` | Estimates cost changes (requires Infracost) |

**Example PR Comment:**

```
## Terraform Validation - Dev Environment

| Step | Result |
|------|--------|
| Init | `success` |
| Validate | `success` |

## Terraform Plan - Dev Environment

<details>
<summary>Show Plan</summary>

```hcl
Terraform will perform the following actions:

  # aws_s3_bucket.media will be created
  + resource "aws_s3_bucket" "media" {
      + bucket = "quikapp-media-dev"
      ...
    }

Plan: 1 to add, 0 to change, 0 to destroy.
```

</details>
```

### 2. Deploy Dev (`terraform-deploy-dev.yml`)

Automatically deploys to dev environment on merge to `develop` branch.

**Trigger:**
- Push to `develop` branch
- Manual dispatch

**Jobs:**

| Job | Description |
|-----|-------------|
| `plan` | Generates execution plan |
| `apply` | Applies changes (auto-approve for dev) |
| `destroy` | Destroys infrastructure (manual only) |
| `summary` | Generates deployment summary |

**Manual Actions:**

```yaml
# Apply changes
action: apply

# Destroy infrastructure (requires confirmation)
action: destroy
confirm_destroy: destroy
```

### 3. Deploy Prod (`terraform-deploy-prod.yml`)

Deploys to production with mandatory approval gate.

**Trigger:**
- Push to `main` branch
- Manual dispatch

**Jobs:**

| Job | Description |
|-----|-------------|
| `preflight` | Validates branch and commit |
| `plan` | Generates execution plan |
| `security-review` | Additional security checks |
| `approval` | Manual approval gate |
| `apply` | Applies changes after approval |
| `verify` | Post-deployment verification |
| `notify` | Sends success/failure notifications |

**Approval Gate:**

The workflow pauses at the `approval` job, requiring a designated approver to review and approve the deployment in the GitHub environment settings.

### 4. Drift Detection (`terraform-drift.yml`)

Scheduled job to detect infrastructure drift.

**Trigger:**
- Daily at 6 AM UTC
- Manual dispatch

**Jobs:**

| Job | Description |
|-----|-------------|
| `drift-dev` | Checks dev environment for drift |
| `drift-prod` | Checks prod environment for drift |
| `summary` | Reports drift status |

**Drift Issue:**

When drift is detected, an issue is automatically created:

```markdown
## Infrastructure Drift Detected - Dev Environment

Terraform has detected differences between the actual
infrastructure state and the configuration.

## Resolution Options

1. Apply Configuration: Run `terraform apply`
2. Update Code: Modify Terraform configuration
3. Investigate: Determine if drift was intentional
```

## Setup

### 1. Create AWS OIDC Provider

```hcl
# In your AWS account
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}
```

### 2. Create IAM Roles

```hcl
# Dev deployment role
resource "aws_iam_role" "github_actions_dev" {
  name = "github-actions-terraform-dev"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:myorg/quikapp:*"
        }
      }
    }]
  })
}

# Attach necessary policies
resource "aws_iam_role_policy_attachment" "github_actions_dev" {
  role       = aws_iam_role.github_actions_dev.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
```

### 3. Configure GitHub Secrets

| Secret | Description |
|--------|-------------|
| `AWS_ROLE_ARN_DEV` | IAM role ARN for dev deployments |
| `AWS_ROLE_ARN_PROD` | IAM role ARN for prod deployments |
| `INFRACOST_API_KEY` | (Optional) Infracost API key |
| `SLACK_WEBHOOK_URL` | (Optional) Slack notifications |

### 4. Configure GitHub Environments

1. Go to **Settings > Environments**
2. Create `dev` environment
3. Create `production` environment with:
   - Required reviewers
   - Wait timer (optional)
   - Deployment branch restrictions

## Usage

### Running Validation on PR

1. Create a pull request with Terraform changes
2. Workflows automatically run
3. Review plan output in PR comments
4. Address any security findings
5. Merge after approval

### Deploying to Dev

```bash
# Automatic on merge to develop
git checkout develop
git merge feature/my-changes
git push origin develop
```

Or manually:

1. Go to **Actions > Terraform Deploy Dev**
2. Click **Run workflow**
3. Select action: `apply`

### Deploying to Production

```bash
# Automatic on merge to main
git checkout main
git merge develop
git push origin main
```

1. Workflow runs plan
2. Wait for approval notification
3. Review plan in GitHub Actions
4. Approve deployment in environment
5. Monitor apply progress

### Checking for Drift

1. Go to **Actions > Terraform Drift Detection**
2. Click **Run workflow**
3. Select environment
4. Optionally enable auto-fix

## Best Practices

### 1. Always Use Pull Requests

Never push directly to `main` or `develop`. Use PRs to:
- Get automated validation
- Review plans before merge
- Maintain audit trail

### 2. Review Security Findings

Always address security scan findings before merging:
- tfsec checks for AWS security issues
- Checkov validates compliance

### 3. Use Cost Estimation

Set up Infracost to understand cost implications:

```bash
# Get API key
infracost auth login

# Add to GitHub Secrets
INFRACOST_API_KEY=<your-api-key>
```

### 4. Monitor Drift

- Review drift detection results daily
- Investigate any unexpected drift
- Document intentional manual changes

### 5. Keep State Secure

- Use encrypted S3 backend
- Enable state locking with DynamoDB
- Restrict state access with IAM

## Troubleshooting

### Workflow Fails to Authenticate

1. Verify OIDC provider is configured correctly
2. Check IAM role trust policy
3. Ensure GitHub secret contains correct ARN

### Plan Shows Unexpected Changes

1. Check for drift in the environment
2. Verify state file is current
3. Look for manual changes in AWS console

### Approval Not Received

1. Check environment protection rules
2. Verify required reviewers are assigned
3. Check for pending notifications

## Cost Optimization

### Reduce Workflow Runs

- Use path filters to skip unchanged environments
- Cache Terraform providers
- Use `workflow_dispatch` for manual testing

### Parallel Execution

- Independent jobs run in parallel
- Plan for both environments simultaneously
- Security scan runs alongside validation
