# Kong API Gateway Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fill the empty `infrastructure/kong/` directory with DB-less declarative Kong configuration routing all 33+ microservices with JWT auth, rate limiting, CORS, and per-environment overrides.

**Architecture:** Kong runs in DB-less mode with a single `kong.yml` declarative config assembled from modular route and plugin YAML files. Envoy sits in front and sends all non-WebSocket traffic to Kong on port 8000. A shell script merges per-stack route files + plugin configs + environment overrides into the final `kong.yml`.

**Tech Stack:** Kong Gateway (OSS), YAML declarative config, Bash scripts

---

### Task 1: Kong Server Config

Create the Kong server configuration file for DB-less mode.

**Files:**
- Create: `infrastructure/kong/kong.conf`

**Step 1: Create `kong.conf`**

```properties
# =============================================================================
# QuckApp Kong Gateway — Server Configuration
# =============================================================================
# DB-less mode: all routing defined in kong.yml declarative config.
# Kong sits behind Envoy, which routes WebSocket traffic directly to
# Elixir services and forwards all REST traffic here on port 8000.
# =============================================================================

# --- Database ---
database = off
declarative_config = /kong/kong.yml

# --- Proxy Listeners ---
# Port 8000: HTTP proxy (receives traffic from Envoy)
# Port 8443: HTTPS proxy (direct TLS termination in staging/prod)
proxy_listen = 0.0.0.0:8000 reuseport backlog=16384, 0.0.0.0:8443 http2 ssl reuseport backlog=16384
proxy_access_log = /dev/stdout
proxy_error_log = /dev/stderr

# --- Admin API ---
# Internal only — never expose externally
admin_listen = 127.0.0.1:8001
admin_access_log = /dev/stdout
admin_error_log = /dev/stderr

# --- Status API ---
# Health checks + Prometheus metrics endpoint
status_listen = 0.0.0.0:8100

# --- Performance ---
nginx_worker_processes = auto
upstream_keepalive_pool_size = 64
upstream_keepalive_max_requests = 1000
upstream_keepalive_idle_timeout = 60

# --- Plugins ---
plugins = bundled

# --- Logging ---
log_level = notice
```

**Step 2: Verify the file exists and is valid properties format**

```bash
cd D:/Learning/QuckApp/infrastructure
cat kong/kong.conf | head -5
# Should show the header comment
```

**Step 3: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add kong/kong.conf
git commit -m "feat(kong): add server config (DB-less mode, ports, logging)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Spring Boot Route Definitions

Create Kong service and route definitions for the 6 Spring Boot microservices.

**Files:**
- Create: `infrastructure/kong/routes/spring-boot.yml`

**Context:** Spring Boot services handle auth, users, permissions, audit, admin, and security. Auth endpoints (`/login`, `/register`, `/refresh`) are public (no JWT). Admin endpoints get IP restriction in production. All other routes require JWT.

**Step 1: Create `routes/spring-boot.yml`**

```yaml
# =============================================================================
# Spring Boot Services — Kong Route Definitions
# =============================================================================
# 6 services: auth, user, permission, audit, admin, security
# Auth has public routes (login/register/refresh) + protected routes
# Admin routes get IP restriction plugin in staging/production
# =============================================================================

_format_version: "3.0"

services:
  # --- Auth Service (8081) ---
  - name: auth-service
    url: http://auth-service:8081
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: auth-public
        paths:
          - /api/v1/auth/login
          - /api/v1/auth/register
          - /api/v1/auth/refresh
          - /api/v1/auth/forgot-password
          - /api/v1/auth/reset-password
        methods:
          - POST
        strip_path: false
      - name: auth-health
        paths:
          - /api/v1/auth/health
        methods:
          - GET
        strip_path: false
      - name: auth-protected
        paths:
          - /api/v1/auth
        methods:
          - GET
          - POST
          - PUT
          - DELETE
          - PATCH
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- User Service (8082) ---
  - name: user-service
    url: http://user-service:8082
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: user-routes
        paths:
          - /api/v1/users
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Permission Service (8083) ---
  - name: permission-service
    url: http://permission-service:8083
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: permission-routes
        paths:
          - /api/v1/permissions
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Audit Service (8084) ---
  - name: audit-service
    url: http://audit-service:8084
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: audit-routes
        paths:
          - /api/v1/audit
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Admin Service (8085) ---
  - name: admin-service
    url: http://admin-service:8085
    connect_timeout: 5000
    write_timeout: 30000
    read_timeout: 30000
    retries: 1
    routes:
      - name: admin-routes
        paths:
          - /api/v1/admin
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp
          - name: acl
            config:
              allow:
                - admin
          - name: ip-restriction
            config:
              allow:
                - 10.0.0.0/8
                - 172.16.0.0/12
                - 192.168.0.0/16

  # --- Security Service (8086) ---
  - name: security-service
    url: http://security-service:8086
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: security-routes
        paths:
          - /api/v1/security
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp
```

