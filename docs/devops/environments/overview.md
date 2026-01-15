---
sidebar_position: 1
---

# Environments Overview

QuckApp uses 8 deployment environments to ensure quality, security, and compliance throughout the software delivery lifecycle.

## Environment Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        QuckApp Environment Pipeline                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Development                    Testing                    Production     │
│  ┌───────────────┐    ┌──────────────────────────┐    ┌─────────────────┐  │
│  │               │    │                          │    │                 │  │
│  │  ┌─────────┐  │    │  ┌─────┐    ┌────────┐  │    │  ┌──────────┐   │  │
│  │  │  Local  │  │    │  │ QA  │    │  UAT1  │  │    │  │ Staging  │   │  │
│  │  │  Mock   │──┼────┼─▶│     │───▶│ Team A │  │    │  │          │   │  │
│  │  └─────────┘  │    │  └─────┘    └────────┘  │    │  └──────────┘   │  │
│  │       │       │    │      │           │      │    │       │        │  │
│  │       ▼       │    │      │           ▼      │    │       ▼        │  │
│  │  ┌─────────┐  │    │      │      ┌────────┐  │    │  ┌──────────┐  │  │
│  │  │   Dev   │──┼────┼──────┘      │  UAT2  │  │    │  │   Live   │  │  │
│  │  │         │  │    │             │ Team B │  │    │  │Production│  │  │
│  │  └─────────┘  │    │             └────────┘  │    │  └──────────┘  │  │
│  │               │    │                  │      │    │                │  │
│  │               │    │                  ▼      │    │                │  │
│  │               │    │             ┌────────┐  │    │                │  │
│  │               │    │             │  UAT3  │  │    │                │  │
│  │               │    │             │External│──┼────┼────────────────┘  │
│  │               │    │             └────────┘  │    │                   │
│  │               │    │                         │    │                   │
│  └───────────────┘    └─────────────────────────┘    └───────────────────┘
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Environment Details

### Local/Mock Environment

| Attribute | Value |
|-----------|-------|
| **Purpose** | Developer local testing with mocked dependencies |
| **URL** | `http://localhost:*` |
| **Cluster** | Docker Desktop / Minikube |
| **Namespace** | `quckapp-mock` |
| **Database** | SQLite / H2 (in-memory) |
| **External Services** | WireMock, LocalStack |
| **Deployment** | Manual (`make dev`) |
| **Approval** | None |
| **Data** | Synthetic test data |

**Configuration:**
```yaml
# config/local.env
ENVIRONMENT=local
LOG_LEVEL=debug
DB_HOST=localhost
DB_NAME=quckapp_local
REDIS_HOST=localhost:6379
KAFKA_BROKERS=localhost:9092
MOCK_EXTERNAL_SERVICES=true
FEATURE_FLAGS_SOURCE=local
```

---

### Dev Environment

| Attribute | Value |
|-----------|-------|
| **Purpose** | Integration testing, feature branch testing |
| **URL** | `https://*.dev.quckapp.dev` |
| **Cluster** | `aks-dev` (Azure Kubernetes Service) |
| **Namespace** | `quckapp` |
| **Database** | MySQL 8.0 (shared dev instance) |
| **External Services** | Sandboxed third-party APIs |
| **Deployment** | Auto on merge to `develop` |
| **Approval** | None |
| **Data** | Anonymized production subset |

**Configuration:**
```yaml
# config/dev.env
ENVIRONMENT=dev
LOG_LEVEL=debug
DB_HOST=mysql-dev.quckapp.internal
DB_NAME=quckapp_dev
DB_POOL_SIZE=10
REDIS_HOST=redis-dev.quckapp.internal:6379
KAFKA_BROKERS=kafka-dev.quckapp.internal:9092
APM_ENABLED=true
APM_SAMPLE_RATE=1.0
FEATURE_FLAGS_SOURCE=launchdarkly-dev
```

**Resources per Service:**
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
replicas: 2
```

---

### QA Environment

| Attribute | Value |
|-----------|-------|
| **Purpose** | QA team testing, regression testing |
| **URL** | `https://*.qa.quckapp.dev` |
| **Cluster** | `aks-qa` |
| **Namespace** | `quckapp-qa` |
| **Database** | MySQL 8.0 (dedicated QA instance) |
| **External Services** | Sandboxed third-party APIs |
| **Deployment** | Manual trigger with QA Lead approval |
| **Approval** | QA Lead (24h timeout) |
| **Data** | QA test dataset + automated test data |

