---
sidebar_position: 3
---

# Kubernetes Environments

This document covers Kubernetes deployment configurations for all QuckApp environments using Kustomize.

## Directory Structure

```
k8s/
├── base/                    # Base manifests (shared)
│   ├── kustomization.yaml
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── api-deployment.yaml
│   ├── worker-deployment.yaml
│   ├── thumbnail-worker-deployment.yaml
│   ├── notification-worker-deployment.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   ├── pdb.yaml
│   └── servicemonitor.yaml
│
└── overlays/
    ├── dev/                 # Development
    ├── qa/                  # QA Testing
    ├── uat1/                # UAT Team A
    ├── uat2/                # UAT Team B
    ├── uat3/                # UAT External/Security
    ├── staging/             # Pre-production
    ├── prod/                # Production
    └── live/                # Live (Full HA)
```

## Environment Comparison

| Environment | Namespace | API Replicas | Worker Replicas | HPA Max | Resources |
|-------------|-----------|--------------|-----------------|---------|-----------|
| **dev** | quckapp | 1 | 1 | 3 | 128Mi-256Mi |
| **qa** | quckapp-qa | 2 | 2 | 5 | 256Mi-512Mi |
| **uat1** | quckapp-uat1 | 2 | 2 | 5 | 256Mi-512Mi |
| **uat2** | quckapp-uat2 | 2 | 2 | 5 | 256Mi-512Mi |
| **uat3** | quckapp-uat3 | 2 | 2 | 5 | 256Mi-512Mi |
| **staging** | quckapp-staging | 3 | 3 | 15 | 512Mi-1Gi |
| **prod** | quckapp-prod | 3 | 3 | 30 | 512Mi-1Gi |
| **live** | quckapp-live | 5 | 5 | 50 | 1Gi-2Gi |

## Quick Commands

### Deploy to Any Environment

```bash
# Preview changes
kustomize build k8s/overlays/<ENV> | kubectl diff -f -

# Apply changes
kubectl apply -k k8s/overlays/<ENV>

# Check rollout status
kubectl rollout status deployment/<ENV>-quckapp-api -n quckapp-<ENV>
```

### Environment-Specific Deployments

```bash
# Development
kubectl apply -k k8s/overlays/dev

# QA
kubectl apply -k k8s/overlays/qa

# UAT Environments
kubectl apply -k k8s/overlays/uat1
kubectl apply -k k8s/overlays/uat2
kubectl apply -k k8s/overlays/uat3

# Staging
kubectl apply -k k8s/overlays/staging

# Live (Production)
kubectl apply -k k8s/overlays/live
```

## Environment Configurations

### Dev Environment

```yaml
# k8s/overlays/dev/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: quckapp
namePrefix: dev-

resources:
  - ../../base
  - namespace.yaml

labels:
  - includeSelectors: true
    pairs:
      environment: dev

patches:
  - target:
      kind: Deployment
      name: quckapp-api
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 1

configMapGenerator:
  - name: quckapp-config
    behavior: merge
    literals:
      - NODE_ENV=development
      - LOG_LEVEL=debug
      - S3_MEDIA_BUCKET=quckapp-media-dev
      - CORS_ORIGINS=https://dev.quckapp.com

images:
  - name: quckapp/api
    newName: ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/quckapp/api
    newTag: dev-latest
```

### QA Environment

```yaml
# k8s/overlays/qa/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: quckapp-qa
namePrefix: qa-

resources:
  - ../../base
  - namespace.yaml

labels:
  - includeSelectors: true
    pairs:
      environment: qa

patches:
  - target:
      kind: Deployment
      name: quckapp-api
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 2
      - op: replace
        path: /spec/template/spec/containers/0/resources
        value:
          requests:
            cpu: "100m"
            memory: "256Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"

  - target:
      kind: HorizontalPodAutoscaler
      name: quckapp-api-hpa
    patch: |-
      - op: replace
        path: /spec/minReplicas
        value: 2
      - op: replace
        path: /spec/maxReplicas
        value: 5

configMapGenerator:
  - name: quckapp-config
    behavior: merge
    literals:
      - NODE_ENV=qa
      - LOG_LEVEL=debug
      - S3_MEDIA_BUCKET=quckapp-media-qa
      - CORS_ORIGINS=https://qa.quckapp.com
```

