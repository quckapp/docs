---
sidebar_position: 6
---

# Kubernetes Deployment

QuckApp uses Kubernetes for production orchestration, providing auto-scaling, self-healing, and rolling deployments.

## Namespace Structure

```
├── QuckApp-core       # Core application services
├── QuckApp-data       # Databases and storage
├── QuckApp-infra      # Infrastructure (Kafka, Redis)
├── QuckApp-monitoring # Prometheus, Grafana, Jaeger
└── QuckApp-ingress    # Nginx Ingress controllers
```

## Deployment Examples

### Backend Service Deployment

```yaml
# k8s/deployments/backend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: QuckApp-core
  labels:
    app: backend
    tier: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: backend
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: backend-sa
      containers:
        - name: backend
          image: registry.QuckApp.dev/backend:v1.0.0
          ports:
            - containerPort: 3000
              name: http
          env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: database-credentials
                  key: postgres-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: redis-credentials
                  key: url
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: jwt-secret
                  key: secret
          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    app: backend
                topologyKey: kubernetes.io/hostname
```

### Service

```yaml
# k8s/services/backend-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: QuckApp-core
  labels:
    app: backend
spec:
  type: ClusterIP
  ports:
    - port: 3000
      targetPort: 3000
      protocol: TCP
      name: http
  selector:
    app: backend
```

### Horizontal Pod Autoscaler

```yaml
# k8s/hpa/backend-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
  namespace: QuckApp-core
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 3
  maxReplicas: 20
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
```

## Ingress Configuration

```yaml
# k8s/ingress/api-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  namespace: QuckApp-core
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1s"
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
spec:
  tls:
    - hosts:
        - api.QuckApp.dev
      secretName: api-tls
  rules:
    - host: api.QuckApp.dev
      http:
        paths:
          - path: /api/v1/auth
            pathType: Prefix
            backend:
              service:
                name: auth-service
                port:
                  number: 8001
          - path: /api/v1/users
            pathType: Prefix
            backend:
              service:
                name: user-service
                port:
                  number: 8002
          - path: /api/v1
            pathType: Prefix
            backend:
              service:
                name: backend
                port:
                  number: 3000
```

## ConfigMaps and Secrets

### ConfigMap

```yaml
# k8s/configmaps/app-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: QuckApp-core
data:
  LOG_LEVEL: "info"
  KAFKA_BROKERS: "kafka-0.kafka:9092,kafka-1.kafka:9092,kafka-2.kafka:9092"
  REDIS_CLUSTER: "redis-cluster.QuckApp-infra:6379"
  CONSUL_HOST: "consul.QuckApp-infra:8500"
  JAEGER_ENDPOINT: "http://jaeger.QuckApp-monitoring:14268/api/traces"
```

### Secret (sealed)

```yaml
# k8s/secrets/database-credentials.yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: database-credentials
  namespace: QuckApp-core
spec:
  encryptedData:
    postgres-url: AgBy8hX...encrypted...
    mysql-url: AgC3kL2...encrypted...
    mongo-url: AgD7mN4...encrypted...
```

## StatefulSet for Databases

```yaml
# k8s/statefulsets/postgres-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: QuckApp-data
spec:
  serviceName: postgres
  replicas: 3
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: postgres-credentials
                  key: username
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-credentials
                  key: password
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
            limits:
              cpu: "2000m"
              memory: "4Gi"
  volumeClaimTemplates:
    - metadata:
        name: postgres-data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: fast-ssd
        resources:
          requests:
            storage: 100Gi
```

## Network Policies

```yaml
# k8s/network-policies/backend-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-network-policy
  namespace: QuckApp-core
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
              name: QuckApp-ingress
        - podSelector:
            matchLabels:
              app: nginx-ingress
      ports:
        - protocol: TCP
          port: 3000
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: QuckApp-data
      ports:
        - protocol: TCP
          port: 5432
        - protocol: TCP
          port: 6379
    - to:
        - namespaceSelector:
            matchLabels:
              name: QuckApp-infra
      ports:
        - protocol: TCP
          port: 9092
```

## Helm Chart Structure

```
QuckApp-helm/
├── Chart.yaml
├── values.yaml
├── values-prod.yaml
├── values-staging.yaml
├── templates/
│   ├── _helpers.tpl
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   └── serviceaccount.yaml
└── charts/
    ├── redis/
    ├── kafka/
    └── postgres/
```

### values.yaml

```yaml
# values.yaml
global:
  environment: production
  imageRegistry: registry.QuckApp.dev

backend:
  replicaCount: 3
  image:
    repository: backend
    tag: latest
  resources:
    requests:
      cpu: 250m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 1Gi
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20

authService:
  replicaCount: 2
  image:
    repository: auth-service
    tag: latest

redis:
  enabled: true
  cluster:
    enabled: true
    nodes: 6

kafka:
  enabled: true
  replicaCount: 3
```

## Deployment Commands

```bash
# Apply all manifests
kubectl apply -k k8s/overlays/production

# Deploy with Helm
helm upgrade --install QuckApp ./QuckApp-helm \
  -f values-prod.yaml \
  --namespace QuckApp-core \
  --create-namespace

# Check deployment status
kubectl rollout status deployment/backend -n QuckApp-core

# Scale manually
kubectl scale deployment/backend --replicas=5 -n QuckApp-core

# View logs
kubectl logs -f deployment/backend -n QuckApp-core

# Port forward for debugging
kubectl port-forward svc/backend 3000:3000 -n QuckApp-core
```
