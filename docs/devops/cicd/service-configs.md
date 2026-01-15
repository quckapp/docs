---
sidebar_position: 4
---

# Service Deployment Configurations

Kubernetes deployment configurations for all 33 QuckApp microservices across 5 technology stacks.

## Deployment Structure

```
k8s/
├── base/                          # Base configurations
│   ├── namespace.yaml
│   ├── network-policies.yaml
│   ├── resource-quotas.yaml
│   └── service-accounts.yaml
├── overlays/                      # Environment-specific
│   ├── local/
│   ├── dev/
│   ├── qa/
│   ├── uat1/
│   ├── uat2/
│   ├── uat3/
│   ├── staging/
│   └── live/
└── services/                      # Per-service configs
    ├── spring-boot/
    ├── nestjs/
    ├── elixir/
    ├── go/
    └── python/
```

---

## Spring Boot Services

### auth-service

```yaml
# k8s/services/spring-boot/auth-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  labels:
    app: auth-service
    tier: backend
    stack: spring-boot
spec:
  replicas: 2
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
        tier: backend
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8081"
        prometheus.io/path: "/actuator/prometheus"
    spec:
      serviceAccountName: quckapp-service
      containers:
        - name: auth-service
          image: quckapp.azurecr.io/auth-service:latest
          ports:
            - containerPort: 8081
              name: http
            - containerPort: 8082
              name: grpc
          env:
            - name: SPRING_PROFILES_ACTIVE
              valueFrom:
                configMapKeyRef:
                  name: quckapp-config
                  key: ENVIRONMENT
            - name: DB_HOST
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: DB_HOST
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: DB_PASSWORD
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: JWT_SECRET
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: REDIS_URL
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8081
            initialDelaySeconds: 60
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8081
            initialDelaySeconds: 30
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          volumeMounts:
            - name: secrets-store
              mountPath: "/mnt/secrets"
              readOnly: true
      volumes:
        - name: secrets-store
          csi:
            driver: secrets-store.csi.k8s.io
            readOnly: true
            volumeAttributes:
              secretProviderClass: azure-kv-secrets
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - auth-service
                topologyKey: kubernetes.io/hostname
---
apiVersion: v1
kind: Service
metadata:
  name: auth-service
spec:
  selector:
    app: auth-service
  ports:
    - name: http
      port: 8081
      targetPort: 8081
    - name: grpc
      port: 8082
      targetPort: 8082
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: auth-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: auth-service
  minReplicas: 2
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
```

### Spring Boot Services Summary

| Service | Port | gRPC Port | Min Replicas | Max Replicas |
|---------|------|-----------|--------------|--------------|
| auth-service | 8081 | 8082 | 2 | 20 |
| user-service | 8083 | 8084 | 2 | 15 |
| permission-service | 8085 | 8086 | 2 | 10 |
| audit-service | 8087 | 8088 | 2 | 10 |
| admin-service | 8089 | 8090 | 1 | 5 |

---

## NestJS Services

### backend-gateway

```yaml
# k8s/services/nestjs/backend-gateway/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend-gateway
  labels:
    app: backend-gateway
    tier: api
    stack: nestjs
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend-gateway
  template:
    metadata:
      labels:
        app: backend-gateway
        tier: api
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: quckapp-service
      containers:
        - name: backend-gateway
          image: quckapp.azurecr.io/backend-gateway:latest
          ports:
            - containerPort: 3000
              name: http
          env:
            - name: NODE_ENV
              valueFrom:
                configMapKeyRef:
                  name: quckapp-config
                  key: ENVIRONMENT
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: DATABASE_URL
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: REDIS_URL
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: JWT_SECRET
            - name: AUTH_SERVICE_URL
              value: "http://auth-service:8081"
            - name: USER_SERVICE_URL
              value: "http://user-service:8083"
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: backend-gateway
spec:
  selector:
    app: backend-gateway
  ports:
    - name: http
      port: 3000
      targetPort: 3000
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: backend-gateway-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1s"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - api.quckapp.dev
      secretName: api-tls
  rules:
    - host: api.quckapp.dev
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: backend-gateway
                port:
                  number: 3000
```

### NestJS Services Summary

