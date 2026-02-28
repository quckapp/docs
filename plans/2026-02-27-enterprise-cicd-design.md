# Enterprise CI/CD Pipeline Design

**Date:** 2026-02-27
**Status:** Approved

## Goal

Unified enterprise CI/CD pipeline: GitHub Actions (CI) builds and tests, Azure Pipelines (CD) deploys through all environments to AKS. Covers all 55 deployable components — 35 backend services, 4 frontend/mobile apps, 5 infrastructure components, 8 database migrations, and 15 shared packages.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AKS strategy | Hybrid — AKS-NONPROD (dev/qa/uat1-3), AKS-STAGING, AKS-PROD (prod/live) | Cost efficiency for lower envs, full isolation for staging + prod |
| CI/CD split | GitHub Actions = CI, Azure Pipelines = CD | Clear responsibility boundary |
| Promotion flow | Auto: dev → qa → uat1 → uat2 → uat3 → staging. Manual: prod, live | Fast feedback with safety at prod |
| UAT model | Sequential: uat1 → uat2 → uat3 | Each UAT is a progressive validation stage |
| Promotion gates | GitHub Actions only — Azure Pipelines just deploys | Clean separation of concerns |
| Service deployment | Hybrid — per-service + deploy-all for coordinated releases | Independence by default, coordination when needed |

## End-to-End Flow

```
Developer → GitHub (push/merge)
                ↓
         GitHub Actions CI
         (build, test, Docker build, push to ACR)
                ↓
         Azure Pipelines CD (triggered via webhook)
                ↓
    AKS-NONPROD          AKS-STAGING        AKS-PROD
  ┌─────────────┐      ┌───────────┐      ┌──────────┐
  │ dev (ns)    │      │ staging   │      │ prod (ns)│
  │ qa (ns)     │  →   │ (ns)      │  →   │ live (ns)│
  │ uat1 (ns)   │      └───────────┘      └──────────┘
  │ uat2 (ns)   │         auto               manual
  │ uat3 (ns)   │        deploy             approval
  └─────────────┘
     auto-promote
```

## Component Inventory

### Category 1: Backend Services (35)

| Service | Language | DB |
|---------|----------|----|
| admin-service | Java/Spring | MySQL |
| analytics-service | Python/FastAPI | ClickHouse |
| attachment-service | Go/Gin | MongoDB |
| audit-service | Java/Spring | MySQL + ES |
| auth-service | Java/Spring | MySQL |
| backend-gateway | Node/NestJS | PostgreSQL |
| bookmark-service | Go/Gin | MySQL |
| call-service | Elixir/Phoenix | PostgreSQL |
| cdn-service | Go/Gin | Redis/S3 |
| channel-service | Go/Gin | MySQL |
| event-broadcast-service | Elixir/Phoenix | Redis |
| export-service | Python/FastAPI | PostgreSQL |
| file-service | Go/Gin | MongoDB |
| go-bff | Go/Gin | PostgreSQL |
| huddle-service | Elixir/Phoenix | PostgreSQL |
| insights-service | Python/FastAPI | ClickHouse |
| integration-service | Python/FastAPI | MongoDB |
| media-service | Go/Gin | MongoDB |
| message-service | Elixir/Phoenix | ScyllaDB |
| ml-service | Python/FastAPI | PostgreSQL |
| moderation-service | Python/FastAPI | PostgreSQL |
| notification-orchestrator | Elixir/Phoenix | Redis |
| notification-service | Node/NestJS | PostgreSQL |
| permission-service | Java/Spring | MySQL |
| presence-service | Elixir/Phoenix | Redis |
| realtime-service | Elixir/Phoenix | Redis |
| reminder-service | Go/Gin | MongoDB |
| search-service | Go/Gin | Elasticsearch |
| security-service | Java/Spring | MySQL |
| sentiment-service | Python/FastAPI | PostgreSQL |
| smart-reply-service | Python/FastAPI | PostgreSQL |
| spark-etl | Python | ClickHouse |
| thread-service | Go/Gin | MySQL |
| user-service | Java/Spring | MySQL |
| workspace-service | Go/Gin | MySQL |

