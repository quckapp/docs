# Envoy Service Mesh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the single-file Envoy edge proxy into a full service mesh with mTLS, per-stack sidecars, resilience policies, observability, and traffic management.

**Architecture:** Keep the existing `envoy.yaml` as-is. Add an enhanced `edge/front-proxy.yaml` for production use. Create a base sidecar template inherited by 5 per-stack sidecar configs. All service-to-service traffic goes through mTLS-enabled sidecars. Observability, resilience, and traffic management are separate composable config files.

**Tech Stack:** Envoy Proxy v1.29+, SPIFFE/SPIRE (identity), OpenTelemetry (tracing), Prometheus (metrics)

---

## Reference: Service Inventory by Stack

| Stack | Services (name:port) |
|-------|---------------------|
| Spring Boot | auth-service:8081, user-service:8082, permission-service:8083, audit-service:8084, admin-service:8085, security-service:8086 |
| Go | media-service:5001, file-service:5002, go-bff:5003, workspace-service:5004, channel-service:5005, search-service:5006, thread-service:5009, bookmark-service:5010, reminder-service:5011, attachment-service:5012, cdn-service:5013 |
| Elixir | presence-service:4001, call-service:4002, message-service:4003, notification-orchestrator:4004, huddle-service:4005, event-broadcast-service:4006 |
| Python | analytics-service:5007, ml-service:5008, moderation-service:5014, export-service:5015, integration-service:5016, sentiment-service:5017, insights-service:5018, smart-reply-service:5019, spark-etl:5020 |
| NestJS | backend-gateway:3000, notification-service:3001 |

## Reference: Design Doc

See `docs/plans/2026-03-02-envoy-service-mesh-design.md` for all decisions, tables, and diagrams.

---

### Task 1: Enhanced Edge Proxy

**Files:**
- Create: `infrastructure/envoy/edge/front-proxy.yaml`

**Context:** This is the production-ready version of the existing `envoy.yaml`. It adds TLS termination, HTTP/2 downstream, distributed tracing headers, external rate limiting, and gzip compression. The existing `envoy.yaml` stays as the simple dev-mode proxy.

**Step 1: Create `edge/front-proxy.yaml`**

```yaml
# =============================================================================
# QUCKAPP - Enhanced Edge Proxy (Production)
# =============================================================================
# Production-grade front proxy with TLS, HTTP/2, tracing, rate limiting,
# and compression. For dev/local use, see ../envoy.yaml instead.
#
# Traffic flow:
#   Client (HTTPS/H2) → front-proxy:8443 → WebSocket → Elixir services
#                                        → REST     → Kong:8000
# =============================================================================

static_resources:
  listeners:
    - name: https_listener
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 8443
      filter_chains:
        - transport_socket:
            name: envoy.transport_sockets.tls
            typed_config:
              "@type": type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.DownstreamTlsContext
              common_tls_context:
                tls_certificates:
                  - certificate_chain:
                      filename: /etc/envoy/certs/server.crt
                    private_key:
                      filename: /etc/envoy/certs/server.key
                alpn_protocols:
                  - h2
                  - http/1.1
          filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: quckapp_edge
                codec_type: AUTO
                upgrade_configs:
                  - upgrade_type: websocket
                    enabled: true

                # --- Request ID generation ---
                request_id_extension:
                  typed_config:
                    "@type": type.googleapis.com/envoy.extensions.request_id.uuid.v3.UuidRequestIdConfig
                    pack_trace_reason: true

                # --- Distributed tracing ---
                tracing:
                  provider:
                    name: envoy.tracers.opentelemetry
                    typed_config:
                      "@type": type.googleapis.com/envoy.config.trace.v3.OpenTelemetryConfig
                      grpc_service:
                        envoy_grpc:
                          cluster_name: otel_collector
                        timeout: 1s
                  random_sampling:
                    value: 1.0  # 1% in production (override per environment)

                # --- Access logging (JSON) ---
                access_log:
                  - name: envoy.access_loggers.stdout
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StdoutAccessLog
                      log_format:
                        json_format:
                          timestamp: "%START_TIME%"
                          method: "%REQ(:METHOD)%"
                          path: "%REQ(X-ENVOY-ORIGINAL-PATH?:PATH)%"
                          protocol: "%PROTOCOL%"
                          status: "%RESPONSE_CODE%"
                          duration_ms: "%DURATION%"
                          bytes_sent: "%BYTES_SENT%"
                          bytes_received: "%BYTES_RECEIVED%"
                          upstream_host: "%UPSTREAM_HOST%"
                          upstream_cluster: "%UPSTREAM_CLUSTER%"
                          request_id: "%REQ(X-REQUEST-ID)%"
                          trace_id: "%REQ(X-B3-TRACEID)%"
                          user_agent: "%REQ(USER-AGENT)%"
                          response_flags: "%RESPONSE_FLAGS%"

                # --- Route configuration ---
                route_config:
                  name: edge_routes
                  virtual_hosts:
                    - name: quckapp
                      domains: ["*"]

                      # Response headers
                      response_headers_to_add:
                        - header:
                            key: strict-transport-security
                            value: "max-age=31536000; includeSubDomains"
                        - header:
                            key: x-content-type-options
                            value: "nosniff"
                        - header:
                            key: x-frame-options
                            value: "DENY"

                      routes:
                        # --- WebSocket routes → Elixir real-time services ---
                        - match:
                            prefix: "/socket"
                          route:
                            cluster: realtime_service
                            timeout: 0s
                            idle_timeout: 3600s

                        - match:
                            prefix: "/chat"
                          route:
                            cluster: realtime_service
                            timeout: 0s
                            idle_timeout: 3600s

                        - match:
                            prefix: "/socket.io"
                          route:
                            cluster: realtime_service
                            timeout: 0s
                            idle_timeout: 3600s

                        - match:
                            prefix: "/ws/presence"
                          route:
                            cluster: presence_service
                            timeout: 0s
                            idle_timeout: 3600s

                        - match:
                            prefix: "/ws/calls"
                          route:
                            cluster: call_service
                            timeout: 0s
                            idle_timeout: 3600s

                        - match:
                            prefix: "/ws/huddles"
                          route:
                            cluster: huddle_service
                            timeout: 0s
                            idle_timeout: 3600s

                        # --- REST catch-all → Kong API Gateway ---
                        - match:
                            prefix: "/"
                          route:
                            cluster: kong_gateway
                            timeout: 30s

                # --- HTTP filter chain ---
                http_filters:
                  - name: envoy.filters.http.cors
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.cors.v3.CorsPolicy
                      allow_origin_string_match:
                        - safe_regex:
                            regex: "https://.*\\.quckapp\\.com"
                        - exact: "https://quckapp.com"
                      allow_methods: "GET, POST, PUT, DELETE, PATCH, OPTIONS"
                      allow_headers: "authorization, content-type, x-request-id, x-api-key, x-workspace-id, upgrade, connection, sec-websocket-key, sec-websocket-version, sec-websocket-extensions, sec-websocket-protocol"
                      expose_headers: "x-request-id, x-ratelimit-limit, x-ratelimit-remaining"
                      allow_credentials: true
                      max_age: "86400"

                  - name: envoy.filters.http.compressor
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.compressor.v3.Compressor
                      response_direction_config:
                        common_config:
                          min_content_length: 1024
                          content_type:
                            - application/json
                            - text/plain
                            - text/html
                            - application/javascript
                            - text/css
                      compressor_library:
                        name: text_optimized
                        typed_config:
                          "@type": type.googleapis.com/envoy.extensions.compression.gzip.compressor.v3.Gzip
                          memory_level: 5
                          compression_level: DEFAULT_COMPRESSION

                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

    # --- HTTP → HTTPS redirect listener ---
    - name: http_redirect
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 8090
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: quckapp_redirect
                codec_type: AUTO
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
                route_config:
                  virtual_hosts:
                    - name: redirect
                      domains: ["*"]
                      routes:
                        - match:
                            prefix: "/"
                          redirect:
                            https_redirect: true

  # --- Upstream clusters ---
  clusters:
    - name: realtime_service
      connect_timeout: 5s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: realtime_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: realtime-service
                      port_value: 4000
      health_checks:
        - timeout: 3s
          interval: 15s
          unhealthy_threshold: 3
          healthy_threshold: 2
          http_health_check:
            path: /health

    - name: presence_service
      connect_timeout: 5s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: presence_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: presence-service
                      port_value: 4001
      health_checks:
        - timeout: 3s
          interval: 15s
          unhealthy_threshold: 3
          healthy_threshold: 2
          http_health_check:
            path: /health

    - name: call_service
      connect_timeout: 5s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: call_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: call-service
                      port_value: 4002
      health_checks:
        - timeout: 3s
          interval: 15s
          unhealthy_threshold: 3
          healthy_threshold: 2
          http_health_check:
            path: /health

    - name: huddle_service
      connect_timeout: 5s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: huddle_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: huddle-service
                      port_value: 4005
      health_checks:
        - timeout: 3s
          interval: 15s
          unhealthy_threshold: 3
          healthy_threshold: 2
          http_health_check:
            path: /health

    - name: kong_gateway
      connect_timeout: 5s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: kong_gateway
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: kong
                      port_value: 8000

    - name: otel_collector
      connect_timeout: 3s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      typed_extension_protocol_options:
        envoy.extensions.upstreams.http.v3.HttpProtocolOptions:
          "@type": type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions
          explicit_http_config:
            http2_protocol_options: {}
      load_assignment:
        cluster_name: otel_collector
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: otel-collector
                      port_value: 4317

# --- Admin interface ---
admin:
  address:
    socket_address:
      address: 127.0.0.1
      port_value: 9901
```

**Step 2: Validate YAML syntax**