**Step 2: Validate YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('kong/routes/spring-boot.yml'))" && echo "VALID"
```
Expected: `VALID`

**Step 3: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add kong/routes/spring-boot.yml
git commit -m "feat(kong): add Spring Boot service routes (auth, user, permission, audit, admin, security)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: NestJS Route Definitions

Create Kong service and route definitions for the 2 NestJS microservices.

**Files:**
- Create: `infrastructure/kong/routes/nestjs.yml`

**Step 1: Create `routes/nestjs.yml`**

```yaml
# =============================================================================
# NestJS Services — Kong Route Definitions
# =============================================================================
# 2 services: backend-gateway, notification-service
# =============================================================================

_format_version: "3.0"

services:
  # --- Backend Gateway (3000) ---
  - name: backend-gateway
    url: http://backend-gateway:3000
    connect_timeout: 5000
    write_timeout: 30000
    read_timeout: 30000
    retries: 2
    routes:
      - name: gateway-routes
        paths:
          - /api/v1/gateway
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Notification Service (3001) ---
  - name: notification-service
    url: http://notification-service:3001
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: notification-routes
        paths:
          - /api/v1/notifications
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp
```

**Step 2: Validate YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('kong/routes/nestjs.yml'))" && echo "VALID"
```

**Step 3: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add kong/routes/nestjs.yml
git commit -m "feat(kong): add NestJS service routes (backend-gateway, notification-service)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Go Service Route Definitions

Create Kong service and route definitions for the 10 Go microservices + go-bff.

**Files:**
- Create: `infrastructure/kong/routes/go.yml`

**Context:** Go services handle workspace management, channels, search, files, media, CDN, threads, bookmarks, reminders, attachments. The go-bff is a backend-for-frontend aggregator. All require JWT.

**Step 1: Create `routes/go.yml`**

