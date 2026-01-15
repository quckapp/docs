---
sidebar_position: 5
---

# Monitoring & Observability

QuckApp uses a comprehensive monitoring stack for metrics, logging, and distributed tracing.

## Stack Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Grafana                               │
│                  (Visualization & Alerting)                  │
└──────────┬─────────────────┬─────────────────┬──────────────┘
           │                 │                 │
           ▼                 ▼                 ▼
    ┌────────────┐    ┌────────────┐    ┌────────────┐
    │ Prometheus │    │   Loki     │    │   Jaeger   │
    │  (Metrics) │    │  (Logs)    │    │ (Tracing)  │
    └──────┬─────┘    └──────┬─────┘    └──────┬─────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │         Services            │
              │  (instrumented with SDKs)   │
              └─────────────────────────────┘
```

## Prometheus

### Configuration

```yaml
# prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - '/etc/prometheus/rules/*.yml'

scrape_configs:
  # Prometheus self-monitoring
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # NestJS Services
  - job_name: 'nestjs-services'
    metrics_path: /metrics
    static_configs:
      - targets:
          - 'backend:3000'
          - 'realtime:3001'
          - 'notification:3002'

  # Spring Boot Services
  - job_name: 'spring-services'
    metrics_path: /actuator/prometheus
    static_configs:
      - targets:
          - 'auth-service:8001'
          - 'user-service:8002'
          - 'permission-service:8003'
          - 'audit-service:8004'
          - 'admin-service:8005'

  # Go Services
  - job_name: 'go-services'
    metrics_path: /metrics
    static_configs:
      - targets:
          - 'workspace:6001'
          - 'channel:6002'
          - 'search:6003'
          - 'thread:6004'
          - 'bookmark:6005'

  # Python Services
  - job_name: 'python-services'
    metrics_path: /metrics
    static_configs:
      - targets:
          - 'analytics:5001'
          - 'moderation:5002'
          - 'ml:5006'

  # Elixir Services
  - job_name: 'elixir-services'
    metrics_path: /metrics
    static_configs:
      - targets:
          - 'presence:4001'
          - 'call:4002'
          - 'message:4003'

  # Infrastructure
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'kafka'
    static_configs:
      - targets: ['kafka-exporter:9308']

  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx-exporter:9113']
```

### Alert Rules

```yaml
# prometheus/rules/alerts.yml
groups:
  - name: service-alerts
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
          description: "{{ $labels.instance }} has been down for more than 1 minute"

      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
          /
          sum(rate(http_requests_total[5m])) by (service) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on {{ $labels.service }}"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)
          ) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency on {{ $labels.service }}"
          description: "P95 latency is {{ $value | humanizeDuration }}"

      - alert: HighMemoryUsage
        expr: |
          process_resident_memory_bytes / 1024 / 1024 / 1024 > 2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.job }}"
          description: "Memory usage is {{ $value | humanize }}GB"

  - name: kafka-alerts
    rules:
      - alert: KafkaConsumerLag
        expr: kafka_consumer_group_lag > 10000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High Kafka consumer lag"
          description: "Consumer group {{ $labels.group }} lag is {{ $value }}"

  - name: database-alerts
    rules:
      - alert: PostgresConnectionsHigh
        expr: pg_stat_activity_count > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High PostgreSQL connections"
          description: "{{ $value }} active connections"

      - alert: RedisMemoryHigh
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Redis memory usage high"
          description: "Memory usage is {{ $value | humanizePercentage }}"
```

## Grafana Dashboards

### Service Overview Dashboard

```json
{
  "dashboard": {
    "title": "QuckApp Services Overview",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [{
          "expr": "sum(rate(http_requests_total[5m])) by (service)"
        }]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [{
          "expr": "sum(rate(http_requests_total{status=~\"5..\"}[5m])) by (service)"
        }]
      },
      {
        "title": "P95 Latency",
        "type": "graph",
        "targets": [{
          "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))"
        }]
      },
      {
        "title": "Active Connections",
        "type": "stat",
        "targets": [{
          "expr": "sum(websocket_connections_active)"
        }]
      }
    ]
  }
}
```

## Loki (Logging)

### Configuration

```yaml
# loki/loki-config.yml
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1

