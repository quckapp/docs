---
sidebar_position: 1
---

# GitHub Actions CI

GitHub Actions handles all Continuous Integration (CI) tasks including building, testing, linting, security scanning, and publishing container images.

## CI Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    GitHub Actions CI Pipeline                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Trigger: Push to main/develop, Pull Request                           │
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │   Checkout  │ →  │  Setup Env  │ →  │    Cache    │                 │
│  │    Code     │    │  (Runtime)  │    │Dependencies │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│                                              │                          │
│         ┌────────────────────────────────────┴────────────────┐        │
│         ▼                        ▼                            ▼        │
│  ┌─────────────┐         ┌─────────────┐              ┌─────────────┐  │
│  │    Build    │         │    Test     │              │    Lint     │  │
│  │   Compile   │         │ Unit/Integ  │              │  Format     │  │
│  └─────────────┘         └─────────────┘              └─────────────┘  │
│         │                        │                            │        │
│         └────────────────────────┼────────────────────────────┘        │
│                                  ▼                                      │
│                    ┌─────────────────────────┐                         │
│                    │   Security Scanning     │                         │
│                    │  SAST, Secrets, Deps    │                         │
│                    └─────────────────────────┘                         │
│                                  │                                      │
│                                  ▼                                      │
│                    ┌─────────────────────────┐                         │
│                    │   Build & Push Image    │                         │
│                    │   to Azure ACR          │                         │
│                    └─────────────────────────┘                         │
│                                  │                                      │
│                                  ▼                                      │
│                    ┌─────────────────────────┐                         │
│                    │  Trigger Azure DevOps   │                         │
│                    │  CD Pipeline            │                         │
│                    └─────────────────────────┘                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Shared Workflow Components

### Reusable Workflows

All services use reusable workflows stored in `.github/workflows/`:

```yaml
# .github/workflows/shared-ci.yml
name: Shared CI Components

on:
  workflow_call:
    inputs:
      service_name:
        required: true
        type: string
      tech_stack:
        required: true
        type: string
    secrets:
      ACR_USERNAME:
        required: true
      ACR_PASSWORD:
        required: true
      SONAR_TOKEN:
        required: false
```

---

## Spring Boot CI Workflow

### `.github/workflows/spring-boot-ci.yml`

```yaml
name: Spring Boot CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'services/spring-boot/**'
  pull_request:
    branches: [main, develop]
    paths:
      - 'services/spring-boot/**'

env:
  JAVA_VERSION: '21'
  MAVEN_OPTS: '-Xmx3072m'
  ACR_REGISTRY: quckapp.azurecr.io

jobs:
  build-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - auth-service
          - user-service
          - permission-service
          - audit-service
          - admin-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: ${{ env.JAVA_VERSION }}
          distribution: 'temurin'
          cache: maven

      - name: Cache Maven dependencies
        uses: actions/cache@v4
        with:
          path: ~/.m2/repository
          key: ${{ runner.os }}-maven-${{ hashFiles('**/pom.xml') }}
          restore-keys: |
            ${{ runner.os }}-maven-

      - name: Build with Maven
        working-directory: services/spring-boot/${{ matrix.service }}
        run: |
          mvn clean compile -DskipTests -B

      - name: Run Unit Tests
        working-directory: services/spring-boot/${{ matrix.service }}
        run: |
          mvn test -B -Dspring.profiles.active=test

      - name: Run Integration Tests
        working-directory: services/spring-boot/${{ matrix.service }}
        run: |
          mvn verify -DskipUnitTests -B -Dspring.profiles.active=integration

      - name: Code Coverage (JaCoCo)
        working-directory: services/spring-boot/${{ matrix.service }}
        run: |
          mvn jacoco:report

      - name: Upload Coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          file: services/spring-boot/${{ matrix.service }}/target/site/jacoco/jacoco.xml
          flags: ${{ matrix.service }}

      - name: Checkstyle Lint
        working-directory: services/spring-boot/${{ matrix.service }}
        run: |
          mvn checkstyle:check

      - name: SpotBugs Analysis
        working-directory: services/spring-boot/${{ matrix.service }}
        run: |
          mvn spotbugs:check

  security-scan:
    runs-on: ubuntu-latest
    needs: build-test
    strategy:
      matrix:
        service:
          - auth-service
          - user-service
          - permission-service
          - audit-service
          - admin-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: OWASP Dependency Check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          project: 'quckapp-${{ matrix.service }}'
          path: 'services/spring-boot/${{ matrix.service }}'
          format: 'HTML'
          args: >
            --failOnCVSS 7
            --enableRetired

      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        with:
          projectBaseDir: services/spring-boot/${{ matrix.service }}

      - name: Trivy Vulnerability Scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: 'services/spring-boot/${{ matrix.service }}'
          severity: 'CRITICAL,HIGH'

  build-push-image:
    runs-on: ubuntu-latest
    needs: [build-test, security-scan]
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    strategy:
      matrix:
        service:
          - auth-service
          - user-service
          - permission-service
          - audit-service
          - admin-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: ${{ env.JAVA_VERSION }}
          distribution: 'temurin'
          cache: maven

      - name: Build JAR
        working-directory: services/spring-boot/${{ matrix.service }}
        run: |
          mvn package -DskipTests -B

      - name: Login to Azure ACR
        uses: azure/docker-login@v1
        with:
          login-server: ${{ env.ACR_REGISTRY }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Build and Push Docker Image
        working-directory: services/spring-boot/${{ matrix.service }}
        run: |
          IMAGE_TAG="${{ env.ACR_REGISTRY }}/${{ matrix.service }}:${{ github.sha }}"
          IMAGE_LATEST="${{ env.ACR_REGISTRY }}/${{ matrix.service }}:latest"

          docker build -t $IMAGE_TAG -t $IMAGE_LATEST .
          docker push $IMAGE_TAG
          docker push $IMAGE_LATEST

      - name: Trigger Azure DevOps CD
        uses: azure/pipelines@v1
        with:
          azure-devops-project-url: 'https://dev.azure.com/quckapp/QuckApp'
          azure-pipeline-name: 'spring-boot-cd'
          azure-devops-token: ${{ secrets.AZURE_DEVOPS_PAT }}
          azure-pipeline-variables: '{"SERVICE_NAME": "${{ matrix.service }}", "IMAGE_TAG": "${{ github.sha }}"}'
```