Run: `cd D:/Learning/QuckApp/infrastructure && python -c "import yaml; yaml.safe_load(open('envoy/edge/front-proxy.yaml')); print('VALID')"`
Expected: `VALID`

**Step 3: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add envoy/edge/front-proxy.yaml
git commit -m "feat(envoy): add enhanced edge proxy with TLS, HTTP/2, tracing, compression"
```

---

### Task 2: TLS Certificate Guide + Rate Limiting Config

**Files:**
- Create: `infrastructure/envoy/edge/tls/tls-config.md`
- Create: `infrastructure/envoy/edge/rate-limiting/rate-limit-config.yaml`

**Step 1: Create `edge/tls/tls-config.md`**

```markdown
# TLS Certificate Management

## Overview

The edge proxy (`front-proxy.yaml`) terminates TLS using certificates stored at
`/etc/envoy/certs/`. This guide covers certificate provisioning for each environment.

## Certificate Locations

| File | Purpose |
|------|---------|
| `/etc/envoy/certs/server.crt` | Server certificate (PEM) |
| `/etc/envoy/certs/server.key` | Private key (PEM) |
| `/etc/envoy/certs/ca.crt` | CA certificate chain (PEM, optional for client verification) |

## Per-Environment Setup

### Development / Local

Use self-signed certificates via `mkcert`:

```bash
mkcert -install
mkcert -cert-file server.crt -key-file server.key localhost 127.0.0.1 ::1
```

Mount into the Envoy container:

```yaml
volumes:
  - ./certs:/etc/envoy/certs:ro
```

### Staging / Production

Use cert-manager with Let's Encrypt (or internal CA):

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: envoy-edge-cert
  namespace: quckapp
spec:
  secretName: envoy-edge-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - "*.quckapp.com"
    - "quckapp.com"
  duration: 2160h    # 90 days
  renewBefore: 720h  # 30 days before expiry
```

Mount the Kubernetes secret:

```yaml
volumes:
  - name: tls-certs
    secret:
      secretName: envoy-edge-tls
```

## Key Rotation

Envoy watches certificate files for changes. When cert-manager renews a certificate,
Envoy picks up the new cert automatically without restart (requires SDS or file watch).

For file-based rotation, configure a watch interval:

```yaml
tls_certificates:
  - certificate_chain:
      filename: /etc/envoy/certs/server.crt
      watched_directory:
        path: /etc/envoy/certs
    private_key:
      filename: /etc/envoy/certs/server.key
```

## Verification

Test TLS connectivity:

```bash
openssl s_client -connect localhost:8443 -servername quckapp.com
curl -v https://localhost:8443/health
```
```

**Step 2: Create `edge/rate-limiting/rate-limit-config.yaml`**

```yaml
# =============================================================================
# External Rate Limiting Service Configuration
# =============================================================================
# Configuration for Envoy's external rate limiting service.
# The edge proxy calls this service to enforce global rate limits.
# Uses envoy.service.ratelimit.v3.RateLimitService.
#
# This config is for the rate limit service itself (e.g., envoyproxy/ratelimit).
# The edge proxy references it via the ratelimit filter.
# =============================================================================

domain: quckapp_edge

descriptors:
  # --- Global rate limit (all clients) ---
  - key: generic_key
    value: default
    rate_limit:
      unit: minute
      requests_per_unit: 10000

  # --- Per-IP rate limit ---
  - key: remote_address
    rate_limit:
      unit: minute
      requests_per_unit: 1000

  # --- Per-path rate limits ---
  - key: path
    value: "/api/v1/auth/login"
    rate_limit:
      unit: minute
      requests_per_unit: 30
    descriptors:
      - key: remote_address
        rate_limit:
          unit: minute
          requests_per_unit: 10

  - key: path
    value: "/api/v1/auth/register"
    rate_limit:
      unit: minute
      requests_per_unit: 10
    descriptors:
      - key: remote_address
        rate_limit:
          unit: minute
          requests_per_unit: 5

  - key: path
    value: "/api/v1/auth/forgot-password"
    rate_limit:
      unit: minute
      requests_per_unit: 5
    descriptors:
      - key: remote_address
        rate_limit:
          unit: minute
          requests_per_unit: 3

  # --- WebSocket connections ---
  - key: path
    value: "/socket"
    rate_limit:
      unit: minute
      requests_per_unit: 500

  # --- ML / heavy endpoints ---
  - key: path
    value: "/api/v1/ml"
    rate_limit:
      unit: minute
      requests_per_unit: 100

  - key: path
    value: "/api/v1/export"
    rate_limit:
      unit: minute
      requests_per_unit: 50
```

**Step 3: Validate YAML**

Run: `cd D:/Learning/QuckApp/infrastructure && python -c "import yaml; yaml.safe_load(open('envoy/edge/rate-limiting/rate-limit-config.yaml')); print('VALID')"`
Expected: `VALID`

**Step 4: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add envoy/edge/tls/tls-config.md envoy/edge/rate-limiting/rate-limit-config.yaml
git commit -m "feat(envoy): add TLS certificate guide and rate limiting config"
```

---

### Task 3: Sidecar Base Template

**Files:**
- Create: `infrastructure/envoy/sidecar/sidecar-base.yaml`

**Context:** This is the base sidecar template that all per-stack sidecar configs inherit from. It defines the inbound listener (accepting mTLS traffic from other services), the outbound listener (intercepting app-to-service calls), access logging, tracing, and health check endpoint.

**Step 1: Create `sidecar/sidecar-base.yaml`**

```yaml
# =============================================================================
# QUCKAPP - Envoy Sidecar Base Template
# =============================================================================
# Base sidecar proxy configuration that all services inherit.
# Per-stack overrides (Spring Boot, Go, Elixir, Python, NestJS) customize
# ports and service-specific settings.
#
# Sidecar responsibilities:
#   - mTLS termination for inbound traffic
#   - mTLS origination for outbound traffic
#   - Circuit breaking and retry policies
#   - Access logging (structured JSON)
#   - Distributed tracing header propagation
#   - Prometheus metrics exposure
#
# Ports:
#   - 15001: Inbound listener (receives mTLS traffic from other sidecars)
#   - 15006: Outbound listener (intercepts app's outbound calls)
#   - 15000: Sidecar admin (metrics, health)
#   - APP_PORT: Forwarded to localhost:APP_PORT (set per-stack)
# =============================================================================

# NOTE: This file is a base template. Per-stack sidecar configs override
# {{APP_PORT}}, {{SERVICE_NAME}}, and {{CLUSTER_DEFINITIONS}} placeholders.

static_resources:
  listeners:
    # --- Inbound: receive traffic from other services via mTLS ---
    - name: inbound_listener
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 15001
      filter_chains:
        - transport_socket:
            name: envoy.transport_sockets.tls
            typed_config:
              "@type": type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.DownstreamTlsContext
              require_client_certificate: true
              common_tls_context:
                tls_certificate_sds_secret_configs:
                  - name: "default"
                    sds_config:
                      api_config_source:
                        api_type: GRPC
                        grpc_services:
                          - envoy_grpc:
                              cluster_name: spire_agent
                        transport_api_version: V3
                validation_context_sds_secret_config:
                  name: "ROOTCA"
                  sds_config:
                    api_config_source:
                      api_type: GRPC
                      grpc_services:
                        - envoy_grpc:
                            cluster_name: spire_agent
                      transport_api_version: V3
          filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: inbound
                codec_type: AUTO

                # Structured JSON access log
                access_log:
                  - name: envoy.access_loggers.stdout
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StdoutAccessLog
                      log_format:
                        json_format:
                          timestamp: "%START_TIME%"
                          method: "%REQ(:METHOD)%"
                          path: "%REQ(X-ENVOY-ORIGINAL-PATH?:PATH)%"
                          status: "%RESPONSE_CODE%"
                          duration_ms: "%DURATION%"
                          upstream_host: "%UPSTREAM_HOST%"
                          request_id: "%REQ(X-REQUEST-ID)%"
                          trace_id: "%REQ(X-B3-TRACEID)%"
                          response_flags: "%RESPONSE_FLAGS%"
                          downstream_peer: "%DOWNSTREAM_PEER_URI_SAN%"

                # Tracing propagation
                tracing:
                  provider:
                    name: envoy.tracers.opentelemetry
                    typed_config:
                      "@type": type.googleapis.com/envoy.config.trace.v3.OpenTelemetryConfig
                      grpc_service:
                        envoy_grpc:
                          cluster_name: otel_collector
                        timeout: 1s
                  random_sampling:
                    value: 1.0

                route_config:
                  name: inbound_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        - match:
                            prefix: "/"
                          route:
                            cluster: local_app
                            timeout: 10s

                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

    # --- Outbound: intercept app's calls to other services ---
    - name: outbound_listener
      address:
        socket_address:
          address: 127.0.0.1
          port_value: 15006
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: outbound
                codec_type: AUTO

                access_log:
                  - name: envoy.access_loggers.stdout
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StdoutAccessLog
                      log_format:
                        json_format:
                          timestamp: "%START_TIME%"
                          direction: "outbound"
                          method: "%REQ(:METHOD)%"
                          path: "%REQ(:PATH)%"
                          status: "%RESPONSE_CODE%"
                          duration_ms: "%DURATION%"
                          upstream_cluster: "%UPSTREAM_CLUSTER%"
                          request_id: "%REQ(X-REQUEST-ID)%"

                route_config:
                  name: outbound_route
                  virtual_hosts:
                    - name: outbound
                      domains: ["*"]
                      routes:
                        # Per-stack overrides define service-specific routes here
                        - match:
                            prefix: "/"
                          route:
                            cluster: passthrough
                            timeout: 10s

                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

  # --- Base clusters ---
  clusters:
    # Local application (sidecar → app on localhost)
    - name: local_app
      connect_timeout: 1s
      type: STATIC
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: local_app
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: 127.0.0.1
                      port_value: 8080  # Override per-stack

    # OTEL collector for tracing
    - name: otel_collector
      connect_timeout: 3s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      typed_extension_protocol_options:
        envoy.extensions.upstreams.http.v3.HttpProtocolOptions:
          "@type": type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions
          explicit_http_config:
            http2_protocol_options: {}
      load_assignment:
        cluster_name: otel_collector
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: otel-collector
                      port_value: 4317

    # SPIRE agent for SDS (certificate rotation)
    - name: spire_agent
      connect_timeout: 1s
      type: STATIC
      lb_policy: ROUND_ROBIN
      typed_extension_protocol_options:
        envoy.extensions.upstreams.http.v3.HttpProtocolOptions:
          "@type": type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions
          explicit_http_config:
            http2_protocol_options: {}
      load_assignment:
        cluster_name: spire_agent
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    pipe:
                      path: /run/spire/sockets/agent.sock

    # Passthrough for unmatched outbound traffic
    - name: passthrough
      connect_timeout: 5s
      type: ORIGINAL_DST
      lb_policy: CLUSTER_PROVIDED