### Category 2: Frontend & Apps (4)

| App | Tech | Deploy Target |
|-----|------|---------------|
| web | React/Next.js | AKS (nginx container) |
| admin | React | AKS (nginx container) |
| mobile | React Native | Azure App Center → App Store |
| chat_app | Flutter | Azure App Center → App Store |

### Category 3: Infrastructure (5)

| Component | Type | Deploy Target |
|-----------|------|---------------|
| kong | API Gateway config | AKS ConfigMap |
| service-urls API | Go backend | AKS |
| docs | Static site | AKS (nginx container) |
| envoy | Proxy config | AKS ConfigMap |
| monitoring | Prometheus/Grafana/Loki | AKS (Helm) |

### Category 4: Database Migrations (8)

| Database | Tool |
|----------|------|
| quckapp-mysql | Flyway |
| quckapp-postgresql | Flyway |
| quckapp-mongodb | migrate-mongo |
| quckapp-elasticsearch | curl/jq |
| quckapp-kafka | kafka-topics.sh |
| quckapp-clickhouse | clickhouse-client |
| quckapp-scylladb | cqlsh |
| quckapp-dynamodb | Terraform |

### Category 5: Shared Packages (15 — CI only, no deploy)

- api-client, go-auth, go-configloader, secure-url
- promotion-gate-{go,spring,python,elixir,node}
- {go,spring,nestjs,elixir,python}-version-middleware
- service-urls (library)

## AKS Cluster Design

### AKS-NONPROD (single cluster, 5 namespaces)

```
aks-nonprod
├── dev        (1 replica per service, debug logging)
├── qa         (1-2 replicas, standard logging)
├── uat1       (2 replicas, production-like config)
├── uat2       (2 replicas, production-like config)
└── uat3       (2 replicas, production-like config)
```

### AKS-STAGING (dedicated cluster, 1 namespace)

```
aks-staging
└── staging    (2+ replicas, mirrors production)
```

### AKS-PROD (dedicated cluster, 2 namespaces)

```
aks-prod
├── prod       (3+ replicas, HPA, PDB)
└── live       (3+ replicas, HPA, PDB, cross-region DR)
```

## GitHub Actions CI Pipeline

Triggered on: push to main, PR merge.

```yaml
Per-service workflow:
  1. Checkout code
  2. Detect changed files (only build if service changed)
  3. Build + unit test (language-specific)
  4. Security scan (Trivy)
  5. Docker build + tag (sha-<commit>)
  6. Push to ACR
  7. Trigger Azure Pipeline via webhook (pass image tag + service name)
```

Package-only workflow (shared libs):
```yaml
  1. Build + test
  2. Publish artifact (Maven/npm/pip/hex)
  3. No Docker, no deploy
```

## Azure Pipelines CD Pipeline

### Per-Service Pipeline (35 services + service-urls + web + admin + docs)

```yaml
stages:
  - stage: Dev
    environment: dev
    cluster: aks-nonprod
    namespace: dev
    approval: none
    actions: [helm-deploy, smoke-test]

  - stage: QA
    environment: qa
    cluster: aks-nonprod
    namespace: qa
    approval: none
    dependsOn: Dev
    actions: [helm-deploy, smoke-test]

  - stage: UAT1
    environment: uat1
    cluster: aks-nonprod
    namespace: uat1
    approval: none
    dependsOn: QA
    actions: [helm-deploy, smoke-test]

  - stage: UAT2
    environment: uat2
    cluster: aks-nonprod
    namespace: uat2
    approval: none
    dependsOn: UAT1
    actions: [helm-deploy, smoke-test]

  - stage: UAT3
    environment: uat3
    cluster: aks-nonprod
    namespace: uat3
    approval: none
    dependsOn: UAT2
    actions: [helm-deploy, smoke-test]

  - stage: Staging
    environment: staging
    cluster: aks-staging
    namespace: staging
    approval: none
    dependsOn: UAT3
    actions: [helm-deploy, smoke-test]

  - stage: Production
    environment: production
    cluster: aks-prod
    namespace: prod
    approval: manual
    dependsOn: Staging
    actions: [helm-deploy, smoke-test, notify]

  - stage: Live
    environment: live
    cluster: aks-prod
    namespace: live
    approval: manual
    dependsOn: Production
    actions: [helm-deploy, smoke-test, notify]
```

