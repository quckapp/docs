---
sidebar_position: 1
---

# DevOps Overview

QuikApp uses a **hybrid CI/CD approach** combining GitHub Actions for Continuous Integration and Azure DevOps Pipelines for Continuous Deployment across 8 environments.

## Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           QuikApp CI/CD Pipeline                            │
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
│  │              quikapp.azurecr.io/{service}:{tag}                     │   │
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
| auth-service | `quikapp/auth-service` | `spring-boot-ci.yml` | `spring-boot-cd.yml` |
| user-service | `quikapp/user-service` | `spring-boot-ci.yml` | `spring-boot-cd.yml` |
| permission-service | `quikapp/permission-service` | `spring-boot-ci.yml` | `spring-boot-cd.yml` |
| audit-service | `quikapp/audit-service` | `spring-boot-ci.yml` | `spring-boot-cd.yml` |
| admin-service | `quikapp/admin-service` | `spring-boot-ci.yml` | `spring-boot-cd.yml` |

### NestJS Services (3)
| Service | Repository | CI Workflow | CD Pipeline |
|---------|------------|-------------|-------------|
| backend-gateway | `quikapp/backend-gateway` | `nestjs-ci.yml` | `nestjs-cd.yml` |
| realtime-service | `quikapp/realtime-service` | `nestjs-ci.yml` | `nestjs-cd.yml` |
| notification-service | `quikapp/notification-service` | `nestjs-ci.yml` | `nestjs-cd.yml` |

### Elixir Services (7)
| Service | Repository | CI Workflow | CD Pipeline |
|---------|------------|-------------|-------------|
| realtime-service | `quikapp/elixir-realtime` | `elixir-ci.yml` | `elixir-cd.yml` |
| presence-service | `quikapp/presence-service` | `elixir-ci.yml` | `elixir-cd.yml` |
| call-service | `quikapp/call-service` | `elixir-ci.yml` | `elixir-cd.yml` |
| message-service | `quikapp/message-service` | `elixir-ci.yml` | `elixir-cd.yml` |
| notification-orchestrator | `quikapp/notification-orchestrator` | `elixir-ci.yml` | `elixir-cd.yml` |
| huddle-service | `quikapp/huddle-service` | `elixir-ci.yml` | `elixir-cd.yml` |
| event-broadcast-service | `quikapp/event-broadcast-service` | `elixir-ci.yml` | `elixir-cd.yml` |

### Go Services (10)
| Service | Repository | CI Workflow | CD Pipeline |
|---------|------------|-------------|-------------|
| workspace-service | `quikapp/workspace-service` | `go-ci.yml` | `go-cd.yml` |
| channel-service | `quikapp/channel-service` | `go-ci.yml` | `go-cd.yml` |
| search-service | `quikapp/search-service` | `go-ci.yml` | `go-cd.yml` |
| thread-service | `quikapp/thread-service` | `go-ci.yml` | `go-cd.yml` |
| bookmark-service | `quikapp/bookmark-service` | `go-ci.yml` | `go-cd.yml` |
| reminder-service | `quikapp/reminder-service` | `go-ci.yml` | `go-cd.yml` |
| media-service | `quikapp/media-service` | `go-ci.yml` | `go-cd.yml` |
| file-service | `quikapp/file-service` | `go-ci.yml` | `go-cd.yml` |
| attachment-service | `quikapp/attachment-service` | `go-ci.yml` | `go-cd.yml` |
| cdn-service | `quikapp/cdn-service` | `go-ci.yml` | `go-cd.yml` |

### Python Services (8)
| Service | Repository | CI Workflow | CD Pipeline |
|---------|------------|-------------|-------------|
| analytics-service | `quikapp/analytics-service` | `python-ci.yml` | `python-cd.yml` |
| moderation-service | `quikapp/moderation-service` | `python-ci.yml` | `python-cd.yml` |
| export-service | `quikapp/export-service` | `python-ci.yml` | `python-cd.yml` |
| integration-service | `quikapp/integration-service` | `python-ci.yml` | `python-cd.yml` |
| ml-service | `quikapp/ml-service` | `python-ml-ci.yml` | `python-ml-cd.yml` |
| sentiment-service | `quikapp/sentiment-service` | `python-ml-ci.yml` | `python-ml-cd.yml` |
| insights-service | `quikapp/insights-service` | `python-ml-ci.yml` | `python-ml-cd.yml` |
| smart-reply-service | `quikapp/smart-reply-service` | `python-ml-ci.yml` | `python-ml-cd.yml` |

## Documentation Structure

- [GitHub Actions CI](./cicd/github-actions) - CI workflows for all tech stacks
- [Azure DevOps CD](./cicd/azure-devops) - CD pipelines and environment gates
- [Environments](./environments/overview) - Environment configuration details
- [Secrets Management](./cicd/secrets) - Vault, Key Vault, and secrets rotation
- [Monitoring](./cicd/monitoring) - Pipeline monitoring and alerting
