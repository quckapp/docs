---
sidebar_position: 1
---

# DevOps Overview

QuckApp uses a **hybrid CI/CD approach** combining GitHub Actions for Continuous Integration and Azure DevOps Pipelines for Continuous Deployment across 8 environments.

## Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           QuckApp CI/CD Pipeline                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    GitHub Actions (CI)                               │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐  │   │
│  │  │  Build  │→ │  Test   │→ │  Lint   │→ │  SAST   │→ │ Publish  │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └──────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │               Azure Container Registry (ACR)                         │   │
│  │              quckapp.azurecr.io/{service}:{tag}                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                  Azure DevOps Pipelines (CD)                         │   │
│  │                                                                       │   │
│  │  ┌───────┐  ┌─────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌───────┐  ┌────┐│   │
│  │  │ Local │→ │ Dev │→ │  QA  │→ │ UAT1 │→ │ UAT2 │→ │ UAT3  │→ │Stg ││   │
│  │  │ Mock  │  │     │  │      │  │      │  │      │  │       │  │    ││   │
│  │  └───────┘  └─────┘  └──────┘  └──────┘  └──────┘  └───────┘  └────┘│   │
│  │                                                                 │    │   │
│  │                                                                 ▼    │   │
│  │                                                            ┌────────┐│   │
│  │                                                            │  Live  ││   │
│  │                                                            └────────┘│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Why Hybrid?

| Aspect | GitHub Actions | Azure DevOps |
|--------|---------------|--------------|
| **Best For** | CI, rapid feedback | CD, enterprise governance |
| **Integration** | Native GitHub integration | Azure ecosystem, ITSM |
| **Marketplace** | 15,000+ community actions | Enterprise-grade extensions |
| **Approvals** | Basic environment protection | Multi-stage gates, ServiceNow |
| **Audit** | Basic logs | Full compliance audit trail |
| **Cost** | Free for public repos | Enterprise licensing |

## Environments

| Environment | Purpose | Deployment | Approval |
|-------------|---------|------------|----------|
| **Local/Mock** | Developer testing | Manual | None |
| **Dev** | Integration testing | Auto on merge | None |
| **QA** | Quality assurance | Auto | QA Lead |
| **UAT1** | User acceptance (Team A) | Manual | Product Owner |
| **UAT2** | User acceptance (Team B) | Manual | Product Owner |
| **UAT3** | User acceptance (External) | Manual | Product Owner + Security |
| **Staging** | Pre-production | Manual | Release Manager |
| **Live** | Production | Manual | CAB + Release Manager |

## Services by Technology

### Spring Boot Services (5)
| Service | Repository | CI Workflow | CD Pipeline |
|---------|------------|-------------|-------------|
| auth-service | `quckapp/auth-service` | `spring-boot-ci.yml` | `spring-boot-cd.yml` |
| user-service | `quckapp/user-service` | `spring-boot-ci.yml` | `spring-boot-cd.yml` |
| permission-service | `quckapp/permission-service` | `spring-boot-ci.yml` | `spring-boot-cd.yml` |
| audit-service | `quckapp/audit-service` | `spring-boot-ci.yml` | `spring-boot-cd.yml` |
| admin-service | `quckapp/admin-service` | `spring-boot-ci.yml` | `spring-boot-cd.yml` |

### NestJS Services (3)
| Service | Repository | CI Workflow | CD Pipeline |
|---------|------------|-------------|-------------|
| backend-gateway | `quckapp/backend-gateway` | `nestjs-ci.yml` | `nestjs-cd.yml` |
| realtime-service | `quckapp/realtime-service` | `nestjs-ci.yml` | `nestjs-cd.yml` |
| notification-service | `quckapp/notification-service` | `nestjs-ci.yml` | `nestjs-cd.yml` |

### Elixir Services (7)
| Service | Repository | CI Workflow | CD Pipeline |
|---------|------------|-------------|-------------|
| realtime-service | `quckapp/elixir-realtime` | `elixir-ci.yml` | `elixir-cd.yml` |
| presence-service | `quckapp/presence-service` | `elixir-ci.yml` | `elixir-cd.yml` |
| call-service | `quckapp/call-service` | `elixir-ci.yml` | `elixir-cd.yml` |
| message-service | `quckapp/message-service` | `elixir-ci.yml` | `elixir-cd.yml` |
| notification-orchestrator | `quckapp/notification-orchestrator` | `elixir-ci.yml` | `elixir-cd.yml` |
| huddle-service | `quckapp/huddle-service` | `elixir-ci.yml` | `elixir-cd.yml` |
| event-broadcast-service | `quckapp/event-broadcast-service` | `elixir-ci.yml` | `elixir-cd.yml` |

### Go Services (10)
| Service | Repository | CI Workflow | CD Pipeline |
|---------|------------|-------------|-------------|
| workspace-service | `quckapp/workspace-service` | `go-ci.yml` | `go-cd.yml` |
| channel-service | `quckapp/channel-service` | `go-ci.yml` | `go-cd.yml` |
| search-service | `quckapp/search-service` | `go-ci.yml` | `go-cd.yml` |
| thread-service | `quckapp/thread-service` | `go-ci.yml` | `go-cd.yml` |
| bookmark-service | `quckapp/bookmark-service` | `go-ci.yml` | `go-cd.yml` |
| reminder-service | `quckapp/reminder-service` | `go-ci.yml` | `go-cd.yml` |
| media-service | `quckapp/media-service` | `go-ci.yml` | `go-cd.yml` |
| file-service | `quckapp/file-service` | `go-ci.yml` | `go-cd.yml` |
| attachment-service | `quckapp/attachment-service` | `go-ci.yml` | `go-cd.yml` |
| cdn-service | `quckapp/cdn-service` | `go-ci.yml` | `go-cd.yml` |

### Python Services (8)
| Service | Repository | CI Workflow | CD Pipeline |
|---------|------------|-------------|-------------|
| analytics-service | `quckapp/analytics-service` | `python-ci.yml` | `python-cd.yml` |
| moderation-service | `quckapp/moderation-service` | `python-ci.yml` | `python-cd.yml` |
| export-service | `quckapp/export-service` | `python-ci.yml` | `python-cd.yml` |
| integration-service | `quckapp/integration-service` | `python-ci.yml` | `python-cd.yml` |
| ml-service | `quckapp/ml-service` | `python-ml-ci.yml` | `python-ml-cd.yml` |
| sentiment-service | `quckapp/sentiment-service` | `python-ml-ci.yml` | `python-ml-cd.yml` |
| insights-service | `quckapp/insights-service` | `python-ml-ci.yml` | `python-ml-cd.yml` |
| smart-reply-service | `quckapp/smart-reply-service` | `python-ml-ci.yml` | `python-ml-cd.yml` |

## Documentation Structure

- [GitHub Actions CI](./cicd/github-actions) - CI workflows for all tech stacks
- [Azure DevOps CD](./cicd/azure-devops) - CD pipelines and environment gates
- [Environments](./environments/overview) - Environment configuration details
- [Secrets Management](./cicd/secrets) - Vault, Key Vault, and secrets rotation
- [Monitoring](./cicd/monitoring) - Pipeline monitoring and alerting