| Service | Port | Min Replicas | Max Replicas | Ingress |
|---------|------|--------------|--------------|---------|
| backend-gateway | 3000 | 3 | 30 | Yes |
| realtime-service | 3001 | 2 | 20 | WebSocket |
| notification-service | 3002 | 2 | 15 | No |

---

## Elixir Services

### realtime-service (Consolidated)

```yaml
# k8s/services/elixir/realtime-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: elixir-realtime
  labels:
    app: elixir-realtime
    tier: realtime
    stack: elixir
spec:
  replicas: 3
  selector:
    matchLabels:
      app: elixir-realtime
  template:
    metadata:
      labels:
        app: elixir-realtime
        tier: realtime
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "4000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: quckapp-service
      containers:
        - name: elixir-realtime
          image: quckapp.azurecr.io/elixir-realtime:latest
          ports:
            - containerPort: 4000
              name: http
            - containerPort: 4369
              name: epmd
            - containerPort: 9100
              name: distribution
          env:
            - name: PHX_HOST
              value: "realtime.quckapp.dev"
            - name: PHX_SERVER
              value: "true"
            - name: SECRET_KEY_BASE
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: PHX_SECRET_KEY_BASE
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: DATABASE_URL
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: REDIS_URL
            - name: MONGO_URL
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: MONGO_URL
            - name: KAFKA_BROKERS
              valueFrom:
                configMapKeyRef:
                  name: quckapp-config
                  key: KAFKA_BROKERS
            - name: TURN_SECRET
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: TURN_SECRET
            - name: APNS_KEY
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: APNS_KEY
            - name: FCM_SERVER_KEY
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: FCM_SERVER_KEY
            # Erlang Clustering
            - name: RELEASE_DISTRIBUTION
              value: "name"
            - name: RELEASE_NODE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: RELEASE_COOKIE
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: ERLANG_COOKIE
            - name: POD_IP
              valueFrom:
                fieldRef:
                  fieldPath: status.podIP
          resources:
            requests:
              memory: "1Gi"
              cpu: "1000m"
            limits:
              memory: "2Gi"
              cpu: "2000m"
          livenessProbe:
            httpGet:
              path: /health/live
              port: 4000
            initialDelaySeconds: 60
            periodSeconds: 10
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 4000
            initialDelaySeconds: 30
            periodSeconds: 5
            timeoutSeconds: 3
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchExpressions:
                  - key: app
                    operator: In
                    values:
                      - elixir-realtime
              topologyKey: kubernetes.io/hostname
---
apiVersion: v1
kind: Service
metadata:
  name: elixir-realtime
spec:
  selector:
    app: elixir-realtime
  ports:
    - name: http
      port: 4000
      targetPort: 4000
    - name: epmd
      port: 4369
      targetPort: 4369
  type: ClusterIP
---
# Headless service for Erlang clustering
apiVersion: v1
kind: Service
metadata:
  name: elixir-realtime-headless
spec:
  selector:
    app: elixir-realtime
  ports:
    - name: epmd
      port: 4369
      targetPort: 4369
    - name: distribution
      port: 9100
      targetPort: 9100
  clusterIP: None
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: elixir-realtime-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: elixir-realtime
  minReplicas: 3
  maxReplicas: 30
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
    - type: Pods
      pods:
        metric:
          name: websocket_connections
        target:
          type: AverageValue
          averageValue: "5000"
```

### Elixir Services Summary

| Service | Port | EPMD Port | Min Replicas | Max Replicas | Clustering |
|---------|------|-----------|--------------|--------------|------------|
| realtime-service | 4000 | 4369 | 3 | 30 | Yes |
| presence-service | 4001 | 4369 | 2 | 20 | Yes |
| call-service | 4002 | 4369 | 2 | 25 | Yes |
| message-service | 4003 | 4369 | 2 | 20 | Yes |
| notification-orchestrator | 4004 | 4369 | 2 | 15 | Yes |
| huddle-service | 4005 | 4369 | 2 | 15 | Yes |
| event-broadcast-service | 4006 | 4369 | 2 | 10 | Yes |

---

## Go Services

### workspace-service