### UAT Environments

```yaml
# k8s/overlays/uat1/kustomization.yaml (similar for uat2, uat3)
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: quckapp-uat1
namePrefix: uat1-

resources:
  - ../../base
  - namespace.yaml

labels:
  - includeSelectors: true
    pairs:
      environment: uat1

patches:
  - target:
      kind: Deployment
      name: quckapp-api
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 2

  - target:
      kind: HorizontalPodAutoscaler
      name: quckapp-api-hpa
    patch: |-
      - op: replace
        path: /spec/minReplicas
        value: 2
      - op: replace
        path: /spec/maxReplicas
        value: 5

configMapGenerator:
  - name: quckapp-config
    behavior: merge
    literals:
      - NODE_ENV=uat1
      - LOG_LEVEL=info
      - S3_MEDIA_BUCKET=quckapp-media-uat1
      - CORS_ORIGINS=https://uat1.quckapp.com
```

### Staging Environment

```yaml
# k8s/overlays/staging/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: quckapp-staging
namePrefix: staging-

resources:
  - ../../base
  - namespace.yaml
  - external-secrets.yaml

labels:
  - includeSelectors: true
    pairs:
      environment: staging

patches:
  - target:
      kind: Deployment
      name: quckapp-api
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 3
      - op: replace
        path: /spec/template/spec/containers/0/resources
        value:
          requests:
            cpu: "250m"
            memory: "512Mi"
          limits:
            cpu: "1000m"
            memory: "1Gi"

  - target:
      kind: HorizontalPodAutoscaler
      name: quckapp-api-hpa
    patch: |-
      - op: replace
        path: /spec/minReplicas
        value: 3
      - op: replace
        path: /spec/maxReplicas
        value: 15

configMapGenerator:
  - name: quckapp-config
    behavior: merge
    literals:
      - NODE_ENV=staging
      - LOG_LEVEL=info
      - S3_MEDIA_BUCKET=quckapp-media-staging
      - CORS_ORIGINS=https://staging.quckapp.com
      - RATE_LIMIT_ENABLED=true
```

### Live Environment

```yaml
# k8s/overlays/live/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: quckapp-live
namePrefix: live-

resources:
  - ../../base
  - namespace.yaml
  - external-secrets.yaml

labels:
  - includeSelectors: true
    pairs:
      environment: live

patches:
  # High availability replicas
  - target:
      kind: Deployment
      name: quckapp-api
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 5
      - op: replace
        path: /spec/template/spec/containers/0/resources
        value:
          requests:
            cpu: "500m"
            memory: "1Gi"
          limits:
            cpu: "2000m"
            memory: "2Gi"

  # Aggressive autoscaling
  - target:
      kind: HorizontalPodAutoscaler
      name: quckapp-api-hpa
    patch: |-
      - op: replace
        path: /spec/minReplicas
        value: 5
      - op: replace
        path: /spec/maxReplicas
        value: 50

  # Stricter PDB
  - target:
      kind: PodDisruptionBudget
      name: quckapp-api-pdb
    patch: |-
      - op: replace
        path: /spec/minAvailable
        value: 3

  # IRSA annotations
  - target:
      kind: ServiceAccount
      name: quckapp-api
    patch: |-
      - op: add
        path: /metadata/annotations/eks.amazonaws.com~1role-arn
        value: "arn:aws:iam::ACCOUNT_ID:role/quckapp-live-api-role"

configMapGenerator:
  - name: quckapp-config
    behavior: merge
    literals:
      - NODE_ENV=production
      - LOG_LEVEL=warn
      - S3_MEDIA_BUCKET=quckapp-media-live
      - CORS_ORIGINS=https://quckapp.com,https://www.quckapp.com
      - RATE_LIMIT_MAX_REQUESTS=500

images:
  - name: quckapp/api
    newName: ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/quckapp/api
    newTag: v1.0.0  # Pinned version in production
```