### Deploy-All Pipeline (coordinated releases)

Manual trigger. Deploys all selected services in dependency order:

```
Phase 1: Database migrations (8 in parallel)
Phase 2: Infrastructure (Kong, Envoy, monitoring)
Phase 3: Core services (auth, user, permission, workspace)
Phase 4: Business services (channel, message, thread, bookmark, etc.)
Phase 5: AI/ML services (ml, sentiment, smart-reply, moderation, etc.)
Phase 6: Gateway services (backend-gateway, go-bff, cdn)
Phase 7: Frontend apps (web, admin, docs)
Phase 8: Cross-service smoke tests
```

### Mobile & chat_app Pipeline (no K8s)

```
Stages: Build → Test → Build APK/IPA → Publish to App Center
  - Dev: internal testing track
  - QA: QA testing track
  - UAT: beta track
  - Staging: pre-release
  - Prod: App Store / Play Store submission
```

## File Structure

```
infrastructure/azure-pipelines/
├── templates/
│   ├── stages/
│   │   ├── deploy-to-aks.yml          # Reusable: Helm deploy + smoke
│   │   ├── deploy-to-app-center.yml   # Reusable: Mobile app publish
│   │   └── db-migrate.yml             # Reusable: Migration K8s Job
│   ├── jobs/
│   │   ├── helm-deploy.yml            # Helm upgrade --install
│   │   ├── smoke-test.yml             # Health endpoint check
│   │   └── rollback.yml               # Helm rollback on failure
│   └── steps/
│       ├── acr-login.yml              # ACR authentication
│       ├── aks-credentials.yml        # AKS kubeconfig
│       └── notify.yml                 # Slack/Teams notification
│
├── per-service/                        # 35 backend services
│   ├── cd-admin-service.yml
│   ├── cd-analytics-service.yml
│   ├── ... (one per service)
│   └── cd-workspace-service.yml
│
├── per-app/                            # Frontend & mobile apps
│   ├── cd-web.yml
│   ├── cd-admin-dashboard.yml
│   ├── cd-docs.yml
│   ├── cd-mobile.yml
│   └── cd-chat-app.yml
│
├── infra/                              # Infrastructure components
│   ├── cd-kong.yml
│   ├── cd-envoy.yml
│   ├── cd-monitoring.yml
│   └── cd-db-migrations.yml
│
├── coordinated/
│   └── cd-deploy-all.yml              # Manual coordinated release
│
└── variables/                          # Per-environment variables
    ├── dev.yml
    ├── qa.yml
    ├── uat1.yml
    ├── uat2.yml
    ├── uat3.yml
    ├── staging.yml
    ├── prod.yml
    └── live.yml
```

## Image Tagging Strategy

```
Build:    ghcr.io/quckapp/<service>:sha-<commit8>
Dev:      ghcr.io/quckapp/<service>:dev
QA:       ghcr.io/quckapp/<service>:qa
UAT:      ghcr.io/quckapp/<service>:uat
Staging:  ghcr.io/quckapp/<service>:staging
Prod:     ghcr.io/quckapp/<service>:prod
Live:     ghcr.io/quckapp/<service>:live
```

Image promotion = re-tag (no rebuild). The sha-tagged image is immutable.

## Smoke Test Strategy

Each stage runs a smoke test after deployment:

```bash
# Health check
curl -sf https://<service>.<env>.quckapp.com/health

# For frontend apps
curl -sf https://<app>.<env>.quckapp.com/ -o /dev/null

# Failure → automatic rollback via helm rollback
```

## Rollback Strategy

- Automatic: if smoke test fails, `helm rollback` to previous release
- Manual: `helm rollback <service> <revision>` via Azure Pipeline manual trigger
- Database: migrations are forward-only; rollback requires new migration

## Notifications

- Dev/QA/UAT: Slack channel notification on failure only
- Staging: Slack notification on success and failure
- Prod/Live: Slack + Teams + email notification on all events