**Configuration:**
```yaml
# config/qa.env
ENVIRONMENT=qa
LOG_LEVEL=info
DB_HOST=mysql-qa.quckapp.internal
DB_NAME=quckapp_qa
DB_POOL_SIZE=20
REDIS_HOST=redis-qa.quckapp.internal:6379
KAFKA_BROKERS=kafka-qa.quckapp.internal:9092
APM_ENABLED=true
APM_SAMPLE_RATE=0.5
SELENIUM_GRID_URL=http://selenium-hub.qa:4444
FEATURE_FLAGS_SOURCE=launchdarkly-qa
```

**Resources per Service:**
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
replicas: 2
```

---

### UAT1 Environment (Team A)

| Attribute | Value |
|-----------|-------|
| **Purpose** | User acceptance testing for internal Team A |
| **URL** | `https://*.uat1.quckapp.dev` |
| **Cluster** | `aks-uat` |
| **Namespace** | `quckapp-uat1` |
| **Database** | MySQL 8.0 (UAT shared instance) |
| **External Services** | Sandbox APIs with rate limiting |
| **Deployment** | Manual trigger with Product Owner approval |
| **Approval** | Product Owner (48h timeout) |
| **Data** | Production-like dataset (anonymized) |

**Configuration:**
```yaml
# config/uat1.env
ENVIRONMENT=uat1
LOG_LEVEL=info
DB_HOST=mysql-uat.quckapp.internal
DB_NAME=quckapp_uat1
DB_POOL_SIZE=20
REDIS_HOST=redis-uat.quckapp.internal:6379
KAFKA_BROKERS=kafka-uat.quckapp.internal:9092
APM_ENABLED=true
APM_SAMPLE_RATE=0.3
FEATURE_FLAGS_SOURCE=launchdarkly-uat
UAT_TEAM=team-a
```

**Resources per Service:**
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
replicas: 2
```

---

### UAT2 Environment (Team B)

| Attribute | Value |
|-----------|-------|
| **Purpose** | User acceptance testing for internal Team B |
| **URL** | `https://*.uat2.quckapp.dev` |
| **Cluster** | `aks-uat` |
| **Namespace** | `quckapp-uat2` |
| **Database** | MySQL 8.0 (UAT shared instance) |
| **External Services** | Sandbox APIs with rate limiting |
| **Deployment** | Manual trigger with Product Owner approval |
| **Approval** | Product Owner (48h timeout) |
| **Data** | Production-like dataset (anonymized) |

**Configuration:**
```yaml
# config/uat2.env
ENVIRONMENT=uat2
LOG_LEVEL=info
DB_HOST=mysql-uat.quckapp.internal
DB_NAME=quckapp_uat2
DB_POOL_SIZE=20
REDIS_HOST=redis-uat.quckapp.internal:6379
KAFKA_BROKERS=kafka-uat.quckapp.internal:9092
APM_ENABLED=true
APM_SAMPLE_RATE=0.3
FEATURE_FLAGS_SOURCE=launchdarkly-uat
UAT_TEAM=team-b
```

**Resources per Service:**
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
replicas: 2
```

---

### UAT3 Environment (External/Security)

| Attribute | Value |
|-----------|-------|
| **Purpose** | External stakeholder testing, security testing |
| **URL** | `https://*.uat3.quckapp.dev` |
| **Cluster** | `aks-uat` |
| **Namespace** | `quckapp-uat3` |
| **Database** | MySQL 8.0 (isolated UAT3 instance) |
| **External Services** | Production-equivalent sandbox |
| **Deployment** | Manual with PO + Security approval |
| **Approval** | Product Owner + Security Team (72h timeout) |
| **Data** | Synthetic data (no PII) |