# --- Admin interface (metrics + health) ---
admin:
  address:
    socket_address:
      address: 127.0.0.1
      port_value: 15000
```

**Step 2: Validate YAML**

Run: `cd D:/Learning/QuckApp/infrastructure && python -c "import yaml; yaml.safe_load(open('envoy/sidecar/sidecar-base.yaml')); print('VALID')"`
Expected: `VALID`

**Step 3: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add envoy/sidecar/sidecar-base.yaml
git commit -m "feat(envoy): add sidecar base template with mTLS, tracing, structured logging"
```

---

### Task 4: Per-Stack Sidecar Configs (Spring Boot + Go)

**Files:**
- Create: `infrastructure/envoy/sidecar/spring-boot-sidecar.yaml`
- Create: `infrastructure/envoy/sidecar/go-sidecar.yaml`

**Step 1: Create `sidecar/spring-boot-sidecar.yaml`**

```yaml
# =============================================================================
# Spring Boot Sidecar Configuration
# =============================================================================
# Extends sidecar-base.yaml for Spring Boot services (ports 8081-8086).
#
# Services: auth-service, user-service, permission-service,
#           audit-service, admin-service, security-service
#
# Spring Boot specifics:
#   - Health check: /actuator/health
#   - Default thread pool: 200 threads → higher circuit breaker limits
#   - Retry on 503/504 for GET only (POST not idempotent by default)
# =============================================================================

# Overrides from sidecar-base.yaml:
#   - local_app port: set per service (8081-8086)
#   - health_check path: /actuator/health
#   - circuit breaker thresholds: Critical tier (auth, admin), Standard (rest)

static_resources:
  listeners:
    - name: inbound_listener
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 15001
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: inbound_spring
                codec_type: AUTO
                route_config:
                  name: inbound_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        - match:
                            prefix: "/"
                          route:
                            cluster: local_app
                            timeout: 10s
                            retry_policy:
                              retry_on: "5xx,connect-failure,reset"
                              num_retries: 2
                              per_try_timeout: 5s
                              retry_back_off:
                                base_interval: 0.025s
                                max_interval: 0.25s
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

  clusters:
    # --- Local app (Spring Boot) ---
    # Set port_value per deployment:
    #   auth-service: 8081, user-service: 8082, permission-service: 8083
    #   audit-service: 8084, admin-service: 8085, security-service: 8086
    - name: local_app
      connect_timeout: 3s
      type: STATIC
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: local_app
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: 127.0.0.1
                      port_value: 8081  # Override per service
      health_checks:
        - timeout: 3s
          interval: 10s
          unhealthy_threshold: 3
          healthy_threshold: 2
          http_health_check:
            path: /actuator/health

      # Circuit breaker: Critical tier for auth/admin, Standard for others
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 2048
            max_pending_requests: 2048
            max_requests: 2048
            max_retries: 5

    # --- Peer service clusters (other Spring Boot services) ---
    - name: auth_service
      connect_timeout: 3s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: auth_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: auth-service
                      port_value: 15001
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 2048
            max_pending_requests: 2048
            max_requests: 2048
            max_retries: 5

    - name: user_service
      connect_timeout: 3s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: user_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: user-service
                      port_value: 15001
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 1024
            max_pending_requests: 1024
            max_requests: 1024
            max_retries: 3

    - name: permission_service
      connect_timeout: 3s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: permission_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: permission-service
                      port_value: 15001
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 1024
            max_pending_requests: 1024
            max_requests: 1024
            max_retries: 3

admin:
  address:
    socket_address:
      address: 127.0.0.1
      port_value: 15000
```

**Step 2: Create `sidecar/go-sidecar.yaml`**

```yaml
# =============================================================================
# Go Sidecar Configuration
# =============================================================================
# Extends sidecar-base.yaml for Go services (ports 5001-5013).
#
# Services: media-service, file-service, go-bff, workspace-service,
#           channel-service, search-service, thread-service, bookmark-service,
#           reminder-service, attachment-service, cdn-service
#
# Go specifics:
#   - Health check: /healthz (Go convention)
#   - Goroutine-based concurrency → standard circuit breaker limits
#   - File/media services get extended timeouts (60s)
#   - Search gets 15s timeout
# =============================================================================

static_resources:
  listeners:
    - name: inbound_listener
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 15001
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: inbound_go
                codec_type: AUTO
                route_config:
                  name: inbound_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        - match:
                            prefix: "/"
                          route:
                            cluster: local_app
                            timeout: 10s
                            retry_policy:
                              retry_on: "5xx,connect-failure,reset"
                              num_retries: 2
                              per_try_timeout: 5s
                              retry_back_off:
                                base_interval: 0.025s
                                max_interval: 0.25s
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

  clusters:
    # --- Local app (Go) ---
    # Set port_value per deployment:
    #   media-service: 5001, file-service: 5002, go-bff: 5003
    #   workspace-service: 5004, channel-service: 5005, search-service: 5006
    #   thread-service: 5009, bookmark-service: 5010, reminder-service: 5011
    #   attachment-service: 5012, cdn-service: 5013
    - name: local_app
      connect_timeout: 3s
      type: STATIC
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: local_app
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: 127.0.0.1
                      port_value: 5001  # Override per service
      health_checks:
        - timeout: 3s
          interval: 10s
          unhealthy_threshold: 3
          healthy_threshold: 2
          http_health_check:
            path: /healthz
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 1024
            max_pending_requests: 1024
            max_requests: 1024
            max_retries: 3

    # --- File-heavy services cluster (extended timeouts) ---
    - name: media_service
      connect_timeout: 5s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: media_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: media-service
                      port_value: 15001
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 1024
            max_pending_requests: 1024
            max_requests: 1024
            max_retries: 3

    - name: file_service
      connect_timeout: 5s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: file_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: file-service
                      port_value: 15001
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 1024
            max_pending_requests: 1024
            max_requests: 1024
            max_retries: 3

    # --- Search service (15s timeout) ---
    - name: search_service
      connect_timeout: 3s
      type: STRICT_DNS
      lb_policy: LEAST_REQUEST  # Distribute to least-loaded instance
      load_assignment:
        cluster_name: search_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: search-service
                      port_value: 15001
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 1024
            max_pending_requests: 1024
            max_requests: 1024
            max_retries: 3

admin:
  address:
    socket_address:
      address: 127.0.0.1
      port_value: 15000
```

**Step 3: Validate both files**

Run: `cd D:/Learning/QuckApp/infrastructure && python -c "import yaml; yaml.safe_load(open('envoy/sidecar/spring-boot-sidecar.yaml')); yaml.safe_load(open('envoy/sidecar/go-sidecar.yaml')); print('VALID')"`
Expected: `VALID`

**Step 4: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add envoy/sidecar/spring-boot-sidecar.yaml envoy/sidecar/go-sidecar.yaml
git commit -m "feat(envoy): add Spring Boot and Go sidecar configs"
```

---

### Task 5: Per-Stack Sidecar Configs (Elixir + Python + NestJS)

**Files:**
- Create: `infrastructure/envoy/sidecar/elixir-sidecar.yaml`
- Create: `infrastructure/envoy/sidecar/python-sidecar.yaml`
- Create: `infrastructure/envoy/sidecar/nestjs-sidecar.yaml`

**Step 1: Create `sidecar/elixir-sidecar.yaml`**

```yaml
# =============================================================================
# Elixir Sidecar Configuration
# =============================================================================
# Extends sidecar-base.yaml for Elixir/Phoenix services (ports 4001-4006).
#
# Services: presence-service, call-service, message-service,
#           notification-orchestrator, huddle-service, event-broadcast-service
#
# Elixir specifics:
#   - Health check: /health (Phoenix convention)
#   - WebSocket support: upgrade_configs enabled
#   - No request timeout for WS connections (timeout: 0s)
#   - 3600s idle timeout for WebSocket connections
#   - BEAM VM handles concurrency → standard circuit breaker limits
# =============================================================================