```yaml
# =============================================================================
# Go Services — Kong Route Definitions
# =============================================================================
# 11 services: workspace, channel, search, file, media, cdn, thread,
#              bookmark, reminder, attachment, go-bff
# =============================================================================

_format_version: "3.0"

services:
  # --- Media Service (5001) ---
  - name: media-service
    url: http://media-service:5001
    connect_timeout: 5000
    write_timeout: 60000
    read_timeout: 60000
    retries: 1
    routes:
      - name: media-routes
        paths:
          - /api/v1/media
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- File Service (5002) ---
  - name: file-service
    url: http://file-service:5002
    connect_timeout: 5000
    write_timeout: 60000
    read_timeout: 60000
    retries: 1
    routes:
      - name: file-routes
        paths:
          - /api/v1/files
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Go BFF (5003) ---
  - name: go-bff
    url: http://go-bff:5003
    connect_timeout: 5000
    write_timeout: 30000
    read_timeout: 30000
    retries: 2
    routes:
      - name: bff-routes
        paths:
          - /api/v1/bff
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Workspace Service (5004) ---
  - name: workspace-service
    url: http://workspace-service:5004
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: workspace-routes
        paths:
          - /api/v1/workspaces
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Channel Service (5005) ---
  - name: channel-service
    url: http://channel-service:5005
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: channel-routes
        paths:
          - /api/v1/channels
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Search Service (5006) ---
  - name: search-service
    url: http://search-service:5006
    connect_timeout: 5000
    write_timeout: 15000
    read_timeout: 15000
    retries: 1
    routes:
      - name: search-routes
        paths:
          - /api/v1/search
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Thread Service (5009) ---
  - name: thread-service
    url: http://thread-service:5009
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: thread-routes
        paths:
          - /api/v1/threads
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Bookmark Service (5010) ---
  - name: bookmark-service
    url: http://bookmark-service:5010
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: bookmark-routes
        paths:
          - /api/v1/bookmarks
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Reminder Service (5011) ---
  - name: reminder-service
    url: http://reminder-service:5011
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: reminder-routes
        paths:
          - /api/v1/reminders
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Attachment Service (5012) ---
  - name: attachment-service
    url: http://attachment-service:5012
    connect_timeout: 5000
    write_timeout: 60000
    read_timeout: 60000
    retries: 1
    routes:
      - name: attachment-routes
        paths:
          - /api/v1/attachments
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- CDN Service (5013) ---
  - name: cdn-service
    url: http://cdn-service:5013
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 30000
    retries: 2
    routes:
      - name: cdn-routes
        paths:
          - /api/v1/cdn
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp
```

**Step 2: Validate YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('kong/routes/go.yml'))" && echo "VALID"
```

**Step 3: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add kong/routes/go.yml
git commit -m "feat(kong): add Go service routes (11 services incl. go-bff)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Python Service Route Definitions

Create Kong service and route definitions for the 8 Python microservices + spark-etl.

**Files:**
- Create: `infrastructure/kong/routes/python.yml`

**Context:** Python services handle AI/ML and analytics. The spark-etl service uses key-auth (internal service-to-service) instead of JWT. ML/analytics services get longer timeouts and response rate limiting.

**Step 1: Create `routes/python.yml`**

```yaml
# =============================================================================
# Python Services — Kong Route Definitions
# =============================================================================
# 9 services: analytics, ml, moderation, export, integration,
#             sentiment, insights, smart-reply, spark-etl
# spark-etl uses key-auth (internal). ML services get longer timeouts.
# =============================================================================

_format_version: "3.0"

services:
  # --- Analytics Service (5007) ---
  - name: analytics-service
    url: http://analytics-service:5007
    connect_timeout: 5000
    write_timeout: 30000
    read_timeout: 30000
    retries: 1
    routes:
      - name: analytics-routes
        paths:
          - /api/v1/analytics
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp
          - name: response-ratelimiting
            config:
              limits:
                analytics:
                  minute: 200

  # --- ML Service (5008) ---
  - name: ml-service
    url: http://ml-service:5008
    connect_timeout: 10000
    write_timeout: 60000
    read_timeout: 60000
    retries: 1
    routes:
      - name: ml-routes
        paths:
          - /api/v1/ml
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp
          - name: response-ratelimiting
            config:
              limits:
                ml:
                  minute: 100

  # --- Moderation Service (5014) ---
  - name: moderation-service
    url: http://moderation-service:5014
    connect_timeout: 5000
    write_timeout: 30000
    read_timeout: 30000
    retries: 1
    routes:
      - name: moderation-routes
        paths:
          - /api/v1/moderation
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Export Service (5015) ---
  - name: export-service
    url: http://export-service:5015
    connect_timeout: 5000
    write_timeout: 120000
    read_timeout: 120000
    retries: 0
    routes:
      - name: export-routes
        paths:
          - /api/v1/export
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Integration Service (5016) ---
  - name: integration-service
    url: http://integration-service:5016
    connect_timeout: 5000
    write_timeout: 30000
    read_timeout: 30000
    retries: 2
    routes:
      - name: integration-routes
        paths:
          - /api/v1/integrations
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Sentiment Service (5017) ---
  - name: sentiment-service
    url: http://sentiment-service:5017
    connect_timeout: 5000
    write_timeout: 30000
    read_timeout: 30000
    retries: 1
    routes:
      - name: sentiment-routes
        paths:
          - /api/v1/sentiment
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Insights Service (5018) ---
  - name: insights-service
    url: http://insights-service:5018
    connect_timeout: 5000
    write_timeout: 30000
    read_timeout: 30000
    retries: 1
    routes:
      - name: insights-routes
        paths:
          - /api/v1/insights
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Smart Reply Service (5019) ---
  - name: smart-reply-service
    url: http://smart-reply-service:5019
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 1
    routes:
      - name: smart-reply-routes
        paths:
          - /api/v1/smart-reply
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Spark ETL (5020) — Internal Only ---
  - name: spark-etl
    url: http://spark-etl:5020
    connect_timeout: 5000
    write_timeout: 120000
    read_timeout: 120000
    retries: 0
    routes:
      - name: etl-routes
        paths:
          - /api/v1/etl
        strip_path: false
        plugins:
          - name: key-auth
            config:
              key_names:
                - X-API-Key
          - name: ip-restriction
            config:
              allow:
                - 10.0.0.0/8
                - 172.16.0.0/12
