---
sidebar_position: 7
---

# CI/CD Pipeline

QuckApp uses GitHub Actions for continuous integration and deployment with automated testing, building, and deployment to Kubernetes.

## Pipeline Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    Push     │───▶│    Build    │───▶│    Test     │───▶│   Deploy    │
│   to Git    │    │   & Lint    │    │   & Scan    │    │ to K8s/ECS  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │                  │
       │                  ▼                  ▼                  ▼
       │           ┌───────────┐      ┌───────────┐      ┌───────────┐
       │           │  Docker   │      │  Unit &   │      │  Staging  │
       │           │   Build   │      │Integration│      │ → Prod    │
       │           └───────────┘      │   Tests   │      └───────────┘
       │                              └───────────┘
       │
       └── PR: Run tests only
           Main: Deploy to staging
           Tag: Deploy to production
```

## GitHub Actions Workflows

### Main CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: registry.QuckApp.dev
  NODE_VERSION: '20'
  GO_VERSION: '1.21'
  JAVA_VERSION: '17'
  PYTHON_VERSION: '3.11'

jobs:
  # ===================
  # DETECT CHANGES
  # ===================
  changes:
    runs-on: ubuntu-latest
    outputs:
      backend: ${{ steps.filter.outputs.backend }}
      auth: ${{ steps.filter.outputs.auth }}
      go-services: ${{ steps.filter.outputs.go-services }}
      python-services: ${{ steps.filter.outputs.python-services }}
      elixir-services: ${{ steps.filter.outputs.elixir-services }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v2
        id: filter
        with:
          filters: |
            backend:
              - 'backend/**'
            auth:
              - 'services/auth-service/**'
            go-services:
              - 'services/*-service/**/*.go'
            python-services:
              - 'services/*-service/**/*.py'
            elixir-services:
              - 'services/*-service/**/*.ex'

  # ===================
  # BACKEND (NestJS)
  # ===================
  backend:
    needs: changes
    if: needs.changes.outputs.backend == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        working-directory: backend
        run: npm ci

      - name: Lint
        working-directory: backend
        run: npm run lint

      - name: Type check
        working-directory: backend
        run: npm run type-check

      - name: Unit tests
        working-directory: backend
        run: npm run test:cov

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: backend/coverage/lcov.info
          flags: backend

      - name: Build
        working-directory: backend
        run: npm run build

      - name: Build Docker image
        if: github.event_name == 'push'
        run: |
          docker build -t $REGISTRY/backend:${{ github.sha }} ./backend
          docker push $REGISTRY/backend:${{ github.sha }}

  # ===================
  # AUTH SERVICE (Spring Boot)
  # ===================
  auth-service:
    needs: changes
    if: needs.changes.outputs.auth == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          java-version: ${{ env.JAVA_VERSION }}
          distribution: 'temurin'
          cache: 'gradle'

      - name: Build with Gradle
        working-directory: services/auth-service
        run: ./gradlew build

      - name: Run tests
        working-directory: services/auth-service
        run: ./gradlew test

      - name: Build Docker image
        if: github.event_name == 'push'
        run: |
          docker build -t $REGISTRY/auth-service:${{ github.sha }} ./services/auth-service
          docker push $REGISTRY/auth-service:${{ github.sha }}

  # ===================
  # GO SERVICES
  # ===================
  go-services:
    needs: changes
    if: needs.changes.outputs.go-services == 'true'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - workspace-service
          - channel-service
          - search-service
          - thread-service
          - bookmark-service
          - reminder-service
          - media-service
          - file-service
          - attachment-service
          - cdn-service
    steps:
      - uses: actions/checkout@v4

      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}
          cache-dependency-path: services/${{ matrix.service }}/go.sum

      - name: Lint
        uses: golangci/golangci-lint-action@v3
        with:
          working-directory: services/${{ matrix.service }}

      - name: Test
        working-directory: services/${{ matrix.service }}
        run: go test -v -race -coverprofile=coverage.out ./...

      - name: Build
        working-directory: services/${{ matrix.service }}
        run: CGO_ENABLED=0 go build -o main .

      - name: Build Docker image
        if: github.event_name == 'push'
        run: |
          docker build -t $REGISTRY/${{ matrix.service }}:${{ github.sha }} ./services/${{ matrix.service }}
          docker push $REGISTRY/${{ matrix.service }}:${{ github.sha }}

  # ===================
  # PYTHON SERVICES
  # ===================
  python-services:
    needs: changes
    if: needs.changes.outputs.python-services == 'true'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - analytics-service
          - moderation-service
          - export-service
          - integration-service
          - ml-service
          - sentiment-service
          - insights-service
          - smart-reply-service
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: 'pip'
          cache-dependency-path: services/${{ matrix.service }}/requirements.txt

      - name: Install dependencies
        working-directory: services/${{ matrix.service }}
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-cov ruff

      - name: Lint
        working-directory: services/${{ matrix.service }}
        run: ruff check .

      - name: Test
        working-directory: services/${{ matrix.service }}
        run: pytest --cov=. --cov-report=xml

      - name: Build Docker image
        if: github.event_name == 'push'
        run: |
          docker build -t $REGISTRY/${{ matrix.service }}:${{ github.sha }} ./services/${{ matrix.service }}
          docker push $REGISTRY/${{ matrix.service }}:${{ github.sha }}

  # ===================
  # SECURITY SCAN
  # ===================
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'CRITICAL,HIGH'

      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --all-projects

  # ===================
  # DEPLOY TO STAGING
  # ===================
  deploy-staging:
    needs: [backend, auth-service, go-services, python-services, security]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Setup kubectl
        uses: azure/setup-kubectl@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name QuckApp-staging

      - name: Deploy to staging
        run: |
          kubectl set image deployment/backend \
            backend=$REGISTRY/backend:${{ github.sha }} \
            -n QuckApp-core

          kubectl rollout status deployment/backend -n QuckApp-core

      - name: Run smoke tests
        run: |
          ./scripts/smoke-tests.sh https://staging.QuckApp.dev
```