### Spring Boot Dockerfile

```dockerfile
# services/spring-boot/{service}/Dockerfile
FROM eclipse-temurin:21-jre-alpine AS runtime

WORKDIR /app

# Security: Non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

COPY target/*.jar app.jar

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
```

---

## NestJS CI Workflow

### `.github/workflows/nestjs-ci.yml`

```yaml
name: NestJS CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'services/nestjs/**'
  pull_request:
    branches: [main, develop]
    paths:
      - 'services/nestjs/**'

env:
  NODE_VERSION: '20'
  ACR_REGISTRY: quckapp.azurecr.io

jobs:
  build-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - backend-gateway
          - realtime-service
          - notification-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: services/nestjs/${{ matrix.service }}/package-lock.json

      - name: Install dependencies
        working-directory: services/nestjs/${{ matrix.service }}
        run: npm ci

      - name: Build
        working-directory: services/nestjs/${{ matrix.service }}
        run: npm run build

      - name: Run Unit Tests
        working-directory: services/nestjs/${{ matrix.service }}
        run: npm run test -- --coverage --watchAll=false

      - name: Run E2E Tests
        working-directory: services/nestjs/${{ matrix.service }}
        run: npm run test:e2e -- --watchAll=false

      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          file: services/nestjs/${{ matrix.service }}/coverage/lcov.info
          flags: ${{ matrix.service }}

      - name: ESLint
        working-directory: services/nestjs/${{ matrix.service }}
        run: npm run lint

      - name: Prettier Check
        working-directory: services/nestjs/${{ matrix.service }}
        run: npm run format:check

  security-scan:
    runs-on: ubuntu-latest
    needs: build-test
    strategy:
      matrix:
        service:
          - backend-gateway
          - realtime-service
          - notification-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: NPM Audit
        working-directory: services/nestjs/${{ matrix.service }}
        run: npm audit --audit-level=high
        continue-on-error: true

      - name: Snyk Security Scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high
          command: test
        continue-on-error: true

      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        with:
          projectBaseDir: services/nestjs/${{ matrix.service }}

  build-push-image:
    runs-on: ubuntu-latest
    needs: [build-test, security-scan]
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    strategy:
      matrix:
        service:
          - backend-gateway
          - realtime-service
          - notification-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Login to Azure ACR
        uses: azure/docker-login@v1
        with:
          login-server: ${{ env.ACR_REGISTRY }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Build and Push Docker Image
        working-directory: services/nestjs/${{ matrix.service }}
        run: |
          IMAGE_TAG="${{ env.ACR_REGISTRY }}/${{ matrix.service }}:${{ github.sha }}"
          IMAGE_LATEST="${{ env.ACR_REGISTRY }}/${{ matrix.service }}:latest"

          docker build -t $IMAGE_TAG -t $IMAGE_LATEST .
          docker push $IMAGE_TAG
          docker push $IMAGE_LATEST

      - name: Trigger Azure DevOps CD
        uses: azure/pipelines@v1
        with:
          azure-devops-project-url: 'https://dev.azure.com/quckapp/QuckApp'
          azure-pipeline-name: 'nestjs-cd'
          azure-devops-token: ${{ secrets.AZURE_DEVOPS_PAT }}
          azure-pipeline-variables: '{"SERVICE_NAME": "${{ matrix.service }}", "IMAGE_TAG": "${{ github.sha }}"}'
```

