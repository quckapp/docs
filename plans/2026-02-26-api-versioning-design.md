# API Versioning System — Design Document

**Date:** 2026-02-26
**Status:** Approved
**Approach:** Service-Level Version Routing (Approach B)

---

## 1. Overview

Centralized API versioning system managed through the `service-urls` dashboard. All APIs follow `{host}/api/v{version}/{resource}` pattern with semantic versioning support (v1, v2, v1.1). The `service-urls` package acts as the single source of truth for version configuration across all environments.

### Goals

- Unified `/api/v{version}/` URL pattern across all services
- Per-service and per-environment version control
- Gated version promotion tied to actual code readiness
- Build-time config injection (no runtime dependency on service-urls)
- Individual CI/CD per component with GitHub Actions + Azure Pipelines
- Sunset window with deprecation headers for backward compatibility

### Non-Goals

- Runtime service discovery or config polling
- Unified monolithic CI/CD pipeline
- Local environment versioning (local = mock/dev testing only)

---

## 2. Data Model

### 2.1 Existing (unchanged)

```
ServiceUrlConfig
├── id: string
├── environment: Environment
├── serviceKey: string
├── category: ServiceCategory
├── url: string
├── description: string
├── isActive: boolean
├── updatedBy: string
├── createdAt: string
└── updatedAt: string
```

### 2.2 New: VersionConfig

One entry per service per API version per environment. A service can have multiple entries (e.g., v1 active + v2 planned).

```
VersionConfig
├── id: string
├── environment: Environment
├── serviceKey: string
├── apiVersion: string              # "v1", "v2", "v1.1"
├── releaseVersion: string          # "1.2.0" (semver)
├── status: VersionStatus           # planned | ready | active | deprecated | sunset | disabled
├── sunsetDate: string | null       # ISO date — when sunset takes effect
├── sunsetDurationDays: number | null  # per-service override (null = use global default)
├── deprecatedAt: string | null     # ISO date — when deprecation started
├── changelog: string               # description of what changed in this version
├── updatedBy: string
├── createdAt: string
└── updatedAt: string
```

### 2.3 New: GlobalVersionConfig

Per-environment defaults.

```
GlobalVersionConfig
├── id: string
├── environment: Environment
├── defaultApiVersion: string       # "v1" — default for new services
├── defaultSunsetDays: number       # 90 — global sunset window
├── updatedBy: string
└── updatedAt: string
```

### 2.4 New: VersionProfile

Environment-agnostic presets. Define once, apply to any environment.

```
VersionProfile
├── id: string
├── name: string                    # "Q1-2026-release"
├── description: string
├── entries: VersionProfileEntry[]
│   ├── serviceKey: string
│   ├── apiVersion: string
│   └── releaseVersion: string
├── createdBy: string
└── createdAt: string
```

### 2.5 Version Status Enum

```
type VersionStatus = 'planned' | 'ready' | 'active' | 'deprecated' | 'sunset' | 'disabled';
```

---

## 3. Version Lifecycle — Gated Promotion

### 3.1 State Machine

```
PLANNED → READY → ACTIVE → DEPRECATED → SUNSET → DISABLED
```

| State | Meaning | Who triggers | Traffic? |
|-------|---------|-------------|----------|
| `planned` | Version declared in dashboard, no code yet | Admin in dashboard | No |
| `ready` | CI pipeline confirms code is deployed & tests pass | CI/CD callback | No |
| `active` | Serving traffic to clients | Admin in dashboard (auto for dev/qa) | Yes |
| `deprecated` | Still serving, but sends `Deprecation` + `Sunset` headers | Admin in dashboard (auto when newer version activates in prod) | Yes + headers |
| `sunset` | Past sunset date, returns `410 Gone` | Automatic (date-based) | 410 Gone |
| `disabled` | Route removed entirely, returns `404` | Admin in dashboard | 404 |

### 3.2 Promotion Rules

| Action | Precondition |
|--------|-------------|
| Create (→ planned) | Anytime |
| → ready | CI pipeline calls API confirming tests pass for that version |
| → active | Status must be `ready` |
| → deprecated | A newer version must be `active` for that service in that env |
| → sunset | Status is `deprecated` AND `sunsetDate` has passed |
| → disabled | Status is `sunset` (manual cleanup) |

