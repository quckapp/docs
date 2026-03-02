# ECS Fargate + EC2 GPU Infrastructure Design

## Context

The `infrastructure/ecs/` directory has a single `backend-task-definition.json` — a generic NestJS template with hardcoded port 3000, 512 CPU / 1024 MB memory. It lacks per-stack templates, service discovery, auto-scaling, environment overrides, and GPU support. This design expands ECS into a full deployment target for all 31 microservices alongside the existing Kubernetes setup.

## Existing State

- **ECS** (`ecs/`): Single generic task definition for NestJS backend
- **Dockerfiles** (`docker/dockerfiles/`): Multi-stage builds for all 5 stacks (Spring Boot, Go, Elixir, Python, NestJS)
- **Kubernetes** (`helm/`, `k8s/`): Complete with 31 services, 8+ environments, HPA, PDB, network policies
- **Kong** (`kong/`): 34 services, 36 routes — defines the API path routing
- **Envoy** (`envoy/`): Service mesh with per-stack sidecars, mTLS, resilience
- **Terraform** (`terraform/`): 17 modules but no ECS module yet

## Decisions

- **Hybrid launch type**: Fargate for 28 services (serverless), EC2 with GPU for 3 ML services (ml, sentiment, moderation)
- **Per-stack templates**: 6 task definitions (spring-boot, go, elixir, python, python-gpu, nestjs) matching existing Dockerfile/sidecar patterns
- **Dual discovery**: AWS Cloud Map for internal service-to-service DNS (`*.quckapp.local`), ALB for external traffic
- **Environment overrides**: 4 environment configs (dev, staging, production, live) controlling resources, replicas, and capacity providers
- **Spot for cost savings**: FARGATE_SPOT for 20 stateless services, FARGATE for 8 critical services, EC2 for 3 GPU services

## Cluster Architecture

```
                    Internet
                       |
                  +----v----+
                  |   ALB   |  (external traffic)
                  +----+----+
                       |
          +------------+------------+
          |            |            |
    +-----v-----+ +---v---+ +-----v-----+
    | Fargate   | |Fargate| | EC2 GPU   |
    | (8 crit)  | | Spot  | | (3 ML)    |
    |           | |(20svc)| |           |
    +-----+-----+ +---+---+ +-----+-----+
          |            |            |
          +------------+------------+
                       |
              Cloud Map DNS
          (*.quckapp.local)
```

## Capacity Providers

| Provider | Use Case | Services | Count |
|----------|----------|----------|-------|
| `FARGATE` | Critical, stateful services | auth, gateway, user, permission, admin, security, audit, workspace | 8 |
| `FARGATE_SPOT` | Stateless, fault-tolerant | channel, thread, search, file, media, bookmark, reminder, attachment, cdn, presence, call, message, notification-orchestrator, huddle, event-broadcast, notification, integration, export, analytics, smart-reply | 20 |
| `EC2_GPU` | ML inference requiring GPU | ml-service, sentiment-service, moderation-service | 3 |

## Resource Tiers

| Tier | CPU | Memory | Services |
|------|-----|--------|----------|
| Critical | 1024 (1 vCPU) | 2048 MB | auth, gateway, user, permission |
| Standard | 512 (0.5 vCPU) | 1024 MB | 20 general services |
| Heavy I/O | 1024 (1 vCPU) | 4096 MB | file, media, attachment, cdn, export |
| ML/GPU | 4096 (4 vCPU) | 8192 MB | ml, sentiment, moderation |
| Batch | 512 (0.5 vCPU) | 2048 MB | spark-etl, analytics |

## Task Definition Templates

| Stack | Template | Health Check | Runtime Flags | Port Range | Count |
|-------|----------|-------------|---------------|------------|-------|
| Spring Boot | `spring-boot.json` | `/actuator/health` | JVM container opts, G1GC, 75% RAM | 8081-8086 | 6 |
| Go | `go.json` | `/healthz` | `GOMAXPROCS` auto, static binary | 5001-5019 | 11 |
| Elixir | `elixir.json` | `/health` | BEAM schedulers, 3600s idle (WS) | 4001-4006 | 6 |
| Python | `python.json` | `/health` | Gunicorn workers = 2*CPU+1 | 5007-5020 | 6 |
| Python GPU | `python-gpu.json` | `/health` | CUDA toolkit, GPU memory fraction | 5008, 5014, 5017 | 3 |
| NestJS | `nestjs.json` | `/health` | Node `--max-old-space-size` | 3000-3001 | 2 |

Each template includes:
- Main app container with port, env vars, secrets, health check, log config
- Optional Envoy sidecar container (for mTLS when mesh is active)
- CloudWatch log group `/ecs/quckapp/{service-name}`
- Secrets from AWS Secrets Manager / SSM Parameter Store

## Service Discovery

### Cloud Map (internal)

| Setting | Value |
|---------|-------|
| Namespace | `quckapp.local` (private DNS, VPC-scoped) |
| Service naming | `{service-name}.quckapp.local` |
| Health check | ECS task health (auto-deregister on failure) |
| DNS record type | A (Fargate awsvpc mode) |
| TTL | 10 seconds |

### ALB (external)

| Setting | Value |
|---------|-------|
| Scheme | Internet-facing |
| Listeners | 80 (redirect to 443), 443 (TLS) |
| Routing | Path-based, matching Kong route paths |
| Health check | Stack-specific path, 30s interval |
| Stickiness | Disabled (stateless services) |

ALB target groups map 1:1 with Kong routes:

| Path Pattern | Target Service | Port |
|-------------|---------------|------|
| `/api/v1/auth/*` | auth-service | 8081 |
| `/api/v1/users/*` | user-service | 8082 |
| `/api/v1/permissions/*` | permission-service | 8083 |
| `/api/v1/audit/*` | audit-service | 8084 |
| `/api/v1/admin/*` | admin-service | 8085 |
| `/api/v1/security/*` | security-service | 8086 |
| `/api/v1/media/*` | media-service | 5001 |
| `/api/v1/files/*` | file-service | 5002 |
| `/api/v1/bff/*` | go-bff | 5003 |
| `/api/v1/workspaces/*` | workspace-service | 5004 |
| `/api/v1/channels/*` | channel-service | 5005 |
| `/api/v1/search/*` | search-service | 5006 |
| `/api/v1/analytics/*` | analytics-service | 5007 |
| `/api/v1/ml/*` | ml-service | 5008 |
| `/api/v1/threads/*` | thread-service | 5009 |
| `/api/v1/bookmarks/*` | bookmark-service | 5010 |
| `/api/v1/reminders/*` | reminder-service | 5011 |
| `/api/v1/attachments/*` | attachment-service | 5012 |
| `/api/v1/cdn/*` | cdn-service | 5013 |
| `/api/v1/moderation/*` | moderation-service | 5014 |
| `/api/v1/export/*` | export-service | 5015 |
| `/api/v1/integrations/*` | integration-service | 5016 |
| `/api/v1/sentiment/*` | sentiment-service | 5017 |
| `/api/v1/insights/*` | insights-service | 5018 |
| `/api/v1/smart-reply/*` | smart-reply-service | 5019 |
| `/api/v1/etl/*` | spark-etl | 5020 |
| `/api/v1/presence/*` | presence-service | 4001 |
| `/api/v1/calls/*` | call-service | 4002 |
| `/api/v1/messages/*` | message-service | 4003 |
| `/api/v1/notification-orchestrator/*` | notification-orchestrator | 4004 |
| `/api/v1/huddles/*` | huddle-service | 4005 |
| `/api/v1/events/*` | event-broadcast-service | 4006 |
| `/api/v1/gateway/*` | backend-gateway | 3000 |
| `/api/v1/notifications/*` | notification-service | 3001 |

## Security Groups

| Group | Inbound | Outbound |
|-------|---------|----------|
| `quckapp-alb-sg` | 80, 443 from `0.0.0.0/0` | All traffic to `quckapp-fargate-sg` |
| `quckapp-fargate-sg` | Service port from `quckapp-alb-sg`, all from self (mesh traffic) | All |
| `quckapp-ec2-gpu-sg` | Service port from `quckapp-fargate-sg` | All |

## Auto-Scaling

### Target Tracking Policies

| Tier | CPU Target | Memory Target | Min Tasks | Max Tasks |
|------|-----------|---------------|-----------|-----------|
| Critical | 60% | 70% | 2 | 10 |
| Standard | 70% | 75% | 1 | 6 |
| Heavy I/O | 65% | 70% | 1 | 8 |
| ML/GPU | 70% | 80% | 1 | 4 |
| Batch | 80% | 85% | 0 | 3 |

### Scheduled Scaling

| Service | Schedule | Action |
|---------|----------|--------|
| spark-etl | Weekdays 02:00-06:00 UTC | Scale to 2, then back to 0 |
| export-service | Daily 00:00-04:00 UTC | Scale to 3, then back to 1 |

## Environment Overrides

| Setting | Dev | Staging | Production | Live |
|---------|-----|---------|------------|------|
| CPU multiplier | 0.5x | 1x | 1x | 1.5x |
| Memory multiplier | 0.5x | 1x | 1x | 1.5x |
| Min replicas | 1 (all) | 1 | 2 (critical) | 3 (critical) |
| Capacity provider | FARGATE only | FARGATE_SPOT | Mixed | FARGATE only |
| Container Insights | Basic | Enhanced | Enhanced | Enhanced |
| Execute command | Enabled | Enabled | Disabled | Disabled |
| Log retention | 7 days | 14 days | 30 days | 90 days |

## Directory Structure

```
ecs/
├── task-definitions/
│   ├── spring-boot.json           # 6 Spring Boot services (auth-security)
│   ├── go.json                    # 11 Go services (media-smart-reply)
│   ├── elixir.json                # 6 Elixir services (presence-event-broadcast)
│   ├── python.json                # 6 Python services (analytics-insights, Fargate)
│   ├── python-gpu.json            # 3 ML services (ml, sentiment, moderation, EC2 GPU)
│   └── nestjs.json                # 2 NestJS services (gateway, notification)
├── services/
│   ├── spring-boot-services.json  # ECS service configs (replicas, LB, scaling)
│   ├── go-services.json
│   ├── elixir-services.json
│   ├── python-services.json
│   └── nestjs-services.json
├── cluster/
│   ├── cluster-config.json        # ECS cluster + Container Insights
│   ├── capacity-providers.json    # FARGATE + FARGATE_SPOT + EC2_GPU ASG
│   └── namespaces.json            # Cloud Map namespace (quckapp.local)
├── networking/
│   ├── alb-config.json            # ALB target groups + 34 listener rules
│   ├── security-groups.json       # 3 security groups (ALB, Fargate, EC2-GPU)
│   └── service-discovery.json     # Cloud Map service entries for all 31 services
├── autoscaling/
│   ├── scaling-policies.json      # Target tracking per tier
│   └── scheduled-scaling.json     # Time-based for batch workloads
├── environments/
│   ├── dev.json
│   ├── staging.json
│   ├── production.json
│   └── live.json
└── scripts/
    ├── deploy-service.sh          # Deploy/update a single service
    └── validate-configs.sh        # Validate all JSON configs
```

## File Count

~25 new files across 7 subdirectories, replacing the existing single `backend-task-definition.json`.