### NestJS Dockerfile

```dockerfile
# services/nestjs/{service}/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -u 1001 -S nestjs -G nodejs

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
```

---

## Elixir CI Workflow

### `.github/workflows/elixir-ci.yml`

```yaml
name: Elixir CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'services/elixir/**'
  pull_request:
    branches: [main, develop]
    paths:
      - 'services/elixir/**'

env:
  OTP_VERSION: '26.2'
  ELIXIR_VERSION: '1.16.0'
  ACR_REGISTRY: quckapp.azurecr.io

jobs:
  build-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - realtime-service
          - presence-service
          - call-service
          - message-service
          - notification-orchestrator
          - huddle-service
          - event-broadcast-service

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: quckapp_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Elixir
        uses: erlef/setup-beam@v1
        with:
          otp-version: ${{ env.OTP_VERSION }}
          elixir-version: ${{ env.ELIXIR_VERSION }}

      - name: Cache deps
        uses: actions/cache@v4
        with:
          path: |
            services/elixir/${{ matrix.service }}/deps
            services/elixir/${{ matrix.service }}/_build
          key: ${{ runner.os }}-mix-${{ hashFiles('**/mix.lock') }}
          restore-keys: |
            ${{ runner.os }}-mix-

      - name: Install dependencies
        working-directory: services/elixir/${{ matrix.service }}
        run: |
          mix local.hex --force
          mix local.rebar --force
          mix deps.get

      - name: Compile
        working-directory: services/elixir/${{ matrix.service }}
        run: mix compile --warnings-as-errors

      - name: Check formatting
        working-directory: services/elixir/${{ matrix.service }}
        run: mix format --check-formatted

      - name: Run Credo (Linting)
        working-directory: services/elixir/${{ matrix.service }}
        run: mix credo --strict

      - name: Run Dialyzer (Type checking)
        working-directory: services/elixir/${{ matrix.service }}
        run: mix dialyzer --halt-exit-status

      - name: Run Tests
        working-directory: services/elixir/${{ matrix.service }}
        env:
          MIX_ENV: test
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/quckapp_test
          REDIS_URL: redis://localhost:6379
        run: |
          mix ecto.create
          mix ecto.migrate
          mix test --cover

      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          file: services/elixir/${{ matrix.service }}/cover/excoveralls.json
          flags: ${{ matrix.service }}

  security-scan:
    runs-on: ubuntu-latest
    needs: build-test
    strategy:
      matrix:
        service:
          - realtime-service
          - presence-service
          - call-service
          - message-service
          - notification-orchestrator
          - huddle-service
          - event-broadcast-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Elixir
        uses: erlef/setup-beam@v1
        with:
          otp-version: ${{ env.OTP_VERSION }}
          elixir-version: ${{ env.ELIXIR_VERSION }}

      - name: Install dependencies
        working-directory: services/elixir/${{ matrix.service }}
        run: |
          mix local.hex --force
          mix deps.get

      - name: Security Audit (mix_audit)
        working-directory: services/elixir/${{ matrix.service }}
        run: mix deps.audit

      - name: Sobelow Security Scan
        working-directory: services/elixir/${{ matrix.service }}
        run: mix sobelow --config

      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        with:
          projectBaseDir: services/elixir/${{ matrix.service }}

  build-push-image:
    runs-on: ubuntu-latest
    needs: [build-test, security-scan]
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    strategy:
      matrix:
        service:
          - realtime-service
          - presence-service
          - call-service
          - message-service
          - notification-orchestrator
          - huddle-service
          - event-broadcast-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Login to Azure ACR
        uses: azure/docker-login@v1
        with:
          login-server: ${{ env.ACR_REGISTRY }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Build and Push Docker Image
        working-directory: services/elixir/${{ matrix.service }}
        run: |
          IMAGE_TAG="${{ env.ACR_REGISTRY }}/${{ matrix.service }}:${{ github.sha }}"
          IMAGE_LATEST="${{ env.ACR_REGISTRY }}/${{ matrix.service }}:latest"

          docker build -t $IMAGE_TAG -t $IMAGE_LATEST .
          docker push $IMAGE_TAG
          docker push $IMAGE_LATEST

      - name: Trigger Azure DevOps CD
        uses: azure/pipelines@v1
        with:
          azure-devops-project-url: 'https://dev.azure.com/quckapp/QuckApp'
          azure-pipeline-name: 'elixir-cd'
          azure-devops-token: ${{ secrets.AZURE_DEVOPS_PAT }}
          azure-pipeline-variables: '{"SERVICE_NAME": "${{ matrix.service }}", "IMAGE_TAG": "${{ github.sha }}"}'
```