### 3.3 Bulk Operations

- **Bump All**: Creates `planned` entries for all services in an environment. Each must individually reach `ready` → `active`.
- **Apply Profile**: For each service in the profile, if that version is `ready` → auto-activate. If `planned` → skip with warning. Dashboard shows which services activated and which are still pending.
- **Activate All Ready**: One button to activate all services in `ready` state for a given environment.

---

## 4. Architecture

### 4.1 service-urls = Build-Time Config Helper

service-urls is a management plane, not a data plane. Services have zero runtime dependency on it.

```
service-urls dashboard
        │
        │  Export (manual or API call)
        ▼
Azure Key Vault (per environment)
        │
        │  Azure Pipeline reads at deploy time
        ▼
K8s deployment / container env vars
        │
        │  Service reads env vars at startup
        ▼
Service runs standalone
```

### 4.2 Config Export Formats

The dashboard can export per-environment config as:

1. **`.env` file** — downloadable, can be committed to infra repo or uploaded to Key Vault
2. **K8s ConfigMap YAML** — for direct AKS deployment
3. **JSON** — for CI/CD to consume programmatically
4. **Kong config fragment** — version-aware route generation

### 4.3 Env Vars Injected Per Service

```bash
# Service identity
SERVICE_KEY=auth-service
SERVICE_CATEGORY=SPRING

# Version config (from service-urls export)
API_VERSION=v1                    # Current active API version
RELEASE_VERSION=1.2.0             # Current release
SUPPORTED_VERSIONS=v1,v2          # All versions this instance can handle
DEPRECATED_VERSIONS=              # Comma-separated deprecated versions
SUNSET_CONFIG=v1:2026-06-01       # version:sunsetDate pairs

# Service URL (existing)
AUTH_SERVICE_URL=http://auth-service:8081

# Mode
VERSION_MODE=deployed             # "local" for docker-compose, "deployed" for real envs
```

### 4.4 Version Middleware (Shared Package Per Language)

Each service imports a thin middleware that:

1. Reads version env vars at startup
2. Extracts API version from request path (`/api/v2/auth/login` → `v2`)
3. Routes to correct version handler
4. Adds `Deprecation` / `Sunset` headers for deprecated versions
5. Returns `410 Gone` for sunset versions
6. Returns `404` for unknown versions

**One shared package per language stack:**

| Stack | Package | Used by |
|-------|---------|---------|
| Go | `packages/go-version-middleware` | workspace-service, channel-service, go-bff, file-service, etc. |
| Java/Spring | `lib/spring-version-starter` | auth-service, user-service, admin-service, etc. |
| Elixir | `lib/version_plug` | message-service, realtime-service, presence-service, etc. |
| Python | `lib/version_middleware` | ml-service, moderation-service, sentiment-service, etc. |
| NestJS | `packages/nestjs-version-middleware` | backend-gateway, notification-service |

### 4.5 Kong Changes

Current routes are hardcoded to `/api/v1/`. Change to version-aware regex patterns:

```yaml
# Before
routes:
  - paths:
      - /api/v1/auth

# After
routes:
  - paths:
      - "~/api/v\\d+(\\.\\d+)?/auth"    # matches /api/v1/auth, /api/v2/auth, /api/v1.1/auth
```

Kong passes the full path to the service. The version middleware inside the service handles dispatch.

Add new route for public config endpoint:

```yaml
- name: version-config
  url: http://admin-service:8085/api/v1/config
  routes:
    - paths:
        - /api/v1/config
      strip_path: false
```

### 4.6 Client Config Endpoint

A public (authenticated) endpoint served by admin-service:

```
GET /api/v1/config/versions?environment=production
```

Response:

```json
{
  "environment": "production",
  "defaultApiVersion": "v1",
  "services": {
    "auth-service": {
      "activeVersions": ["v1"],
      "deprecatedVersions": [],
      "baseUrl": "https://api.quckapp.io"
    },
    "message-service": {
      "activeVersions": ["v1", "v2"],
      "deprecatedVersions": [],
      "baseUrl": "https://api.quckapp.io"
    }
  }
}
```

Used by:
- `packages/api-client` — extended to fetch config at init
- Mobile app — fetches config on startup, caches locally
- Web app — fetches config on load