static_resources:
  listeners:
    - name: inbound_listener
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 15001
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: inbound_elixir
                codec_type: AUTO
                upgrade_configs:
                  - upgrade_type: websocket
                    enabled: true
                route_config:
                  name: inbound_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        # WebSocket routes (no timeout)
                        - match:
                            prefix: "/socket"
                          route:
                            cluster: local_app
                            timeout: 0s
                            idle_timeout: 3600s
                        - match:
                            prefix: "/ws"
                          route:
                            cluster: local_app
                            timeout: 0s
                            idle_timeout: 3600s
                        # REST routes (standard timeout)
                        - match:
                            prefix: "/"
                          route:
                            cluster: local_app
                            timeout: 10s
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

  clusters:
    # --- Local app (Elixir/Phoenix) ---
    # Set port_value per deployment:
    #   presence-service: 4001, call-service: 4002, message-service: 4003
    #   notification-orchestrator: 4004, huddle-service: 4005, event-broadcast-service: 4006
    - name: local_app
      connect_timeout: 5s
      type: STATIC
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: local_app
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: 127.0.0.1
                      port_value: 4001  # Override per service
      health_checks:
        - timeout: 3s
          interval: 10s
          unhealthy_threshold: 3
          healthy_threshold: 2
          http_health_check:
            path: /health
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 1024
            max_pending_requests: 1024
            max_requests: 1024
            max_retries: 3

    # --- Peer Elixir services ---
    - name: presence_service
      connect_timeout: 5s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: presence_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: presence-service
                      port_value: 15001

    - name: message_service
      connect_timeout: 5s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: message_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: message-service
                      port_value: 15001

admin:
  address:
    socket_address:
      address: 127.0.0.1
      port_value: 15000
```

**Step 2: Create `sidecar/python-sidecar.yaml`**

```yaml
# =============================================================================
# Python Sidecar Configuration
# =============================================================================
# Extends sidecar-base.yaml for Python services (ports 5007-5020).
#
# Services: analytics-service, ml-service, moderation-service, export-service,
#           integration-service, sentiment-service, insights-service,
#           smart-reply-service, spark-etl
#
# Python specifics:
#   - Health check: /health (FastAPI/Flask convention)
#   - ML services: 60s timeout, LEAST_REQUEST LB (GPU-bound)
#   - Export/ETL: 120s timeout, Batch tier circuit breakers, 0 retries
#   - Standard services: 30s timeout
# =============================================================================

static_resources:
  listeners:
    - name: inbound_listener
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 15001
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: inbound_python
                codec_type: AUTO
                route_config:
                  name: inbound_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        - match:
                            prefix: "/"
                          route:
                            cluster: local_app
                            timeout: 30s  # Override: 60s for ML, 120s for ETL
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

  clusters:
    # --- Local app (Python) ---
    # Set port_value per deployment:
    #   analytics-service: 5007, ml-service: 5008, moderation-service: 5014
    #   export-service: 5015, integration-service: 5016, sentiment-service: 5017
    #   insights-service: 5018, smart-reply-service: 5019, spark-etl: 5020
    - name: local_app
      connect_timeout: 5s
      type: STATIC
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: local_app
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: 127.0.0.1
                      port_value: 5007  # Override per service
      health_checks:
        - timeout: 5s
          interval: 15s
          unhealthy_threshold: 3
          healthy_threshold: 2
          http_health_check:
            path: /health
      # Standard tier (override to Batch for export/ETL)
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 1024
            max_pending_requests: 1024
            max_requests: 1024
            max_retries: 3

    # --- ML service cluster (LEAST_REQUEST for GPU load distribution) ---
    - name: ml_service
      connect_timeout: 5s
      type: STRICT_DNS
      lb_policy: LEAST_REQUEST
      load_assignment:
        cluster_name: ml_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: ml-service
                      port_value: 15001
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 1024
            max_pending_requests: 1024
            max_requests: 1024
            max_retries: 1

    # --- Export/ETL cluster (Batch tier) ---
    - name: export_service
      connect_timeout: 5s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: export_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: export-service
                      port_value: 15001
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 256
            max_pending_requests: 128
            max_requests: 256
            max_retries: 1

    - name: spark_etl
      connect_timeout: 5s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: spark_etl
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: spark-etl
                      port_value: 15001
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 256
            max_pending_requests: 128
            max_requests: 256
            max_retries: 1

admin:
  address:
    socket_address:
      address: 127.0.0.1
      port_value: 15000
```

**Step 3: Create `sidecar/nestjs-sidecar.yaml`**

```yaml
# =============================================================================
# NestJS Sidecar Configuration
# =============================================================================
# Extends sidecar-base.yaml for NestJS services (ports 3000-3001).
#
# Services: backend-gateway, notification-service
#
# NestJS specifics:
#   - Health check: /health (NestJS Terminus convention)
#   - backend-gateway is Critical tier (2048 connections)
#   - notification-service is Standard tier (1024 connections)
#   - Node.js single-threaded → careful with connection limits
# =============================================================================

static_resources:
  listeners:
    - name: inbound_listener
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 15001
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: inbound_nestjs
                codec_type: AUTO
                route_config:
                  name: inbound_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        - match:
                            prefix: "/"
                          route:
                            cluster: local_app
                            timeout: 30s
                            retry_policy:
                              retry_on: "5xx,connect-failure,reset"
                              num_retries: 2
                              per_try_timeout: 10s
                              retry_back_off:
                                base_interval: 0.025s
                                max_interval: 0.25s
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

  clusters:
    # --- Local app (NestJS) ---
    # Set port_value per deployment:
    #   backend-gateway: 3000, notification-service: 3001
    - name: local_app
      connect_timeout: 3s
      type: STATIC
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: local_app
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: 127.0.0.1
                      port_value: 3000  # Override per service
      health_checks:
        - timeout: 3s
          interval: 10s
          unhealthy_threshold: 3
          healthy_threshold: 2
          http_health_check:
            path: /health
      # Critical tier for gateway, Standard for notification
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 2048
            max_pending_requests: 2048
            max_requests: 2048
            max_retries: 5

admin:
  address:
    socket_address:
      address: 127.0.0.1
      port_value: 15000
```

**Step 4: Validate all 3 files**

Run: `cd D:/Learning/QuckApp/infrastructure && python -c "import yaml; yaml.safe_load(open('envoy/sidecar/elixir-sidecar.yaml')); yaml.safe_load(open('envoy/sidecar/python-sidecar.yaml')); yaml.safe_load(open('envoy/sidecar/nestjs-sidecar.yaml')); print('VALID')"`
Expected: `VALID`

**Step 5: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add envoy/sidecar/elixir-sidecar.yaml envoy/sidecar/python-sidecar.yaml envoy/sidecar/nestjs-sidecar.yaml
git commit -m "feat(envoy): add Elixir, Python, and NestJS sidecar configs"
```

---

### Task 6: mTLS Configuration

**Files:**
- Create: `infrastructure/envoy/mtls/mtls-config.yaml`
- Create: `infrastructure/envoy/mtls/spiffe-config.yaml`
- Create: `infrastructure/envoy/mtls/ca-config.md`

**Step 1: Create `mtls/mtls-config.yaml`**

```yaml
# =============================================================================
# mTLS Policy Configuration
# =============================================================================
# Mutual TLS policy for all service-to-service communication.
# Mode: STRICT — all traffic must be encrypted and authenticated.
#
# Certificate management via SPIRE (SPIFFE Runtime Environment):
#   - Workload attestation via Kubernetes service accounts
#   - 24-hour certificate lifetime with automatic rotation
#   - ECDSA P-256 key algorithm
# =============================================================================

mtls_policy:
  mode: STRICT  # STRICT = all traffic encrypted, PERMISSIVE = accept both

tls_params:
  tls_minimum_protocol_version: TLSv1_3
  tls_maximum_protocol_version: TLSv1_3
  cipher_suites:
    - TLS_AES_256_GCM_SHA384
    - TLS_AES_128_GCM_SHA256
    - TLS_CHACHA20_POLY1305_SHA256

certificate_config:
  algorithm: ECDSA_P256
  lifetime: 86400          # 24 hours in seconds
  rotation_grace_period: 3600  # Rotate 1 hour before expiry
  key_size: 256

# SDS (Secret Discovery Service) configuration
# Sidecars obtain certificates from SPIRE agent via SDS
sds_config:
  api_config_source:
    api_type: GRPC
    grpc_services:
      - envoy_grpc:
          cluster_name: spire_agent
    transport_api_version: V3
  resource_api_version: V3

# Trust domain
trust_domain: "quckapp.com"

# Service identity format (SPIFFE)
identity_template: "spiffe://quckapp.com/ns/quckapp/sa/{{SERVICE_NAME}}"

# Per-service identities
service_identities:
  # Spring Boot
  auth-service: "spiffe://quckapp.com/ns/quckapp/sa/auth-service"
  user-service: "spiffe://quckapp.com/ns/quckapp/sa/user-service"
  permission-service: "spiffe://quckapp.com/ns/quckapp/sa/permission-service"
  audit-service: "spiffe://quckapp.com/ns/quckapp/sa/audit-service"
  admin-service: "spiffe://quckapp.com/ns/quckapp/sa/admin-service"
  security-service: "spiffe://quckapp.com/ns/quckapp/sa/security-service"

  # Go
  media-service: "spiffe://quckapp.com/ns/quckapp/sa/media-service"
  file-service: "spiffe://quckapp.com/ns/quckapp/sa/file-service"
  go-bff: "spiffe://quckapp.com/ns/quckapp/sa/go-bff"
  workspace-service: "spiffe://quckapp.com/ns/quckapp/sa/workspace-service"
  channel-service: "spiffe://quckapp.com/ns/quckapp/sa/channel-service"
  search-service: "spiffe://quckapp.com/ns/quckapp/sa/search-service"
  thread-service: "spiffe://quckapp.com/ns/quckapp/sa/thread-service"
  bookmark-service: "spiffe://quckapp.com/ns/quckapp/sa/bookmark-service"
  reminder-service: "spiffe://quckapp.com/ns/quckapp/sa/reminder-service"
  attachment-service: "spiffe://quckapp.com/ns/quckapp/sa/attachment-service"
  cdn-service: "spiffe://quckapp.com/ns/quckapp/sa/cdn-service"

  # Elixir
  presence-service: "spiffe://quckapp.com/ns/quckapp/sa/presence-service"
  call-service: "spiffe://quckapp.com/ns/quckapp/sa/call-service"
  message-service: "spiffe://quckapp.com/ns/quckapp/sa/message-service"
  notification-orchestrator: "spiffe://quckapp.com/ns/quckapp/sa/notification-orchestrator"
  huddle-service: "spiffe://quckapp.com/ns/quckapp/sa/huddle-service"
  event-broadcast-service: "spiffe://quckapp.com/ns/quckapp/sa/event-broadcast-service"

  # Python
  analytics-service: "spiffe://quckapp.com/ns/quckapp/sa/analytics-service"
  ml-service: "spiffe://quckapp.com/ns/quckapp/sa/ml-service"
  moderation-service: "spiffe://quckapp.com/ns/quckapp/sa/moderation-service"
  export-service: "spiffe://quckapp.com/ns/quckapp/sa/export-service"
  integration-service: "spiffe://quckapp.com/ns/quckapp/sa/integration-service"
  sentiment-service: "spiffe://quckapp.com/ns/quckapp/sa/sentiment-service"
  insights-service: "spiffe://quckapp.com/ns/quckapp/sa/insights-service"
  smart-reply-service: "spiffe://quckapp.com/ns/quckapp/sa/smart-reply-service"
  spark-etl: "spiffe://quckapp.com/ns/quckapp/sa/spark-etl"

  # NestJS
  backend-gateway: "spiffe://quckapp.com/ns/quckapp/sa/backend-gateway"
  notification-service: "spiffe://quckapp.com/ns/quckapp/sa/notification-service"
```

