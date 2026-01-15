---
sidebar_position: 2
---

# AWS Infrastructure

QuckApp leverages Amazon Web Services (AWS) for media storage, content delivery, and scalable infrastructure alongside Azure Kubernetes Service (AKS) for container orchestration.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           QuckApp AWS Infrastructure                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                              Mobile/Web Clients                               │   │
│  │                                                                               │   │
│  │    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐                  │   │
│  │    │   iOS   │    │ Android │    │   Web   │    │ Desktop │                  │   │
│  │    │   App   │    │   App   │    │   App   │    │   App   │                  │   │
│  │    └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘                  │   │
│  │         │              │              │              │                        │   │
│  │         └──────────────┴──────────────┴──────────────┘                        │   │
│  │                                 │                                             │   │
│  │                    ┌────────────┴────────────┐                                │   │
│  │                    │   Client-Side E2EE      │                                │   │
│  │                    │   (Signal Protocol)     │                                │   │
│  │                    └────────────┬────────────┘                                │   │
│  └─────────────────────────────────┼────────────────────────────────────────────┘   │
│                                    │                                                 │
│                                    ▼                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                           AWS Global Edge Network                             │   │
│  │                                                                               │   │
│  │    ┌─────────────────┐         ┌─────────────────┐                           │   │
│  │    │    Route 53     │         │   CloudFront    │                           │   │
│  │    │   (DNS + Geo)   │◀───────▶│   (CDN Edge)    │                           │   │
│  │    └────────┬────────┘         └────────┬────────┘                           │   │
│  │             │                           │                                     │   │
│  │             │    ┌──────────────────────┘                                     │   │
│  │             │    │                                                            │   │
│  │             ▼    ▼                                                            │   │
│  │    ┌─────────────────┐         ┌─────────────────┐                           │   │
│  │    │  AWS WAF/Shield │         │  AWS Certificate│                           │   │
│  │    │   (DDoS/WAF)    │         │    Manager      │                           │   │
│  │    └────────┬────────┘         └─────────────────┘                           │   │
│  └─────────────┼────────────────────────────────────────────────────────────────┘   │
│                │                                                                     │
│                ▼                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                              API & Compute Layer                              │   │
│  │                                                                               │   │
│  │    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │   │
│  │    │   API Gateway   │    │  Lambda@Edge    │    │   App Runner    │         │   │
│  │    │  (REST/WebSocket│    │ (Media Process) │    │  (Containers)   │         │   │
│  │    └────────┬────────┘    └────────┬────────┘    └────────┬────────┘         │   │
│  │             │                      │                      │                   │   │
│  │             └──────────────────────┴──────────────────────┘                   │   │
│  │                                    │                                          │   │
│  │                                    ▼                                          │   │
│  │    ┌─────────────────────────────────────────────────────────────────┐       │   │
│  │    │                     Media Service (Go)                          │       │   │
│  │    │                                                                  │       │   │
│  │    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │       │   │
│  │    │  │  Upload  │  │  Process │  │ Thumbnail│  │  Deliver │        │       │   │
│  │    │  │  Handler │  │  Handler │  │Generator │  │  Handler │        │       │   │
│  │    │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │       │   │
│  │    └─────────────────────────────────────────────────────────────────┘       │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                                 │
│                                    ▼                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                              Storage Layer                                    │   │
│  │                                                                               │   │
│  │    ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │    │                         Amazon S3                                    │   │   │
│  │    │                                                                      │   │   │
│  │    │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │   │   │
│  │    │  │   Media    │  │ Thumbnails │  │  Archives  │  │   Logs     │    │   │   │
│  │    │  │   Bucket   │  │   Bucket   │  │  (Glacier) │  │   Bucket   │    │   │   │
│  │    │  │            │  │            │  │            │  │            │    │   │   │
│  │    │  │ • Photos   │  │ • Image    │  │ • Cold     │  │ • Access   │    │   │   │
│  │    │  │ • Videos   │  │   Previews │  │   Storage  │  │   Logs     │    │   │   │
│  │    │  │ • Voice    │  │ • Video    │  │ • Backups  │  │ • Audit    │    │   │   │
│  │    │  │ • Files    │  │   Previews │  │ • Exports  │  │   Trails   │    │   │   │
│  │    │  │            │  │            │  │            │  │            │    │   │   │
│  │    │  │ Lifecycle: │  │ Lifecycle: │  │ Lifecycle: │  │ Lifecycle: │    │   │   │
│  │    │  │ 30d→IA     │  │ 7d delete  │  │ Permanent  │  │ 90d delete │    │   │   │
│  │    │  │ 90d→Glacier│  │            │  │            │  │            │    │   │   │
│  │    │  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │   │   │
│  │    │                                                                      │   │   │
│  │    │  Encryption: SSE-KMS (AES-256) + Client-Side E2EE                   │   │   │
│  │    └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                               │   │
│  │    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │   │
│  │    │   ElastiCache   │    │    DynamoDB     │    │     SQS/SNS     │         │   │
│  │    │    (Redis)      │    │  (Media Meta)   │    │  (Event Queue)  │         │   │
│  │    └─────────────────┘    └─────────────────┘    └─────────────────┘         │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                          Security & Encryption                                │   │
│  │                                                                               │   │
│  │    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │   │
│  │    │    AWS KMS      │    │   IAM Roles     │    │   Secrets       │         │   │
│  │    │ (Encryption     │    │  (Fine-grained  │    │   Manager       │         │   │
│  │    │  Key Mgmt)      │    │   Access)       │    │                 │         │   │
│  │    └─────────────────┘    └─────────────────┘    └─────────────────┘         │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Why AWS for Media Storage?

QuckApp uses a **hybrid cloud strategy**:

| Component | Platform | Reason |
|-----------|----------|--------|
| **Container Orchestration** | Azure AKS | Existing enterprise infrastructure |
| **Media Storage** | AWS S3 | Industry-leading object storage |
| **CDN/Delivery** | AWS CloudFront | Global edge network (400+ PoPs) |
| **Media Processing** | AWS Lambda@Edge | Serverless at edge locations |
| **Secrets** | Azure Key Vault + AWS KMS | Best of both platforms |

### AWS vs WhatsApp Architecture Comparison

```
WhatsApp (Meta)                           QuckApp (AWS)
─────────────────                         ─────────────────
• Closed system                           • Open/extensible
• Meta-owned servers                      • AWS infrastructure
• Proprietary storage                     • S3 + Glacier
• Signal Protocol E2EE                    • Signal Protocol E2EE
• No external access                      • API-driven access
• Meta controls lifecycle                 • Configurable lifecycle
```

---

## AWS Services Used

### Core Services

| Service | Purpose | Environment |
|---------|---------|-------------|
| **S3** | Media storage (photos, videos, files, voice) | All |
| **CloudFront** | Global CDN delivery | All |
| **Lambda** | Media processing, thumbnails | All |
| **Lambda@Edge** | Image/video optimization | Production |
| **API Gateway** | REST/WebSocket APIs | All |
| **KMS** | Encryption key management | All |
| **Route 53** | DNS and geo-routing | Production |
| **WAF** | Web application firewall | Production |
| **Shield** | DDoS protection | Production |

### Storage Tiers

| Tier | S3 Class | Use Case | Cost |
|------|----------|----------|------|
| **Hot** | S3 Standard | Active media (< 30 days) | $0.023/GB |
| **Warm** | S3 IA | Older media (30-90 days) | $0.0125/GB |
| **Cold** | S3 Glacier | Archived media (> 90 days) | $0.004/GB |
| **Deep Archive** | S3 Glacier Deep | Compliance retention | $0.00099/GB |

---

## Multi-Region Architecture

```
                            ┌─────────────────────────────────────┐
                            │         Route 53 (Global)           │
                            │    Latency-based / Geo routing      │
                            └──────────────┬──────────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    ▼                      ▼                      ▼
        ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
        │   US Region       │  │   EU Region       │  │   APAC Region     │
        │   (us-east-1)     │  │   (eu-west-1)     │  │   (ap-southeast-1)│
        │                   │  │                   │  │                   │
        │  ┌─────────────┐  │  │  ┌─────────────┐  │  │  ┌─────────────┐  │
        │  │ CloudFront  │  │  │  │ CloudFront  │  │  │  │ CloudFront  │  │
        │  │   PoPs      │  │  │  │   PoPs      │  │  │  │   PoPs      │  │
        │  └──────┬──────┘  │  │  └──────┬──────┘  │  │  └──────┬──────┘  │
        │         │         │  │         │         │  │         │         │
        │  ┌──────▼──────┐  │  │  ┌──────▼──────┐  │  │  ┌──────▼──────┐  │
        │  │  S3 Bucket  │  │  │  │  S3 Bucket  │  │  │  │  S3 Bucket  │  │
        │  │  (Primary)  │  │  │  │  (Replica)  │  │  │  │  (Replica)  │  │
        │  └─────────────┘  │  │  └─────────────┘  │  │  └─────────────┘  │
        │                   │  │                   │  │                   │
        │  ┌─────────────┐  │  │  ┌─────────────┐  │  │  ┌─────────────┐  │
        │  │ ElastiCache │  │  │  │ ElastiCache │  │  │  │ ElastiCache │  │
        │  │   (Redis)   │  │  │  │   (Redis)   │  │  │  │   (Redis)   │  │
        │  └─────────────┘  │  │  └─────────────┘  │  │  └─────────────┘  │
        └───────────────────┘  └───────────────────┘  └───────────────────┘
                    │                      │                      │
                    └──────────────────────┼──────────────────────┘
                                           │
                            ┌──────────────▼──────────────────────┐
                            │      S3 Cross-Region Replication    │
                            │         (Automatic Sync)            │
                            └─────────────────────────────────────┘
```

---

## Environment-Specific Configuration

### Development

```yaml
# aws/environments/dev.yaml
region: us-east-1

s3:
  buckets:
    media:
      name: quckapp-media-dev
      versioning: false
      encryption: AES256
      lifecycle:
        expiration_days: 7
    thumbnails:
      name: quckapp-thumbs-dev
      lifecycle:
        expiration_days: 3

cloudfront:
  enabled: false  # Direct S3 access in dev

lambda:
  memory: 512
  timeout: 30
```

### Production

```yaml
# aws/environments/prod.yaml
region: us-east-1
multi_region: true
replica_regions:
  - eu-west-1
  - ap-southeast-1

s3:
  buckets:
    media:
      name: quckapp-media-prod
      versioning: true
      encryption: aws:kms
      kms_key: arn:aws:kms:us-east-1:123456789:key/media-key
      replication:
        enabled: true
        destinations:
          - eu-west-1
          - ap-southeast-1
      lifecycle:
        transitions:
          - days: 30
            storage_class: STANDARD_IA
          - days: 90
            storage_class: GLACIER
        expiration_days: 365

cloudfront:
  enabled: true
  price_class: PriceClass_All
  origins:
    - s3
    - api_gateway
  behaviors:
    - path: /media/*
      cache_ttl: 86400
      compress: true
    - path: /api/*
      cache_ttl: 0
      forward_headers: all

lambda:
  memory: 2048
  timeout: 60
  provisioned_concurrency: 10
```

---

## Cost Estimation

### Monthly Cost by Environment

| Service | Dev | QA | Staging | Production |
|---------|-----|-----|---------|------------|
| **S3 Storage** | $5 | $20 | $100 | $2,000 |
| **S3 Requests** | $2 | $10 | $50 | $500 |
| **CloudFront** | $0 | $10 | $50 | $1,500 |
| **Lambda** | $5 | $20 | $100 | $800 |
| **KMS** | $1 | $3 | $10 | $50 |
| **Data Transfer** | $5 | $30 | $150 | $3,000 |
| **Total** | **~$18** | **~$93** | **~$460** | **~$7,850** |

### Cost Optimization Strategies

1. **S3 Intelligent-Tiering** - Automatic tier optimization
2. **Reserved Capacity** - Up to 40% savings
3. **CloudFront Caching** - Reduces origin requests by 80%+
4. **Lambda@Edge** - Process at edge, reduce data transfer
5. **Lifecycle Policies** - Auto-archive/delete old media

---

## Related Documentation

- [S3 Media Storage](./s3.md) - Detailed S3 configuration
- [CloudFront CDN](./cloudfront.md) - CDN setup and optimization
- [Media Encryption](./media-encryption.md) - E2EE implementation
- [Media Service](../microservices/go/media-service.md) - Go media microservice
- [File Service](../microservices/go/file-service.md) - File handling service