### 4.7 api-client Package Extension

Extend the existing OpenAPI-generated `api-client` with a version-aware wrapper:

```typescript
// New: packages/api-client/src/core/VersionedClient.ts
import { OpenAPI } from './OpenAPI';

class VersionedClient {
  private versionConfig: VersionConfigResponse;

  async init(environment: string) {
    // Fetch from /api/v1/config/versions?environment=...
    // Cache the response
  }

  getServiceUrl(serviceKey: string, apiVersion?: string): string {
    // Returns full URL: https://api.quckapp.io/api/v2/messages
    // Uses active version if apiVersion not specified
  }
}
```

---

## 5. service-urls Dashboard — New Pages

### 5.1 Versions Tab (in EnvironmentDetail)

Added as a new section alongside existing Services/Infrastructure/Firebase tabs.

- Table: service | current version | status | release | sunset date | actions
- Actions: Promote (ready→active), Deprecate, View changelog
- Filters: by category, by status
- Bulk actions bar: "Activate All Ready", "Bump All to v{x}"

### 5.2 Version Profiles Page (new route)

- List all profiles
- Create profile: name, description, pick services + versions
- Apply profile to environment (shows readiness check before applying)
- Clone profile

### 5.3 Global Config Page (in EnvironmentDetail)

- Default API version for new services
- Default sunset window (days)
- Per-environment settings

### 5.4 Version History / Audit Log

- Timeline view: who changed what version when
- Links to changelog entries
- Filter by service, environment, date range

---

## 6. CI/CD — Per-Component GitHub Actions + Azure Pipelines

### 6.1 Principle

Every deployable component has its own independent GitHub Actions workflow. No shared monolithic pipeline. Each workflow triggers its own Azure Pipeline for deployment.

### 6.2 Workflow Files

```
.github/workflows/
│
├── services/
│   ├── ci-auth-service.yml
│   ├── ci-admin-service.yml
│   ├── ci-audit-service.yml
│   ├── ci-permission-service.yml
│   ├── ci-security-service.yml
│   ├── ci-user-service.yml
│   ├── ci-backend-gateway.yml
│   ├── ci-notification-service.yml
│   ├── ci-call-service.yml
│   ├── ci-event-broadcast-service.yml
│   ├── ci-huddle-service.yml
│   ├── ci-message-service.yml
│   ├── ci-notification-orchestrator.yml
│   ├── ci-presence-service.yml
│   ├── ci-realtime-service.yml
│   ├── ci-attachment-service.yml
│   ├── ci-bookmark-service.yml
│   ├── ci-cdn-service.yml
│   ├── ci-channel-service.yml
│   ├── ci-file-service.yml
│   ├── ci-go-bff.yml
│   ├── ci-media-service.yml
│   ├── ci-reminder-service.yml
│   ├── ci-search-service.yml
│   ├── ci-thread-service.yml
│   ├── ci-workspace-service.yml
│   ├── ci-analytics-service.yml
│   ├── ci-export-service.yml
│   ├── ci-insights-service.yml
│   ├── ci-integration-service.yml
│   ├── ci-ml-service.yml
│   ├── ci-moderation-service.yml
│   ├── ci-sentiment-service.yml
│   └── ci-smart-reply-service.yml
│
├── packages/
│   ├── ci-api-client.yml
│   ├── ci-service-urls.yml
│   ├── ci-go-auth.yml
│   ├── ci-secure-url.yml
│   └── ci-service-urls-lib.yml
│
├── clients/
│   ├── ci-web.yml
│   ├── ci-mobile-android.yml
│   ├── ci-mobile-ios.yml
│   └── ci-admin-dashboard.yml
│
└── infrastructure/
    ├── ci-kong.yml
    ├── ci-terraform-dev.yml
    ├── ci-terraform-staging.yml
    ├── ci-terraform-prod.yml
    └── ci-docker-base-images.yml
```

### 6.3 Per-Service Workflow Pattern

Each service workflow follows this structure:

```
Trigger: push to services/{service-name}/** OR manual dispatch

Job 1: Build & Test
  → Checkout → Unit tests → Build Docker image
  → Tag: acr.io/{service}:{git-sha}
  → Push to Azure Container Registry

Job 2: Deploy to DEV (automatic)
  → environment: development
  → Trigger Azure Pipeline → inject env vars from Key Vault
  → Smoke tests → if v{new} tests pass → call service-urls API: mark READY
  → Auto-activate version for dev

Job 3: Deploy to QA (automatic, needs: deploy-dev)
  → environment: qa
  → Same as dev + QA regression suite

Job 4: Deploy to UAT (manual gate, needs: deploy-qa)
  → environment: uat1 (GitHub protection rule, 1 approval)
  → Trigger Azure Pipeline → deploy to UAT AKS
  → Version activation: manual in dashboard

Job 5: Deploy to Staging (manual gate, needs: deploy-uat)
  → environment: staging (GitHub protection rule, 1 approval)
  → Full integration test suite

Job 6: Deploy to Production (manual gate, needs: deploy-staging)
  → environment: production (GitHub protection rule, 2 approvals)
  → Blue-green or canary deployment via Azure Pipeline
  → Version activation: manual in dashboard

Job 7: Promote to Live (manual gate, needs: deploy-production)
  → environment: live (GitHub protection rule, release manager)
  → Triggers app store submission / CDN cache invalidation
  → Version activation: manual in dashboard
```

### 6.4 Client Workflows

```
ci-web.yml
  Trigger: push to web/**
  → Build (Vite) with VITE_API_URL + VITE_API_VERSION from service-urls export
  → Deploy: dev → Azure Static Web App
            staging → Azure slot
            prod → Azure CDN
            live → swap slot

ci-mobile-android.yml
  Trigger: push to mobile/** (Android paths)
  → Build APK/AAB with API_URL + API_VERSION injected
  → Deploy: dev → Firebase App Distribution
            staging → Play Console internal track
            prod → Play Console production track
            live → staged rollout

ci-mobile-ios.yml
  Trigger: push to mobile/** (iOS paths)
  → Build IPA with API_URL + API_VERSION injected
  → Deploy: dev → Firebase App Distribution
            staging → TestFlight
            prod → App Store Connect
            live → phased release
```

### 6.5 Infrastructure Workflows

```
ci-kong.yml
  Trigger: push to kong/**
  → Validate kong.yml (deck validate)
  → Deploy: Kong config to each environment's gateway

ci-terraform-{env}.yml
  Trigger: push to infrastructure/terraform/{env}/**
  → terraform plan → manual approve → terraform apply
```

### 6.6 Environment Promotion Rules

| Environment | Deploy trigger | Version activation | Approvals |
|------------|---------------|-------------------|-----------|
| `local` | docker-compose up | N/A (hardcoded env vars) | None |
| `development` | Auto on merge to main | Auto (CI activates) | None |
| `qa` | Auto after dev passes | Auto (CI activates) | None |
| `uat1-3` | Manual GitHub approval | Manual in dashboard | 1 reviewer |
| `staging` | Manual GitHub approval | Manual in dashboard | 1 reviewer |
| `production` | Manual GitHub approval | Manual in dashboard | 2 reviewers |
| `live` | Manual GitHub approval | Manual in dashboard | Release manager |

### 6.7 Config Bridge: service-urls → Azure Key Vault

```
service-urls dashboard
  │
  │  "Export to Key Vault" button (or API call from CI)
  │  POST /admin/service-urls/{env}/export/keyvault
  │
  ▼
Azure Key Vault (one vault per environment)
  ├── dev-kv:    AUTH-SERVICE-URL, AUTH-API-VERSION, ...
  ├── qa-kv:     AUTH-SERVICE-URL, AUTH-API-VERSION, ...
  ├── uat1-kv:   ...
  ├── staging-kv: ...
  ├── prod-kv:   ...
  └── live-kv:   ...
  │
  │  Azure Pipeline reads at deploy time
  │  (az keyvault secret list / K8s CSI driver)
  ▼
Container env vars injected from Key Vault
```

---

## 7. API Endpoints — New

### 7.1 Admin Endpoints (service-urls backend)