**Configuration:**
```yaml
# config/uat3.env
ENVIRONMENT=uat3
LOG_LEVEL=info
DB_HOST=mysql-uat3.quckapp.internal
DB_NAME=quckapp_uat3
DB_POOL_SIZE=30
REDIS_HOST=redis-uat3.quckapp.internal:6379
KAFKA_BROKERS=kafka-uat3.quckapp.internal:9092
APM_ENABLED=true
APM_SAMPLE_RATE=0.5
FEATURE_FLAGS_SOURCE=launchdarkly-uat
SECURITY_HEADERS_STRICT=true
WAF_ENABLED=true
PENETRATION_TEST_MODE=true
```

**Resources per Service:**
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
replicas: 3
```

**Security Testing Tools:**
- OWASP ZAP automated scanning
- Burp Suite Pro manual testing
- Nuclei vulnerability scanner
- Custom penetration testing

---

### Staging Environment

| Attribute | Value |
|-----------|-------|
| **Purpose** | Pre-production validation, performance testing |
| **URL** | `https://*.staging.quckapp.dev` |
| **Cluster** | `aks-staging` |
| **Namespace** | `quckapp-staging` |
| **Database** | MySQL 8.0 (production replica - read) |
| **External Services** | Production APIs (limited quota) |
| **Deployment** | Manual with Release Manager approval |
| **Approval** | Release Manager (72h timeout) |
| **Data** | Production data (anonymized PII) |

**Configuration:**
```yaml
# config/staging.env
ENVIRONMENT=staging
LOG_LEVEL=info
DB_HOST=mysql-staging.quckapp.internal
DB_NAME=quckapp_staging
DB_POOL_SIZE=50
DB_READ_REPLICA=mysql-staging-ro.quckapp.internal
REDIS_HOST=redis-staging.quckapp.internal:6379
REDIS_CLUSTER_MODE=true
KAFKA_BROKERS=kafka-staging.quckapp.internal:9092
APM_ENABLED=true
APM_SAMPLE_RATE=0.1
FEATURE_FLAGS_SOURCE=launchdarkly-staging
CDN_ENABLED=true
RATE_LIMITING_ENABLED=true
```

**Resources per Service:**
```yaml
resources:
  requests:
    memory: "1Gi"
    cpu: "1000m"
  limits:
    memory: "2Gi"
    cpu: "2000m"
replicas: 3
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilization: 70
```

**Performance Testing:**
- k6 load testing
- Gatling stress testing
- Locust distributed testing
- Target: 10,000 concurrent users

---

### Live/Production Environment

| Attribute | Value |
|-----------|-------|
| **Purpose** | Production workloads, real users |
| **URL** | `https://*.quckapp.com` |
| **Cluster** | `aks-prod` (multi-region) |
| **Namespace** | `quckapp-prod` |
| **Database** | MySQL 8.0 (HA cluster, multi-AZ) |
| **External Services** | Production APIs (full access) |
| **Deployment** | Manual with CAB + Release Manager approval |
| **Approval** | CAB + Release Manager (1 week timeout) |
| **Data** | Real production data |

**Configuration:**
```yaml
# config/live.env
ENVIRONMENT=production
LOG_LEVEL=warn
DB_HOST=mysql-prod.quckapp.internal
DB_NAME=quckapp_prod
DB_POOL_SIZE=100
DB_READ_REPLICAS=mysql-prod-ro-1.quckapp.internal,mysql-prod-ro-2.quckapp.internal
REDIS_HOST=redis-prod.quckapp.internal:6379
REDIS_CLUSTER_MODE=true
REDIS_SENTINEL_ENABLED=true
KAFKA_BROKERS=kafka-prod-1.quckapp.internal:9092,kafka-prod-2.quckapp.internal:9092,kafka-prod-3.quckapp.internal:9092
APM_ENABLED=true
APM_SAMPLE_RATE=0.01
FEATURE_FLAGS_SOURCE=launchdarkly-prod
CDN_ENABLED=true
CDN_PROVIDER=cloudflare
RATE_LIMITING_ENABLED=true
RATE_LIMIT_REQUESTS_PER_SECOND=100
WAF_ENABLED=true
DDOS_PROTECTION=true
```

**Resources per Service:**
```yaml
resources:
  requests:
    memory: "2Gi"
    cpu: "2000m"
  limits:
    memory: "4Gi"
    cpu: "4000m"
replicas: 5
autoscaling:
  enabled: true
  minReplicas: 5
  maxReplicas: 50
  targetCPUUtilization: 60
  targetMemoryUtilization: 70
```

