---
sidebar_position: 3
---

# Dev Environment

The development environment serves as the integration testing ground where all feature branches are merged and tested together.

## Overview

| Aspect | Configuration |
|--------|---------------|
| **URL** | `https://dev.QuckApp.com` |
| **API** | `https://api.dev.QuckApp.com` |
| **Purpose** | Integration testing, feature validation |
| **Data** | Synthetic test data |
| **Deployment** | Automatic on commit to `develop` branch |
| **Access** | Development team |

## Infrastructure

```
┌─────────────────────────────────────────────────────────────────┐
│                     AWS - Dev Account                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    EKS Cluster (Dev)                       │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │  │
│  │  │ Backend │ │  Auth   │ │  User   │ │ Search  │  ...    │  │
│  │  │   x1    │ │   x1    │ │   x1    │ │   x1    │         │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  RDS (Dev)  │  │ ElastiCache │  │    MSK      │             │
│  │  Shared DB  │  │   Shared    │  │   Shared    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Kubernetes Configuration

```yaml
# k8s/overlays/dev/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: QuckApp

resources:
  - ../../base

replicas:
  - name: backend
    count: 1
  - name: auth-service
    count: 1
  - name: user-service
    count: 1

images:
  - name: registry.QuckApp.dev/backend
    newTag: develop
  - name: registry.QuckApp.dev/auth-service
    newTag: develop

configMapGenerator:
  - name: app-config
    behavior: merge
    literals:
      - ENVIRONMENT=dev
      - LOG_LEVEL=debug
      - ENABLE_SWAGGER=true
      - ENABLE_DEBUG_ENDPOINTS=true

secretGenerator:
  - name: app-secrets
    behavior: merge
    literals:
      - JWT_ACCESS_SECRET=${DEV_JWT_ACCESS_SECRET}
```

## Environment Variables

```yaml
# k8s/overlays/dev/config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: dev-config
  namespace: QuckApp
data:
  # Environment
  ENVIRONMENT: "dev"
  LOG_LEVEL: "debug"

  # URLs
  API_URL: "https://api.dev.QuckApp.com"
  WS_URL: "wss://ws.dev.QuckApp.com"
  CDN_URL: "https://cdn.dev.QuckApp.com"

  # Database endpoints
  POSTGRES_HOST: "QuckApp.cluster-xxxxx.us-east-1.rds.amazonaws.com"
  MYSQL_HOST: "QuckApp-mysql.cluster-xxxxx.us-east-1.rds.amazonaws.com"
  MONGODB_HOST: "QuckApp-docdb.cluster-xxxxx.us-east-1.docdb.amazonaws.com"

  # Cache
  REDIS_HOST: "QuckApp.xxxxx.cache.amazonaws.com"

  # Kafka
  KAFKA_BROKERS: "b-1.QuckApp.xxxxx.kafka.us-east-1.amazonaws.com:9092"

  # Elasticsearch
  ELASTICSEARCH_URL: "https://QuckApp.us-east-1.es.amazonaws.com"

  # Feature Flags
  ENABLE_SWAGGER: "true"
  ENABLE_DEBUG_ENDPOINTS: "true"
  ENABLE_MOCK_PAYMENTS: "true"
  RATE_LIMIT_MULTIPLIER: "10"
```

## CI/CD Pipeline

```yaml
# .github/workflows/deploy-dev.yml
name: Deploy to Dev

on:
  push:
    branches: [develop]

env:
  AWS_REGION: us-east-1
  EKS_CLUSTER: QuckApp
  REGISTRY: registry.QuckApp.dev

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.DEV_AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.DEV_AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        run: |
          aws ecr get-login-password --region $AWS_REGION | \
          docker login --username AWS --password-stdin $REGISTRY

      - name: Build and push images
        run: |
          docker build -t $REGISTRY/backend:develop ./backend
          docker push $REGISTRY/backend:develop

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name $EKS_CLUSTER

      - name: Deploy to Dev
        run: |
          kubectl apply -k k8s/overlays/dev
          kubectl rollout status deployment/backend -n QuckApp

      - name: Run smoke tests
        run: |
          ./scripts/smoke-tests.sh https://api.dev.QuckApp.com

      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Dev deployment ${{ job.status }}: ${{ github.sha }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_DEV_WEBHOOK }}
```

## Database Management

```bash
# Connect to Dev PostgreSQL
psql -h QuckApp.cluster-xxxxx.us-east-1.rds.amazonaws.com \
     -U QuckApp -d QuckApp

# Run migrations
kubectl exec -it deployment/backend -n QuckApp -- \
  npm run migration:run

# Reset database (caution!)
kubectl exec -it deployment/backend -n QuckApp -- \
  npm run db:reset && npm run db:seed
```

## Accessing Dev Environment

### VPN Connection

```bash
# Connect to Dev VPN
openvpn --config QuckApp.ovpn

# Or AWS Client VPN
aws ec2 create-client-vpn-connection \
  --client-vpn-endpoint-id cvpn-endpoint-xxxxx
```

### kubectl Access

```bash
# Configure kubectl for Dev
aws eks update-kubeconfig --name QuckApp --region us-east-1

# Verify access
kubectl get pods -n QuckApp

# Port forward for debugging
kubectl port-forward svc/backend 3000:3000 -n QuckApp
```

## Monitoring

| Tool | URL |
|------|-----|
| Grafana | https://grafana.dev.QuckApp.com |
| Jaeger | https://jaeger.dev.QuckApp.com |
| Kibana | https://logs.dev.QuckApp.com |

## Data Reset Schedule

Dev environment data is reset every Sunday at midnight UTC:

```yaml
# k8s/overlays/dev/data-reset-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: dev-data-reset
  namespace: QuckApp
spec:
  schedule: "0 0 * * 0"  # Every Sunday at midnight
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: data-reset
              image: registry.QuckApp.dev/db-tools:latest
              command: ["/scripts/reset-dev-data.sh"]
          restartPolicy: OnFailure
```
