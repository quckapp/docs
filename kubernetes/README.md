# Kubernetes Deployment Guide

This guide covers deploying QuckApp to Kubernetes using the manifests in the `k8s/` directory.

## Architecture Overview

```
                                    ┌─────────────────────────────────────────────┐
                                    │              AWS Cloud                       │
┌──────────────┐                    │  ┌────────────────────────────────────────┐ │
│   CloudFront │────────────────────┼──│              ALB Ingress               │ │
│     (CDN)    │                    │  └──────────────────┬─────────────────────┘ │
└──────────────┘                    │                     │                       │
                                    │  ┌──────────────────┴─────────────────────┐ │
                                    │  │           EKS Cluster                   │ │
                                    │  │  ┌─────────────────────────────────────┐│ │
                                    │  │  │         quckapp-prod namespace      ││ │
                                    │  │  │                                     ││ │
                                    │  │  │  ┌─────────┐  ┌─────────┐          ││ │
                                    │  │  │  │ API Pod │  │ API Pod │  (HPA)   ││ │
                                    │  │  │  └────┬────┘  └────┬────┘          ││ │
                                    │  │  │       │            │               ││ │
                                    │  │  │  ┌────┴────────────┴────┐          ││ │
                                    │  │  │  │    quckapp-api svc   │          ││ │
                                    │  │  │  └──────────────────────┘          ││ │
                                    │  │  │                                     ││ │
                                    │  │  │  ┌──────────┐ ┌──────────┐ (HPA)   ││ │
                                    │  │  │  │ Worker 1 │ │ Worker 2 │         ││ │
                                    │  │  │  └──────────┘ └──────────┘         ││ │
                                    │  │  └─────────────────────────────────────┘│ │
                                    │  └─────────────────────────────────────────┘ │
                                    │                     │                        │
                                    │  ┌──────────────────┴──────────────────┐     │
                                    │  │              AWS Services            │     │
                                    │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌───────┐  │     │
                                    │  │  │ RDS │ │Redis│ │ S3  │ │  SQS  │  │     │
                                    │  │  └─────┘ └─────┘ └─────┘ └───────┘  │     │
                                    │  └─────────────────────────────────────┘     │
                                    └──────────────────────────────────────────────┘
```

## Prerequisites

### Tools Required

| Tool | Version | Purpose |
|------|---------|---------|
| kubectl | 1.28+ | Kubernetes CLI |
| kustomize | 4.0+ | Manifest management |
| aws-cli | 2.x | AWS authentication |
| helm | 3.x | Package management (optional) |

### Cluster Requirements

- EKS 1.28+ or compatible Kubernetes cluster
- AWS Load Balancer Controller installed
- External Secrets Operator (production)
- Prometheus Operator (monitoring)
- metrics-server (HPA)

## Initial Setup

### 1. Configure kubectl

```bash
# For EKS
aws eks update-kubeconfig --name quckapp --region us-east-1

# Verify connection
kubectl cluster-info
kubectl get nodes
```

### 2. Install Prerequisites

```bash
# AWS Load Balancer Controller
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=quckapp

# External Secrets Operator (prod only)
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace

# Prometheus Operator (monitoring)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace
```

### 3. Create Image Pull Secret (if using private registry)

```bash
kubectl create secret docker-registry quckapp-registry \
  --docker-server=123456789.dkr.ecr.us-east-1.amazonaws.com \
  --docker-username=AWS \
  --docker-password=$(aws ecr get-login-password) \
  -n quckapp
```

## Deployment

### Development Environment

```bash
# Create namespace
kubectl apply -f k8s/overlays/dev/namespace.yaml

# Deploy all resources
kubectl apply -k k8s/overlays/dev

# Verify deployment
kubectl get all -n quckapp
```

### Production Environment

```bash
# Create namespace with PSS
kubectl apply -f k8s/overlays/prod/namespace.yaml

# Setup External Secrets first
kubectl apply -f k8s/overlays/prod/external-secrets.yaml

# Wait for secrets to sync
kubectl wait --for=condition=SecretSynced externalsecret/quckapp-secrets -n quckapp-prod

# Deploy all resources
kubectl apply -k k8s/overlays/prod

# Verify deployment
kubectl get all -n quckapp-prod
```

## Resource Details

### Deployments

| Component | Replicas (Dev) | Replicas (Prod) | Purpose |
|-----------|---------------|-----------------|---------|
| API | 1 | 3-20 | HTTP API server |
| Worker | 1 | 3-50 | Media processing |
| Thumbnail Worker | 1 | 2-10 | Thumbnail generation |
| Notification Worker | 1 | 1-5 | Push notifications |

### Services