```

**Step 2: Validate YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('kong/routes/python.yml'))" && echo "VALID"
```

**Step 3: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add kong/routes/python.yml
git commit -m "feat(kong): add Python service routes (9 services incl. spark-etl with key-auth)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Elixir REST Route Definitions

Create Kong service and route definitions for the 6 Elixir services' REST-only endpoints. WebSocket traffic is handled by Envoy — Kong only sees REST requests.

**Files:**
- Create: `infrastructure/kong/routes/elixir-rest.yml`

**Step 1: Create `routes/elixir-rest.yml`**

```yaml
# =============================================================================
# Elixir Services — REST-Only Kong Route Definitions
# =============================================================================
# 6 services: presence, call, message, notification-orchestrator,
#             huddle, event-broadcast
# WebSocket traffic is handled by Envoy (envoy.yaml) — Kong only sees
# REST API requests for these services.
# =============================================================================

_format_version: "3.0"

services:
  # --- Presence Service (4001) — REST endpoints ---
  - name: presence-service
    url: http://presence-service:4001
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: presence-rest-routes
        paths:
          - /api/v1/presence
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Call Service (4002) — REST endpoints ---
  - name: call-service
    url: http://call-service:4002
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: call-rest-routes
        paths:
          - /api/v1/calls
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Message Service (4003) — REST endpoints ---
  - name: message-service
    url: http://message-service:4003
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: message-rest-routes
        paths:
          - /api/v1/messages
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Notification Orchestrator (4004) — REST only ---
  - name: notification-orchestrator
    url: http://notification-orchestrator:4004
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: notification-orchestrator-routes
        paths:
          - /api/v1/notification-orchestrator
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Huddle Service (4005) — REST endpoints ---
  - name: huddle-service
    url: http://huddle-service:4005
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: huddle-rest-routes
        paths:
          - /api/v1/huddles
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp

  # --- Event Broadcast Service (4006) — REST only ---
  - name: event-broadcast-service
    url: http://event-broadcast-service:4006
    connect_timeout: 5000
    write_timeout: 10000
    read_timeout: 10000
    retries: 2
    routes:
      - name: event-broadcast-routes
        paths:
          - /api/v1/events
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp
```

**Step 2: Validate YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('kong/routes/elixir-rest.yml'))" && echo "VALID"
```

**Step 3: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add kong/routes/elixir-rest.yml
git commit -m "feat(kong): add Elixir REST-only routes (6 services, WS handled by Envoy)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Global Plugins

Create global plugin configurations applied to all routes.

**Files:**
- Create: `infrastructure/kong/plugins/global-plugins.yml`

**Step 1: Create `plugins/global-plugins.yml`**

```yaml
# =============================================================================
# Global Plugins — Applied to All Routes
# =============================================================================
# Rate limiting, CORS, Prometheus metrics, bot detection, request ID
# =============================================================================

