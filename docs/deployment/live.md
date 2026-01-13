---
sidebar_position: 8
---

# Live Environment

The live environment serves actual end users and implements blue/green deployment for zero-downtime releases.

## Overview

| Aspect | Configuration |
|--------|---------------|
| **URL** | `https://QuikApp.com` / `https://app.QuikApp.com` |
| **API** | `https://api.QuikApp.com` |
| **Purpose** | Active production serving end users |
| **Data** | Real user data |
| **Deployment** | Blue/Green with traffic shifting |
| **Access** | End users (public) |

## Blue/Green Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AWS - Live Account                                  │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                          Route 53                                        │   │
│  │                     api.QuikApp.com                                     │   │
│  │              (Weighted routing: Blue 100% / Green 0%)                    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                           │                     │                               │
│              ┌────────────┘                     └────────────┐                  │
│              │                                               │                  │
│              ▼                                               ▼                  │
│  ┌───────────────────────────────┐           ┌───────────────────────────────┐ │
│  │         BLUE STACK            │           │        GREEN STACK            │ │
│  │        (ACTIVE)               │           │        (STANDBY)              │ │
│  │                               │           │                               │ │
│  │  ┌─────────────────────────┐ │           │  ┌─────────────────────────┐ │ │
│  │  │   CloudFront + ALB      │ │           │  │   CloudFront + ALB      │ │ │
│  │  └─────────────────────────┘ │           │  └─────────────────────────┘ │ │
│  │              │                │           │              │                │ │
│  │  ┌─────────────────────────┐ │           │  ┌─────────────────────────┐ │ │
│  │  │    EKS Blue Cluster     │ │           │  │   EKS Green Cluster     │ │ │
│  │  │                         │ │           │  │                         │ │ │
│  │  │  Backend    x10         │ │           │  │  Backend    x10         │ │ │
│  │  │  Auth       x10         │ │           │  │  Auth       x10         │ │ │
│  │  │  User       x10         │ │           │  │  User       x10         │ │ │
│  │  │  Message    x10         │ │           │  │  Message    x10         │ │ │
│  │  │  ...                    │ │           │  │  ...                    │ │ │
│  │  └─────────────────────────┘ │           │  └─────────────────────────┘ │ │
│  └───────────────────────────────┘           └───────────────────────────────┘ │
│                           │                               │                     │
│                           └───────────┬───────────────────┘                     │
│                                       │                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                      SHARED DATA LAYER                                   │   │
│  │                                                                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │   Aurora    │  │   Aurora    │  │  DocumentDB │  │   S3/CDN    │    │   │
│  │  │ PostgreSQL  │  │   MySQL     │  │   Cluster   │  │             │    │   │
│  │  │ Global DB   │  │ Global DB   │  │  Global     │  │  Global     │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  │                                                                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     │   │
│  │  │ ElastiCache │  │     MSK     │  │  OpenSearch │                     │   │
│  │  │  Global     │  │   Cluster   │  │   Cluster   │                     │   │
│  │  │             │  │             │  │             │                     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Kubernetes Configuration

### Blue Stack

```yaml
# k8s/overlays/live-blue/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: QuikApp-live-blue

resources:
  - ../../base
  - istio-config.yaml
  - hpa.yaml
  - pdb.yaml
  - network-policies.yaml

replicas:
  - name: backend
    count: 10
  - name: auth-service
    count: 10
  - name: user-service
    count: 10
  - name: message-service
    count: 10
  - name: search-service
    count: 5
  - name: notification-service
    count: 5
  - name: presence-service
    count: 5
  - name: realtime-service
    count: 8

images:
  - name: registry.QuikApp.dev/backend
    newTag: live-v2.5.0
  - name: registry.QuikApp.dev/auth-service
    newTag: live-v2.5.0

configMapGenerator:
  - name: app-config
    behavior: merge
    literals:
      - ENVIRONMENT=live
      - STACK=blue
      - LOG_LEVEL=warn
      - ENABLE_METRICS=true
      - ENABLE_TRACING=true
```

### Green Stack

```yaml
# k8s/overlays/live-green/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: QuikApp-live-green

resources:
  - ../../base
  - istio-config.yaml
  - hpa.yaml
  - pdb.yaml
  - network-policies.yaml

replicas:
  - name: backend
    count: 10
  - name: auth-service
    count: 10
  - name: user-service
    count: 10
  - name: message-service
    count: 10
  - name: search-service
    count: 5
  - name: notification-service
    count: 5
  - name: presence-service
    count: 5
  - name: realtime-service
    count: 8

images:
  - name: registry.QuikApp.dev/backend
    newTag: live-v2.6.0  # New version
  - name: registry.QuikApp.dev/auth-service
    newTag: live-v2.6.0

configMapGenerator:
  - name: app-config
    behavior: merge
    literals:
      - ENVIRONMENT=live
      - STACK=green
      - LOG_LEVEL=warn
      - ENABLE_METRICS=true
      - ENABLE_TRACING=true
```