**High Availability:**
- Multi-AZ deployment
- Cross-region failover (primary: East US, secondary: West US)
- Database replication with automatic failover
- Redis Sentinel for cache HA
- Kafka cluster with 3+ brokers

---

## Environment Comparison Matrix

| Feature | Local | Dev | QA | UAT1 | UAT2 | UAT3 | Staging | Live |
|---------|-------|-----|----|----|----|----|---------|------|
| **Auto Deploy** | No | Yes | No | No | No | No | No | No |
| **Approval Required** | No | No | Yes | Yes | Yes | Yes | Yes | Yes |
| **Real External APIs** | No | Sandbox | Sandbox | Sandbox | Sandbox | Sandbox | Limited | Full |
| **Production Data** | No | Subset | No | Anonymized | Anonymized | Synthetic | Anonymized | Yes |
| **Performance Testing** | No | No | No | No | No | No | Yes | No |
| **Security Scanning** | Basic | Basic | Basic | Basic | Basic | Full | Full | Continuous |
| **Monitoring** | Basic | Full | Full | Full | Full | Full | Full | Full |
| **Alerting** | No | Slack | Slack | Slack | Slack | Slack | PagerDuty | PagerDuty |
| **Backup** | No | Daily | Daily | Daily | Daily | Daily | Hourly | Continuous |
| **DR** | No | No | No | No | No | No | Warm | Hot |

---

## Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Azure Cloud Infrastructure                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         Azure Front Door (CDN + WAF)                        ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                       │                                          │
│         ┌─────────────────────────────┼─────────────────────────────┐           │
│         │                             │                             │           │
│         ▼                             ▼                             ▼           │
│  ┌─────────────┐              ┌─────────────┐              ┌─────────────┐      │
│  │   aks-dev   │              │   aks-uat   │              │  aks-prod   │      │
│  │  (East US)  │              │  (East US)  │              │ (Multi-AZ)  │      │
│  ├─────────────┤              ├─────────────┤              ├─────────────┤      │
│  │ quckapp │              │ quckapp-uat1│              │ quckapp-prod│      │
│  │             │              │ quckapp-uat2│              │             │      │
│  │             │              │ quckapp-uat3│              │             │      │
│  └─────────────┘              └─────────────┘              └─────────────┘      │
│         │                             │                             │           │
│         ▼                             ▼                             ▼           │
│  ┌─────────────┐              ┌─────────────┐              ┌─────────────┐      │
│  │  mysql-dev  │              │  mysql-uat  │              │ mysql-prod  │      │
│  │   (Azure    │              │   (Azure    │              │  (Azure DB  │      │
│  │  Database)  │              │  Database)  │              │   HA/DR)    │      │
│  └─────────────┘              └─────────────┘              └─────────────┘      │
│         │                             │                             │           │
│         ▼                             ▼                             ▼           │
│  ┌─────────────┐              ┌─────────────┐              ┌─────────────┐      │
│  │  redis-dev  │              │  redis-uat  │              │ redis-prod  │      │
│  │   (Azure    │              │   (Azure    │              │  (Cluster   │      │
│  │   Cache)    │              │   Cache)    │              │   Mode)     │      │
│  └─────────────┘              └─────────────┘              └─────────────┘      │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                           Shared Services                                   ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    ││
│  │  │  Azure Key   │  │    Azure     │  │   Azure      │  │    Azure     │    ││
│  │  │    Vault     │  │   Monitor    │  │  Log Ana.    │  │     ACR      │    ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Environment Promotion Process

### Standard Promotion Flow

```
Developer → Local/Mock → Dev → QA → UAT1 → UAT2 → UAT3 → Staging → Live
                │         │     │      │       │       │        │
                │         │     │      │       │       │        │
              Auto     Auto   QA     PO      PO    PO+Sec    RM     CAB
                       merge  Lead
```

### Hotfix Promotion Flow

```
Developer → Local/Mock → Dev → QA → Staging → Live
                │         │     │       │        │
              Auto     Auto   QA      RM      CAB
                       merge  Lead          (expedited)
```

### Rollback Process

1. **Automatic Rollback**: Triggered by health check failures
2. **Manual Rollback**: Initiated by Ops team
3. **Rollback Window**: < 5 minutes
4. **Notification**: Immediate PagerDuty alert