schema_config:
  configs:
    - from: 2024-01-01
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki/index
    cache_location: /loki/cache
  filesystem:
    directory: /loki/chunks

limits_config:
  retention_period: 30d
```

### Promtail Configuration

```yaml
# promtail/promtail-config.yml
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: containers
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        target_label: 'container'
      - source_labels: ['__meta_docker_container_log_stream']
        target_label: 'stream'
    pipeline_stages:
      - json:
          expressions:
            level: level
            message: msg
            service: service
      - labels:
          level:
          service:
```

## Jaeger (Tracing)

### Configuration

```yaml
# jaeger/jaeger-config.yml
collector:
  zipkin:
    host-port: ":9411"
  otlp:
    enabled: true
    grpc:
      host-port: ":4317"
    http:
      host-port: ":4318"

storage:
  type: elasticsearch
  elasticsearch:
    server-urls: http://elasticsearch:9200
    index-prefix: jaeger

query:
  base-path: /jaeger
```

### Service Instrumentation

#### NestJS

```typescript
// tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';

const sdk = new NodeSDK({
  serviceName: 'backend-service',
  traceExporter: new JaegerExporter({
    endpoint: 'http://jaeger:14268/api/traces'
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new NestInstrumentation()
  ]
});

sdk.start();
```

#### Spring Boot

```yaml
# application.yml
management:
  tracing:
    sampling:
      probability: 1.0
  zipkin:
    tracing:
      endpoint: http://jaeger:9411/api/v2/spans
```

#### Go

```go
// tracing.go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/jaeger"
    "go.opentelemetry.io/otel/sdk/trace"
)

func initTracer() (*trace.TracerProvider, error) {
    exporter, err := jaeger.New(
        jaeger.WithCollectorEndpoint(
            jaeger.WithEndpoint("http://jaeger:14268/api/traces"),
        ),
    )
    if err != nil {
        return nil, err
    }

    tp := trace.NewTracerProvider(
        trace.WithBatcher(exporter),
        trace.WithResource(resource.NewWithAttributes(
            semconv.ServiceNameKey.String("workspace-service"),
        )),
    )
    otel.SetTracerProvider(tp)
    return tp, nil
}
```

## Key Metrics by Service

| Service | Key Metrics |
|---------|-------------|
| Backend Gateway | Request rate, latency, error rate |
| Auth Service | Login attempts, token generation, failures |
| Message Service | Messages/sec, delivery latency |
| Realtime Service | WebSocket connections, message throughput |
| Search Service | Query latency, index size |
| Analytics Service | Events processed, processing latency |

## Docker Compose for Monitoring

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:v2.47.0
    volumes:
      - ./prometheus:/etc/prometheus
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=15d'
    ports:
      - "9090:9090"
    networks:
      - QuckApp-network

  grafana:
    image: grafana/grafana:10.1.0
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    ports:
      - "3030:3000"
    networks:
      - QuckApp-network

  loki:
    image: grafana/loki:2.9.0
    volumes:
      - ./loki:/etc/loki
      - loki_data:/loki
    command: -config.file=/etc/loki/loki-config.yml
    ports:
      - "3100:3100"
    networks:
      - QuckApp-network

  promtail:
    image: grafana/promtail:2.9.0
    volumes:
      - ./promtail:/etc/promtail
      - /var/run/docker.sock:/var/run/docker.sock
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
    command: -config.file=/etc/promtail/promtail-config.yml
    networks:
      - QuckApp-network

  jaeger:
    image: jaegertracing/all-in-one:1.50
    environment:
      - COLLECTOR_OTLP_ENABLED=true
    ports:
      - "16686:16686"
      - "14268:14268"
      - "4317:4317"
    networks:
      - QuckApp-network

volumes:
  prometheus_data:
  grafana_data:
  loki_data:

networks:
  QuckApp-network:
    external: true
```
