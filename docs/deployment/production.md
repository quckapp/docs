---
sidebar_position: 7
---

# Production Environment

The production environment hosts release candidates that have been validated in staging and are ready for live deployment.

## Overview

| Aspect | Configuration |
|--------|---------------|
| **URL** | `https://prod.QuikApp.com` |
| **API** | `https://api.prod.QuikApp.com` |
| **Purpose** | Release candidate validation |
| **Data** | Real production data |
| **Deployment** | Controlled release process |
| **Access** | Operations team, on-call engineers |

## Infrastructure

Production runs on a fully redundant, multi-AZ infrastructure:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AWS - Production Account                                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Route 53 (DNS)                                │   │
│  │                    api.prod.QuikApp.com                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                 │                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CloudFront CDN                                    │   │
│  │                  + WAF + Shield                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                 │                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   Application Load Balancer                          │   │
│  │                       (Multi-AZ)                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                 │                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    EKS Cluster (Production)                          │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │   AZ-a                    AZ-b                    AZ-c       │  │   │
│  │  │  ┌───────┐              ┌───────┐              ┌───────┐    │  │   │
│  │  │  │Backend│              │Backend│              │Backend│    │  │   │
│  │  │  │  x2   │              │  x2   │              │  x1   │    │  │   │
│  │  │  └───────┘              └───────┘              └───────┘    │  │   │
│  │  │  ┌───────┐              ┌───────┐              ┌───────┐    │  │   │
│  │  │  │ Auth  │              │ Auth  │              │ Auth  │    │  │   │
│  │  │  │  x2   │              │  x2   │              │  x1   │    │  │   │
│  │  │  └───────┘              └───────┘              └───────┘    │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │                   Istio Service Mesh                          │  │   │
│  │  │              (mTLS, Traffic Management, Observability)        │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Data Layer                                    │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │   Aurora    │  │   Aurora    │  │  DocumentDB │                 │   │
│  │  │ PostgreSQL  │  │   MySQL     │  │   Cluster   │                 │   │
│  │  │  Multi-AZ   │  │  Multi-AZ   │  │   3-node    │                 │   │
│  │  │ r6g.xlarge  │  │ r6g.xlarge  │  │  r6g.large  │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │ ElastiCache │  │     MSK     │  │  OpenSearch │                 │   │
│  │  │   Cluster   │  │   Cluster   │  │   Cluster   │                 │   │
│  │  │  6-node     │  │   6-node    │  │   3-node    │                 │   │
│  │  │ r6g.large   │  │ kafka.m5.lg │  │  r6.large   │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Kubernetes Configuration

```yaml
# k8s/overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: QuikApp-production

resources:
  - ../../base
  - istio-config.yaml
  - hpa.yaml
  - pdb.yaml
  - network-policies.yaml
  - resource-quotas.yaml

replicas:
  - name: backend
    count: 5
  - name: auth-service
    count: 5
  - name: user-service
    count: 5
  - name: message-service
    count: 5
  - name: search-service
    count: 3
  - name: notification-service
    count: 3
  - name: presence-service
    count: 3

images:
  - name: registry.QuikApp.dev/backend
    newTag: prod-latest
  - name: registry.QuikApp.dev/auth-service
    newTag: prod-latest

configMapGenerator:
  - name: app-config
    behavior: merge
    literals:
      - ENVIRONMENT=production
      - LOG_LEVEL=warn
      - ENABLE_SWAGGER=false
      - ENABLE_METRICS=true
      - ENABLE_TRACING=true

patchesStrategicMerge:
  - resources-patch.yaml
```

### Resource Configuration

```yaml
# k8s/overlays/production/resources-patch.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
spec:
  template:
    spec:
      containers:
        - name: backend
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: backend
```

### Horizontal Pod Autoscaler

```yaml
# k8s/overlays/production/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
  namespace: QuikApp-production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 5
  maxReplicas: 20
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 4
          periodSeconds: 60
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
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "1000"
```

### Network Policies