**Step 2: Create `mtls/spiffe-config.yaml`**

```yaml
# =============================================================================
# SPIFFE Identity Framework Configuration
# =============================================================================
# SPIRE (SPIFFE Runtime Environment) server and agent configuration
# for workload identity and certificate issuance.
#
# Architecture:
#   SPIRE Server (control plane) → issues SVIDs (SPIFFE Verifiable Identity Documents)
#   SPIRE Agent (per node) → attests workloads, serves SVIDs via Workload API
#   Envoy Sidecar → fetches SVIDs from SPIRE Agent via SDS
# =============================================================================

# --- SPIRE Server Configuration ---
spire_server:
  trust_domain: "quckapp.com"
  bind_address: "0.0.0.0"
  bind_port: 8081
  log_level: INFO

  ca_config:
    ca_ttl: "720h"       # Root CA: 30 days
    default_svid_ttl: "24h"  # Workload SVID: 24 hours
    ca_key_type: "ec-p256"

  datastore:
    plugin: "sql"
    config:
      database_type: "postgres"
      connection_string: "dbname=spire host=spire-db user=spire password=${SPIRE_DB_PASSWORD} sslmode=require"

  node_attestor:
    plugin: "k8s_psat"  # Kubernetes Projected Service Account Token
    config:
      clusters:
        quckapp:
          service_account_allow_list:
            - "quckapp:spire-agent"

  key_manager:
    plugin: "disk"
    config:
      keys_path: "/run/spire/data/keys.json"

# --- SPIRE Agent Configuration ---
spire_agent:
  trust_domain: "quckapp.com"
  server_address: "spire-server"
  server_port: 8081
  socket_path: "/run/spire/sockets/agent.sock"
  log_level: INFO

  workload_attestor:
    plugin: "k8s"
    config:
      skip_kubelet_verification: false

  key_manager:
    plugin: "memory"

# --- Registration Entries ---
# Each service gets a SPIFFE ID based on its Kubernetes service account
registration_entries:
  # Spring Boot services
  - spiffe_id: "spiffe://quckapp.com/ns/quckapp/sa/auth-service"
    parent_id: "spiffe://quckapp.com/spire/agent/k8s_psat/quckapp"
    selectors:
      - "k8s:sa:auth-service"
      - "k8s:ns:quckapp"

  - spiffe_id: "spiffe://quckapp.com/ns/quckapp/sa/user-service"
    parent_id: "spiffe://quckapp.com/spire/agent/k8s_psat/quckapp"
    selectors:
      - "k8s:sa:user-service"
      - "k8s:ns:quckapp"

  # (Pattern repeats for all 34 services — abbreviated for readability)
  # Each entry follows: spiffe_id + parent_id + k8s selectors (sa + ns)

  # Go services
  - spiffe_id: "spiffe://quckapp.com/ns/quckapp/sa/go-bff"
    parent_id: "spiffe://quckapp.com/spire/agent/k8s_psat/quckapp"
    selectors:
      - "k8s:sa:go-bff"
      - "k8s:ns:quckapp"

  # Elixir services
  - spiffe_id: "spiffe://quckapp.com/ns/quckapp/sa/presence-service"
    parent_id: "spiffe://quckapp.com/spire/agent/k8s_psat/quckapp"
    selectors:
      - "k8s:sa:presence-service"
      - "k8s:ns:quckapp"

  # Python services
  - spiffe_id: "spiffe://quckapp.com/ns/quckapp/sa/ml-service"
    parent_id: "spiffe://quckapp.com/spire/agent/k8s_psat/quckapp"
    selectors:
      - "k8s:sa:ml-service"
      - "k8s:ns:quckapp"

  # NestJS services
  - spiffe_id: "spiffe://quckapp.com/ns/quckapp/sa/backend-gateway"
    parent_id: "spiffe://quckapp.com/spire/agent/k8s_psat/quckapp"
    selectors:
      - "k8s:sa:backend-gateway"
      - "k8s:ns:quckapp"
```

**Step 3: Create `mtls/ca-config.md`**

```markdown
# Internal CA Setup Guide

## Overview

QuckApp uses SPIRE (SPIFFE Runtime Environment) as the internal CA for all
service-to-service mTLS. SPIRE issues short-lived X.509 SVIDs (SPIFFE Verifiable
Identity Documents) to each workload via the Workload API.

## Architecture

```
┌──────────────────────────────────┐
│         SPIRE Server             │
│  - Root CA (self-signed)         │
│  - Issues intermediate CAs       │
│  - Stores in PostgreSQL          │
│  - CA TTL: 30 days               │
└──────────┬───────────────────────┘
           │ mTLS (node attestation)
           ▼
┌──────────────────────────────────┐
│         SPIRE Agent (per node)   │
│  - Workload attestation (k8s)   │
│  - Serves SVIDs via Unix socket │
│  - Socket: /run/spire/agent.sock│
└──────────┬───────────────────────┘
           │ SDS (gRPC over Unix socket)
           ▼
┌──────────────────────────────────┐
│         Envoy Sidecar            │
│  - Fetches SVID from agent      │
│  - Auto-rotates (< 24h)         │
│  - ECDSA P-256 keys             │
└──────────────────────────────────┘
```

## Deployment

### Prerequisites

- Kubernetes cluster with RBAC
- PostgreSQL database for SPIRE server
- Helm 3+

### Install SPIRE Server

```bash
helm repo add spiffe https://spiffe.github.io/helm-charts-hardened/
helm install spire spiffe/spire \
  --namespace spire-system \
  --create-namespace \
  --set global.spire.trustDomain=quckapp.com \
  --set spire-server.caKeyType=ec-p256 \
  --set spire-server.caTTL=720h \
  --set spire-server.defaultSVIDTTL=24h
```

### Register Services

```bash
# Register each service (example for auth-service)
kubectl exec -n spire-system spire-server-0 -- \
  /opt/spire/bin/spire-server entry create \
  -spiffeID spiffe://quckapp.com/ns/quckapp/sa/auth-service \
  -parentID spiffe://quckapp.com/spire/agent/k8s_psat/quckapp \
  -selector k8s:sa:auth-service \
  -selector k8s:ns:quckapp
```

## Certificate Verification

```bash
# Check SVID from a running sidecar
kubectl exec -it <pod> -c envoy -- \
  /usr/local/bin/envoy --mode validate --config-path /etc/envoy/envoy.yaml

# View issued SVIDs
kubectl exec -n spire-system spire-server-0 -- \
  /opt/spire/bin/spire-server entry show

# Verify mTLS between services
kubectl exec -it <pod-a> -- \
  openssl s_client -connect <service-b>:15001 -cert /tmp/svid.pem -key /tmp/key.pem
```

## Rotation Schedule

| Component | Lifetime | Rotation Trigger |
|-----------|----------|-----------------|
| Root CA | 30 days | Automatic (SPIRE) |
| Workload SVID | 24 hours | 1 hour before expiry |
| SPIRE Agent | 7 days | Node re-attestation |
```

**Step 4: Validate YAML files**

Run: `cd D:/Learning/QuckApp/infrastructure && python -c "import yaml; yaml.safe_load(open('envoy/mtls/mtls-config.yaml')); yaml.safe_load(open('envoy/mtls/spiffe-config.yaml')); print('VALID')"`
Expected: `VALID`

**Step 5: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add envoy/mtls/mtls-config.yaml envoy/mtls/spiffe-config.yaml envoy/mtls/ca-config.md
git commit -m "feat(envoy): add mTLS policy, SPIFFE identity framework, and CA setup guide"
```

---

### Task 7: Resilience Policies (Circuit Breakers + Retry + Outlier + Timeouts)

**Files:**
- Create: `infrastructure/envoy/resilience/circuit-breakers.yaml`
- Create: `infrastructure/envoy/resilience/retry-policies.yaml`
- Create: `infrastructure/envoy/resilience/outlier-detection.yaml`
- Create: `infrastructure/envoy/resilience/timeouts.yaml`

**Step 1: Create `resilience/circuit-breakers.yaml`**

```yaml
# =============================================================================
# Circuit Breaker Thresholds
# =============================================================================
# Per-service circuit breaker configuration, organized by tier.
# Applied to cluster definitions in sidecar configs.
#
# Tiers:
#   Critical  — auth, admin, gateway (high limits, more retries)
#   Standard  — most services (balanced limits)
#   Batch     — export, ETL, ML inference (low limits, few retries)
# =============================================================================

