---
sidebar_position: 1
---

# Deployment Overview

QuikApp supports multiple deployment environments, each serving a specific purpose in the software development lifecycle.

## Environment Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION TIER                                  │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐       │
│  │         LIVE               │  │       PRODUCTION            │       │
│  │   (Blue/Green Active)      │◄─│    (Release Candidate)      │       │
│  │   live.QuikApp.com        │  │   prod.QuikApp.com         │       │
│  └─────────────────────────────┘  └─────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRE-PRODUCTION TIER                              │
│  ┌─────────────────────────────┐                                        │
│  │         STAGING             │                                        │
│  │   (Production Mirror)       │                                        │
│  │   staging.QuikApp.com      │                                        │
│  └─────────────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           UAT TIER                                       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               │
│  │     UAT1      │  │     UAT2      │  │     UAT3      │               │
│  │  (Feature A)  │  │  (Feature B)  │  │  (Regression) │               │
│  │ uat1.QuikApp │  │ uat2.QuikApp │  │ uat3.QuikApp │               │
│  └───────────────┘  └───────────────┘  └───────────────┘               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         TESTING TIER                                     │
│  ┌─────────────────────────────┐                                        │
│  │            QA               │                                        │
│  │   (Quality Assurance)       │                                        │
│  │   qa.QuikApp.com           │                                        │
│  └─────────────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       DEVELOPMENT TIER                                   │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐       │
│  │           DEV               │  │          LOCAL              │       │
│  │   (Integration Testing)     │  │     (Developer Machine)     │       │
│  │   dev.QuikApp.com          │  │     localhost:3000          │       │
│  └─────────────────────────────┘  └─────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

## Environment Summary

| Environment | Purpose | Data | Deployment | Access |
|-------------|---------|------|------------|--------|
| **Local** | Developer testing | Mock/Seed | Manual | Developer only |
| **Dev** | Integration testing | Synthetic | On commit | Development team |
| **QA** | Quality assurance | Test data | On PR merge | QA team |
| **UAT1** | Feature testing | Sanitized prod | Manual | Business users |
| **UAT2** | Feature testing | Sanitized prod | Manual | Business users |
| **UAT3** | Regression testing | Sanitized prod | Scheduled | QA + Business |
| **Staging** | Pre-production validation | Prod clone | On release | All teams |
| **Production** | Release candidate | Real data | Controlled | Operations |
| **Live** | Active production | Real data | Blue/Green | End users |

## Infrastructure per Environment

### Compute & Database

| Environment | Kubernetes | Database | Redis | Kafka | Replicas |
|-------------|------------|----------|-------|-------|----------|
| Local | Docker Compose | SQLite/H2 | Single | Single | 1 |
| Dev | AKS (small) | Shared MySQL | Shared | Shared | 1-2 |
| QA | AKS (small) | Dedicated MySQL | Dedicated | Shared | 2 |
| UAT1-3 | AKS (medium) | Dedicated MySQL | Dedicated | Shared | 2 |
| Staging | AKS (prod-like) | Dedicated MySQL | Cluster | Cluster | 3 |
| Production | AKS (full) | Multi-AZ MySQL | Cluster | Cluster | 3-5 |
| Live | AKS (full) | Multi-AZ MySQL | Cluster | Cluster | 5-10 |

### AWS Media Infrastructure

QuikApp uses AWS for media storage and delivery alongside Azure Kubernetes Service (AKS) for container orchestration.

| Environment | S3 Bucket | CloudFront | S3 Lifecycle | Encryption |
|-------------|-----------|------------|--------------|------------|
| Local | LocalStack S3 | None | 1 day delete | AES-256 |
| Dev | quikapp-media-dev | Disabled | 7 day delete | SSE-S3 |
| QA | quikapp-media-qa | Optional | 14 day delete | SSE-S3 |
| UAT1-3 | quikapp-media-uat | Enabled | 30 day to IA | SSE-KMS |
| Staging | quikapp-media-staging | Enabled | 30d-IA, 90d-Glacier | SSE-KMS |
| Production | quikapp-media-prod | Enabled + WAF | 30d-IA, 90d-Glacier | SSE-KMS |
| Live | quikapp-media-prod | Enabled + WAF + Shield | 30d-IA, 90d-Glacier | SSE-KMS |

For detailed AWS configuration, see:
- [AWS Infrastructure](../infrastructure/aws.md) - Overall AWS architecture
- [S3 Media Storage](../infrastructure/s3.md) - Bucket configuration and lifecycle
- [CloudFront CDN](../infrastructure/cloudfront.md) - CDN and edge delivery
- [Media Encryption](../infrastructure/media-encryption.md) - E2EE implementation

## Deployment Flow

```
Developer → Local → Dev → QA → UAT → Staging → Production → Live
    │         │       │      │     │       │          │         │
    │         │       │      │     │       │          │         │
    ▼         ▼       ▼      ▼     ▼       ▼          ▼         ▼
  Code    Docker   Auto   Manual Manual  Release   Canary   Blue/Green
  Test    Compose  Deploy Deploy Deploy  Branch    Deploy    Switch
```

## Quick Links

- [Local Environment](./local) - Developer machine setup
- [Dev Environment](./dev) - Development integration
- [QA Environment](./qa) - Quality assurance testing
- [UAT Environments](./uat) - User acceptance testing
- [Staging Environment](./staging) - Pre-production
- [Production Environment](./production) - Release deployment
- [Live Environment](./live) - Active production
