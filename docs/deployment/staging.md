---
sidebar_position: 6
---

# Staging Environment

The staging environment is a production-mirror used for final validation before deploying to production.

## Overview

| Aspect | Configuration |
|--------|---------------|
| **URL** | `https://staging.QuckApp.com` |
| **API** | `https://api.staging.QuckApp.com` |
| **Purpose** | Pre-production validation |
| **Data** | Production clone (sanitized) |
| **Deployment** | On release branch creation |
| **Access** | All teams |

## Infrastructure

Staging mirrors production infrastructure as closely as possible:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AWS - Staging Account                                   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        EKS Cluster (Staging)                           │  │
│  │                                                                        │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │  │
│  │  │ Backend │ │  Auth   │ │  User   │ │ Message │ │ Search  │  ...   │  │
│  │  │   x3    │ │   x3    │ │   x3    │ │   x3    │ │   x3    │        │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘        │  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────┐     │  │
│  │  │                    Istio Service Mesh                        │     │  │
│  │  └─────────────────────────────────────────────────────────────┘     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                        Data Layer                                   │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │    │
│  │  │   Aurora    │ │   Aurora    │ │  DocumentDB │ │ ElastiCache │  │    │
│  │  │  PostgreSQL │ │    MySQL    │ │   (Mongo)   │ │   Cluster   │  │    │
│  │  │  Multi-AZ   │ │  Multi-AZ   │ │   3-node    │ │   3-node    │  │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │    │
│  │                                                                     │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │    │
│  │  │     MSK     │ │ OpenSearch  │ │   S3/CDN    │                  │    │
│  │  │   Cluster   │ │   Cluster   │ │  (CloudFr.) │                  │    │
│  │  │   3-node    │ │   3-node    │ │             │                  │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘                  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Kubernetes Configuration

```yaml
# k8s/overlays/staging/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: QuckApp-staging

resources:
  - ../../base
  - istio-config.yaml
  - hpa.yaml
  - pdb.yaml

replicas:
  - name: backend
    count: 3
  - name: auth-service
    count: 3
  - name: user-service
    count: 3
  - name: message-service
    count: 3
  - name: search-service
    count: 3

images:
  - name: registry.QuckApp.dev/backend
    newTag: staging-latest
  - name: registry.QuckApp.dev/auth-service
    newTag: staging-latest

configMapGenerator:
  - name: app-config
    behavior: merge
    literals:
      - ENVIRONMENT=staging
      - LOG_LEVEL=info
      - ENABLE_SWAGGER=false
      - ENABLE_METRICS=true
      - ENABLE_TRACING=true

secretGenerator:
  - name: app-secrets
    behavior: merge
    literals:
      - JWT_ACCESS_SECRET=${STAGING_JWT_ACCESS_SECRET}
```

### Horizontal Pod Autoscaler

```yaml
# k8s/overlays/staging/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
  namespace: QuckApp-staging
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 3
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### Pod Disruption Budget

```yaml
# k8s/overlays/staging/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: backend-pdb
  namespace: QuckApp-staging
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: backend
```

## Environment Variables

```yaml
# k8s/overlays/staging/config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: staging-config
  namespace: QuckApp-staging
data:
  # Environment
  ENVIRONMENT: "staging"
  LOG_LEVEL: "info"

  # URLs
  API_URL: "https://api.staging.QuckApp.com"
  WS_URL: "wss://ws.staging.QuckApp.com"
  CDN_URL: "https://cdn.staging.QuckApp.com"

  # Database endpoints (Multi-AZ Aurora)
  POSTGRES_HOST: "QuckApp-staging.cluster-xxxxx.us-east-1.rds.amazonaws.com"
  POSTGRES_READ_HOST: "QuckApp-staging.cluster-ro-xxxxx.us-east-1.rds.amazonaws.com"
  MYSQL_HOST: "QuckApp-staging-mysql.cluster-xxxxx.us-east-1.rds.amazonaws.com"
  MONGODB_HOST: "QuckApp-staging-docdb.cluster-xxxxx.us-east-1.docdb.amazonaws.com"

  # Cache (Cluster mode)
  REDIS_HOST: "QuckApp-staging.xxxxx.clustercfg.use1.cache.amazonaws.com"
  REDIS_CLUSTER_MODE: "true"

  # Kafka (MSK Cluster)
  KAFKA_BROKERS: "b-1.QuckApp-staging.xxxxx.kafka.us-east-1.amazonaws.com:9092,b-2.QuckApp-staging.xxxxx.kafka.us-east-1.amazonaws.com:9092,b-3.QuckApp-staging.xxxxx.kafka.us-east-1.amazonaws.com:9092"

  # Elasticsearch (OpenSearch)
  ELASTICSEARCH_URL: "https://QuckApp-staging.us-east-1.es.amazonaws.com"

  # Feature Flags (production-like)
  ENABLE_SWAGGER: "false"
  ENABLE_DEBUG_ENDPOINTS: "false"
  ENABLE_MOCK_PAYMENTS: "false"
  RATE_LIMIT_MULTIPLIER: "1"