## Operations

### View All Environments

```bash
# List pods across all environments
for ns in dev qa uat1 uat2 uat3 staging live; do
  echo "=== quckapp-$ns ==="
  kubectl get pods -n quckapp-$ns
done
```

### Check Rollout Status

```bash
# Check specific environment
kubectl rollout status deployment/live-quckapp-api -n quckapp-live

# Watch rollout
kubectl rollout status deployment/live-quckapp-api -n quckapp-live -w
```

### View Logs

```bash
# Follow API logs
kubectl logs -f deployment/live-quckapp-api -n quckapp-live

# View previous container logs (after crash)
kubectl logs deployment/live-quckapp-api -n quckapp-live --previous

# View logs with timestamps
kubectl logs -f deployment/live-quckapp-api -n quckapp-live --timestamps
```

### Scale Deployments

```bash
# Manual scaling
kubectl scale deployment live-quckapp-api --replicas=10 -n quckapp-live

# View HPA status
kubectl get hpa -n quckapp-live
kubectl describe hpa live-quckapp-api-hpa -n quckapp-live
```

### Rollback

```bash
# View rollout history
kubectl rollout history deployment/live-quckapp-api -n quckapp-live

# Rollback to previous version
kubectl rollout undo deployment/live-quckapp-api -n quckapp-live

# Rollback to specific revision
kubectl rollout undo deployment/live-quckapp-api -n quckapp-live --to-revision=2
```

## Monitoring

### Prometheus Metrics

```bash
# Port-forward to view metrics
kubectl port-forward deployment/live-quckapp-api 9090:9090 -n quckapp-live

# View metrics
curl http://localhost:9090/metrics
```

### View Events

```bash
# View namespace events
kubectl get events -n quckapp-live --sort-by='.lastTimestamp'

# Watch events
kubectl get events -n quckapp-live -w
```

## Troubleshooting

### Pod Issues

```bash
# Describe pod for detailed info
kubectl describe pod <pod-name> -n quckapp-live

# Get pod logs
kubectl logs <pod-name> -n quckapp-live

# Execute into pod
kubectl exec -it <pod-name> -n quckapp-live -- /bin/sh
```

### Network Issues

```bash
# Check service endpoints
kubectl get endpoints -n quckapp-live

# Test service connectivity
kubectl run debug --rm -it --image=alpine -n quckapp-live -- \
  wget -qO- http://live-quckapp-api:3000/health
```

### Resource Issues

```bash
# View resource usage
kubectl top pods -n quckapp-live

# View node resources
kubectl top nodes
```

## CI/CD Integration

### GitHub Actions Deployment

```yaml
# .github/workflows/k8s-deploy.yml
name: Deploy to Kubernetes

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy'
        required: true
        type: choice
        options:
          - dev
          - qa
          - uat1
          - uat2
          - uat3
          - staging
          - live
      image_tag:
        description: 'Image tag to deploy'
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name quckapp-${{ github.event.inputs.environment }}

      - name: Deploy
        run: |
          cd k8s/overlays/${{ github.event.inputs.environment }}
          kustomize edit set image quckapp/api=*:${{ github.event.inputs.image_tag }}
          kubectl apply -k .
          kubectl rollout status deployment/${{ github.event.inputs.environment }}-quckapp-api \
            -n quckapp-${{ github.event.inputs.environment }} \
            --timeout=300s
```

## Related Documentation

- [Environments Overview](./overview.md) - All environment details
- [Terraform Infrastructure](./terraform.md) - Terraform configurations
- [CI/CD Pipelines](../cicd/github-actions.md) - Deployment pipelines