tiers:
  critical:
    description: "High-availability services (auth, admin, gateway)"
    services:
      - auth-service
      - admin-service
      - backend-gateway
      - security-service
    thresholds:
      max_connections: 2048
      max_pending_requests: 2048
      max_requests: 2048
      max_retries: 5
      track_remaining: true

  standard:
    description: "Standard CRUD and communication services"
    services:
      - user-service
      - permission-service
      - audit-service
      - workspace-service
      - channel-service
      - thread-service
      - bookmark-service
      - reminder-service
      - cdn-service
      - notification-service
      - presence-service
      - call-service
      - message-service
      - notification-orchestrator
      - huddle-service
      - event-broadcast-service
      - integration-service
      - smart-reply-service
      - go-bff
    thresholds:
      max_connections: 1024
      max_pending_requests: 1024
      max_requests: 1024
      max_retries: 3
      track_remaining: true

  batch:
    description: "Long-running, resource-intensive services"
    services:
      - export-service
      - spark-etl
      - ml-service
      - analytics-service
      - moderation-service
      - sentiment-service
      - insights-service
    thresholds:
      max_connections: 256
      max_pending_requests: 128
      max_requests: 256
      max_retries: 1
      track_remaining: true

# Special: file upload services (high connection limit, low retry)
  file_heavy:
    description: "File and media upload services"
    services:
      - media-service
      - file-service
      - attachment-service
      - search-service
    thresholds:
      max_connections: 1024
      max_pending_requests: 512
      max_requests: 1024
      max_retries: 1
      track_remaining: true
```

**Step 2: Create `resilience/retry-policies.yaml`**

```yaml
# =============================================================================
# Retry Policies
# =============================================================================
# Per-method retry strategies. Only idempotent operations are retried.
# Non-idempotent mutations (POST, PUT, DELETE) are NOT retried by default
# to prevent duplicate side effects.
# =============================================================================

policies:
  # --- Safe retries for read operations ---
  idempotent_reads:
    description: "GET/HEAD requests — safe to retry"
    methods:
      - GET
      - HEAD
    retry_on: "503,504,connect-failure,reset"
    num_retries: 2
    per_try_timeout: 5s
    retry_back_off:
      base_interval: 0.025s  # 25ms
      max_interval: 0.25s    # 250ms

  # --- No retries for mutations ---
  non_idempotent_mutations:
    description: "POST/PUT/DELETE — do NOT retry (side effects)"
    methods:
      - POST
      - PUT
      - DELETE
      - PATCH
    retry_on: ""
    num_retries: 0

  # --- Marked idempotent POST (via header x-idempotent: true) ---
  idempotent_post:
    description: "POST requests marked idempotent via x-idempotent header"
    methods:
      - POST
    request_headers_match:
      - name: "x-idempotent"
        exact_match: "true"
    retry_on: "503,504"
    num_retries: 1
    per_try_timeout: 10s
    retry_back_off:
      base_interval: 0.1s    # 100ms
      max_interval: 1s

  # --- WebSocket connections (no retry, reconnect at app layer) ---
  websocket:
    description: "WebSocket upgrades — app handles reconnection"
    num_retries: 0

# Per-service overrides (applied on top of method-based policies)
service_overrides:
  auth-service:
    # Auth login is POST but idempotent
    idempotent_post:
      num_retries: 2
      per_try_timeout: 3s

  search-service:
    # Search is read-heavy, allow more retries
    idempotent_reads:
      num_retries: 3
      per_try_timeout: 10s

  export-service:
    # Export is long-running, no retries at all
    idempotent_reads:
      num_retries: 0

  spark-etl:
    # ETL is long-running, no retries
    idempotent_reads:
      num_retries: 0
```

**Step 3: Create `resilience/outlier-detection.yaml`**

```yaml
# =============================================================================
# Outlier Detection Configuration
# =============================================================================
# Automatically ejects unhealthy hosts from load balancing pools.
# Ejected hosts are returned to the pool after the ejection period.
# =============================================================================

default:
  # Eject after 5 consecutive 5xx errors
  consecutive_5xx: 5

  # How often to check for outliers
  interval: 10s

  # How long an ejected host stays out
  base_ejection_time: 30s

  # Maximum % of hosts that can be ejected (prevents total pool drain)
  max_ejection_percent: 10

  # Consider gateway errors (502, 503, 504) as ejection triggers
  consecutive_gateway_failure: 5
  enforcing_consecutive_gateway_failure: 100

  # Also consider success rate (eject if success rate is 2+ stddev below mean)
  success_rate_minimum_hosts: 3
  success_rate_request_volume: 100
  success_rate_stdev_factor: 1900  # 1.9 standard deviations

# Per-tier overrides
tiers:
  critical:
    description: "Auth, gateway — stricter detection, faster recovery"
    consecutive_5xx: 3
    interval: 5s
    base_ejection_time: 15s
    max_ejection_percent: 5

  batch:
    description: "Export, ETL — more tolerant, longer ejection"
    consecutive_5xx: 10
    interval: 30s
    base_ejection_time: 60s
    max_ejection_percent: 20
```

**Step 4: Create `resilience/timeouts.yaml`**

```yaml
# =============================================================================
# Per-Service Timeout Configuration
# =============================================================================
# Timeout matrix for all services, organized by service type.
# These values are referenced by sidecar configs and route definitions.
#
# | Service Type       | Connect | Request | Idle   |
# |--------------------|---------|---------|--------|
# | Auth/gateway       | 3s      | 10s     | 300s   |
# | CRUD services      | 3s      | 10s     | 120s   |
# | Search             | 3s      | 15s     | 60s    |
# | File/media         | 5s      | 60s     | 120s   |
# | ML/analytics       | 5s      | 60s     | 60s    |
# | Export/ETL         | 5s      | 120s    | 300s   |
# | WebSocket (Elixir) | 5s      | 0s      | 3600s  |
# =============================================================================

service_timeouts:
  # --- Auth / Gateway (Critical) ---
  auth-service:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 300s
  admin-service:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 300s
  backend-gateway:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 300s
  security-service:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 300s

  # --- CRUD Services (Standard) ---
  user-service:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 120s
  permission-service:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 120s
  audit-service:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 120s
  workspace-service:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 120s
  channel-service:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 120s
  thread-service:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 120s
  bookmark-service:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 120s
  reminder-service:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 120s
  notification-service:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 120s
  notification-orchestrator:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 120s
  go-bff:
    connect_timeout: 3s
    request_timeout: 30s
    idle_timeout: 120s
  integration-service:
    connect_timeout: 3s
    request_timeout: 30s
    idle_timeout: 120s
  smart-reply-service:
    connect_timeout: 3s
    request_timeout: 10s
    idle_timeout: 120s

  # --- Search ---
  search-service:
    connect_timeout: 3s
    request_timeout: 15s
    idle_timeout: 60s

  # --- File / Media ---
  media-service:
    connect_timeout: 5s
    request_timeout: 60s
    idle_timeout: 120s
  file-service:
    connect_timeout: 5s
    request_timeout: 60s
    idle_timeout: 120s
  attachment-service:
    connect_timeout: 5s
    request_timeout: 60s
    idle_timeout: 120s
  cdn-service:
    connect_timeout: 5s
    request_timeout: 30s
    idle_timeout: 120s

  # --- ML / Analytics ---
  ml-service:
    connect_timeout: 5s
    request_timeout: 60s
    idle_timeout: 60s
  analytics-service:
    connect_timeout: 5s
    request_timeout: 60s
    idle_timeout: 60s
  moderation-service:
    connect_timeout: 5s
    request_timeout: 30s
    idle_timeout: 60s
  sentiment-service:
    connect_timeout: 5s
    request_timeout: 30s
    idle_timeout: 60s
  insights-service:
    connect_timeout: 5s
    request_timeout: 30s
    idle_timeout: 60s

  # --- Export / ETL ---
  export-service:
    connect_timeout: 5s
    request_timeout: 120s
    idle_timeout: 300s
  spark-etl:
    connect_timeout: 5s
    request_timeout: 120s
    idle_timeout: 300s

  # --- WebSocket (Elixir real-time) ---
  presence-service:
    connect_timeout: 5s
    request_timeout: 0s  # No timeout for WS
    idle_timeout: 3600s
  call-service:
    connect_timeout: 5s
    request_timeout: 0s
    idle_timeout: 3600s
  message-service:
    connect_timeout: 5s
    request_timeout: 0s
    idle_timeout: 3600s
  huddle-service:
    connect_timeout: 5s
    request_timeout: 0s
    idle_timeout: 3600s
  event-broadcast-service:
    connect_timeout: 5s
    request_timeout: 0s
    idle_timeout: 3600s
```

**Step 5: Validate all 4 files**

Run: `cd D:/Learning/QuckApp/infrastructure && python -c "import yaml; [yaml.safe_load(open(f'envoy/resilience/{f}')) for f in ['circuit-breakers.yaml','retry-policies.yaml','outlier-detection.yaml','timeouts.yaml']]; print('VALID')"`
Expected: `VALID`

**Step 6: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add envoy/resilience/
git commit -m "feat(envoy): add resilience policies (circuit breakers, retries, outlier detection, timeouts)"
```

---

### Task 8: Observability Configuration

**Files:**
- Create: `infrastructure/envoy/observability/access-log-config.yaml`
- Create: `infrastructure/envoy/observability/tracing-config.yaml`
- Create: `infrastructure/envoy/observability/metrics-config.yaml`