### Elixir Dockerfile

```dockerfile
# services/elixir/{service}/Dockerfile
FROM elixir:1.16-otp-26-alpine AS builder

ENV MIX_ENV=prod

WORKDIR /app

RUN apk add --no-cache build-base git

COPY mix.exs mix.lock ./
COPY config config

RUN mix local.hex --force && \
    mix local.rebar --force && \
    mix deps.get --only prod && \
    mix deps.compile

COPY lib lib
COPY priv priv

RUN mix compile && \
    mix release

FROM alpine:3.19 AS runtime

RUN apk add --no-cache libstdc++ openssl ncurses-libs

WORKDIR /app

RUN addgroup -g 1001 -S elixir && \
    adduser -u 1001 -S elixir -G elixir

COPY --from=builder --chown=elixir:elixir /app/_build/prod/rel/qukchat_realtime ./

USER elixir

ENV HOME=/app
ENV PHX_SERVER=true

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["bin/qukchat_realtime", "start"]
```

---

## Go CI Workflow

### `.github/workflows/go-ci.yml`

```yaml
name: Go CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'services/go/**'
  pull_request:
    branches: [main, develop]
    paths:
      - 'services/go/**'

env:
  GO_VERSION: '1.22'
  ACR_REGISTRY: quckapp.azurecr.io

jobs:
  build-test:
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
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}
          cache-dependency-path: services/go/${{ matrix.service }}/go.sum

      - name: Download dependencies
        working-directory: services/go/${{ matrix.service }}
        run: go mod download

      - name: Build
        working-directory: services/go/${{ matrix.service }}
        run: go build -v ./...

      - name: Run Tests
        working-directory: services/go/${{ matrix.service }}
        run: go test -v -race -coverprofile=coverage.out -covermode=atomic ./...

      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          file: services/go/${{ matrix.service }}/coverage.out
          flags: ${{ matrix.service }}

      - name: Run golangci-lint
        uses: golangci/golangci-lint-action@v4
        with:
          version: latest
          working-directory: services/go/${{ matrix.service }}
          args: --timeout=5m

      - name: Run go vet
        working-directory: services/go/${{ matrix.service }}
        run: go vet ./...

  security-scan:
    runs-on: ubuntu-latest
    needs: build-test
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
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}

      - name: Run Gosec Security Scanner
        uses: securego/gosec@master
        with:
          args: '-no-fail -fmt sarif -out gosec.sarif ./...'
        env:
          GOFLAGS: '-buildvcs=false'

      - name: Upload SARIF file
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: gosec.sarif

      - name: Run govulncheck
        working-directory: services/go/${{ matrix.service }}
        run: |
          go install golang.org/x/vuln/cmd/govulncheck@latest
          govulncheck ./...

      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        with:
          projectBaseDir: services/go/${{ matrix.service }}

  build-push-image:
    runs-on: ubuntu-latest
    needs: [build-test, security-scan]
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
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
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Login to Azure ACR
        uses: azure/docker-login@v1
        with:
          login-server: ${{ env.ACR_REGISTRY }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Build and Push Docker Image
        working-directory: services/go/${{ matrix.service }}
        run: |
          IMAGE_TAG="${{ env.ACR_REGISTRY }}/${{ matrix.service }}:${{ github.sha }}"
          IMAGE_LATEST="${{ env.ACR_REGISTRY }}/${{ matrix.service }}:latest"

          docker build -t $IMAGE_TAG -t $IMAGE_LATEST .
          docker push $IMAGE_TAG
          docker push $IMAGE_LATEST

      - name: Trigger Azure DevOps CD
        uses: azure/pipelines@v1
        with:
          azure-devops-project-url: 'https://dev.azure.com/quckapp/QuckApp'
          azure-pipeline-name: 'go-cd'
          azure-devops-token: ${{ secrets.AZURE_DEVOPS_PAT }}
          azure-pipeline-variables: '{"SERVICE_NAME": "${{ matrix.service }}", "IMAGE_TAG": "${{ github.sha }}"}'
```

