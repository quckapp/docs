---
sidebar_position: 4
---

# QA Environment

The QA environment is dedicated to quality assurance testing with automated test suites and manual testing by the QA team.

## Overview

| Aspect | Configuration |
|--------|---------------|
| **URL** | `https://qa.QuckApp.com` |
| **API** | `https://api.qa.QuckApp.com` |
| **Purpose** | Quality assurance testing |
| **Data** | Test data (automated + manual) |
| **Deployment** | On PR merge to `main` |
| **Access** | QA team, developers |

## Infrastructure

```
┌─────────────────────────────────────────────────────────────────┐
│                     AWS - QA Account                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    EKS Cluster (QA)                        │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │  │
│  │  │ Backend │ │  Auth   │ │  User   │ │ Search  │  ...    │  │
│  │  │   x2    │ │   x2    │ │   x2    │ │   x2    │         │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  RDS (QA)   │  │ ElastiCache │  │    MSK      │             │
│  │  Dedicated  │  │  Dedicated  │  │   Shared    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Kubernetes Configuration

```yaml
# k8s/overlays/qa/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: QuckApp-qa

resources:
  - ../../base

replicas:
  - name: backend
    count: 2
  - name: auth-service
    count: 2
  - name: user-service
    count: 2
  - name: message-service
    count: 2

images:
  - name: registry.QuckApp.dev/backend
    newTag: qa-latest
  - name: registry.QuckApp.dev/auth-service
    newTag: qa-latest

configMapGenerator:
  - name: app-config
    behavior: merge
    literals:
      - ENVIRONMENT=qa
      - LOG_LEVEL=info
      - ENABLE_SWAGGER=true
      - ENABLE_TEST_ENDPOINTS=true

secretGenerator:
  - name: app-secrets
    behavior: merge
    literals:
      - JWT_ACCESS_SECRET=${QA_JWT_ACCESS_SECRET}
```

## Environment Variables

```yaml
# k8s/overlays/qa/config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: qa-config
  namespace: QuckApp-qa
data:
  # Environment
  ENVIRONMENT: "qa"
  LOG_LEVEL: "info"

  # URLs
  API_URL: "https://api.qa.QuckApp.com"
  WS_URL: "wss://ws.qa.QuckApp.com"
  CDN_URL: "https://cdn.qa.QuckApp.com"

  # Database endpoints
  POSTGRES_HOST: "QuckApp-qa.cluster-xxxxx.us-east-1.rds.amazonaws.com"
  MYSQL_HOST: "QuckApp-qa-mysql.cluster-xxxxx.us-east-1.rds.amazonaws.com"
  MONGODB_HOST: "QuckApp-qa-docdb.cluster-xxxxx.us-east-1.docdb.amazonaws.com"

  # Cache
  REDIS_HOST: "QuckApp-qa.xxxxx.cache.amazonaws.com"

  # Kafka
  KAFKA_BROKERS: "b-1.QuckApp-qa.xxxxx.kafka.us-east-1.amazonaws.com:9092"

  # Elasticsearch
  ELASTICSEARCH_URL: "https://QuckApp-qa.us-east-1.es.amazonaws.com"

  # Feature Flags
  ENABLE_SWAGGER: "true"
  ENABLE_TEST_ENDPOINTS: "true"
  ENABLE_MOCK_PAYMENTS: "true"
  RATE_LIMIT_MULTIPLIER: "5"
```

## CI/CD Pipeline

```yaml
# .github/workflows/deploy-qa.yml
name: Deploy to QA

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  AWS_REGION: us-east-1
  EKS_CLUSTER: QuckApp-qa
  REGISTRY: registry.QuckApp.dev

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run unit tests
        run: |
          npm ci
          npm run test:ci

      - name: Run integration tests
        run: npm run test:integration

  build-and-deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.QA_AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.QA_AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        run: |
          aws ecr get-login-password --region $AWS_REGION | \
          docker login --username AWS --password-stdin $REGISTRY

      - name: Build and push images
        run: |
          docker build -t $REGISTRY/backend:qa-${{ github.sha }} ./backend
          docker build -t $REGISTRY/backend:qa-latest ./backend
          docker push $REGISTRY/backend:qa-${{ github.sha }}
          docker push $REGISTRY/backend:qa-latest

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name $EKS_CLUSTER

      - name: Deploy to QA
        run: |
          kubectl apply -k k8s/overlays/qa
          kubectl rollout status deployment/backend -n QuckApp-qa --timeout=300s

  run-tests:
    needs: build-and-deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run smoke tests
        run: ./scripts/smoke-tests.sh https://api.qa.QuckApp.com

      - name: Run E2E tests
        run: |
          npm ci
          npx playwright install --with-deps
          npm run test:e2e -- --project=qa

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: qa-test-results
          path: test-results/

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "QA deployment tests FAILED: ${{ github.sha }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_QA_WEBHOOK }}
```

## Automated Testing

### Test Suites

```yaml
# qa-tests/config.yaml
environments:
  qa:
    base_url: https://api.qa.QuckApp.com
    ws_url: wss://ws.qa.QuckApp.com

