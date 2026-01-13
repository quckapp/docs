---
sidebar_position: 3
---

# Dev Environment

The development environment serves as the integration testing ground where all feature branches are merged and tested together.

## Overview

| Aspect | Configuration |
|--------|---------------|
| **URL** | `https://dev.QuikApp.com` |
| **API** | `https://api.dev.QuikApp.com` |
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

namespace: QuikApp-dev

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
  - name: registry.QuikApp.dev/backend
    newTag: develop
  - name: registry.QuikApp.dev/auth-service
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
  namespace: QuikApp-dev
data:
  # Environment
  ENVIRONMENT: "dev"
  LOG_LEVEL: "debug"

  # URLs
  API_URL: "https://api.dev.QuikApp.com"
  WS_URL: "wss://ws.dev.QuikApp.com"
  CDN_URL: "https://cdn.dev.QuikApp.com"

  # Database endpoints
  POSTGRES_HOST: "QuikApp-dev.cluster-xxxxx.us-east-1.rds.amazonaws.com"
  MYSQL_HOST: "QuikApp-dev-mysql.cluster-xxxxx.us-east-1.rds.amazonaws.com"
  MONGODB_HOST: "QuikApp-dev-docdb.cluster-xxxxx.us-east-1.docdb.amazonaws.com"

  # Cache
  REDIS_HOST: "QuikApp-dev.xxxxx.cache.amazonaws.com"

  # Kafka
  KAFKA_BROKERS: "b-1.QuikApp-dev.xxxxx.kafka.us-east-1.amazonaws.com:9092"

  # Elasticsearch
  ELASTICSEARCH_URL: "https://QuikApp-dev.us-east-1.es.amazonaws.com"

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
  EKS_CLUSTER: QuikApp-dev
  REGISTRY: registry.QuikApp.dev

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
          kubectl rollout status deployment/backend -n QuikApp-dev

      - name: Run smoke tests
        run: |
          ./scripts/smoke-tests.sh https://api.dev.QuikApp.com

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
psql -h QuikApp-dev.cluster-xxxxx.us-east-1.rds.amazonaws.com \
     -U QuikApp -d QuikApp

# Run migrations
kubectl exec -it deployment/backend -n QuikApp-dev -- \
  npm run migration:run

# Reset database (caution!)
kubectl exec -it deployment/backend -n QuikApp-dev -- \
  npm run db:reset && npm run db:seed
```

## Accessing Dev Environment

### VPN Connection

```bash
# Connect to Dev VPN
openvpn --config QuikApp-dev.ovpn

# Or AWS Client VPN
aws ec2 create-client-vpn-connection \
  --client-vpn-endpoint-id cvpn-endpoint-xxxxx
```

### kubectl Access

```bash
# Configure kubectl for Dev
aws eks update-kubeconfig --name QuikApp-dev --region us-east-1

# Verify access
kubectl get pods -n QuikApp-dev

# Port forward for debugging
kubectl port-forward svc/backend 3000:3000 -n QuikApp-dev
```

## Monitoring

| Tool | URL |
|------|-----|
| Grafana | https://grafana.dev.QuikApp.com |
| Jaeger | https://jaeger.dev.QuikApp.com |
| Kibana | https://logs.dev.QuikApp.com |

## Data Reset Schedule

Dev environment data is reset every Sunday at midnight UTC:

```yaml
# k8s/overlays/dev/data-reset-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: dev-data-reset
  namespace: QuikApp-dev
spec:
  schedule: "0 0 * * 0"  # Every Sunday at midnight
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: data-reset
              image: registry.QuikApp.dev/db-tools:latest
              command: ["/scripts/reset-dev-data.sh"]
          restartPolicy: OnFailure
```