## Deployment Process

### Blue/Green Switch Script

```bash
#!/bin/bash
# scripts/blue-green-switch.sh

CURRENT_STACK=$1  # blue or green
NEW_STACK=$2      # green or blue
VERSION=$3

# Validate inputs
if [[ ! "$CURRENT_STACK" =~ ^(blue|green)$ ]] || [[ ! "$NEW_STACK" =~ ^(blue|green)$ ]]; then
  echo "Usage: ./blue-green-switch.sh <current_stack> <new_stack> <version>"
  exit 1
fi

echo "=== Blue/Green Deployment ==="
echo "Current: $CURRENT_STACK -> New: $NEW_STACK"
echo "Version: $VERSION"

# Step 1: Deploy to inactive stack
echo "Step 1: Deploying v$VERSION to $NEW_STACK stack..."
kubectl apply -k k8s/overlays/live-$NEW_STACK

# Wait for deployment
for deploy in backend auth-service user-service message-service; do
  kubectl rollout status deployment/$deploy -n QuikApp-live-$NEW_STACK --timeout=600s
done

# Step 2: Run health checks on new stack
echo "Step 2: Running health checks on $NEW_STACK..."
./scripts/health-check.sh https://api-$NEW_STACK.QuikApp.com

# Step 3: Gradual traffic shift
echo "Step 3: Starting traffic shift..."

# 10% to new stack
echo "  -> Shifting 10% traffic to $NEW_STACK..."
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://route53/traffic-10-$NEW_STACK.json
sleep 300  # 5 minutes

# Validate metrics
./scripts/validate-metrics.sh $NEW_STACK || {
  echo "Metrics validation failed, rolling back..."
  ./scripts/rollback-traffic.sh $CURRENT_STACK
  exit 1
}

# 50% to new stack
echo "  -> Shifting 50% traffic to $NEW_STACK..."
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://route53/traffic-50-$NEW_STACK.json
sleep 600  # 10 minutes

./scripts/validate-metrics.sh $NEW_STACK || {
  echo "Metrics validation failed, rolling back..."
  ./scripts/rollback-traffic.sh $CURRENT_STACK
  exit 1
}

# 100% to new stack
echo "  -> Shifting 100% traffic to $NEW_STACK..."
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://route53/traffic-100-$NEW_STACK.json

# Step 4: Update stack status
echo "Step 4: Updating stack configuration..."
kubectl annotate deployment/backend \
  -n QuikApp-live-$NEW_STACK \
  deployment.QuikApp.com/active="true" --overwrite

kubectl annotate deployment/backend \
  -n QuikApp-live-$CURRENT_STACK \
  deployment.QuikApp.com/active="false" --overwrite

echo "=== Deployment Complete ==="
echo "Active stack: $NEW_STACK (v$VERSION)"
echo "Standby stack: $CURRENT_STACK"
```

### Traffic Configuration

```json
// route53/traffic-10-green.json
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.QuikApp.com",
        "Type": "A",
        "SetIdentifier": "blue",
        "Weight": 90,
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "d1234567890.cloudfront.net",
          "EvaluateTargetHealth": true
        }
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.QuikApp.com",
        "Type": "A",
        "SetIdentifier": "green",
        "Weight": 10,
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "d0987654321.cloudfront.net",
          "EvaluateTargetHealth": true
        }
      }
    }
  ]
}
```

## Auto-Scaling Configuration

```yaml
# k8s/overlays/live-blue/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
  namespace: QuikApp-live-blue
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 10
  maxReplicas: 50
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        - type: Pods
          value: 10
          periodSeconds: 30
        - type: Percent
          value: 100
          periodSeconds: 30
      selectPolicy: Max
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 70
    - type: External
      external:
        metric:
          name: sqs_queue_depth
          selector:
            matchLabels:
              queue: QuikApp-tasks
        target:
          type: AverageValue
          averageValue: "100"
```

## Global Distribution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CloudFront Global Distribution                       │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  US-East    │  │  US-West    │  │   EU-West   │  │ AP-Southeast│       │
│  │  (Primary)  │  │  (Replica)  │  │  (Replica)  │  │  (Replica)  │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│         │                │                │                │               │
│         ▼                ▼                ▼                ▼               │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     Aurora Global Database                           │  │
│  │  Primary: us-east-1  │  Replicas: us-west-2, eu-west-1, ap-southeast │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     ElastiCache Global Datastore                     │  │
│  │  Primary: us-east-1  │  Replicas: us-west-2, eu-west-1              │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Monitoring & Alerting

### Critical Alerts