### Production Deployment

```yaml
# .github/workflows/deploy-prod.yml
name: Deploy to Production

on:
  release:
    types: [published]

jobs:
  deploy-production:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Setup kubectl
        uses: azure/setup-kubectl@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name QuckApp-production

      - name: Deploy with Helm
        run: |
          helm upgrade --install QuckApp ./helm/QuckApp \
            -f helm/QuckApp/values-prod.yaml \
            --set global.image.tag=${{ github.event.release.tag_name }} \
            --namespace QuckApp-core \
            --wait --timeout 10m

      - name: Verify deployment
        run: |
          kubectl get pods -n QuckApp-core
          kubectl rollout status deployment/backend -n QuckApp-core

      - name: Notify Slack
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Production deployment completed: ${{ github.event.release.tag_name }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## Environment Configuration

### Staging

```yaml
# environments/staging/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: QuckApp-staging

resources:
  - ../../base

patches:
  - patch: |-
      - op: replace
        path: /spec/replicas
        value: 2
    target:
      kind: Deployment

configMapGenerator:
  - name: app-config
    behavior: merge
    literals:
      - LOG_LEVEL=debug
      - ENVIRONMENT=staging
```

### Production

```yaml
# environments/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: QuckApp-production

resources:
  - ../../base

patches:
  - patch: |-
      - op: replace
        path: /spec/replicas
        value: 5
    target:
      kind: Deployment

configMapGenerator:
  - name: app-config
    behavior: merge
    literals:
      - LOG_LEVEL=info
      - ENVIRONMENT=production
```

## Rollback Procedures

```bash
# View deployment history
kubectl rollout history deployment/backend -n QuckApp-core

# Rollback to previous version
kubectl rollout undo deployment/backend -n QuckApp-core

# Rollback to specific revision
kubectl rollout undo deployment/backend --to-revision=3 -n QuckApp-core

# Helm rollback
helm rollback QuckApp 2 -n QuckApp-core
```

## Secrets Management

```yaml
# Using External Secrets Operator
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: database-credentials
  namespace: QuckApp-core
spec:
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: aws-secrets-manager
  target:
    name: database-credentials
  data:
    - secretKey: postgres-url
      remoteRef:
        key: QuckApp/production/database
        property: postgres_url
```