test_suites:
  smoke:
    description: Basic health checks
    timeout: 5m
    tests:
      - health_check
      - auth_flow
      - basic_messaging

  regression:
    description: Full regression suite
    timeout: 60m
    schedule: "0 2 * * *"  # Every night at 2 AM
    tests:
      - user_management
      - workspace_operations
      - channel_crud
      - message_operations
      - file_uploads
      - search_functionality
      - notifications
      - real_time_events

  performance:
    description: Performance benchmarks
    timeout: 30m
    schedule: "0 3 * * 0"  # Every Sunday at 3 AM
    tests:
      - api_latency
      - concurrent_users
      - message_throughput
```

### Test Data Management

```bash
#!/bin/bash
# scripts/qa-data-setup.sh

echo "Setting up QA test data..."

# Create test users
curl -X POST https://api.qa.QuckApp.com/admin/seed \
  -H "Authorization: Bearer $QA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "users": 100,
    "workspaces": 10,
    "channels_per_workspace": 20,
    "messages_per_channel": 1000
  }'

# Create specific test scenarios
./scripts/create-qa-scenarios.sh

echo "QA data setup complete!"
```

## Test Users

| Email | Password | Role | Purpose |
|-------|----------|------|---------|
| qa.admin@QuckApp.com | QaAdmin123! | Super Admin | Administrative testing |
| qa.owner@QuckApp.com | QaOwner123! | Workspace Owner | Workspace management testing |
| qa.member@QuckApp.com | QaMember123! | Member | General feature testing |
| qa.guest@QuckApp.com | QaGuest123! | Guest | Limited access testing |
| qa.bot@QuckApp.com | QaBot123! | Bot | Integration testing |

## Monitoring

| Tool | URL | Purpose |
|------|-----|---------|
| Grafana | https://grafana.qa.QuckApp.com | Metrics dashboards |
| Jaeger | https://jaeger.qa.QuckApp.com | Distributed tracing |
| Kibana | https://logs.qa.QuckApp.com | Log analysis |
| TestRail | https://testrail.QuckApp.com | Test management |
| Allure | https://allure.qa.QuckApp.com | Test reports |

## Test Result Integration

```yaml
# k8s/overlays/qa/test-reporter.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: qa-test-reporter
  namespace: QuckApp-qa
spec:
  schedule: "0 8 * * 1-5"  # Weekdays at 8 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: reporter
              image: registry.QuckApp.dev/test-reporter:latest
              env:
                - name: SLACK_WEBHOOK
                  valueFrom:
                    secretKeyRef:
                      name: qa-secrets
                      key: slack-webhook
                - name: TESTRAIL_API_KEY
                  valueFrom:
                    secretKeyRef:
                      name: qa-secrets
                      key: testrail-api-key
              command:
                - /bin/sh
                - -c
                - |
                  ./generate-daily-report.sh
                  ./push-to-testrail.sh
                  ./notify-slack.sh
          restartPolicy: OnFailure
```

## Data Reset Schedule

QA environment data is reset every Monday at midnight UTC:

```yaml
# k8s/overlays/qa/data-reset-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: qa-data-reset
  namespace: QuckApp-qa
spec:
  schedule: "0 0 * * 1"  # Every Monday at midnight
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: data-reset
              image: registry.QuckApp.dev/db-tools:latest
              command: ["/scripts/reset-qa-data.sh"]
              env:
                - name: PRESERVE_TEST_USERS
                  value: "true"
                - name: PRESERVE_TEST_WORKSPACES
                  value: "true"
          restartPolicy: OnFailure
```

## Accessing QA Environment

### VPN Connection

```bash
# Connect to QA VPN
openvpn --config QuckApp-qa.ovpn

# Or AWS Client VPN
aws ec2 create-client-vpn-connection \
  --client-vpn-endpoint-id cvpn-endpoint-qa-xxxxx
```

### kubectl Access

```bash
# Configure kubectl for QA
aws eks update-kubeconfig --name QuckApp-qa --region us-east-1

# Verify access
kubectl get pods -n QuckApp-qa

# View test pod logs
kubectl logs -f deployment/test-runner -n QuckApp-qa
```