_format_version: "3.0"

plugins:
  # --- Rate Limiting (global default) ---
  - name: rate-limiting
    config:
      minute: 1000
      policy: local
      fault_tolerant: true
      hide_client_headers: false
      error_code: 429
      error_message: "Rate limit exceeded. Try again later."

  # --- CORS ---
  - name: cors
    config:
      origins:
        - "https://*.quckapp.com"
        - "http://localhost:3000"
        - "http://localhost:5173"
      methods:
        - GET
        - POST
        - PUT
        - DELETE
        - PATCH
        - OPTIONS
      headers:
        - Authorization
        - Content-Type
        - X-Request-ID
        - X-API-Key
        - X-Workspace-ID
      exposed_headers:
        - X-RateLimit-Limit-Minute
        - X-RateLimit-Remaining-Minute
      credentials: true
      max_age: 86400
      preflight_continue: false

  # --- Prometheus Metrics ---
  - name: prometheus
    config:
      per_consumer: true
      status_code_metrics: true
      latency_metrics: true
      bandwidth_metrics: true
      upstream_health_metrics: true

  # --- Bot Detection ---
  - name: bot-detection
    config:
      allow: []
      deny: []

  # --- Request Transformer (add X-Request-ID) ---
  - name: request-transformer
    config:
      add:
        headers:
          - "X-Request-ID:$(uuid)"
```

**Step 2: Validate YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('kong/plugins/global-plugins.yml'))" && echo "VALID"
```

**Step 3: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add kong/plugins/global-plugins.yml
git commit -m "feat(kong): add global plugins (rate-limiting, CORS, Prometheus, bot-detection)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Auth and Traffic Plugins

Create plugin configuration files for authentication and traffic management.

**Files:**
- Create: `infrastructure/kong/plugins/auth-plugins.yml`
- Create: `infrastructure/kong/plugins/traffic-plugins.yml`

**Step 1: Create `plugins/auth-plugins.yml`**

```yaml
# =============================================================================
# Auth Plugin Configurations
# =============================================================================
# JWT and Key-Auth plugin reference configs.
# These are applied per-route in the route files, not globally.
# This file documents the shared config patterns.
# =============================================================================

# JWT Configuration Reference
# Applied per-route via: plugins: [{ name: jwt, config: ... }]
#
# Algorithm: RS256 (asymmetric — auth-service signs, Kong verifies)
# Claims verified: exp (expiration)
# Key claim: iss (issuer)
# Secret is fetched from Kong consumers or JWKS endpoint
#
# Consumer setup (done via Admin API or declarative):
#   consumers:
#     - username: quckapp-jwt
#       jwt_secrets:
#         - algorithm: RS256
#           key: quckapp-auth
#           rsa_public_key: <public key from auth-service>

# Key-Auth Configuration Reference
# Applied to internal service-to-service routes (e.g., spark-etl)
#
# Key lookup: X-API-Key header
# Consumer setup:
#   consumers:
#     - username: spark-etl-consumer
#       keyauth_credentials:
#         - key: <generated-api-key>

_format_version: "3.0"

consumers:
  # --- JWT Consumer (all authenticated users) ---
  - username: quckapp-jwt
    jwt_secrets:
      - algorithm: RS256
        key: quckapp-auth
        # rsa_public_key injected per environment

  # --- Service-to-Service Consumers ---
  - username: spark-etl-consumer
    keyauth_credentials:
      - key: "${SPARK_ETL_API_KEY}"
    acls:
      - group: internal

  - username: ci-pipeline-consumer
    keyauth_credentials:
      - key: "${CI_PIPELINE_API_KEY}"
    acls:
      - group: internal
```

**Step 2: Create `plugins/traffic-plugins.yml`**