```yaml
# k8s/services/go/workspace-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: workspace-service
  labels:
    app: workspace-service
    tier: backend
    stack: go
spec:
  replicas: 2
  selector:
    matchLabels:
      app: workspace-service
  template:
    metadata:
      labels:
        app: workspace-service
        tier: backend
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "5004"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: quckapp-service
      containers:
        - name: workspace-service
          image: quckapp.azurecr.io/workspace-service:latest
          ports:
            - containerPort: 5004
              name: http
            - containerPort: 5005
              name: grpc
          env:
            - name: ENV
              valueFrom:
                configMapKeyRef:
                  name: quckapp-config
                  key: ENVIRONMENT
            - name: DB_DSN
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: MYSQL_DSN
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: REDIS_URL
            - name: KAFKA_BROKERS
              valueFrom:
                configMapKeyRef:
                  name: quckapp-config
                  key: KAFKA_BROKERS
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "250m"
          livenessProbe:
            httpGet:
              path: /health
              port: 5004
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 5004
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: workspace-service
spec:
  selector:
    app: workspace-service
  ports:
    - name: http
      port: 5004
      targetPort: 5004
    - name: grpc
      port: 5005
      targetPort: 5005
  type: ClusterIP
```

### Go Services Summary

| Service | HTTP Port | gRPC Port | Min Replicas | Max Replicas |
|---------|-----------|-----------|--------------|--------------|
| workspace-service | 5004 | 5005 | 2 | 15 |
| channel-service | 5006 | 5007 | 2 | 15 |
| search-service | 5008 | 5009 | 2 | 20 |
| thread-service | 5010 | 5011 | 2 | 10 |
| bookmark-service | 5012 | 5013 | 1 | 5 |
| reminder-service | 5014 | 5015 | 1 | 5 |
| media-service | 5016 | 5017 | 2 | 15 |
| file-service | 5018 | 5019 | 2 | 15 |
| attachment-service | 5020 | 5021 | 2 | 10 |
| cdn-service | 5022 | 5023 | 2 | 10 |

---

## Python Services

### analytics-service

```yaml
# k8s/services/python/analytics-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics-service
  labels:
    app: analytics-service
    tier: backend
    stack: python
spec:
  replicas: 2
  selector:
    matchLabels:
      app: analytics-service
  template:
    metadata:
      labels:
        app: analytics-service
        tier: backend
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "5007"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: quckapp-service
      containers:
        - name: analytics-service
          image: quckapp.azurecr.io/analytics-service:latest
          ports:
            - containerPort: 5007
              name: http
          env:
            - name: ENVIRONMENT
              valueFrom:
                configMapKeyRef:
                  name: quckapp-config
                  key: ENVIRONMENT
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: DATABASE_URL
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: REDIS_URL
            - name: KAFKA_BROKERS
              valueFrom:
                configMapKeyRef:
                  name: quckapp-config
                  key: KAFKA_BROKERS
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 5007
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 5007
            initialDelaySeconds: 15
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: analytics-service
spec:
  selector:
    app: analytics-service
  ports:
    - name: http
      port: 5007
      targetPort: 5007
  type: ClusterIP
```

### ml-service (GPU-enabled)

```yaml
# k8s/services/python/ml-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ml-service
  labels:
    app: ml-service
    tier: ml
    stack: python
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ml-service
  template:
    metadata:
      labels:
        app: ml-service
        tier: ml
    spec:
      serviceAccountName: quckapp-service
      nodeSelector:
        kubernetes.io/accelerator: nvidia-tesla-v100
      containers:
        - name: ml-service
          image: quckapp.azurecr.io/ml-service:latest
          ports:
            - containerPort: 5008
              name: http
          env:
            - name: ENVIRONMENT
              valueFrom:
                configMapKeyRef:
                  name: quckapp-config
                  key: ENVIRONMENT
            - name: DATABRICKS_HOST
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: DATABRICKS_HOST
            - name: DATABRICKS_TOKEN
              valueFrom:
                secretKeyRef:
                  name: quckapp-secrets
                  key: DATABRICKS_TOKEN
            - name: MODEL_PATH
              value: "/models"
          resources:
            requests:
              memory: "4Gi"
              cpu: "2000m"
              nvidia.com/gpu: 1
            limits:
              memory: "8Gi"
              cpu: "4000m"
              nvidia.com/gpu: 1
          volumeMounts:
            - name: model-storage
              mountPath: /models
      volumes:
        - name: model-storage
          persistentVolumeClaim:
            claimName: ml-models-pvc
```