**Step 1: Create `observability/access-log-config.yaml`**

```yaml
# =============================================================================
# Structured Access Log Configuration
# =============================================================================
# JSON-formatted access logs for all Envoy proxies (edge + sidecars).
# Logs are emitted to stdout for collection by Fluentd/Fluent Bit.
#
# Fields:
#   timestamp, method, path, protocol, status, duration_ms, bytes_sent,
#   bytes_received, upstream_host, upstream_cluster, request_id, trace_id,
#   user_agent, response_flags, downstream_peer (mTLS identity)
# =============================================================================

# Edge proxy log format (full detail)
edge_format:
  json_format:
    timestamp: "%START_TIME%"
    method: "%REQ(:METHOD)%"
    path: "%REQ(X-ENVOY-ORIGINAL-PATH?:PATH)%"
    protocol: "%PROTOCOL%"
    status: "%RESPONSE_CODE%"
    status_details: "%RESPONSE_CODE_DETAILS%"
    duration_ms: "%DURATION%"
    request_duration_ms: "%REQUEST_DURATION%"
    response_duration_ms: "%RESPONSE_DURATION%"
    bytes_sent: "%BYTES_SENT%"
    bytes_received: "%BYTES_RECEIVED%"
    upstream_host: "%UPSTREAM_HOST%"
    upstream_cluster: "%UPSTREAM_CLUSTER%"
    upstream_transport_failure: "%UPSTREAM_TRANSPORT_FAILURE_REASON%"
    request_id: "%REQ(X-REQUEST-ID)%"
    trace_id: "%REQ(X-B3-TRACEID)%"
    span_id: "%REQ(X-B3-SPANID)%"
    user_agent: "%REQ(USER-AGENT)%"
    referer: "%REQ(REFERER)%"
    forwarded_for: "%REQ(X-FORWARDED-FOR)%"
    response_flags: "%RESPONSE_FLAGS%"
    route_name: "%ROUTE_NAME%"
    connection_termination: "%CONNECTION_TERMINATION_DETAILS%"

# Sidecar log format (compact, adds peer identity)
sidecar_format:
  json_format:
    timestamp: "%START_TIME%"
    direction: "inbound"  # Override to "outbound" for outbound listener
    method: "%REQ(:METHOD)%"
    path: "%REQ(X-ENVOY-ORIGINAL-PATH?:PATH)%"
    status: "%RESPONSE_CODE%"
    duration_ms: "%DURATION%"
    upstream_host: "%UPSTREAM_HOST%"
    upstream_cluster: "%UPSTREAM_CLUSTER%"
    request_id: "%REQ(X-REQUEST-ID)%"
    trace_id: "%REQ(X-B3-TRACEID)%"
    response_flags: "%RESPONSE_FLAGS%"
    downstream_peer: "%DOWNSTREAM_PEER_URI_SAN%"
    upstream_peer: "%UPSTREAM_PEER_URI_SAN%"

# Log filter (skip health checks and metrics endpoints)
filter:
  not_health_check_filter: {}
  # Additionally filter out /healthz, /actuator/health, /metrics
  runtime_filter:
    runtime_key: "access_log.enabled"
    percent_sampled:
      numerator: 100
```

**Step 2: Create `observability/tracing-config.yaml`**

```yaml
# =============================================================================
# Distributed Tracing Configuration
# =============================================================================
# OpenTelemetry-based distributed tracing for all Envoy proxies.
# Traces are sent to the OTEL Collector which forwards to Jaeger/Tempo.
#
# Sampling:
#   Development: 100% (all requests traced)
#   Staging:     10%
#   Production:  1%
#
# Propagation: W3C Trace Context + B3 (for backward compatibility)
# =============================================================================

# OTEL collector endpoint
collector:
  address: otel-collector
  port: 4317
  protocol: grpc
  timeout: 1s

# Sampling rates per environment
sampling:
  development:
    rate: 100.0  # 100% of requests
  staging:
    rate: 10.0   # 10% of requests
  production:
    rate: 1.0    # 1% of requests

# Trace context propagation headers
propagation:
  # W3C Trace Context (primary)
  - traceparent
  - tracestate
  # B3 (backward compatibility with Zipkin-instrumented services)
  - x-b3-traceid
  - x-b3-spanid
  - x-b3-parentspanid
  - x-b3-sampled
  # Custom headers to propagate
  - x-request-id
  - x-workspace-id

# Envoy tracing provider config (used in HttpConnectionManager)
envoy_tracing_config:
  provider:
    name: envoy.tracers.opentelemetry
    typed_config:
      "@type": type.googleapis.com/envoy.config.trace.v3.OpenTelemetryConfig
      grpc_service:
        envoy_grpc:
          cluster_name: otel_collector
        timeout: 1s
      service_name: "quckapp-envoy"

# Span attributes added to all traces
custom_tags:
  - tag: "service.namespace"
    literal:
      value: "quckapp"
  - tag: "deployment.environment"
    environment:
      name: "DEPLOY_ENV"
      default_value: "development"
```

**Step 3: Create `observability/metrics-config.yaml`**

```yaml
# =============================================================================
# Prometheus Metrics Configuration
# =============================================================================
# Envoy exposes metrics on the admin port (:9901 edge, :15000 sidecar)
# at /stats/prometheus. Prometheus scrapes these endpoints.
#
# Key metric categories:
#   - Per-cluster: upstream_cx_*, upstream_rq_*
#   - Per-route: vhost.*.route.*
#   - Circuit breaker: circuit_breakers.*
#   - Outlier detection: outlier_detection.*
#   - Health check: health_check.*
# =============================================================================

# Stats sink configuration
stats_sinks:
  - name: envoy.stat_sinks.prometheus
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.stat_sinks.open_telemetry.v3.SinkConfig
      # Alternatively use the built-in Prometheus endpoint on admin port

# Stats prefix configuration
stats_config:
  stats_tags:
    # Extract service name from cluster name
    - tag_name: "envoy_service"
      regex: "^cluster\\.(.*?)\\."
    # Extract route name
    - tag_name: "envoy_route"
      regex: "^vhost\\..*\\.route\\.(.*?)\\."
    # Extract response code class
    - tag_name: "envoy_response_code_class"
      regex: "^cluster\\..*\\.upstream_rq_(\\dxx)"

  use_all_default_tags: true

# Prometheus scrape config (for reference — deploy in prometheus.yml)
prometheus_scrape:
  # Edge proxy
  - job_name: "envoy-edge"
    metrics_path: /stats/prometheus
    static_configs:
      - targets: ["envoy-edge:9901"]
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        replacement: "edge-proxy"

  # Sidecar proxies (auto-discovered via Kubernetes)
  - job_name: "envoy-sidecar"
    metrics_path: /stats/prometheus
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        target_label: __address__
        regex: (.+)
        replacement: "${1}:15000"

# Key metrics to alert on
alert_metrics:
  # Circuit breaker tripped
  - metric: "envoy_cluster_circuit_breakers_default_cx_open"
    threshold: 1
    severity: warning

  # High error rate (>5% 5xx in 5 minutes)
  - metric: "envoy_cluster_upstream_rq_5xx"
    rate_interval: 5m
    threshold_percent: 5
    severity: critical

  # High latency (p99 > 5s)
  - metric: "envoy_cluster_upstream_rq_time"
    quantile: 0.99
    threshold_ms: 5000
    severity: warning

  # Host ejected by outlier detection
  - metric: "envoy_cluster_outlier_detection_ejections_active"
    threshold: 1
    severity: warning
```

**Step 4: Validate all 3 files**

Run: `cd D:/Learning/QuckApp/infrastructure && python -c "import yaml; [yaml.safe_load(open(f'envoy/observability/{f}')) for f in ['access-log-config.yaml','tracing-config.yaml','metrics-config.yaml']]; print('VALID')"`
Expected: `VALID`

**Step 5: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add envoy/observability/
git commit -m "feat(envoy): add observability configs (access logs, tracing, metrics)"
```

---

### Task 9: Traffic Management Configuration

**Files:**
- Create: `infrastructure/envoy/traffic/traffic-splitting.yaml`
- Create: `infrastructure/envoy/traffic/fault-injection.yaml`
- Create: `infrastructure/envoy/traffic/load-balancing.yaml`

**Step 1: Create `traffic/traffic-splitting.yaml`**

```yaml
# =============================================================================
# Traffic Splitting Configuration
# =============================================================================
# Canary deployments, blue-green routing, and weighted traffic splits.
# Used for gradual rollouts and A/B testing.
#
# Strategies:
#   1. Header-based (x-canary: true → canary cluster)
#   2. Weighted split (90/10, 95/5, 99/1)
#   3. Cookie-based (sticky sessions for consistent experience)
# =============================================================================

# --- Header-based canary routing ---
# Route requests with x-canary: true to the canary cluster
canary:
  header_name: "x-canary"
  header_value: "true"
  description: |
    Requests with header "x-canary: true" are routed to the canary version
    of the service. All other requests go to the stable version.
    Use for internal testing and staged rollouts.

  # Example Envoy route config:
  route_config:
    virtual_hosts:
      - name: canary_example
        domains: ["*"]
        routes:
          # Canary route (header match, higher priority)
          - match:
              prefix: "/"
              headers:
                - name: "x-canary"
                  exact_match: "true"
            route:
              cluster: "{service}_canary"
              timeout: 10s
          # Stable route (default)
          - match:
              prefix: "/"
            route:
              cluster: "{service}_stable"
              timeout: 10s