```yaml
# =============================================================================
# Traffic Management Plugin Configurations
# =============================================================================
# Request/response transformers, IP restriction, ACL patterns
# =============================================================================

# IP Restriction Reference
# Applied to admin routes and internal-only services
# Allow list uses private RFC1918 ranges + VPN CIDR
#
# Production CIDRs (override per environment):
#   allow:
#     - 10.0.0.0/8        # VPC internal
#     - 172.16.0.0/12     # Docker networks
#     - 192.168.0.0/16    # Local dev

# ACL Reference
# Groups used across routes:
#   - admin: Full platform access (admin-service, audit-service)
#   - workspace-owner: Workspace management endpoints
#   - member: Standard authenticated user
#   - internal: Service-to-service (spark-etl, CI pipeline)

# Response Rate Limiting Reference
# Applied to ML/analytics services to prevent expensive query abuse
# Limits are per consumer, returned in X-RateLimit headers
#
# Tiers:
#   analytics: 200/min (dashboard queries)
#   ml: 100/min (inference requests)
#   export: 10/min (data export jobs)
```

**Step 3: Validate both files**

```bash
python -c "import yaml; yaml.safe_load(open('kong/plugins/auth-plugins.yml'))" && echo "auth VALID"
python -c "import yaml; yaml.safe_load(open('kong/plugins/traffic-plugins.yml'))" && echo "traffic VALID"
```

**Step 4: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add kong/plugins/auth-plugins.yml kong/plugins/traffic-plugins.yml
git commit -m "feat(kong): add auth plugins (JWT, key-auth consumers) and traffic plugin reference

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Environment Override Files

Create per-environment override configurations.

**Files:**
- Create: `infrastructure/kong/environments/dev.yml`
- Create: `infrastructure/kong/environments/qa.yml`
- Create: `infrastructure/kong/environments/staging.yml`
- Create: `infrastructure/kong/environments/production.yml`
- Create: `infrastructure/kong/environments/live.yml`

**Step 1: Create all 5 environment files**

`environments/dev.yml`:
```yaml
# =============================================================================
# Dev Environment Overrides
# =============================================================================
# Relaxed rate limits, debug logging, no SSL, no bot detection
# =============================================================================

_environment: dev

overrides:
  rate_limiting:
    minute: 10000
  log_level: debug
  bot_detection: false
  ip_restriction: false
  ssl_termination: false
  cors_origins:
    - "http://localhost:3000"
    - "http://localhost:5173"
    - "http://localhost:8080"
    - "https://*.dev.quckapp.com"
```

`environments/qa.yml`:
```yaml
# =============================================================================
# QA Environment Overrides
# =============================================================================
_environment: qa

overrides:
  rate_limiting:
    minute: 5000
  log_level: info
  bot_detection: true
  ip_restriction: false
  ssl_termination: false
  cors_origins:
    - "https://*.qa.quckapp.com"
```

`environments/staging.yml`:
```yaml
# =============================================================================
# Staging Environment Overrides
# =============================================================================
_environment: staging

overrides:
  rate_limiting:
    minute: 2000
  log_level: notice
  bot_detection: true
  ip_restriction: true
  ssl_termination: true
  cors_origins:
    - "https://*.staging.quckapp.com"
```

`environments/production.yml`:
```yaml
# =============================================================================
# Production Environment Overrides
# =============================================================================
_environment: production

overrides:
  rate_limiting:
    minute: 1000
  log_level: notice
  bot_detection: true
  ip_restriction: true
  ssl_termination: true
  cors_origins:
    - "https://*.quckapp.com"
```

`environments/live.yml`:
```yaml
# =============================================================================
# Live Environment Overrides
# =============================================================================
_environment: live

overrides:
  rate_limiting:
    minute: 1000
  log_level: warn
  bot_detection: true
  ip_restriction: true
  ssl_termination: true
  cors_origins:
    - "https://quckapp.com"
    - "https://app.quckapp.com"
```