```
# Version CRUD
GET    /admin/service-urls/{env}/versions                        # List all versions
GET    /admin/service-urls/{env}/versions/{serviceKey}           # Versions for one service
POST   /admin/service-urls/{env}/versions                        # Create version (→ planned)
PUT    /admin/service-urls/{env}/versions/{serviceKey}/{ver}     # Update version
DELETE /admin/service-urls/{env}/versions/{serviceKey}/{ver}     # Delete version

# Version state transitions
POST   /admin/service-urls/{env}/versions/{serviceKey}/{ver}/ready     # CI callback
POST   /admin/service-urls/{env}/versions/{serviceKey}/{ver}/activate  # → active
POST   /admin/service-urls/{env}/versions/{serviceKey}/{ver}/deprecate # → deprecated
POST   /admin/service-urls/{env}/versions/{serviceKey}/{ver}/disable   # → disabled

# Bulk operations
POST   /admin/service-urls/{env}/versions/bulk-plan              # Plan version for all services
POST   /admin/service-urls/{env}/versions/bulk-activate          # Activate all READY services
POST   /admin/service-urls/{env}/versions/bulk-deprecate         # Deprecate old version for all

# Profiles
GET    /admin/service-urls/profiles                              # List profiles
POST   /admin/service-urls/profiles                              # Create profile
GET    /admin/service-urls/profiles/{id}                         # Get profile
PUT    /admin/service-urls/profiles/{id}                         # Update profile
DELETE /admin/service-urls/profiles/{id}                         # Delete profile
POST   /admin/service-urls/profiles/{id}/apply/{env}            # Apply profile to environment

# Global config
GET    /admin/service-urls/{env}/global-config                   # Get global config
PUT    /admin/service-urls/{env}/global-config                   # Update global config

# Export
POST   /admin/service-urls/{env}/export/keyvault                # Push to Azure Key Vault
GET    /admin/service-urls/{env}/export/env-file                 # Download .env file
GET    /admin/service-urls/{env}/export/configmap                # Download K8s ConfigMap
GET    /admin/service-urls/{env}/export/kong                     # Download Kong routes fragment
```

### 7.2 Public Endpoint (for clients)

```
GET    /api/v1/config/versions?environment={env}                # Version map for clients
```

---

## 8. Local Environment

Local uses `docker-compose.yml` with no versioning infrastructure:

```yaml
auth-service:
  environment:
    API_VERSION: v1
    RELEASE_VERSION: 0.0.0-local
    VERSION_MODE: local
    SUPPORTED_VERSIONS: v1
```

`VERSION_MODE=local` tells the version middleware to skip all version logic and serve everything under the single `API_VERSION` value. No connection to service-urls API, no Key Vault, no gates.

---

## 9. Component Summary

| Component | What changes |
|-----------|-------------|
| `packages/service-urls` (dashboard) | Add Versions tab, Profiles page, Global Config page, Export to Key Vault, Version History |
| `services/admin-service` (backend) | Add version CRUD endpoints, config public endpoint, profile management, Key Vault export |
| `kong/kong.yml` | Regex version routes `/api/v{ver}/`, add `/api/v1/config` route |
| `packages/api-client` | Add `VersionedClient` wrapper, fetch config endpoint |
| `packages/go-version-middleware` | New — shared Go version middleware |
| `lib/spring-version-starter` | New — shared Spring Boot version auto-config |
| `lib/version_plug` | New — shared Elixir Plug for version routing |
| `lib/version_middleware` | New — shared Python ASGI/WSGI middleware |
| `packages/nestjs-version-middleware` | New — shared NestJS middleware |
| `docker-compose.yml` | Add VERSION_MODE=local + version env vars |
| `.github/workflows/` | 50+ individual workflow files (services, packages, clients, infra) |
| `mobile/` | Consume versioned config from api-client |
| `web/` | Consume versioned config from api-client |

---

## 10. Migration Strategy

1. **Phase 1**: Add version data model + dashboard UI. No service changes yet. All services default to v1 active.
2. **Phase 2**: Add version middleware packages (Go, Spring, Elixir, Python, NestJS). Services adopt middleware but only serve v1.
3. **Phase 3**: Update Kong routes to regex version patterns. Backward compatible — `/api/v1/` still matches.
4. **Phase 4**: Extend api-client with VersionedClient. Mobile and web adopt it.
5. **Phase 5**: Set up per-component GitHub Actions + Azure Pipelines. One service at a time.
6. **Phase 6**: First v2 rollout on a low-risk service (e.g., bookmark-service) to validate the full flow.