```yaml
# k8s/overlays/production/network-policies.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-network-policy
  namespace: QuikApp-production
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: istio-system
        - podSelector:
            matchLabels:
              app: istio-ingressgateway
      ports:
        - protocol: TCP
          port: 3000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: auth-service
        - podSelector:
            matchLabels:
              app: user-service
      ports:
        - protocol: TCP
          port: 3000
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379
```

## Deployment Pipeline

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to deploy (from staging)'
        required: true
      approval_ticket:
        description: 'Change approval ticket number'
        required: true

env:
  AWS_REGION: us-east-1
  EKS_CLUSTER: QuikApp-production
  REGISTRY: registry.QuikApp.dev

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Validate approval ticket
        run: |
          # Verify change approval ticket exists and is approved
          ./scripts/validate-change-ticket.sh ${{ inputs.approval_ticket }}

      - name: Verify staging validation
        run: |
          # Ensure version was validated in staging
          ./scripts/check-staging-approval.sh ${{ inputs.version }}

  pre-deployment:
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Create deployment snapshot
        run: |
          # Snapshot current state for rollback
          ./scripts/create-deployment-snapshot.sh production

      - name: Run pre-deployment checks
        run: |
          ./scripts/pre-deployment-checks.sh production

  deploy:
    needs: pre-deployment
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.PROD_AWS_ACCOUNT_ID }}:role/github-deploy-role
          aws-region: ${{ env.AWS_REGION }}

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name $EKS_CLUSTER

      - name: Run database migrations
        run: |
          kubectl apply -f k8s/jobs/migration-job.yaml -n QuikApp-production
          kubectl wait --for=condition=complete job/db-migration \
            -n QuikApp-production --timeout=600s

      - name: Deploy canary (10%)
        run: |
          kubectl apply -f k8s/overlays/production/canary-10.yaml
          sleep 300  # Wait 5 minutes for canary validation

      - name: Validate canary metrics
        run: |
          ./scripts/validate-canary-metrics.sh \
            --error-threshold=0.1 \
            --latency-threshold=500

      - name: Progressive rollout (50%)
        run: |
          kubectl apply -f k8s/overlays/production/canary-50.yaml
          sleep 300

      - name: Full deployment
        run: |
          kubectl apply -k k8s/overlays/production
          kubectl rollout status deployment/backend \
            -n QuikApp-production --timeout=600s

  post-deployment:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - name: Run smoke tests
        run: ./scripts/smoke-tests.sh https://api.prod.QuikApp.com

      - name: Update deployment record
        run: |
          ./scripts/record-deployment.sh \
            --version=${{ inputs.version }} \
            --environment=production \
            --ticket=${{ inputs.approval_ticket }}

      - name: Notify stakeholders
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Production deployment complete: v${{ inputs.version }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Production Deployment Complete*\n• Version: v${{ inputs.version }}\n• Ticket: ${{ inputs.approval_ticket }}\n• Status: Success"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_PROD_WEBHOOK }}
```

## Database Configuration

### Aurora PostgreSQL

```yaml
# terraform/production/aurora-postgres.tf
resource "aws_rds_cluster" "production_postgres" {
  cluster_identifier     = "QuikApp-production-postgres"
  engine                 = "aurora-postgresql"
  engine_version         = "15.4"
  database_name          = "QuikApp"
  master_username        = "QuikApp_admin"
  master_password        = var.postgres_master_password

  db_subnet_group_name   = aws_db_subnet_group.production.name
  vpc_security_group_ids = [aws_security_group.aurora.id]

  backup_retention_period      = 35
  preferred_backup_window      = "03:00-04:00"
  preferred_maintenance_window = "sun:04:00-sun:05:00"

  deletion_protection = true
  skip_final_snapshot = false

  enabled_cloudwatch_logs_exports = ["postgresql"]

  serverlessv2_scaling_configuration {
    min_capacity = 2
    max_capacity = 64
  }
}

resource "aws_rds_cluster_instance" "production_postgres" {
  count               = 3
  identifier          = "QuikApp-production-postgres-${count.index}"
  cluster_identifier  = aws_rds_cluster.production_postgres.id
  instance_class      = "db.serverless"
  engine              = "aurora-postgresql"
  publicly_accessible = false

  performance_insights_enabled = true
  monitoring_interval          = 60
  monitoring_role_arn          = aws_iam_role.rds_monitoring.arn
}
```

## Security Configuration

### WAF Rules

```yaml
# terraform/production/waf.tf
resource "aws_wafv2_web_acl" "production" {
  name  = "QuikApp-production-waf"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Rate limiting
  rule {
    name     = "RateLimitRule"
    priority = 1

    override_action {
      none {}
    }

    statement {
      rate_based_statement {
        limit              = 10000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
    }
  }

  # AWS Managed Rules
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesCommonRuleSet"
    }
  }

  # SQL Injection Protection
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesSQLiRuleSet"
    }
  }
}
```

## Monitoring & Alerting

### Production Alerts

```yaml
# prometheus/production-alerts.yaml
groups:
  - name: production-critical
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) /
          sum(rate(http_requests_total[5m])) > 0.005
        for: 2m
        labels:
          severity: critical
          environment: production
        annotations:
          summary: "Critical: High error rate in production"
          runbook: "https://runbooks.QuikApp.com/high-error-rate"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: critical
          environment: production
        annotations:
          summary: "Critical: High latency in production"

      - alert: DatabaseConnectionsHigh
        expr: |
          pg_stat_activity_count > 80
        for: 5m
        labels:
          severity: warning
          environment: production
        annotations:
          summary: "Database connections approaching limit"

      - alert: KafkaLag
        expr: |
          kafka_consumer_group_lag > 100000
        for: 10m
        labels:
          severity: warning
          environment: production
        annotations:
          summary: "Kafka consumer lag is high"