**Step 2: Validate all environment files**

```bash
for f in kong/environments/*.yml; do python -c "import yaml; yaml.safe_load(open('$f'))" && echo "$f VALID"; done
```

**Step 3: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add kong/environments/
git commit -m "feat(kong): add per-environment overrides (dev, qa, staging, production, live)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Config Generation and Validation Scripts

Create the shell scripts that merge modular configs into the final `kong.yml` and validate syntax.

**Files:**
- Create: `infrastructure/kong/scripts/validate-config.sh`
- Create: `infrastructure/kong/scripts/generate-config.sh`

**Step 1: Create `scripts/validate-config.sh`**

```bash
#!/usr/bin/env bash
# =============================================================================
# Validate Kong Declarative Configuration
# =============================================================================
# Usage: ./validate-config.sh [kong.yml]
# Validates YAML syntax and Kong schema compliance.
# =============================================================================

set -euo pipefail

CONFIG_FILE="${1:-kong/kong.yml}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Kong Config Validation ==="
echo "File: $CONFIG_FILE"
echo ""

# 1. Check file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: Config file not found: $CONFIG_FILE"
    exit 1
fi

# 2. Validate YAML syntax
echo "[1/3] Checking YAML syntax..."
if python -c "import yaml; yaml.safe_load(open('$CONFIG_FILE'))" 2>/dev/null; then
    echo "  PASS: Valid YAML"
else
    echo "  FAIL: Invalid YAML syntax"
    exit 1
fi

# 3. Check _format_version exists
echo "[2/3] Checking format version..."
FORMAT_VERSION=$(python -c "import yaml; d=yaml.safe_load(open('$CONFIG_FILE')); print(d.get('_format_version', 'MISSING'))")
if [ "$FORMAT_VERSION" = "MISSING" ]; then
    echo "  FAIL: _format_version not found"
    exit 1
else
    echo "  PASS: _format_version = $FORMAT_VERSION"
fi

# 4. Count services and routes
echo "[3/3] Counting services and routes..."
SERVICES=$(python -c "import yaml; d=yaml.safe_load(open('$CONFIG_FILE')); print(len(d.get('services', [])))")
ROUTES=$(python -c "
import yaml
d = yaml.safe_load(open('$CONFIG_FILE'))
count = sum(len(s.get('routes', [])) for s in d.get('services', []))
print(count)
")
echo "  Services: $SERVICES"
echo "  Routes: $ROUTES"

echo ""
echo "=== Validation PASSED ==="
```

**Step 2: Create `scripts/generate-config.sh`**

