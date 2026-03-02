# Kong API Gateway Design

## Context

The `infrastructure/kong/` directory is empty despite Envoy routing all REST traffic to Kong on port 8000. Kong is the API gateway for all 33 microservices' REST endpoints. This design fills that gap with DB-less declarative configuration matching the project's GitOps workflow.

## Existing State

- **Envoy** (`infrastructure/envoy/envoy.yaml`): Routes WebSocket traffic to Elixir services, everything else to `kong:8000`
- **Nginx** (`infrastructure/nginx/`): Parallel reverse proxy with upstreams for all 33 services
- **Kong directory**: Empty — no routes, no plugins, no server config
- **Service ports**: Defined in `nginx/conf.d/upstreams.conf` (NestJS 3000-3001, Spring 8081-8086, Elixir 4001-4006, Go 5001-5019, Python 5007-5019)

## Decisions

- **DB-less mode**: `database = off`, all config in versioned YAML files — no PostgreSQL dependency
- **Declarative config**: Single `kong.yml` assembled from modular route/plugin files via merge script
- **Route organization**: Separate YAML per tech stack (spring-boot, nestjs, go, python, elixir-rest)
- **Plugin strategy**: Global plugins (rate-limiting, CORS, Prometheus, bot-detection) + per-route plugins (JWT, key-auth, IP restriction, ACL)
- **Environment overrides**: Per-environment YAML files for rate limits, debug logging, SSL, IP restrictions

## Directory Structure

```
kong/
├── kong.yml                    # Main declarative config (assembled from parts)
├── kong.conf                   # Kong server settings (DB-less, ports, logging)
├── plugins/
│   ├── global-plugins.yml      # Rate limiting, CORS, logging, bot detection, Prometheus
│   ├── auth-plugins.yml        # JWT + key-auth plugin configs
│   └── traffic-plugins.yml     # Request/response transform, IP restriction, ACL
├── routes/
│   ├── spring-boot.yml         # auth, user, permission, audit, admin, security (6 services)
│   ├── nestjs.yml              # backend-gateway, notification (2 services)
│   ├── go.yml                  # workspace, channel, search, file, media, cdn, thread, bookmark, reminder, attachment (10 services)
│   ├── python.yml              # analytics, ml, moderation, export, integration, sentiment, insights, smart-reply (8 services)
│   └── elixir-rest.yml         # message, presence, call, huddle, notification-orchestrator, event-broadcast REST endpoints (6 services, WS in Envoy)
├── environments/
│   ├── dev.yml                 # Relaxed rate limits, debug logging, no SSL
│   ├── qa.yml
│   ├── staging.yml
│   ├── production.yml          # Strict rate limits, no debug, SSL + IP restrictions
│   └── live.yml
└── scripts/
    ├── validate-config.sh      # Validate kong.yml syntax before deploy
    └── generate-config.sh      # Merge routes + plugins + env overrides into final kong.yml
```

## Route Mapping

### Spring Boot Services (6)

| Service | Port | Route Prefix |
|---------|------|-------------|
| auth-service | 8081 | `/api/v1/auth` |
| user-service | 8082 | `/api/v1/users` |
| permission-service | 8083 | `/api/v1/permissions` |
| audit-service | 8084 | `/api/v1/audit` |
| admin-service | 8085 | `/api/v1/admin` |
| security-service | 8086 | `/api/v1/security` |

### NestJS Services (2)

| Service | Port | Route Prefix |
|---------|------|-------------|
| backend-gateway | 3000 | `/api/v1/gateway` |
| notification-service | 3001 | `/api/v1/notifications` |

### Go Services (10)

| Service | Port | Route Prefix |
|---------|------|-------------|
| media-service | 5001 | `/api/v1/media` |
| file-service | 5002 | `/api/v1/files` |
| workspace-service | 5004 | `/api/v1/workspaces` |
| channel-service | 5005 | `/api/v1/channels` |
| search-service | 5006 | `/api/v1/search` |
| thread-service | 5009 | `/api/v1/threads` |
| bookmark-service | 5010 | `/api/v1/bookmarks` |
| reminder-service | 5011 | `/api/v1/reminders` |
| attachment-service | 5012 | `/api/v1/attachments` |
| cdn-service | 5013 | `/api/v1/cdn` |

### Python Services (8)

| Service | Port | Route Prefix |
|---------|------|-------------|
| analytics-service | 5007 | `/api/v1/analytics` |
| ml-service | 5008 | `/api/v1/ml` |
| moderation-service | 5014 | `/api/v1/moderation` |
| export-service | 5015 | `/api/v1/export` |
| integration-service | 5016 | `/api/v1/integrations` |
| sentiment-service | 5017 | `/api/v1/sentiment` |
| insights-service | 5018 | `/api/v1/insights` |
| smart-reply-service | 5019 | `/api/v1/smart-reply` |

### Elixir Services — REST Only (6)

| Service | Port | Route Prefix | Note |
|---------|------|-------------|------|
| message-service | 4003 | `/api/v1/messages` | WS via Envoy |
| presence-service | 4001 | `/api/v1/presence` | WS via Envoy |
| call-service | 4002 | `/api/v1/calls` | WS via Envoy |
| huddle-service | 4005 | `/api/v1/huddles` | WS via Envoy |
| notification-orchestrator | 4004 | `/api/v1/notification-orchestrator` | REST only |
| event-broadcast-service | 4006 | `/api/v1/events` | REST only |

### Special Routes

| Service | Port | Route Prefix | Auth |
|---------|------|-------------|------|
| go-bff | 5003 | `/api/v1/bff` | JWT |
| spark-etl | 5020 | `/api/v1/etl` | key-auth (internal) |

## Plugin Strategy

### Global Plugins

| Plugin | Config |
|--------|--------|
| `rate-limiting` | 1000 req/min per consumer (default), policy: local |
| `cors` | Allow `*.quckapp.com`, methods: GET/POST/PUT/DELETE/PATCH/OPTIONS |
| `prometheus` | Expose on `:8100/metrics`, per-consumer metrics |
| `bot-detection` | Block known bad user agents |
| `request-transformer` | Add `X-Request-ID` header if missing |

### Per-Route Plugins

| Plugin | Applied To | Config |
|--------|-----------|--------|
| `jwt` | All authenticated routes | Validate RS256 tokens from auth-service |
| `key-auth` | Service-to-service routes | API key in `X-API-Key` header |
| `ip-restriction` | Admin endpoints (`/api/v1/admin/*`) | Allow internal CIDRs only |
| `acl` | Role-restricted routes | Groups: `admin`, `workspace-owner`, `member` |
| `response-ratelimiting` | ML/analytics services | Tiered limits by consumer group |

### Public Routes (No Auth)

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/health`
- `GET /health` (Kong health check)

## Environment Overrides

| Setting | Dev | QA | Staging | Production | Live |
|---------|-----|-----|---------|------------|------|
| Rate limit (req/min) | 10000 | 5000 | 2000 | 1000 | 1000 |
| Debug logging | Yes | Yes | No | No | No |
| Bot detection | Off | On | On | On | On |
| IP restriction (admin) | Off | Off | On | On | On |
| SSL termination | Off | Off | On | On | On |
| Prometheus metrics | On | On | On | On | On |

## File Count

~18 new files in `infrastructure/kong/`.