### Go Dockerfile

```dockerfile
# services/go/{service}/Dockerfile
FROM golang:1.22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/service ./cmd/main.go

FROM scratch

COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/service /service

EXPOSE 8080

ENTRYPOINT ["/service"]
```

---

## Python CI Workflow

### `.github/workflows/python-ci.yml`

```yaml
name: Python CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'services/python/**'
  pull_request:
    branches: [main, develop]
    paths:
      - 'services/python/**'

env:
  PYTHON_VERSION: '3.12'
  ACR_REGISTRY: quckapp.azurecr.io

jobs:
  build-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - analytics-service
          - moderation-service
          - export-service
          - integration-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: 'pip'
          cache-dependency-path: services/python/${{ matrix.service }}/requirements.txt

      - name: Install dependencies
        working-directory: services/python/${{ matrix.service }}
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install -r requirements-dev.txt

      - name: Run Tests with pytest
        working-directory: services/python/${{ matrix.service }}
        run: |
          pytest --cov=. --cov-report=xml --cov-report=html -v

      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          file: services/python/${{ matrix.service }}/coverage.xml
          flags: ${{ matrix.service }}

      - name: Run Ruff Linter
        working-directory: services/python/${{ matrix.service }}
        run: ruff check .

      - name: Run Black Formatter
        working-directory: services/python/${{ matrix.service }}
        run: black --check .

      - name: Run mypy Type Checker
        working-directory: services/python/${{ matrix.service }}
        run: mypy . --ignore-missing-imports

  security-scan:
    runs-on: ubuntu-latest
    needs: build-test
    strategy:
      matrix:
        service:
          - analytics-service
          - moderation-service
          - export-service
          - integration-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Run Bandit Security Scanner
        working-directory: services/python/${{ matrix.service }}
        run: |
          pip install bandit
          bandit -r . -f json -o bandit-report.json || true

      - name: Run Safety Check
        working-directory: services/python/${{ matrix.service }}
        run: |
          pip install safety
          safety check -r requirements.txt --json > safety-report.json || true

      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        with:
          projectBaseDir: services/python/${{ matrix.service }}

  build-push-image:
    runs-on: ubuntu-latest
    needs: [build-test, security-scan]
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    strategy:
      matrix:
        service:
          - analytics-service
          - moderation-service
          - export-service
          - integration-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Login to Azure ACR
        uses: azure/docker-login@v1
        with:
          login-server: ${{ env.ACR_REGISTRY }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Build and Push Docker Image
        working-directory: services/python/${{ matrix.service }}
        run: |
          IMAGE_TAG="${{ env.ACR_REGISTRY }}/${{ matrix.service }}:${{ github.sha }}"
          IMAGE_LATEST="${{ env.ACR_REGISTRY }}/${{ matrix.service }}:latest"

          docker build -t $IMAGE_TAG -t $IMAGE_LATEST .
          docker push $IMAGE_TAG
          docker push $IMAGE_LATEST

      - name: Trigger Azure DevOps CD
        uses: azure/pipelines@v1
        with:
          azure-devops-project-url: 'https://dev.azure.com/quckapp/QuckApp'
          azure-pipeline-name: 'python-cd'
          azure-devops-token: ${{ secrets.AZURE_DEVOPS_PAT }}
          azure-pipeline-variables: '{"SERVICE_NAME": "${{ matrix.service }}", "IMAGE_TAG": "${{ github.sha }}"}'
```