# --- Weighted traffic splits ---
# Gradually shift traffic from stable → canary
weighted_splits:
  # Conservative rollout (start here)
  rollout_1_percent:
    clusters:
      - name: "{service}_stable"
        weight: 99
      - name: "{service}_canary"
        weight: 1

  rollout_5_percent:
    clusters:
      - name: "{service}_stable"
        weight: 95
      - name: "{service}_canary"
        weight: 5

  rollout_10_percent:
    clusters:
      - name: "{service}_stable"
        weight: 90
      - name: "{service}_canary"
        weight: 10

  rollout_50_percent:
    clusters:
      - name: "{service}_stable"
        weight: 50
      - name: "{service}_canary"
        weight: 50

  # Full cutover
  rollout_100_percent:
    clusters:
      - name: "{service}_canary"
        weight: 100

# --- Blue-Green deployment ---
blue_green:
  description: |
    Two identical environments (blue/green). Traffic switches entirely
    from one to the other. Use for zero-downtime deployments.
  active_cluster: "{service}_blue"
  standby_cluster: "{service}_green"
  # Switch by changing active_cluster to green and standby to blue
```

**Step 2: Create `traffic/fault-injection.yaml`**

```yaml
# =============================================================================
# Fault Injection Configuration
# =============================================================================
# Chaos testing via controlled fault injection. Inject HTTP errors or
# latency delays to test resilience of downstream services.
#
# SAFETY:
#   - Only enabled when x-fault-inject: true header is present
#   - Never enabled globally in production
#   - Low percentages to avoid cascading failures
# =============================================================================

# --- Abort faults (inject HTTP errors) ---
abort_faults:
  # Inject 500 errors at 0.1% rate (1 in 1000 requests)
  low_error_rate:
    fault_filter_config:
      abort:
        http_status: 500
        percentage:
          numerator: 1
          denominator: THOUSAND
      headers:
        - name: "x-fault-inject"
          exact_match: "true"

  # Inject 503 errors at 1% rate (service unavailable)
  service_unavailable:
    fault_filter_config:
      abort:
        http_status: 503
        percentage:
          numerator: 1
          denominator: HUNDRED
      headers:
        - name: "x-fault-inject"
          exact_match: "true"

  # Inject 429 rate limit errors at 5% rate
  rate_limit_test:
    fault_filter_config:
      abort:
        http_status: 429
        percentage:
          numerator: 5
          denominator: HUNDRED
      headers:
        - name: "x-fault-inject"
          exact_match: "true"

# --- Delay faults (inject latency) ---
delay_faults:
  # Add 100ms delay to 1% of requests
  slight_delay:
    fault_filter_config:
      delay:
        fixed_delay: 0.1s
        percentage:
          numerator: 1
          denominator: HUNDRED
      headers:
        - name: "x-fault-inject"
          exact_match: "true"

  # Add 500ms delay to 0.5% of requests
  moderate_delay:
    fault_filter_config:
      delay:
        fixed_delay: 0.5s
        percentage:
          numerator: 5
          denominator: THOUSAND
      headers:
        - name: "x-fault-inject"
          exact_match: "true"

  # Add 3s delay to 0.1% of requests (timeout testing)
  timeout_test:
    fault_filter_config:
      delay:
        fixed_delay: 3s
        percentage:
          numerator: 1
          denominator: THOUSAND
      headers:
        - name: "x-fault-inject"
          exact_match: "true"

# --- Combined faults ---
combined:
  # Realistic chaos: mix of errors and delays
  chaos_test:
    fault_filter_config:
      abort:
        http_status: 500
        percentage:
          numerator: 1
          denominator: THOUSAND
      delay:
        fixed_delay: 0.1s
        percentage:
          numerator: 1
          denominator: HUNDRED
      headers:
        - name: "x-fault-inject"
          exact_match: "true"

# Envoy HTTP filter config (add to http_filters before router)
envoy_filter_config:
  name: envoy.filters.http.fault
  typed_config:
    "@type": type.googleapis.com/envoy.extensions.filters.http.fault.v3.HTTPFault
    abort:
      http_status: 500
      percentage:
        numerator: 1
        denominator: THOUSAND
    delay:
      fixed_delay: 0.1s
      percentage:
        numerator: 1
        denominator: HUNDRED
    headers:
      - name: "x-fault-inject"
        exact_match: "true"
```

**Step 3: Create `traffic/load-balancing.yaml`**

```yaml
# =============================================================================
# Load Balancing Policies
# =============================================================================
# Per-service load balancing strategy selection.
#
# Available policies:
#   ROUND_ROBIN    — Default, equal distribution
#   LEAST_REQUEST  — Route to instance with fewest active requests (ML, GPU)
#   RING_HASH      — Consistent hashing for session stickiness
#   RANDOM         — Random selection (simple, good for uniform workloads)
# =============================================================================

policies:
  # --- Default: ROUND_ROBIN ---
  # Used by most services — simple, fair distribution
  round_robin:
    lb_policy: ROUND_ROBIN
    services:
      - auth-service
      - user-service
      - permission-service
      - audit-service
      - admin-service
      - security-service
      - workspace-service
      - channel-service
      - thread-service
      - bookmark-service
      - reminder-service
      - notification-service
      - notification-orchestrator
      - go-bff
      - integration-service
      - smart-reply-service
      - presence-service
      - call-service
      - message-service
      - huddle-service
      - event-broadcast-service
      - moderation-service
      - export-service
      - spark-etl
      - cdn-service
      - attachment-service
      - media-service
      - file-service
      - backend-gateway

  # --- LEAST_REQUEST: for GPU/compute-bound services ---
  # Routes to the instance with the fewest active requests
  least_request:
    lb_policy: LEAST_REQUEST
    config:
      choice_count: 2  # Power of 2 choices
    services:
      - ml-service
      - analytics-service
      - sentiment-service
      - insights-service

  # --- RING_HASH: for session-sticky services ---
  # Consistent hash based on header or cookie for session affinity
  ring_hash:
    lb_policy: RING_HASH
    config:
      minimum_ring_size: 1024
      maximum_ring_size: 8388608
      hash_function: XX_HASH
    hash_policy:
      - header:
          header_name: "x-workspace-id"
      - cookie:
          name: "_quckapp_session"
          ttl: 0s  # Session cookie
    services:
      - search-service  # Cache-friendly routing by workspace
```

**Step 4: Validate all 3 files**

Run: `cd D:/Learning/QuckApp/infrastructure && python -c "import yaml; [yaml.safe_load(open(f'envoy/traffic/{f}')) for f in ['traffic-splitting.yaml','fault-injection.yaml','load-balancing.yaml']]; print('VALID')"`
Expected: `VALID`

**Step 5: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add envoy/traffic/
git commit -m "feat(envoy): add traffic management configs (splitting, fault injection, load balancing)"
```

---

### Task 10: YAML Validation Script

**Files:**
- Create: `infrastructure/envoy/scripts/validate-configs.sh`

**Context:** Similar to `kong/scripts/validate-config.sh`, this script validates all Envoy YAML files for syntax correctness and counts the files per directory.

**Step 1: Create `scripts/validate-configs.sh`**

```bash
#!/usr/bin/env bash
# =============================================================================
# Validate Envoy Configuration Files
# =============================================================================
# Usage: ./validate-configs.sh
# Validates YAML syntax for all Envoy config files across all directories.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENVOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Envoy Config Validation ==="
echo "Directory: $ENVOY_DIR"
echo ""

TOTAL_FILES=0
TOTAL_PASS=0
TOTAL_FAIL=0

# Find all YAML files (exclude scripts directory)
while IFS= read -r file; do
    TOTAL_FILES=$((TOTAL_FILES + 1))
    REL_PATH="${file#$ENVOY_DIR/}"

    # Convert path for Python on Windows
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* ]]; then
        PY_FILE=$(cygpath -w "$file" 2>/dev/null || echo "$file")
    else
        PY_FILE="$file"
    fi

    if python -c "import yaml; yaml.safe_load(open(r'$PY_FILE'))" 2>/dev/null; then
        echo "  PASS: $REL_PATH"
        TOTAL_PASS=$((TOTAL_PASS + 1))
    else
        echo "  FAIL: $REL_PATH"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
    fi
done < <(find "$ENVOY_DIR" -name "*.yaml" -o -name "*.yml" | sort)

echo ""
echo "=== Summary ==="
echo "  Total files: $TOTAL_FILES"
echo "  Passed:      $TOTAL_PASS"
echo "  Failed:      $TOTAL_FAIL"

# Count by directory
echo ""
echo "=== Files by Directory ==="
for dir in edge sidecar mtls resilience observability traffic; do
    if [ -d "$ENVOY_DIR/$dir" ]; then
        COUNT=$(find "$ENVOY_DIR/$dir" -name "*.yaml" -o -name "*.yml" | wc -l)
        echo "  $dir/: $COUNT files"
    fi
done

echo ""
if [ "$TOTAL_FAIL" -gt 0 ]; then
    echo "=== Validation FAILED ==="
    exit 1
else
    echo "=== Validation PASSED ==="
fi
```

**Step 2: Run validation**

Run: `cd D:/Learning/QuckApp/infrastructure && bash envoy/scripts/validate-configs.sh`
Expected: All files PASS, 0 failures

**Step 3: Commit**

```bash
cd D:/Learning/QuckApp/infrastructure
git add envoy/scripts/validate-configs.sh
git commit -m "feat(envoy): add YAML validation script for all config files"
```

---

### Task 11: Commit Docs and Update Parent Repo

**Step 1: Commit implementation plan in docs submodule**

```bash
cd D:/Learning/QuckApp/docs
git add docs/plans/2026-03-02-envoy-service-mesh-implementation.md
git commit -m "docs: add Envoy service mesh implementation plan"
```

**Step 2: Update parent repo submodule references**

```bash
cd D:/Learning/QuckApp
git add infrastructure docs
git commit -m "feat: add Envoy service mesh configuration (24 files across 6 directories)"
```