| Service | Type | Port | Endpoint |
|---------|------|------|----------|
| quckapp-api | ClusterIP | 80 | Internal only |
| quckapp-api-headless | ClusterIP (None) | 3000 | Service discovery |

### Ingress

**Dev (nginx)**:
- URL: `https://api-dev.quckapp.com`
- TLS: Let's Encrypt or self-signed
- Rate limiting: 100 req/s

**Prod (ALB)**:
- URL: `https://api.quckapp.com`
- TLS: ACM certificate
- WAF: Enabled
- Shield: Optional

## Security Configuration

### IAM Roles for Service Accounts (IRSA)

Production uses IRSA for AWS access:

```yaml
# ServiceAccount annotation
eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT_ID:role/quckapp-prod-api-role
```

Required IAM policies:
- S3 access for media bucket
- SQS access for queues
- DynamoDB access for metadata
- Secrets Manager read access

### Network Policies

Default deny with explicit allows:
- API: Accepts traffic from ingress namespace
- Workers: Egress only to AWS services
- All: DNS resolution allowed

### Pod Security

Production namespace enforces restricted PSS:
- No privilege escalation
- Read-only root filesystem
- Non-root user (UID 1000)
- Dropped capabilities

## Autoscaling

### Horizontal Pod Autoscaler

```yaml
# API scaling
minReplicas: 3
maxReplicas: 20
targetCPU: 70%
targetMemory: 80%

# Worker scaling (with SQS metric)
minReplicas: 3
maxReplicas: 50
targetQueueDepth: 5 messages/pod
```

### Pod Disruption Budget

```yaml
# Ensures minimum availability during updates
minAvailable: 2  # API
minAvailable: 2  # Workers
```

## Monitoring

### Prometheus Metrics

API exposes:
- `http_requests_total` - Request count by status
- `http_request_duration_seconds` - Latency histogram
- `process_cpu_seconds_total` - CPU usage
- `process_resident_memory_bytes` - Memory usage

### Alerts

| Alert | Severity | Condition |
|-------|----------|-----------|
| APIHighErrorRate | Critical | >5% 5xx errors |
| APIPodDown | Critical | 0 available replicas |
| HighMemoryUsage | Warning | >90% memory |
| QueueBacklog | Warning | >1000 messages |
| HighLatency | Warning | P99 > 2s |

### Grafana Dashboards

Import dashboards for:
- API performance
- Worker throughput
- Resource utilization

## Operations

### Rolling Update

```bash
# Update image
kubectl set image deployment/prod-quckapp-api \
  api=123456789.dkr.ecr.us-east-1.amazonaws.com/quckapp/api:v1.2.0 \
  -n quckapp-prod

# Watch rollout
kubectl rollout status deployment/prod-quckapp-api -n quckapp-prod
```

### Rollback

```bash
# Rollback to previous version
kubectl rollout undo deployment/prod-quckapp-api -n quckapp-prod

# Rollback to specific revision
kubectl rollout undo deployment/prod-quckapp-api --to-revision=3 -n quckapp-prod
```

### Scaling

```bash
# Manual scale
kubectl scale deployment/prod-quckapp-worker --replicas=10 -n quckapp-prod

# Patch HPA limits
kubectl patch hpa prod-quckapp-worker-hpa -n quckapp-prod \
  --type merge -p '{"spec":{"maxReplicas":100}}'
```

### Debugging

```bash
# Get pod logs
kubectl logs -f deployment/prod-quckapp-api -n quckapp-prod

# Exec into pod
kubectl exec -it deployment/prod-quckapp-api -n quckapp-prod -- /bin/sh

# Port forward for local testing
kubectl port-forward svc/prod-quckapp-api 3000:80 -n quckapp-prod
```

## Disaster Recovery

### Backup

```bash
# Backup all resources
kubectl get all -n quckapp-prod -o yaml > backup.yaml

# Backup secrets (encrypted)
kubectl get secrets -n quckapp-prod -o yaml | \
  kubeseal --format yaml > sealed-secrets-backup.yaml
```

### Restore

```bash
# Restore from backup
kubectl apply -f backup.yaml
```

## Cost Optimization

### Resource Recommendations

Use VPA (Vertical Pod Autoscaler) for recommendations:

```bash
kubectl get vpa -n quckapp-prod
```

### Spot Instances

For non-critical workers, use spot instances:

```yaml
affinity:
  nodeAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 1
        preference:
          matchExpressions:
            - key: eks.amazonaws.com/capacityType
              operator: In
              values:
                - SPOT
```

## Related Documentation

- [k8s/README.md](../../k8s/README.md) - Manifest details
- [Docker Setup](../docker/README.md) - Local development
- [Terraform](../terraform/README.md) - Infrastructure provisioning