### Python Services Summary

| Service | Port | GPU | Min Replicas | Max Replicas |
|---------|------|-----|--------------|--------------|
| analytics-service | 5007 | No | 2 | 10 |
| moderation-service | 5014 | No | 2 | 10 |
| export-service | 5015 | No | 1 | 5 |
| integration-service | 5016 | No | 2 | 10 |
| ml-service | 5008 | Yes | 2 | 10 |
| sentiment-service | 5017 | Yes | 2 | 8 |
| insights-service | 5018 | Yes | 1 | 5 |
| smart-reply-service | 5019 | Yes | 2 | 10 |

---

## Environment Overlays

### Kustomization for Dev

```yaml
# k8s/overlays/dev/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: quckapp

resources:
  - ../../base
  - ../../services/spring-boot/auth-service
  - ../../services/spring-boot/user-service
  - ../../services/spring-boot/permission-service
  - ../../services/spring-boot/audit-service
  - ../../services/spring-boot/admin-service
  - ../../services/nestjs/backend-gateway
  - ../../services/nestjs/realtime-service
  - ../../services/nestjs/notification-service
  - ../../services/elixir/realtime-service
  - ../../services/go/workspace-service
  - ../../services/go/channel-service
  - ../../services/go/search-service
  - ../../services/python/analytics-service

configMapGenerator:
  - name: quckapp-config
    literals:
      - ENVIRONMENT=dev
      - LOG_LEVEL=debug
      - KAFKA_BROKERS=kafka-dev.quckapp.internal:9092

images:
  - name: quckapp.azurecr.io/auth-service
    newTag: dev-latest
  - name: quckapp.azurecr.io/user-service
    newTag: dev-latest

replicas:
  - name: auth-service
    count: 2
  - name: backend-gateway
    count: 2
  - name: elixir-realtime
    count: 2
```

### Kustomization for Live

```yaml
# k8s/overlays/live/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: quckapp-prod

resources:
  - ../../base
  - ../../services/spring-boot/auth-service
  - ../../services/spring-boot/user-service
  - ../../services/spring-boot/permission-service
  - ../../services/spring-boot/audit-service
  - ../../services/spring-boot/admin-service
  - ../../services/nestjs/backend-gateway
  - ../../services/nestjs/realtime-service
  - ../../services/nestjs/notification-service
  - ../../services/elixir/realtime-service
  - ../../services/go/workspace-service
  - ../../services/go/channel-service
  - ../../services/go/search-service
  - ../../services/go/media-service
  - ../../services/go/file-service
  - ../../services/python/analytics-service
  - ../../services/python/ml-service
  - poddisruptionbudgets.yaml
  - networkpolicies.yaml

configMapGenerator:
  - name: quckapp-config
    literals:
      - ENVIRONMENT=production
      - LOG_LEVEL=warn
      - KAFKA_BROKERS=kafka-prod-1.quckapp.internal:9092,kafka-prod-2.quckapp.internal:9092,kafka-prod-3.quckapp.internal:9092

patchesStrategicMerge:
  - production-resources.yaml

replicas:
  - name: auth-service
    count: 5
  - name: backend-gateway
    count: 10
  - name: elixir-realtime
    count: 10
```

---

## Network Policies

```yaml
# k8s/base/network-policies.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
spec:
  podSelector: {}
  policyTypes:
    - Ingress
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-backend-to-database
spec:
  podSelector:
    matchLabels:
      tier: backend
  policyTypes:
    - Egress
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: database
      ports:
        - protocol: TCP
          port: 3306
        - protocol: TCP
          port: 5432
        - protocol: TCP
          port: 27017
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-ingress-to-gateway
spec:
  podSelector:
    matchLabels:
      app: backend-gateway
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 3000
```

---

## Pod Disruption Budgets

```yaml
# k8s/overlays/live/poddisruptionbudgets.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: auth-service-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: auth-service
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: backend-gateway-pdb
spec:
  minAvailable: 3
  selector:
    matchLabels:
      app: backend-gateway
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: elixir-realtime-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: elixir-realtime
```
