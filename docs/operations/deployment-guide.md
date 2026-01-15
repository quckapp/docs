---
sidebar_position: 2
---

# Deployment Guide

## 1. Prerequisites

### 1.1 Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| kubectl | 1.28+ | Kubernetes CLI |
| helm | 3.12+ | Package manager |
| kustomize | 5.0+ | Manifest management |
| aws-cli | 2.x | AWS access |
| terraform | 1.5+ | Infrastructure |

### 1.2 Access Requirements

- AWS IAM credentials
- Kubernetes cluster access
- Container registry access
- Vault access (secrets)

## 2. Environment Setup

### 2.1 Clone Repositories

```bash
# Infrastructure
git clone https://github.com/quckapp/infrastructure.git
cd infrastructure

# Set environment
export ENV=dev  # dev | qa | uat1 | uat2 | uat3 | staging | live
```

### 2.2 Configure kubectl

```bash
# Get kubeconfig
aws eks update-kubeconfig --name quckapp-${ENV} --region us-east-1

# Verify connection
kubectl cluster-info
kubectl get nodes
```

## 3. Deployment Steps

### 3.1 Infrastructure (Terraform)

```bash
# Navigate to environment
cd terraform/environments/${ENV}

# Initialize
terraform init -backend-config=backend.hcl

# Plan changes
terraform plan -var-file=${ENV}.tfvars -out=tfplan

# Apply (with approval)
terraform apply tfplan
```

### 3.2 Kubernetes Manifests

```bash
# Navigate to k8s
cd k8s/overlays/${ENV}

# Preview changes
kustomize build . | kubectl diff -f -

# Apply manifests
kubectl apply -k .

# Verify rollout
kubectl rollout status deployment/${ENV}-quckapp-api -n quckapp-${ENV}
```

### 3.3 Helm Charts (Optional)

```bash
# Add Helm repo
helm repo add quckapp https://charts.quckapp.com
helm repo update

# Install/upgrade
helm upgrade --install quckapp-${ENV} quckapp/quckapp \
  -n quckapp-${ENV} \
  -f values-${ENV}.yaml \
  --wait
```

## 4. Configuration

### 4.1 Environment Variables

```yaml
# config/env/${ENV}.yaml
environment: ${ENV}
log_level: info
db_host: mysql-${ENV}.quckapp.internal
redis_host: redis-${ENV}.quckapp.internal
kafka_brokers: kafka-${ENV}.quckapp.internal:9092
```

### 4.2 Secrets Management

```bash
# Secrets from Vault
vault kv get -format=json secret/quckapp/${ENV}/db | jq -r '.data.data'

# Create Kubernetes secret
kubectl create secret generic db-credentials \
  -n quckapp-${ENV} \
  --from-literal=username=quckapp \
  --from-literal=password=$(vault kv get -field=password secret/quckapp/${ENV}/db)
```

## 5. Verification

### 5.1 Health Checks

```bash
# Check pods
kubectl get pods -n quckapp-${ENV}

# Check services
kubectl get svc -n quckapp-${ENV}

# Health endpoint
curl https://api.${ENV}.quckapp.com/health
```

### 5.2 Smoke Tests

```bash
# Run smoke tests
npm run test:smoke -- --env=${ENV}

# Expected output
✓ API health check
✓ WebSocket connection
✓ Authentication flow
✓ Message send/receive
```

## 6. Rollback

### 6.1 Kubernetes Rollback

```bash
# Check history
kubectl rollout history deployment/${ENV}-quckapp-api -n quckapp-${ENV}

# Rollback to previous
kubectl rollout undo deployment/${ENV}-quckapp-api -n quckapp-${ENV}

# Rollback to specific revision
kubectl rollout undo deployment/${ENV}-quckapp-api \
  -n quckapp-${ENV} \
  --to-revision=3
```

### 6.2 Database Rollback

```bash
# Check migrations
flyway info -url=jdbc:mysql://mysql-${ENV}:3306/quckapp

# Rollback one migration
flyway undo -url=jdbc:mysql://mysql-${ENV}:3306/quckapp
```

## 7. Environment-Specific Notes

### 7.1 Development

```bash
# Auto-deployment on merge
# No approvals required
# Scaled down resources
kubectl apply -k k8s/overlays/dev
```

### 7.2 Production/Live

```bash
# Requires CAB approval
# Blue-green deployment
# Full monitoring enabled

# 1. Deploy to green
kubectl apply -k k8s/overlays/live-green

# 2. Verify green
./scripts/verify-deployment.sh green

# 3. Switch traffic
kubectl patch service quckapp-api -n quckapp-live \
  -p '{"spec":{"selector":{"version":"green"}}}'

# 4. Monitor
./scripts/monitor-canary.sh
```

## 8. Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Pods not starting | Image pull error | Check registry credentials |
| Connection refused | Service not ready | Check readiness probe |
| OOMKilled | Memory limit | Increase memory limits |
| CrashLoopBackOff | App crash | Check logs |

### Debug Commands

```bash
# Pod logs
kubectl logs -f deployment/${ENV}-quckapp-api -n quckapp-${ENV}

# Describe pod
kubectl describe pod <pod-name> -n quckapp-${ENV}

# Exec into pod
kubectl exec -it <pod-name> -n quckapp-${ENV} -- /bin/sh
```