### Python ML Services CI Workflow

### `.github/workflows/python-ml-ci.yml`

```yaml
name: Python ML CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'services/python/ml-*'
      - 'services/python/sentiment-*'
      - 'services/python/insights-*'
      - 'services/python/smart-reply-*'
  pull_request:
    branches: [main, develop]

env:
  PYTHON_VERSION: '3.12'
  ACR_REGISTRY: quckapp.azurecr.io

jobs:
  build-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - ml-service
          - sentiment-service
          - insights-service
          - smart-reply-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install dependencies
        working-directory: services/python/${{ matrix.service }}
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install -r requirements-dev.txt

      - name: Run Tests
        working-directory: services/python/${{ matrix.service }}
        run: pytest --cov=. --cov-report=xml -v

      - name: Run Model Tests
        working-directory: services/python/${{ matrix.service }}
        run: pytest tests/model_tests/ -v --tb=short

      - name: Lint with Ruff
        working-directory: services/python/${{ matrix.service }}
        run: ruff check .

  model-validation:
    runs-on: ubuntu-latest
    needs: build-test
    strategy:
      matrix:
        service:
          - ml-service
          - sentiment-service
          - insights-service
          - smart-reply-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Download Model Artifacts
        working-directory: services/python/${{ matrix.service }}
        run: |
          # Download from Azure Blob or Databricks
          az storage blob download-batch \
            --account-name quckappml \
            --source models/${{ matrix.service }} \
            --destination ./models

      - name: Validate Model Performance
        working-directory: services/python/${{ matrix.service }}
        run: |
          python scripts/validate_model.py \
            --model-path ./models \
            --min-accuracy 0.85 \
            --max-latency-ms 100

  build-push-image:
    runs-on: ubuntu-latest
    needs: [build-test, model-validation]
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    strategy:
      matrix:
        service:
          - ml-service
          - sentiment-service
          - insights-service
          - smart-reply-service

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Login to Azure ACR
        uses: azure/docker-login@v1
        with:
          login-server: ${{ env.ACR_REGISTRY }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Build and Push Docker Image
        working-directory: services/python/${{ matrix.service }}
        run: |
          IMAGE_TAG="${{ env.ACR_REGISTRY }}/${{ matrix.service }}:${{ github.sha }}"
          docker build -t $IMAGE_TAG .
          docker push $IMAGE_TAG

      - name: Trigger Azure DevOps CD
        uses: azure/pipelines@v1
        with:
          azure-devops-project-url: 'https://dev.azure.com/quckapp/QuckApp'
          azure-pipeline-name: 'python-ml-cd'
          azure-devops-token: ${{ secrets.AZURE_DEVOPS_PAT }}
          azure-pipeline-variables: '{"SERVICE_NAME": "${{ matrix.service }}", "IMAGE_TAG": "${{ github.sha }}"}'
```

### Python Dockerfile

```dockerfile
# services/python/{service}/Dockerfile
FROM python:3.12-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

FROM python:3.12-slim AS runtime

WORKDIR /app

RUN groupadd -g 1001 python && \
    useradd -u 1001 -g python python

COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/* && rm -rf /wheels

COPY --chown=python:python . .

USER python

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## GitHub Secrets Configuration

Required secrets in GitHub repository settings:

| Secret | Description |
|--------|-------------|
| `ACR_USERNAME` | Azure Container Registry username |
| `ACR_PASSWORD` | Azure Container Registry password |
| `AZURE_DEVOPS_PAT` | Azure DevOps Personal Access Token |
| `SONAR_TOKEN` | SonarCloud authentication token |
| `SNYK_TOKEN` | Snyk security scanning token |
| `CODECOV_TOKEN` | Codecov coverage upload token |

---

## Branch Protection Rules

Configure branch protection for `main` and `develop`:

```yaml
# Required status checks
required_status_checks:
  strict: true
  contexts:
    - "build-test"
    - "security-scan"
    - "SonarCloud Code Analysis"

# Required reviews
required_pull_request_reviews:
  required_approving_review_count: 2
  dismiss_stale_reviews: true
  require_code_owner_reviews: true

# Other settings
enforce_admins: true
required_linear_history: true
allow_force_pushes: false
allow_deletions: false
```
