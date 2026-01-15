# QuckApp Environments

This document describes all deployment environments for QuckApp.

## Environment Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Development Pipeline                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────┐      ┌────┐      ┌──────┐      ┌─────────┐      ┌──────┐        │
│   │ Dev │ ───► │ QA │ ───► │ UAT  │ ───► │ Staging │ ───► │ Live │        │
│   └─────┘      └────┘      │ 1-3  │      └─────────┘      └──────┘        │
│                            └──────┘                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Environments

| Environment | Purpose | URL | AWS Region |
|-------------|---------|-----|------------|
| **Dev** | Development & Integration | `dev.quckapp.com` | us-east-1 |
| **QA** | Quality Assurance Testing | `qa.quckapp.com` | us-east-1 |
| **UAT1** | User Acceptance Testing 1 | `uat1.quckapp.com` | us-east-1 |
| **UAT2** | User Acceptance Testing 2 | `uat2.quckapp.com` | us-east-1 |
| **UAT3** | User Acceptance Testing 3 | `uat3.quckapp.com` | us-east-1 |
| **Staging** | Pre-Production | `staging.quckapp.com` | us-east-1 |
| **Live** | Production | `quckapp.com` | us-east-1 |

## Environment Details

### Dev

**Purpose:** Active development and continuous integration

| Aspect | Configuration |
|--------|---------------|
| VPC CIDR | 10.0.0.0/16 |
| RDS | db.t3.small, Single-AZ |
| ElastiCache | cache.t3.micro, 1 node |
| API Replicas | 1 |
| Auto-deploy | On merge to `develop` |

### QA

**Purpose:** Quality assurance and automated testing

| Aspect | Configuration |
|--------|---------------|
| VPC CIDR | 10.1.0.0/16 |
| RDS | db.t3.medium, Single-AZ |
| ElastiCache | cache.t3.small, 1 node |
| API Replicas | 2 |
| Auto-deploy | Manual or after Dev |

### UAT1 / UAT2 / UAT3

**Purpose:** User acceptance testing by stakeholders

| Aspect | UAT1 | UAT2 | UAT3 |
|--------|------|------|------|
| VPC CIDR | 10.2.0.0/16 | 10.3.0.0/16 | 10.4.0.0/16 |
| RDS | db.t3.medium | db.t3.medium | db.t3.medium |
| ElastiCache | cache.t3.small | cache.t3.small | cache.t3.small |
| API Replicas | 2 | 2 | 2 |

**Use Cases:**
- UAT1: Sprint demo / Release candidate testing
- UAT2: Parallel feature testing
- UAT3: Client-specific testing / Long-running tests

### Staging

**Purpose:** Pre-production validation (mirrors production)

| Aspect | Configuration |
|--------|---------------|
| VPC CIDR | 10.10.0.0/16 |
| RDS | db.r6g.large, Multi-AZ |
| ElastiCache | cache.r6g.large, 2 nodes |
| API Replicas | 3-10 (HPA) |
| Auto-deploy | Manual after UAT approval |

**Features:**
- Production-like infrastructure
- External Secrets from AWS Secrets Manager
- WAF enabled
- Performance testing baseline

### Live (Production)

**Purpose:** Production environment serving real users

| Aspect | Configuration |
|--------|---------------|
| VPC CIDR | 10.100.0.0/16 |
| RDS | db.r6g.xlarge, Aurora Multi-AZ, 3 instances |
| ElastiCache | cache.r6g.xlarge, Cluster mode, 3 shards |
| API Replicas | 5-50 (HPA) |
| Deploy | Manual with approval gate |

**Features:**
- Full high availability
- Cross-region replication (optional)
- WAF + Shield Advanced
- 35-day backup retention
- Performance Insights enabled
- Comprehensive monitoring

## Infrastructure Comparison

| Feature | Dev | QA | UAT | Staging | Live |
|---------|-----|-----|-----|---------|------|
| Multi-AZ | No | No | No | Yes | Yes |
| Read Replicas | No | No | No | Yes | Yes |
| Deletion Protection | No | No | No | Yes | Yes |
| Backup Retention | 1 day | 7 days | 7 days | 14 days | 35 days |
| CloudFront | No | No | No | Yes | Yes |
| WAF | No | No | No | Yes | Yes |
| PITR | No | Yes | Yes | Yes | Yes |
| KMS Encryption | Yes | Yes | Yes | Yes | Yes |

## Estimated Monthly Costs

| Environment | Estimated Cost | Notes |
|-------------|----------------|-------|
| Dev | ~$200 | Minimal resources |
| QA | ~$350 | Testing overhead |
| UAT1-3 | ~$300 each | Can be powered down |
| Staging | ~$1,500 | Prod-like resources |
| Live | ~$5,000+ | Full HA, scales with usage |

## Promotion Path

```
Dev ──► QA ──► UAT1/2/3 ──► Staging ──► Live
```

### Promotion Requirements

| From → To | Requirements |
|-----------|--------------|
| Dev → QA | All tests passing, Code review approved |
| QA → UAT | QA sign-off, No critical bugs |
| UAT → Staging | UAT sign-off, Release notes |
| Staging → Live | Staging verified, Change approval |

## Terraform Commands

```bash
# Initialize any environment
make init ENV=<env>

# Plan changes
make plan ENV=<env>

# Apply changes
make apply ENV=<env>

# Shortcuts
make qa-plan
make staging-apply
make live-plan

# View outputs
make output ENV=<env>
```

## Kubernetes Deployments

```bash
# Deploy to any environment
kubectl apply -k k8s/overlays/<env>

# Using kustomize
kustomize build k8s/overlays/<env> | kubectl apply -f -

# Check deployment
kubectl get pods -n quckapp-<env>
```

## GitHub Actions

| Workflow | Trigger | Environments |
|----------|---------|--------------|
| `terraform-deploy-all.yml` | Manual | All |
| `k8s-deploy-all.yml` | Manual | All |
| `promote-environment.yml` | Manual | Promotion flow |
| `terraform-deploy-dev.yml` | Push to develop | Dev |
| `terraform-deploy-prod.yml` | Push to main | Staging, Live |

## Access Control

| Environment | Engineering | QA | Stakeholders | Ops |
|-------------|-------------|-----|--------------|-----|
| Dev | Full | Read | None | Full |
| QA | Read | Full | None | Full |
| UAT1-3 | Read | Full | Read | Full |
| Staging | Read | Read | Read | Full |
| Live | None | None | None | Full |

## Monitoring

All environments have:
- CloudWatch metrics
- CloudWatch Logs
- Prometheus metrics (K8s)

Production additionally has:
- CloudWatch Alarms
- PagerDuty integration
- Grafana dashboards
- X-Ray tracing

## Related Documentation

- [Terraform Modules](../terraform/README.md)
- [Kubernetes Manifests](../kubernetes/README.md)
- [CI/CD Pipelines](../terraform/ci-cd.md)
- [Docker Setup](../docker/README.md)