```

### Monitoring URLs

| Tool | URL | Purpose |
|------|-----|---------|
| Grafana | https://grafana.prod.QuikApp.com | Metrics dashboards |
| Jaeger | https://jaeger.prod.QuikApp.com | Distributed tracing |
| Kibana | https://logs.prod.QuikApp.com | Log analysis |
| PagerDuty | Integrated | Incident management |
| StatusPage | https://status.QuikApp.com | Public status |

## Rollback Procedure

```bash
#!/bin/bash
# scripts/rollback-production.sh

PREVIOUS_VERSION=$1

if [ -z "$PREVIOUS_VERSION" ]; then
  echo "Usage: ./rollback-production.sh <version>"
  exit 1
fi

echo "WARNING: Rolling back production to version $PREVIOUS_VERSION"
echo "This action requires change management approval."
read -p "Enter approval ticket number: " TICKET

# Validate ticket
./scripts/validate-change-ticket.sh $TICKET || exit 1

# Create incident record
INCIDENT_ID=$(./scripts/create-incident.sh "Production rollback to $PREVIOUS_VERSION")

echo "Starting rollback... Incident: $INCIDENT_ID"

# Rollback using kubectl
kubectl rollout undo deployment/backend -n QuikApp-production \
  --to-revision=$(kubectl rollout history deployment/backend -n QuikApp-production | grep $PREVIOUS_VERSION | awk '{print $1}')

# Wait for rollback
kubectl rollout status deployment/backend -n QuikApp-production --timeout=600s

# Run validation
./scripts/smoke-tests.sh https://api.prod.QuikApp.com

# Update incident
./scripts/update-incident.sh $INCIDENT_ID "Rollback complete"

echo "Rollback complete!"
```

## Access Control

Production access is strictly controlled:

```yaml
# rbac/production-rbac.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: production-operator
  namespace: QuikApp-production
rules:
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets"]
    verbs: ["get", "list", "watch"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: production-admin
  namespace: QuikApp-production
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]
```

Access requires:
- VPN connection
- MFA authentication
- Role-based authorization
- Audit logging enabled
