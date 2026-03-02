# Envoy Service Mesh Design

## Context

The `infrastructure/envoy/` directory has a single `envoy.yaml` that acts as a basic WebSocket router — sending WS traffic to Elixir services and everything else to Kong. It lacks mTLS, circuit breaking, retries, observability, and sidecar proxy support. This design expands Envoy into a full service mesh (without Istio) covering edge proxy enhancement, per-service sidecars, mTLS, resilience policies, observability, and traffic management.

## Existing State

- **Envoy** (`envoy.yaml`): Single edge proxy, 5 clusters (4 Elixir WS + Kong catch-all), CORS filter, admin on 9901
- **Kong** (`kong/`): Handles all REST API routing (34 services, 36 routes, JWT, rate limiting)
- **Traffic flow**: Client → Envoy (8090) → WebSocket → Elixir / REST → Kong (8000) → microservices

## Decisions

- **No Istio**: Pure Envoy configs in git — no control plane dependency
- **Sidecar pattern**: Base template + per-stack overrides (Spring, Go, Elixir, Python, NestJS)
- **mTLS**: STRICT mode for all service-to-service traffic, SPIFFE identities, 24-hour cert rotation
- **Resilience**: Per-service circuit breakers, retry policies (idempotent-only retries), outlier detection
- **Observability**: Structured JSON access logs, distributed tracing (OTEL), Prometheus stats sink
- **Traffic management**: Canary via header routing, weighted splits, fault injection for chaos

## Directory Structure

```
envoy/
├── envoy.yaml                          # (keep) Existing edge proxy
├── edge/
│   ├── front-proxy.yaml                # Enhanced edge: TLS, HTTP/2, tracing, rate limiting
│   ├── tls/
│   │   └── tls-config.md               # Certificate management guide
│   └── rate-limiting/
│       └── rate-limit-config.yaml       # External rate limiting service config
├── sidecar/
│   ├── sidecar-base.yaml               # Base sidecar template (all services inherit)
│   ├── spring-boot-sidecar.yaml        # Spring Boot overrides (ports 8081-8086)
│   ├── go-sidecar.yaml                 # Go overrides (ports 5001-5019)
│   ├── elixir-sidecar.yaml             # Elixir overrides (ports 4001-4006)
│   ├── python-sidecar.yaml             # Python overrides (ports 5007-5020)
│   └── nestjs-sidecar.yaml             # NestJS overrides (ports 3000-3001)
├── mtls/
│   ├── mtls-config.yaml                # mTLS policy (STRICT, cert rotation)
│   ├── ca-config.md                    # Internal CA setup guide
│   └── spiffe-config.yaml              # SPIFFE identity framework
├── resilience/
│   ├── circuit-breakers.yaml           # Per-service circuit breaker thresholds
│   ├── retry-policies.yaml             # Retry strategies by service type
│   ├── outlier-detection.yaml          # Unhealthy host ejection
│   └── timeouts.yaml                   # Per-service timeout configs
├── observability/
│   ├── access-log-config.yaml          # Structured JSON access logging
│   ├── tracing-config.yaml             # Distributed tracing (OTEL/Jaeger)
│   └── metrics-config.yaml             # Prometheus stats sink
└── traffic/
    ├── traffic-splitting.yaml          # Canary, blue-green, header-based routing
    ├── fault-injection.yaml            # Chaos testing via fault injection
    └── load-balancing.yaml             # LB policies per service
```

## Sidecar Architecture

```
┌─────────────────────────────────────────────────┐
│                  Kubernetes Pod                  │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │  App Container│    │  Envoy Sidecar       │   │
│  │  (service)    │◄──►│  - mTLS termination  │   │
│  │  localhost:X  │    │  - Circuit breaking  │   │
│  └──────────────┘    │  - Retry policies    │   │
│                      │  - Access logging    │   │
│                      │  - Tracing headers   │   │
│                      │  - Prometheus stats  │   │
│                      └──────────┬───────────┘   │
└─────────────────────────────────┼───────────────┘
                                  │ mTLS
                                  ▼
                        Other service pods
```

## mTLS Configuration

| Setting | Value |
|---------|-------|
| Mode | STRICT (all traffic encrypted) |
| Identity | SPIFFE: `spiffe://quckapp.com/ns/quckapp/sa/<service>` |
| Algorithm | ECDSA P-256 |
| Cert lifetime | 24 hours |
| CA | Internal CA (cert-manager with self-signed root) |
| Rotation | Automatic via SDS (Secret Discovery Service) |

## Resilience Policies

### Circuit Breakers

| Service Tier | Max Connections | Max Pending | Max Requests | Max Retries |
|-------------|----------------|-------------|-------------|-------------|
| Critical (auth, gateway) | 2048 | 2048 | 2048 | 5 |
| Standard (most services) | 1024 | 1024 | 1024 | 3 |
| Batch (export, ETL) | 256 | 128 | 256 | 1 |

### Retry Policies

| Method | Retries | Retry-On | Backoff |
|--------|---------|----------|---------|
| GET/HEAD | 2 | 503,504,connect-failure,reset | 25ms base, 250ms max |
| POST/PUT/DELETE | 0 | — | — |
| Idempotent POST (marked) | 1 | 503,504 | 100ms base |

### Outlier Detection

| Setting | Value |
|---------|-------|
| Consecutive 5xx | 5 (eject after 5 failures) |
| Ejection time | 30 seconds |
| Max ejection % | 10% of hosts |
| Interval | 10 seconds |

## Timeout Matrix

| Service Type | Connect | Request | Idle |
|-------------|---------|---------|------|
| Auth/gateway | 3s | 10s | 300s |
| CRUD services | 3s | 10s | 120s |
| Search | 3s | 15s | 60s |
| File/media/attachment | 5s | 60s | 120s |
| ML/analytics | 5s | 60s | 60s |
| Export/ETL | 5s | 120s | 300s |
| WebSocket (Elixir) | 5s | 0s (no limit) | 3600s |

## Observability

| Component | Config |
|-----------|--------|
| Access logs | JSON format: timestamp, method, path, status, duration, upstream, x-request-id, trace-id |
| Tracing | OpenTelemetry collector (OTEL) at `otel-collector:4317`, 1% sampling in prod |
| Metrics | Prometheus stats sink on `:9901/stats/prometheus`, per-cluster and per-route |

## Traffic Management

| Feature | Config |
|---------|--------|
| Canary | Header `x-canary: true` routes to canary upstream |
| Weighted split | 90/10, 95/5, 99/1 weight configurations |
| Fault injection | Inject 500s (0.1%) or delays (100ms) for chaos testing |
| Load balancing | ROUND_ROBIN (default), LEAST_REQUEST (ML), RING_HASH (session sticky) |

## File Count

~24 new files across 6 new subdirectories, keeping the existing `envoy.yaml`.