```yaml
# prometheus/live-alerts.yaml
groups:
  - name: live-critical
    rules:
      - alert: LiveHighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5..",environment="live"}[1m])) /
          sum(rate(http_requests_total{environment="live"}[1m])) > 0.001
        for: 1m
        labels:
          severity: critical
          environment: live
          pagerduty: "true"
        annotations:
          summary: "CRITICAL: Live environment error rate > 0.1%"
          runbook: "https://runbooks.QuikApp.com/live-high-error-rate"

      - alert: LiveHighLatency
        expr: |
          histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{environment="live"}[1m])) > 0.5
        for: 2m
        labels:
          severity: critical
          environment: live
          pagerduty: "true"
        annotations:
          summary: "CRITICAL: Live P99 latency > 500ms"

      - alert: LiveServiceDown
        expr: |
          up{environment="live"} == 0
        for: 30s
        labels:
          severity: critical
          environment: live
          pagerduty: "true"
        annotations:
          summary: "CRITICAL: Live service is down"

      - alert: LiveDatabaseConnectionPoolExhausted
        expr: |
          pg_stat_activity_count{environment="live"} / pg_settings_max_connections > 0.9
        for: 2m
        labels:
          severity: critical
          environment: live
        annotations:
          summary: "Database connection pool at 90% capacity"

      - alert: LiveKafkaConsumerLag
        expr: |
          kafka_consumer_group_lag{environment="live"} > 50000
        for: 5m
        labels:
          severity: warning
          environment: live
        annotations:
          summary: "Kafka consumer lag is high"
```

### Real-time Dashboard

```yaml
# grafana/live-dashboard.yaml
dashboard:
  title: "QuikApp Live Dashboard"
  refresh: "5s"

  panels:
    - title: "Request Rate"
      type: graph
      targets:
        - expr: 'sum(rate(http_requests_total{environment="live"}[1m]))'

    - title: "Error Rate"
      type: stat
      targets:
        - expr: |
            sum(rate(http_requests_total{status=~"5..",environment="live"}[1m])) /
            sum(rate(http_requests_total{environment="live"}[1m])) * 100

    - title: "P99 Latency"
      type: gauge
      targets:
        - expr: 'histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{environment="live"}[1m]))'

    - title: "Active Users"
      type: stat
      targets:
        - expr: 'sum(presence_active_users{environment="live"})'

    - title: "Messages/sec"
      type: graph
      targets:
        - expr: 'sum(rate(messages_sent_total{environment="live"}[1m]))'

    - title: "WebSocket Connections"
      type: stat
      targets:
        - expr: 'sum(websocket_connections_active{environment="live"})'
```

## Incident Response

### Instant Rollback

```bash
#!/bin/bash
# scripts/emergency-rollback.sh

# Get current active stack
ACTIVE_STACK=$(kubectl get deployment/backend -n QuikApp-live-blue \
  -o jsonpath='{.metadata.annotations.deployment\.QuikApp\.com/active}')

if [ "$ACTIVE_STACK" == "true" ]; then
  CURRENT="blue"
  STANDBY="green"
else
  CURRENT="green"
  STANDBY="blue"
fi

echo "=== EMERGENCY ROLLBACK ==="
echo "Switching from $CURRENT to $STANDBY immediately"

# Instant traffic switch (no gradual shift)
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://route53/traffic-100-$STANDBY.json

echo "Traffic switched to $STANDBY stack"
echo "Creating incident record..."

./scripts/create-incident.sh "Emergency rollback from $CURRENT to $STANDBY"
```

### On-Call Procedures

```markdown
## Live Incident Response

### Severity Levels

| Level | Response Time | Criteria |
|-------|---------------|----------|
| SEV1 | Immediate | Complete outage, data loss risk |
| SEV2 | 15 minutes | Partial outage, degraded service |
| SEV3 | 1 hour | Minor impact, workaround available |
| SEV4 | 24 hours | No user impact, monitoring alert |

### Escalation Path

1. On-call Engineer (PagerDuty)
2. Engineering Lead
3. VP Engineering
4. CTO

### Quick Actions

1. **Service Down**: Run emergency rollback
2. **High Error Rate**: Check recent deployments, consider rollback
3. **High Latency**: Scale up, check database connections
4. **Database Issues**: Failover to replica
```

## SLA Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Uptime | 99.99% | Monthly |
| API Latency (P50) | < 100ms | Real-time |
| API Latency (P99) | < 500ms | Real-time |
| Error Rate | < 0.1% | Real-time |
| Time to Recovery | < 5 minutes | Per incident |

## Access Control

Live environment has the strictest access controls:

```yaml
# rbac/live-rbac.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: live-readonly
rules:
  - apiGroups: [""]
    resources: ["pods", "services"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: live-operator
rules:
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch", "patch"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: live-admin
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]
```

Access requirements:
- VPN with hardware token (YubiKey)
- MFA on all accounts
- Just-in-time access approval
- Full audit logging
- Break-glass procedures documented