```bash
#!/usr/bin/env bash
# =============================================================================
# Generate Kong Declarative Config
# =============================================================================
# Usage: ./generate-config.sh [environment]
# Merges route files + plugin configs + environment overrides into kong.yml.
#
# Examples:
#   ./generate-config.sh dev          # Dev config
#   ./generate-config.sh production   # Production config
#   ./generate-config.sh              # Defaults to dev
# =============================================================================

set -euo pipefail

ENV="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KONG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_FILE="$KONG_DIR/kong.yml"

echo "=== Generating Kong Config ==="
echo "Environment: $ENV"
echo "Output: $OUTPUT_FILE"
echo ""

# Validate environment file exists
ENV_FILE="$KONG_DIR/environments/${ENV}.yml"
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: Environment file not found: $ENV_FILE"
    echo "Available: $(ls "$KONG_DIR/environments/" | sed 's/.yml//g' | tr '\n' ' ')"
    exit 1
fi

# Merge all route and plugin files into a single kong.yml
python << 'PYTHON_SCRIPT'
import yaml
import sys
import os
import glob

kong_dir = os.environ.get("KONG_DIR", ".")
env = os.environ.get("ENV", "dev")
output_file = os.environ.get("OUTPUT_FILE", "kong.yml")

merged = {
    "_format_version": "3.0",
    "services": [],
    "plugins": [],
    "consumers": [],
}

# Load route files
route_files = sorted(glob.glob(os.path.join(kong_dir, "routes", "*.yml")))
for rf in route_files:
    with open(rf) as f:
        data = yaml.safe_load(f) or {}
    services = data.get("services", [])
    merged["services"].extend(services)
    print(f"  Loaded {len(services)} services from {os.path.basename(rf)}")

# Load plugin files
plugin_files = sorted(glob.glob(os.path.join(kong_dir, "plugins", "*.yml")))
for pf in plugin_files:
    with open(pf) as f:
        data = yaml.safe_load(f) or {}
    plugins = data.get("plugins", [])
    consumers = data.get("consumers", [])
    merged["plugins"].extend(plugins)
    merged["consumers"].extend(consumers)
    if plugins:
        print(f"  Loaded {len(plugins)} plugins from {os.path.basename(pf)}")
    if consumers:
        print(f"  Loaded {len(consumers)} consumers from {os.path.basename(pf)}")

# Load environment overrides
env_file = os.path.join(kong_dir, "environments", f"{env}.yml")
with open(env_file) as f:
    env_data = yaml.safe_load(f) or {}
overrides = env_data.get("overrides", {})

# Apply rate limit override to global rate-limiting plugin
rate_limit = overrides.get("rate_limiting", {}).get("minute")
if rate_limit:
    for plugin in merged["plugins"]:
        if plugin.get("name") == "rate-limiting":
            plugin["config"]["minute"] = rate_limit
            print(f"  Applied rate limit override: {rate_limit}/min")

# Apply CORS origins override
cors_origins = overrides.get("cors_origins")
if cors_origins:
    for plugin in merged["plugins"]:
        if plugin.get("name") == "cors":
            plugin["config"]["origins"] = cors_origins
            print(f"  Applied CORS origins override: {cors_origins}")

# Remove empty lists
if not merged["consumers"]:
    del merged["consumers"]
if not merged["plugins"]:
    del merged["plugins"]

# Write output
with open(output_file, "w") as f:
    yaml.dump(merged, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

total_services = len(merged["services"])
total_routes = sum(len(s.get("routes", [])) for s in merged["services"])
print(f"\n  Generated: {total_services} services, {total_routes} routes")
print(f"  Written to: {output_file}")
PYTHON_SCRIPT

echo ""
echo "=== Generation Complete ==="

# Run validation
echo ""
bash "$SCRIPT_DIR/validate-config.sh" "$OUTPUT_FILE"
```

**Step 3: Make scripts executable**

```bash
chmod +x kong/scripts/validate-config.sh kong/scripts/generate-config.sh
```

**Step 4: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add kong/scripts/
git commit -m "feat(kong): add config generation and validation scripts

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 11: Generate and Commit Final kong.yml

Run the generation script to produce the assembled `kong.yml` and validate it.

**Files:**
- Create: `infrastructure/kong/kong.yml` (generated)

**Step 1: Generate the config**

```bash
cd D:/Learning/QuckApp/infrastructure
bash kong/scripts/generate-config.sh dev
```
Expected output: ~34 services, ~36 routes, validation PASSED

**Step 2: Verify the generated file**

```bash
head -20 kong/kong.yml
wc -l kong/kong.yml
```

**Step 3: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add kong/kong.yml
git commit -m "feat(kong): generate assembled kong.yml (34 services, 36 routes)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 12: Final Verification and Parent Repo Update

Verify all files, check total count, update parent repo submodule reference.

**Step 1: Verify file count**

```bash
cd D:/Learning/QuckApp/infrastructure
find kong/ -type f | sort
find kong/ -type f | wc -l
```
Expected: 18 files

**Step 2: Verify git status is clean**

```bash
git status
git log --oneline -12
```

**Step 3: Update parent repo**

```bash
cd D:/Learning/QuckApp
git add infrastructure
git commit -m "feat(infrastructure): add Kong API Gateway config (DB-less, 34 services, JWT/rate-limiting)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