```

## CI/CD Pipeline

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging

on:
  push:
    branches:
      - 'release/*'
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to deploy'
        required: true

env:
  AWS_REGION: us-east-1
  EKS_CLUSTER: QuckApp-staging
  REGISTRY: registry.QuckApp.dev

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate release branch
        run: |
          if [[ ! "$GITHUB_REF" =~ ^refs/heads/release/ ]]; then
            echo "Error: Must deploy from release branch"
            exit 1
          fi

      - name: Run security scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'CRITICAL,HIGH'

  build:
    needs: validate
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.version }}
    steps:
      - uses: actions/checkout@v4

      - name: Extract version
        id: version
        run: |
          VERSION=$(echo $GITHUB_REF | sed 's/refs\/heads\/release\///')
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.STAGING_AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.STAGING_AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        run: |
          aws ecr get-login-password --region $AWS_REGION | \
          docker login --username AWS --password-stdin $REGISTRY

      - name: Build and push images
        run: |
          VERSION=${{ steps.version.outputs.version }}

          # Build all services
          for service in backend auth-service user-service message-service; do
            docker build -t $REGISTRY/$service:$VERSION ./$service
            docker build -t $REGISTRY/$service:staging-latest ./$service
            docker push $REGISTRY/$service:$VERSION
            docker push $REGISTRY/$service:staging-latest
          done

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.STAGING_AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.STAGING_AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name $EKS_CLUSTER

      - name: Run database migrations
        run: |
          kubectl apply -f k8s/jobs/migration-job.yaml -n QuckApp-staging
          kubectl wait --for=condition=complete job/db-migration -n QuckApp-staging --timeout=300s

      - name: Deploy to Staging
        run: |
          kubectl apply -k k8s/overlays/staging

          # Wait for all deployments
          for deploy in backend auth-service user-service message-service; do
            kubectl rollout status deployment/$deploy -n QuckApp-staging --timeout=300s
          done

      - name: Run smoke tests
        run: ./scripts/smoke-tests.sh https://api.staging.QuckApp.com

  performance-test:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run load tests
        run: |
          npm ci
          npm run test:load -- --env=staging --duration=10m

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: load-test-results
          path: load-test-results/

  notify:
    needs: [deploy, performance-test]
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: Notify Slack
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Staging deployment ${{ needs.deploy.result }}: v${{ needs.build.outputs.version }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Staging Deployment*\n• Version: v${{ needs.build.outputs.version }}\n• Status: ${{ needs.deploy.result }}\n• Performance: ${{ needs.performance-test.result }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_STAGING_WEBHOOK }}
```

## Staging Validation Checklist

Before promoting to production, validate:

```markdown
## Pre-Production Checklist

### Functional Testing
- [ ] All critical user flows work correctly
- [ ] Authentication/authorization works
- [ ] Real-time features (WebSocket) work
- [ ] File uploads work correctly
- [ ] Search functionality returns accurate results
- [ ] Notifications are delivered

### Performance Testing
- [ ] API response times < 200ms (p95)
- [ ] WebSocket latency < 100ms
- [ ] No memory leaks observed
- [ ] Database query performance acceptable
- [ ] Cache hit rates > 80%

### Security Validation
- [ ] SSL/TLS certificates valid
- [ ] Security headers present
- [ ] Rate limiting works
- [ ] CORS configured correctly
- [ ] No sensitive data in logs

### Infrastructure
- [ ] Auto-scaling works correctly
- [ ] Health checks passing
- [ ] Monitoring dashboards operational
- [ ] Alerts configured and working
- [ ] Backup/restore tested

### Documentation
- [ ] Release notes prepared
- [ ] API documentation updated
- [ ] Runbook updated
- [ ] Rollback plan documented
```

## Monitoring

| Tool | URL | Purpose |
|------|-----|---------|
| Grafana | https://grafana.staging.QuckApp.com | Metrics dashboards |
| Jaeger | https://jaeger.staging.QuckApp.com | Distributed tracing |
| Kibana | https://logs.staging.QuckApp.com | Log analysis |
| PagerDuty | Integrated | Alerting |

### Key Metrics to Monitor

```yaml
# prometheus/staging-alerts.yaml
groups:
  - name: staging-alerts
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) /
          sum(rate(http_requests_total[5m])) > 0.01
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate in staging"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency in staging"

      - alert: PodRestarting
        expr: |
          increase(kube_pod_container_status_restarts_total[1h]) > 3
        labels:
          severity: warning
        annotations:
          summary: "Pod restarting frequently"
```

## Data Synchronization

Staging receives sanitized production data snapshots:

```yaml
# k8s/overlays/staging/data-sync-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: staging-data-sync
  namespace: QuckApp-staging
spec:
  schedule: "0 2 * * 0"  # Every Sunday at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: data-sync
              image: registry.QuckApp.dev/db-tools:latest
              command:
                - /bin/sh
                - -c
                - |
                  # Restore from production snapshot
                  ./restore-from-snapshot.sh prod-sanitized-latest

                  # Run any staging-specific data modifications
                  ./staging-data-overrides.sh
              env:
                - name: DB_HOST
                  valueFrom:
                    secretKeyRef:
                      name: db-credentials
                      key: host
          restartPolicy: OnFailure
```

## Accessing Staging

### VPN Connection

```bash
# Connect to Staging VPN
openvpn --config QuckApp-staging.ovpn
```

### kubectl Access

```bash
# Configure kubectl for Staging
aws eks update-kubeconfig --name QuckApp-staging --region us-east-1

# Verify access
kubectl get pods -n QuckApp-staging

# Check deployment status
kubectl rollout status deployment/backend -n QuckApp-staging
```

## Rollback Procedure

```bash
#!/bin/bash
# scripts/rollback-staging.sh

PREVIOUS_VERSION=$1

if [ -z "$PREVIOUS_VERSION" ]; then
  echo "Usage: ./rollback-staging.sh <version>"
  echo "Available versions:"
  kubectl rollout history deployment/backend -n QuckApp-staging
  exit 1
fi

echo "Rolling back staging to version $PREVIOUS_VERSION..."

# Rollback all services
for service in backend auth-service user-service message-service; do
  kubectl set image deployment/$service \
    $service=registry.QuckApp.dev/$service:$PREVIOUS_VERSION \
    -n QuckApp-staging
done

# Wait for rollback
kubectl rollout status deployment/backend -n QuckApp-staging

echo "Rollback complete!"
```
