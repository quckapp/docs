# Enterprise CI/CD Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a unified enterprise CI/CD pipeline: GitHub Actions (CI) builds/tests/pushes Docker images to ACR, then triggers Azure Pipelines (CD) which deploys through dev → qa → uat1 → uat2 → uat3 → staging → prod → live across 3 AKS clusters.

**Architecture:** Azure Pipelines CD uses reusable stage/job/step templates. Per-service pipelines (39 deployables) share the same templates. A coordinated deploy-all pipeline handles phased rollouts. GitHub Actions CI triggers Azure Pipelines via webhook after successful Docker push. Helm chart already exists — we add per-environment values and per-service overrides.

**Tech Stack:** Azure Pipelines YAML, GitHub Actions, Helm 3, Terraform (AzureRM), AKS, ACR, Kustomize

**Design Doc:** `docs/plans/2026-02-27-enterprise-cicd-design.md`

---

## Existing Infrastructure (DO NOT recreate)

These already exist and should be referenced/extended, not duplicated:

| Component | Path | Status |
|-----------|------|--------|
| Azure Pipelines CD template | `infrastructure/azure-pipelines/cd-main.yml` | Exists — refactor into new structure |
| Azure Pipelines CI template | `infrastructure/azure-pipelines/ci-main.yml` | Exists — keep for CI |
| Deploy steps template | `infrastructure/azure-pipelines/templates/deploy-steps.yml` | Exists — extract into new templates |
| Docker build templates | `infrastructure/azure-pipelines/templates/docker-build-*.yml` | Exists — keep |
| Smoke test template | `infrastructure/azure-pipelines/templates/smoke-tests.yml` | Exists — wrap in new job template |
| Integration test template | `infrastructure/azure-pipelines/templates/integration-tests.yml` | Exists — keep |
| Rollback template | `infrastructure/azure-pipelines/templates/rollback.yml` | Exists — wrap in new job template |
| Variable groups doc | `infrastructure/azure-pipelines/variable-groups.yml` | Exists — extend |
| Helm chart | `infrastructure/helm/quckapp/` | Exists — add missing env values |
| Helm templates (deploy, svc, hpa, pdb, etc.) | `infrastructure/helm/quckapp/templates/` | Exists — no changes |
| Helm env values | `infrastructure/helm/quckapp/values-*.yaml` | Exists for dev/qa/staging/prod/uat1-3 |
| K8s base + overlays | `infrastructure/k8s/` | Exists — add live overlay |
| Terraform modules | `infrastructure/terraform/modules/` | Exists — add AKS module updates |
| Terraform environments | `infrastructure/terraform/environments/` | Exists for dev/qa/staging/prod/live |
| GitHub CI workflow | `.github/workflows/ci.yml` | Exists — add webhook trigger |
| GitHub Docker build | `.github/workflows/docker-build.yml` | Exists — add webhook trigger |
| GitHub K8s deploy | `.github/workflows/k8s-deploy.yml` | Exists — keep as-is (AWS path) |
| GitHub promote workflow | `.github/workflows/promote-environment.yml` | Exists — keep |
| GitHub DB migrate workflow | `.github/workflows/db-migrate.yml` | Exists — keep |

---

## Phase 1: Azure Pipelines CD — Reusable Templates

Foundation templates that all per-service pipelines will reference.

### Task 1: Create ACR login step template

**Files:**
- Create: `infrastructure/azure-pipelines/templates/steps/acr-login.yml`

**Context:** This step template handles Azure Container Registry authentication. Used by every deploy job. The existing `deploy-steps.yml` already does ACR login inline — we extract it into a reusable step.

**Step 1: Create the step template**

```yaml
# infrastructure/azure-pipelines/templates/steps/acr-login.yml
# Reusable step: Authenticate to Azure Container Registry
parameters:
  - name: azureSubscription
    type: string
    default: 'QuckApp-Azure'
  - name: acrName
    type: string
    default: 'quckappacr'

steps:
  - task: AzureCLI@2
    displayName: 'Login to ACR'
    inputs:
      azureSubscription: ${{ parameters.azureSubscription }}
      scriptType: bash
      scriptLocation: inlineScript
      inlineScript: |
        az acr login --name ${{ parameters.acrName }}
        echo "##vso[task.setvariable variable=ACR_LOGIN_SERVER]${{ parameters.acrName }}.azurecr.io"
```

**Step 2: Validate YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('infrastructure/azure-pipelines/templates/steps/acr-login.yml'))"`
Expected: No errors

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/templates/steps/acr-login.yml
git commit -m "feat(cd): add ACR login step template"
```

---

### Task 2: Create AKS credentials step template

**Files:**
- Create: `infrastructure/azure-pipelines/templates/steps/aks-credentials.yml`

**Context:** Gets kubeconfig for the target AKS cluster. The cluster name is determined by the environment parameter — mapping to AKS-NONPROD (dev/qa/uat1-3), AKS-STAGING, or AKS-PROD (prod/live).

**Step 1: Create the step template**

```yaml
# infrastructure/azure-pipelines/templates/steps/aks-credentials.yml
# Reusable step: Get AKS kubeconfig for target cluster
parameters:
  - name: environment
    type: string
  - name: azureSubscription
    type: string
    default: 'QuckApp-Azure'
  - name: resourceGroup
    type: string
    default: 'quckapp-rg'

steps:
  - task: AzureCLI@2
    displayName: 'Get AKS credentials (${{ parameters.environment }})'
    inputs:
      azureSubscription: ${{ parameters.azureSubscription }}
      scriptType: bash
      scriptLocation: inlineScript
      inlineScript: |
        # Map environment to AKS cluster
        case "${{ parameters.environment }}" in
          dev|qa|uat1|uat2|uat3)
            CLUSTER_NAME="aks-nonprod"
            ;;
          staging)
            CLUSTER_NAME="aks-staging"
            ;;
          prod|live)
            CLUSTER_NAME="aks-prod"
            ;;
          *)
            echo "##vso[task.logissue type=error]Unknown environment: ${{ parameters.environment }}"
            exit 1
            ;;
        esac

        echo "Connecting to cluster: $CLUSTER_NAME (namespace: ${{ parameters.environment }})"
        az aks get-credentials \
          --resource-group ${{ parameters.resourceGroup }} \
          --name $CLUSTER_NAME \
          --overwrite-existing

        # Verify connectivity
        kubectl cluster-info
        echo "##vso[task.setvariable variable=AKS_CLUSTER_NAME]$CLUSTER_NAME"
        echo "##vso[task.setvariable variable=K8S_NAMESPACE]${{ parameters.environment }}"
```

**Step 2: Validate YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('infrastructure/azure-pipelines/templates/steps/aks-credentials.yml'))"`
Expected: No errors

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/templates/steps/aks-credentials.yml
git commit -m "feat(cd): add AKS credentials step template"
```

---

### Task 3: Create notification step template

**Files:**
- Create: `infrastructure/azure-pipelines/templates/steps/notify.yml`

**Context:** Sends Slack/Teams notifications. Dev/QA/UAT: failure only. Staging: all. Prod/Live: Slack + Teams + email.

**Step 1: Create the step template**

```yaml
# infrastructure/azure-pipelines/templates/steps/notify.yml
# Reusable step: Send deployment notifications
parameters:
  - name: environment
    type: string
  - name: serviceName
    type: string
  - name: status
    type: string  # 'success' or 'failure'
  - name: imageTag
    type: string
    default: ''
  - name: slackWebhookVar
    type: string
    default: 'SLACK_WEBHOOK_URL'
  - name: teamsWebhookVar
    type: string
    default: 'TEAMS_WEBHOOK_URL'

steps:
  - bash: |
      ENV="${{ parameters.environment }}"
      STATUS="${{ parameters.status }}"
      SERVICE="${{ parameters.serviceName }}"
      TAG="${{ parameters.imageTag }}"

      # Determine notification level
      SEND_SLACK=false
      SEND_TEAMS=false

      case "$ENV" in
        dev|qa|uat1|uat2|uat3)
          # Only notify on failure
          if [ "$STATUS" = "failure" ]; then
            SEND_SLACK=true
          fi
          ;;
        staging)
          # Always notify
          SEND_SLACK=true
          ;;
        prod|live)
          # All channels
          SEND_SLACK=true
          SEND_TEAMS=true
          ;;
      esac

      # Color and emoji
      if [ "$STATUS" = "success" ]; then
        COLOR="#36a64f"
        EMOJI="white_check_mark"
        TEXT="deployed successfully"
      else
        COLOR="#ff0000"
        EMOJI="x"
        TEXT="deployment FAILED"
      fi

      # Slack notification
      if [ "$SEND_SLACK" = "true" ] && [ -n "$(${{ parameters.slackWebhookVar }})" ]; then
        curl -sf -X POST "$(${{ parameters.slackWebhookVar }})" \
          -H 'Content-Type: application/json' \
          -d "{
            \"attachments\": [{
              \"color\": \"$COLOR\",
              \"text\": \":$EMOJI: *$SERVICE* $TEXT to *$ENV*\",
              \"fields\": [
                {\"title\": \"Service\", \"value\": \"$SERVICE\", \"short\": true},
                {\"title\": \"Environment\", \"value\": \"$ENV\", \"short\": true},
                {\"title\": \"Image Tag\", \"value\": \"$TAG\", \"short\": true},
                {\"title\": \"Pipeline\", \"value\": \"$(Build.BuildNumber)\", \"short\": true}
              ]
            }]
          }" || echo "Slack notification failed (non-fatal)"
      fi

      # Teams notification
      if [ "$SEND_TEAMS" = "true" ] && [ -n "$(${{ parameters.teamsWebhookVar }})" ]; then
        curl -sf -X POST "$(${{ parameters.teamsWebhookVar }})" \
          -H 'Content-Type: application/json' \
          -d "{
            \"@type\": \"MessageCard\",
            \"themeColor\": \"$COLOR\",
            \"summary\": \"$SERVICE $TEXT to $ENV\",
            \"sections\": [{
              \"activityTitle\": \"$SERVICE $TEXT to $ENV\",
              \"facts\": [
                {\"name\": \"Service\", \"value\": \"$SERVICE\"},
                {\"name\": \"Environment\", \"value\": \"$ENV\"},
                {\"name\": \"Image Tag\", \"value\": \"$TAG\"},
                {\"name\": \"Pipeline\", \"value\": \"$(Build.BuildNumber)\"}
              ]
            }]
          }" || echo "Teams notification failed (non-fatal)"
      fi
    displayName: 'Send notifications (${{ parameters.environment }}/${{ parameters.status }})'
    condition: always()
    env:
      SLACK_WEBHOOK_URL: $(${{ parameters.slackWebhookVar }})
      TEAMS_WEBHOOK_URL: $(${{ parameters.teamsWebhookVar }})
```

**Step 2: Validate YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('infrastructure/azure-pipelines/templates/steps/notify.yml'))"`
Expected: No errors

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/templates/steps/notify.yml
git commit -m "feat(cd): add notification step template"
```

---

### Task 4: Create Helm deploy job template

**Files:**
- Create: `infrastructure/azure-pipelines/templates/jobs/helm-deploy.yml`

**Context:** The core deployment job. Runs ACR login, gets AKS credentials, does `helm upgrade --install` for a single service, then waits for rollout. References the existing Helm chart at `infrastructure/helm/quckapp/`.

**Step 1: Create the job template**

```yaml
# infrastructure/azure-pipelines/templates/jobs/helm-deploy.yml
# Reusable job: Deploy a single service via Helm
parameters:
  - name: environment
    type: string
  - name: serviceName
    type: string
  - name: imageTag
    type: string
  - name: helmTimeout
    type: string
    default: '15m'
  - name: azureSubscription
    type: string
    default: 'QuckApp-Azure'
  - name: acrName
    type: string
    default: 'quckappacr'
  - name: resourceGroup
    type: string
    default: 'quckapp-rg'
  - name: helmChartPath
    type: string
    default: 'infrastructure/helm/quckapp'

jobs:
  - job: HelmDeploy_${{ replace(parameters.serviceName, '-', '_') }}_${{ parameters.environment }}
    displayName: 'Helm Deploy ${{ parameters.serviceName }} → ${{ parameters.environment }}'
    pool:
      vmImage: 'ubuntu-latest'
    steps:
      # ACR login
      - template: ../steps/acr-login.yml
        parameters:
          azureSubscription: ${{ parameters.azureSubscription }}
          acrName: ${{ parameters.acrName }}

      # AKS credentials
      - template: ../steps/aks-credentials.yml
        parameters:
          environment: ${{ parameters.environment }}
          azureSubscription: ${{ parameters.azureSubscription }}
          resourceGroup: ${{ parameters.resourceGroup }}

      # Helm deploy
      - bash: |
          NAMESPACE="${{ parameters.environment }}"
          SERVICE="${{ parameters.serviceName }}"
          IMAGE_TAG="${{ parameters.imageTag }}"
          ACR="${{ parameters.acrName }}.azurecr.io"
          CHART_PATH="${{ parameters.helmChartPath }}"
          ENV="${{ parameters.environment }}"

          echo "Deploying $SERVICE:$IMAGE_TAG to $NAMESPACE"

          # Build Helm set arguments for this specific service
          # Convert service-name to camelCase for Helm values key
          HELM_KEY=$(echo "$SERVICE" | sed -r 's/-(.)/\U\1/g')

          helm upgrade --install "quckapp-$SERVICE" "$CHART_PATH" \
            --namespace "$NAMESPACE" \
            --create-namespace \
            --values "$CHART_PATH/values.yaml" \
            --values "$CHART_PATH/values-$(echo $ENV | sed 's/uat[0-9]/uat/').yaml" \
            --set "global.environment=$ENV" \
            --set "global.imageRegistry=$ACR" \
            --set "${HELM_KEY}.image.repository=$ACR/quckapp/$SERVICE" \
            --set "${HELM_KEY}.image.tag=$IMAGE_TAG" \
            --set "${HELM_KEY}.enabled=true" \
            --timeout ${{ parameters.helmTimeout }} \
            --wait \
            --atomic

          echo "Helm deploy complete for $SERVICE"
        displayName: 'Helm upgrade --install ${{ parameters.serviceName }}'

      # Wait for rollout
      - bash: |
          NAMESPACE="${{ parameters.environment }}"
          SERVICE="${{ parameters.serviceName }}"

          echo "Waiting for rollout of $SERVICE in $NAMESPACE..."
          kubectl rollout status deployment/"$SERVICE" \
            --namespace "$NAMESPACE" \
            --timeout=600s

          echo "Rollout complete"
        displayName: 'Wait for rollout (${{ parameters.serviceName }})'
```

**Step 2: Validate YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('infrastructure/azure-pipelines/templates/jobs/helm-deploy.yml'))"`
Expected: No errors

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/templates/jobs/helm-deploy.yml
git commit -m "feat(cd): add Helm deploy job template"
```

---

### Task 5: Create smoke test job template

**Files:**
- Create: `infrastructure/azure-pipelines/templates/jobs/smoke-test.yml`

**Context:** Runs after Helm deploy. Curls the service health endpoint inside the cluster. If it fails, triggers rollback. References the existing `smoke-tests.yml` pattern.

**Step 1: Create the job template**

```yaml
# infrastructure/azure-pipelines/templates/jobs/smoke-test.yml
# Reusable job: Health check after deployment
parameters:
  - name: environment
    type: string
  - name: serviceName
    type: string
  - name: healthPath
    type: string
    default: '/health'
  - name: port
    type: number
    default: 80
  - name: retries
    type: number
    default: 5
  - name: retryDelay
    type: number
    default: 10
  - name: azureSubscription
    type: string
    default: 'QuckApp-Azure'
  - name: resourceGroup
    type: string
    default: 'quckapp-rg'

jobs:
  - job: SmokeTest_${{ replace(parameters.serviceName, '-', '_') }}_${{ parameters.environment }}
    displayName: 'Smoke Test ${{ parameters.serviceName }} (${{ parameters.environment }})'
    pool:
      vmImage: 'ubuntu-latest'
    steps:
      # AKS credentials
      - template: ../steps/aks-credentials.yml
        parameters:
          environment: ${{ parameters.environment }}
          azureSubscription: ${{ parameters.azureSubscription }}
          resourceGroup: ${{ parameters.resourceGroup }}

      # Health check via kubectl
      - bash: |
          NAMESPACE="${{ parameters.environment }}"
          SERVICE="${{ parameters.serviceName }}"
          HEALTH_PATH="${{ parameters.healthPath }}"
          PORT="${{ parameters.port }}"
          RETRIES=${{ parameters.retries }}
          DELAY=${{ parameters.retryDelay }}

          echo "Smoke testing $SERVICE at $HEALTH_PATH (namespace: $NAMESPACE)"

          for i in $(seq 1 $RETRIES); do
            echo "Attempt $i/$RETRIES..."
            RESULT=$(kubectl run smoke-test-$SERVICE-$RANDOM \
              --namespace "$NAMESPACE" \
              --image=curlimages/curl:latest \
              --restart=Never \
              --rm \
              --attach \
              --timeout=30s \
              -- curl -sf "http://$SERVICE:$PORT$HEALTH_PATH" 2>&1) && {
                echo "Health check passed: $RESULT"
                exit 0
            }
            echo "Attempt $i failed, waiting ${DELAY}s..."
            sleep $DELAY
          done

          echo "##vso[task.logissue type=error]Smoke test failed for $SERVICE after $RETRIES attempts"
          exit 1
        displayName: 'Health check ${{ parameters.serviceName }}'
```

**Step 2: Validate YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('infrastructure/azure-pipelines/templates/jobs/smoke-test.yml'))"`
Expected: No errors

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/templates/jobs/smoke-test.yml
git commit -m "feat(cd): add smoke test job template"
```

---

### Task 6: Create rollback job template

**Files:**
- Create: `infrastructure/azure-pipelines/templates/jobs/rollback.yml`

**Context:** Called when smoke test fails. Runs `helm rollback` to the previous release.

**Step 1: Create the job template**

```yaml
# infrastructure/azure-pipelines/templates/jobs/rollback.yml
# Reusable job: Helm rollback on deployment failure
parameters:
  - name: environment
    type: string
  - name: serviceName
    type: string
  - name: azureSubscription
    type: string
    default: 'QuckApp-Azure'
  - name: resourceGroup
    type: string
    default: 'quckapp-rg'

jobs:
  - job: Rollback_${{ replace(parameters.serviceName, '-', '_') }}_${{ parameters.environment }}
    displayName: 'Rollback ${{ parameters.serviceName }} (${{ parameters.environment }})'
    pool:
      vmImage: 'ubuntu-latest'
    condition: failed()
    steps:
      # AKS credentials
      - template: ../steps/aks-credentials.yml
        parameters:
          environment: ${{ parameters.environment }}
          azureSubscription: ${{ parameters.azureSubscription }}
          resourceGroup: ${{ parameters.resourceGroup }}

      # Helm rollback
      - bash: |
          NAMESPACE="${{ parameters.environment }}"
          SERVICE="${{ parameters.serviceName }}"

          echo "Rolling back $SERVICE in $NAMESPACE..."

          # Get current revision
          CURRENT=$(helm history "quckapp-$SERVICE" \
            --namespace "$NAMESPACE" \
            --max 2 \
            --output json | jq '.[0].revision')

          if [ -z "$CURRENT" ] || [ "$CURRENT" = "1" ]; then
            echo "##vso[task.logissue type=warning]No previous revision to rollback to"
            exit 0
          fi

          PREVIOUS=$((CURRENT - 1))
          echo "Rolling back from revision $CURRENT to $PREVIOUS"

          helm rollback "quckapp-$SERVICE" "$PREVIOUS" \
            --namespace "$NAMESPACE" \
            --wait \
            --timeout 10m

          # Verify rollback
          kubectl rollout status deployment/"$SERVICE" \
            --namespace "$NAMESPACE" \
            --timeout=300s

          echo "Rollback complete"
        displayName: 'Helm rollback ${{ parameters.serviceName }}'

      # Notify about rollback
      - template: ../steps/notify.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: ${{ parameters.serviceName }}
          status: 'failure'
```

**Step 2: Validate YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('infrastructure/azure-pipelines/templates/jobs/rollback.yml'))"`
Expected: No errors

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/templates/jobs/rollback.yml
git commit -m "feat(cd): add rollback job template"
```

---

### Task 7: Create deploy-to-AKS stage template

**Files:**
- Create: `infrastructure/azure-pipelines/templates/stages/deploy-to-aks.yml`

**Context:** The main reusable stage. Composes helm-deploy → smoke-test → rollback (on failure) → notify. Every per-service pipeline references this stage once per environment.

**Step 1: Create the stage template**

```yaml
# infrastructure/azure-pipelines/templates/stages/deploy-to-aks.yml
# Reusable stage: Full deploy cycle (deploy → smoke → rollback on fail → notify)
parameters:
  - name: environment
    type: string
  - name: serviceName
    type: string
  - name: imageTag
    type: string
  - name: healthPath
    type: string
    default: '/health'
  - name: port
    type: number
    default: 80
  - name: helmTimeout
    type: string
    default: '15m'
  - name: dependsOn
    type: object
    default: []
  - name: approval
    type: string
    default: 'none'  # 'none' or 'manual'
  - name: azureSubscription
    type: string
    default: 'QuckApp-Azure'
  - name: acrName
    type: string
    default: 'quckappacr'
  - name: resourceGroup
    type: string
    default: 'quckapp-rg'

stages:
  - stage: Deploy_${{ parameters.environment }}
    displayName: 'Deploy to ${{ parameters.environment }}'
    dependsOn: ${{ parameters.dependsOn }}
    ${{ if eq(parameters.approval, 'manual') }}:
      variables:
        - group: 'quckapp-${{ parameters.environment }}'
    ${{ else }}:
      variables:
        - group: 'quckapp-${{ parameters.environment }}'
    jobs:
      # Manual approval gate (prod/live only)
      - ${{ if eq(parameters.approval, 'manual') }}:
        - deployment: Approve_${{ parameters.environment }}
          displayName: 'Approve ${{ parameters.environment }} deployment'
          environment: 'quckapp-${{ parameters.environment }}'
          strategy:
            runOnce:
              deploy:
                steps:
                  - bash: echo "Approved for ${{ parameters.environment }}"

      # Helm deploy
      - template: ../jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: ${{ parameters.serviceName }}
          imageTag: ${{ parameters.imageTag }}
          helmTimeout: ${{ parameters.helmTimeout }}
          azureSubscription: ${{ parameters.azureSubscription }}
          acrName: ${{ parameters.acrName }}
          resourceGroup: ${{ parameters.resourceGroup }}

      # Smoke test
      - template: ../jobs/smoke-test.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: ${{ parameters.serviceName }}
          healthPath: ${{ parameters.healthPath }}
          port: ${{ parameters.port }}
          azureSubscription: ${{ parameters.azureSubscription }}
          resourceGroup: ${{ parameters.resourceGroup }}

      # Rollback on failure
      - template: ../jobs/rollback.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: ${{ parameters.serviceName }}
          azureSubscription: ${{ parameters.azureSubscription }}
          resourceGroup: ${{ parameters.resourceGroup }}

      # Success notification
      - job: Notify_${{ parameters.environment }}
        displayName: 'Notify (${{ parameters.environment }})'
        dependsOn:
          - SmokeTest_${{ replace(parameters.serviceName, '-', '_') }}_${{ parameters.environment }}
        condition: succeeded()
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - template: ../steps/notify.yml
            parameters:
              environment: ${{ parameters.environment }}
              serviceName: ${{ parameters.serviceName }}
              status: 'success'
              imageTag: ${{ parameters.imageTag }}
```

**Step 2: Validate YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('infrastructure/azure-pipelines/templates/stages/deploy-to-aks.yml'))"`
Expected: No errors

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/templates/stages/deploy-to-aks.yml
git commit -m "feat(cd): add deploy-to-AKS stage template"
```

---

### Task 8: Create DB migration stage template

**Files:**
- Create: `infrastructure/azure-pipelines/templates/stages/db-migrate.yml`

**Context:** Runs database migrations as K8s Jobs before service deployment. Uses existing migration Docker images from `database/quckapp-*/`.

**Step 1: Create the stage template**

```yaml
# infrastructure/azure-pipelines/templates/stages/db-migrate.yml
# Reusable stage: Run database migrations as K8s Jobs
parameters:
  - name: environment
    type: string
  - name: databases
    type: object
    # Each item: { name: 'mysql', image: 'db-migrate-mysql', tag: 'latest' }
  - name: dependsOn
    type: object
    default: []
  - name: azureSubscription
    type: string
    default: 'QuckApp-Azure'
  - name: acrName
    type: string
    default: 'quckappacr'
  - name: resourceGroup
    type: string
    default: 'quckapp-rg'
  - name: timeout
    type: number
    default: 600

stages:
  - stage: DBMigrate_${{ parameters.environment }}
    displayName: 'DB Migrations (${{ parameters.environment }})'
    dependsOn: ${{ parameters.dependsOn }}
    jobs:
      - ${{ each db in parameters.databases }}:
        - job: Migrate_${{ db.name }}_${{ parameters.environment }}
          displayName: 'Migrate ${{ db.name }} (${{ parameters.environment }})'
          pool:
            vmImage: 'ubuntu-latest'
          steps:
            - template: ../steps/acr-login.yml
              parameters:
                azureSubscription: ${{ parameters.azureSubscription }}
                acrName: ${{ parameters.acrName }}

            - template: ../steps/aks-credentials.yml
              parameters:
                environment: ${{ parameters.environment }}
                azureSubscription: ${{ parameters.azureSubscription }}
                resourceGroup: ${{ parameters.resourceGroup }}

            - bash: |
                NAMESPACE="${{ parameters.environment }}"
                DB_NAME="${{ db.name }}"
                IMAGE="${{ parameters.acrName }}.azurecr.io/quckapp/${{ db.image }}:${{ db.tag }}"
                TIMEOUT=${{ parameters.timeout }}
                JOB_NAME="db-migrate-$DB_NAME-$(date +%s)"

                echo "Running $DB_NAME migration in $NAMESPACE"

                # Apply migration job
                cat <<MANIFEST | kubectl apply -n "$NAMESPACE" -f -
                apiVersion: batch/v1
                kind: Job
                metadata:
                  name: $JOB_NAME
                  labels:
                    app: db-migration
                    database: $DB_NAME
                spec:
                  backoffLimit: 1
                  activeDeadlineSeconds: $TIMEOUT
                  template:
                    spec:
                      restartPolicy: Never
                      containers:
                        - name: migrate
                          image: $IMAGE
                          envFrom:
                            - secretRef:
                                name: quckapp-db-$DB_NAME
                          env:
                            - name: ENVIRONMENT
                              value: "$NAMESPACE"
                MANIFEST

                # Wait for completion
                echo "Waiting for migration job $JOB_NAME..."
                kubectl wait --for=condition=complete \
                  job/$JOB_NAME \
                  --namespace "$NAMESPACE" \
                  --timeout=${TIMEOUT}s || {
                    echo "##vso[task.logissue type=error]Migration failed for $DB_NAME"
                    kubectl logs job/$JOB_NAME --namespace "$NAMESPACE" --tail=50
                    exit 1
                  }

                echo "$DB_NAME migration complete"
              displayName: 'Run ${{ db.name }} migration'
```

**Step 2: Validate YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('infrastructure/azure-pipelines/templates/stages/db-migrate.yml'))"`
Expected: No errors

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/templates/stages/db-migrate.yml
git commit -m "feat(cd): add DB migration stage template"
```

---

### Task 9: Create App Center deploy stage template

**Files:**
- Create: `infrastructure/azure-pipelines/templates/stages/deploy-to-app-center.yml`

**Context:** For mobile (React Native) and chat_app (Flutter). Builds APK/IPA and publishes to Azure App Center instead of AKS.

**Step 1: Create the stage template**

```yaml
# infrastructure/azure-pipelines/templates/stages/deploy-to-app-center.yml
# Reusable stage: Build and publish mobile app to Azure App Center
parameters:
  - name: environment
    type: string
  - name: appName
    type: string  # 'mobile' or 'chat-app'
  - name: platform
    type: string  # 'react-native' or 'flutter'
  - name: appCenterOrg
    type: string
    default: 'QuckApp'
  - name: dependsOn
    type: object
    default: []
  - name: approval
    type: string
    default: 'none'

stages:
  - stage: AppCenter_${{ replace(parameters.appName, '-', '_') }}_${{ parameters.environment }}
    displayName: 'App Center ${{ parameters.appName }} → ${{ parameters.environment }}'
    dependsOn: ${{ parameters.dependsOn }}
    jobs:
      - ${{ if eq(parameters.approval, 'manual') }}:
        - deployment: Approve_${{ replace(parameters.appName, '-', '_') }}_${{ parameters.environment }}
          displayName: 'Approve ${{ parameters.environment }}'
          environment: 'quckapp-${{ parameters.environment }}'
          strategy:
            runOnce:
              deploy:
                steps:
                  - bash: echo "Approved"

      # Determine distribution group
      - job: Build_${{ replace(parameters.appName, '-', '_') }}_${{ parameters.environment }}
        displayName: 'Build & Distribute (${{ parameters.environment }})'
        pool:
          vmImage: 'macos-latest'
        variables:
          DIST_GROUP: ${{ parameters.environment }}
        steps:
          - checkout: self
            submodules: true

          # React Native setup
          - ${{ if eq(parameters.platform, 'react-native') }}:
            - task: NodeTool@0
              inputs:
                versionSpec: '18.x'
            - bash: |
                cd mobile
                npm ci
                npx react-native bundle --platform android --dev false \
                  --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle
              displayName: 'Build React Native bundle'

          # Flutter setup
          - ${{ if eq(parameters.platform, 'flutter') }}:
            - task: FlutterInstall@0
              inputs:
                mode: 'auto'
                channel: 'stable'
            - bash: |
                cd apps/chat_app
                flutter pub get
                flutter build apk --release
              displayName: 'Build Flutter APK'

          # Distribute to App Center
          - task: AppCenterDistribute@3
            inputs:
              serverEndpoint: 'AppCenter-${{ parameters.appCenterOrg }}'
              appSlug: '${{ parameters.appCenterOrg }}/${{ parameters.appName }}-android'
              appFile: |
                ${{ if eq(parameters.platform, 'react-native') }}:
                  mobile/android/app/build/outputs/apk/release/app-release.apk
                ${{ if eq(parameters.platform, 'flutter') }}:
                  apps/chat_app/build/app/outputs/flutter-apk/app-release.apk
              releaseNotesOption: 'input'
              releaseNotesInput: 'Automated deployment to ${{ parameters.environment }}'
              destinationType: 'groups'
              distributionGroupId: '$(DIST_GROUP)'
```

**Step 2: Validate YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('infrastructure/azure-pipelines/templates/stages/deploy-to-app-center.yml'))"`
Expected: No errors

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/templates/stages/deploy-to-app-center.yml
git commit -m "feat(cd): add App Center deploy stage template"
```

---

## Phase 2: Environment Variable Files

### Task 10: Create per-environment Azure Pipelines variable files

**Files:**
- Create: `infrastructure/azure-pipelines/variables/dev.yml`
- Create: `infrastructure/azure-pipelines/variables/qa.yml`
- Create: `infrastructure/azure-pipelines/variables/uat1.yml`
- Create: `infrastructure/azure-pipelines/variables/uat2.yml`
- Create: `infrastructure/azure-pipelines/variables/uat3.yml`
- Create: `infrastructure/azure-pipelines/variables/staging.yml`
- Create: `infrastructure/azure-pipelines/variables/prod.yml`
- Create: `infrastructure/azure-pipelines/variables/live.yml`

**Context:** Each environment has its own variable file with cluster name, namespace, replica counts, resource limits, domain, and feature flags.

**Step 1: Create all 8 variable files**

Use this pattern for each, adjusting values per environment:

```yaml
# infrastructure/azure-pipelines/variables/dev.yml
variables:
  environment: 'dev'
  aksCluster: 'aks-nonprod'
  namespace: 'dev'
  domain: 'dev.quckapp.com'
  replicaCount: 1
  helmTimeout: '15m'
  logLevel: 'debug'
  resourceCpu: '100m'
  resourceMemory: '128Mi'
  resourceLimitCpu: '500m'
  resourceLimitMemory: '512Mi'
  enableHpa: 'false'
  enablePdb: 'false'
  ingressClass: 'nginx'
  tlsEnabled: 'true'
  imageRegistry: 'quckappacr.azurecr.io'
```

Differences by environment:

| Variable | dev | qa | uat1-3 | staging | prod | live |
|----------|-----|----|----|---------|------|------|
| aksCluster | aks-nonprod | aks-nonprod | aks-nonprod | aks-staging | aks-prod | aks-prod |
| replicaCount | 1 | 1 | 2 | 2 | 3 | 3 |
| logLevel | debug | info | info | info | warn | warn |
| enableHpa | false | false | false | true | true | true |
| enablePdb | false | false | false | true | true | true |
| helmTimeout | 15m | 15m | 15m | 20m | 20m | 20m |
| resourceCpu | 100m | 100m | 200m | 250m | 500m | 500m |
| resourceMemory | 128Mi | 128Mi | 256Mi | 256Mi | 512Mi | 512Mi |
| domain | dev.quckapp.com | qa.quckapp.com | uat{N}.quckapp.com | staging.quckapp.com | quckapp.com | live.quckapp.com |

**Step 2: Validate all 8 files**

Run: `for f in infrastructure/azure-pipelines/variables/*.yml; do echo "Checking $f..."; python -c "import yaml; yaml.safe_load(open('$f'))"; done`
Expected: No errors

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/variables/
git commit -m "feat(cd): add per-environment variable files for all 8 environments"
```

---

## Phase 3: Per-Service CD Pipelines

### Task 11: Create the per-service pipeline generator script

**Files:**
- Create: `scripts/gen-cd-pipelines.py`

**Context:** Rather than manually writing 39 nearly identical YAML files, we generate them from a service registry. Each pipeline: triggered by webhook from GitHub Actions CI, deploys through all 8 environments using the stage template.

**Step 1: Create the generator script**

```python
#!/usr/bin/env python3
"""Generate Azure Pipelines CD YAML for all deployable services."""

import os
import yaml

# Service registry: name → { stack, healthPath, port }
BACKEND_SERVICES = {
    # Go services
    'attachment-service':    {'stack': 'go',      'healthPath': '/health', 'port': 80},
    'bookmark-service':      {'stack': 'go',      'healthPath': '/health', 'port': 80},
    'cdn-service':           {'stack': 'go',      'healthPath': '/health', 'port': 80},
    'channel-service':       {'stack': 'go',      'healthPath': '/health', 'port': 80},
    'file-service':          {'stack': 'go',      'healthPath': '/health', 'port': 80},
    'go-bff':                {'stack': 'go',      'healthPath': '/health', 'port': 80},
    'media-service':         {'stack': 'go',      'healthPath': '/health', 'port': 80},
    'reminder-service':      {'stack': 'go',      'healthPath': '/health', 'port': 80},
    'search-service':        {'stack': 'go',      'healthPath': '/health', 'port': 80},
    'thread-service':        {'stack': 'go',      'healthPath': '/health', 'port': 80},
    'workspace-service':     {'stack': 'go',      'healthPath': '/health', 'port': 80},
    # Java/Spring services
    'admin-service':         {'stack': 'spring',  'healthPath': '/api/v1/admin/actuator/health', 'port': 80},
    'audit-service':         {'stack': 'spring',  'healthPath': '/api/v1/audit/actuator/health', 'port': 80},
    'auth-service':          {'stack': 'spring',  'healthPath': '/api/v1/auth/actuator/health', 'port': 80},
    'permission-service':    {'stack': 'spring',  'healthPath': '/api/v1/permission/actuator/health', 'port': 80},
    'security-service':      {'stack': 'spring',  'healthPath': '/api/v1/security/actuator/health', 'port': 80},
    'user-service':          {'stack': 'spring',  'healthPath': '/api/v1/user/actuator/health', 'port': 80},
    # Python/FastAPI services
    'analytics-service':     {'stack': 'python',  'healthPath': '/health', 'port': 80},
    'export-service':        {'stack': 'python',  'healthPath': '/health', 'port': 80},
    'insights-service':      {'stack': 'python',  'healthPath': '/health', 'port': 80},
    'integration-service':   {'stack': 'python',  'healthPath': '/health', 'port': 80},
    'ml-service':            {'stack': 'python',  'healthPath': '/health', 'port': 80},
    'moderation-service':    {'stack': 'python',  'healthPath': '/health', 'port': 80},
    'sentiment-service':     {'stack': 'python',  'healthPath': '/health', 'port': 80},
    'smart-reply-service':   {'stack': 'python',  'healthPath': '/health', 'port': 80},
    'spark-etl':             {'stack': 'python',  'healthPath': '/health', 'port': 80},
    # Elixir/Phoenix services
    'call-service':              {'stack': 'elixir', 'healthPath': '/health', 'port': 80},
    'event-broadcast-service':   {'stack': 'elixir', 'healthPath': '/health', 'port': 80},
    'huddle-service':            {'stack': 'elixir', 'healthPath': '/health', 'port': 80},
    'message-service':           {'stack': 'elixir', 'healthPath': '/health', 'port': 80},
    'notification-orchestrator': {'stack': 'elixir', 'healthPath': '/health', 'port': 80},
    'presence-service':          {'stack': 'elixir', 'healthPath': '/health', 'port': 80},
    'realtime-service':          {'stack': 'elixir', 'healthPath': '/health', 'port': 80},
    # Node/NestJS services
    'backend-gateway':       {'stack': 'nestjs',  'healthPath': '/api/v1/health/live', 'port': 80},
    'notification-service':  {'stack': 'nestjs',  'healthPath': '/api/v1/health', 'port': 80},
}

# Environments in promotion order
ENVIRONMENTS = [
    {'name': 'dev',     'dependsOn': [],             'approval': 'none'},
    {'name': 'qa',      'dependsOn': ['Deploy_dev'],  'approval': 'none'},
    {'name': 'uat1',    'dependsOn': ['Deploy_qa'],   'approval': 'none'},
    {'name': 'uat2',    'dependsOn': ['Deploy_uat1'], 'approval': 'none'},
    {'name': 'uat3',    'dependsOn': ['Deploy_uat2'], 'approval': 'none'},
    {'name': 'staging', 'dependsOn': ['Deploy_uat3'], 'approval': 'none'},
    {'name': 'prod',    'dependsOn': ['Deploy_staging'], 'approval': 'manual'},
    {'name': 'live',    'dependsOn': ['Deploy_prod'],    'approval': 'manual'},
]

OUTPUT_DIR = 'infrastructure/azure-pipelines/per-service'


def generate_pipeline(service_name, service_info):
    """Generate a CD pipeline YAML for a single service."""
    health_path = service_info['healthPath']
    port = service_info['port']

    # Build stages list
    stages = []
    for env in ENVIRONMENTS:
        stages.append({
            'template': '../templates/stages/deploy-to-aks.yml',
            'parameters': {
                'environment': env['name'],
                'serviceName': service_name,
                'imageTag': '$(imageTag)',
                'healthPath': health_path,
                'port': port,
                'dependsOn': env['dependsOn'],
                'approval': env['approval'],
            }
        })

    pipeline = f"""# Auto-generated CD pipeline for {service_name}
# Do not edit manually — regenerate with: python scripts/gen-cd-pipelines.py

trigger: none  # Triggered by GitHub Actions webhook

resources:
  webhooks:
    - webhook: github_ci_{service_name.replace('-', '_')}
      connection: GitHubWebhook
      filters:
        - path: service
          value: {service_name}

parameters:
  - name: imageTag
    type: string
    displayName: 'Image tag to deploy'

variables:
  - name: imageTag
    value: ${{{{ parameters.imageTag }}}}

stages:
"""
    for env in ENVIRONMENTS:
        depends = ''
        if env['dependsOn']:
            depends = f"\n    dependsOn: {env['dependsOn']}"

        pipeline += f"""  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: '{env['name']}'
      serviceName: '{service_name}'
      imageTag: $(imageTag)
      healthPath: '{health_path}'
      port: {port}{depends}
      approval: '{env['approval']}'
"""

    return pipeline


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for service_name, service_info in sorted(BACKEND_SERVICES.items()):
        filename = f"cd-{service_name}.yml"
        filepath = os.path.join(OUTPUT_DIR, filename)
        content = generate_pipeline(service_name, service_info)

        with open(filepath, 'w', newline='\n') as f:
            f.write(content)

        print(f"Generated: {filepath}")

    print(f"\nGenerated {len(BACKEND_SERVICES)} CD pipelines in {OUTPUT_DIR}/")


if __name__ == '__main__':
    main()
```

**Step 2: Run the generator**

Run: `cd /d/Learning/QuckApp && python scripts/gen-cd-pipelines.py`
Expected: "Generated 35 CD pipelines in infrastructure/azure-pipelines/per-service/"

**Step 3: Validate a sample pipeline**

Run: `python -c "import yaml; yaml.safe_load(open('infrastructure/azure-pipelines/per-service/cd-auth-service.yml'))"`
Expected: No errors

**Step 4: Commit**

```bash
git add scripts/gen-cd-pipelines.py infrastructure/azure-pipelines/per-service/
git commit -m "feat(cd): generate per-service CD pipelines for all 35 backend services"
```

---

## Phase 4: Frontend & App CD Pipelines

### Task 12: Create web app CD pipeline

**Files:**
- Create: `infrastructure/azure-pipelines/per-app/cd-web.yml`

**Context:** React/Next.js app deployed as nginx container to AKS. Same 8-environment promotion as backend services.

**Step 1: Create the pipeline**

```yaml
# infrastructure/azure-pipelines/per-app/cd-web.yml
# CD pipeline for web frontend (React/Next.js → nginx container → AKS)
trigger: none

resources:
  webhooks:
    - webhook: github_ci_web
      connection: GitHubWebhook
      filters:
        - path: service
          value: web

parameters:
  - name: imageTag
    type: string
    displayName: 'Image tag to deploy'

variables:
  - name: imageTag
    value: ${{ parameters.imageTag }}

stages:
  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'dev'
      serviceName: 'web'
      imageTag: $(imageTag)
      healthPath: '/'
      approval: 'none'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'qa'
      serviceName: 'web'
      imageTag: $(imageTag)
      healthPath: '/'
      dependsOn: ['Deploy_dev']
      approval: 'none'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'uat1'
      serviceName: 'web'
      imageTag: $(imageTag)
      healthPath: '/'
      dependsOn: ['Deploy_qa']
      approval: 'none'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'uat2'
      serviceName: 'web'
      imageTag: $(imageTag)
      healthPath: '/'
      dependsOn: ['Deploy_uat1']
      approval: 'none'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'uat3'
      serviceName: 'web'
      imageTag: $(imageTag)
      healthPath: '/'
      dependsOn: ['Deploy_uat2']
      approval: 'none'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'staging'
      serviceName: 'web'
      imageTag: $(imageTag)
      healthPath: '/'
      dependsOn: ['Deploy_uat3']
      approval: 'none'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'prod'
      serviceName: 'web'
      imageTag: $(imageTag)
      healthPath: '/'
      dependsOn: ['Deploy_staging']
      approval: 'manual'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'live'
      serviceName: 'web'
      imageTag: $(imageTag)
      healthPath: '/'
      dependsOn: ['Deploy_prod']
      approval: 'manual'
```

**Step 2: Create admin dashboard, docs, service-urls pipelines** (same pattern, different serviceName)

Create `cd-admin-dashboard.yml`, `cd-docs.yml` with serviceName set to `admin`, `docs` respectively. Same 8-stage structure.

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/per-app/
git commit -m "feat(cd): add CD pipelines for web, admin, docs frontends"
```

---

### Task 13: Create mobile and chat_app CD pipelines

**Files:**
- Create: `infrastructure/azure-pipelines/per-app/cd-mobile.yml`
- Create: `infrastructure/azure-pipelines/per-app/cd-chat-app.yml`

**Context:** These deploy to Azure App Center, not AKS. Use the deploy-to-app-center stage template.

**Step 1: Create mobile pipeline**

```yaml
# infrastructure/azure-pipelines/per-app/cd-mobile.yml
# CD pipeline for mobile app (React Native → App Center)
trigger: none

resources:
  webhooks:
    - webhook: github_ci_mobile
      connection: GitHubWebhook
      filters:
        - path: service
          value: mobile

parameters:
  - name: imageTag
    type: string
    displayName: 'Build version'

stages:
  - template: ../templates/stages/deploy-to-app-center.yml
    parameters:
      environment: 'dev'
      appName: 'mobile'
      platform: 'react-native'

  - template: ../templates/stages/deploy-to-app-center.yml
    parameters:
      environment: 'qa'
      appName: 'mobile'
      platform: 'react-native'
      dependsOn: ['AppCenter_mobile_dev']

  - template: ../templates/stages/deploy-to-app-center.yml
    parameters:
      environment: 'uat1'
      appName: 'mobile'
      platform: 'react-native'
      dependsOn: ['AppCenter_mobile_qa']

  - template: ../templates/stages/deploy-to-app-center.yml
    parameters:
      environment: 'staging'
      appName: 'mobile'
      platform: 'react-native'
      dependsOn: ['AppCenter_mobile_uat1']

  - template: ../templates/stages/deploy-to-app-center.yml
    parameters:
      environment: 'prod'
      appName: 'mobile'
      platform: 'react-native'
      dependsOn: ['AppCenter_mobile_staging']
      approval: 'manual'
```

**Step 2: Create chat_app pipeline** (same pattern, `flutter` platform, `chat-app` appName)

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/per-app/cd-mobile.yml
git add infrastructure/azure-pipelines/per-app/cd-chat-app.yml
git commit -m "feat(cd): add CD pipelines for mobile (React Native) and chat_app (Flutter)"
```

---

## Phase 5: Infrastructure CD Pipelines

### Task 14: Create Kong, Envoy, monitoring, and DB migration CD pipelines

**Files:**
- Create: `infrastructure/azure-pipelines/infra/cd-kong.yml`
- Create: `infrastructure/azure-pipelines/infra/cd-envoy.yml`
- Create: `infrastructure/azure-pipelines/infra/cd-monitoring.yml`
- Create: `infrastructure/azure-pipelines/infra/cd-db-migrations.yml`

**Context:** Kong and Envoy deploy as ConfigMap updates. Monitoring deploys via Helm sub-chart. DB migrations use the db-migrate stage template.

**Step 1: Create Kong pipeline**

```yaml
# infrastructure/azure-pipelines/infra/cd-kong.yml
# CD pipeline for Kong API Gateway configuration
trigger: none

resources:
  webhooks:
    - webhook: github_ci_kong
      connection: GitHubWebhook
      filters:
        - path: service
          value: kong

parameters:
  - name: imageTag
    type: string
    displayName: 'Config version tag'

variables:
  - name: imageTag
    value: ${{ parameters.imageTag }}

stages:
  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'dev'
      serviceName: 'kong'
      imageTag: $(imageTag)
      healthPath: '/status'
      port: 8001
      approval: 'none'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'qa'
      serviceName: 'kong'
      imageTag: $(imageTag)
      healthPath: '/status'
      port: 8001
      dependsOn: ['Deploy_dev']
      approval: 'none'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'uat1'
      serviceName: 'kong'
      imageTag: $(imageTag)
      healthPath: '/status'
      port: 8001
      dependsOn: ['Deploy_qa']
      approval: 'none'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'uat2'
      serviceName: 'kong'
      imageTag: $(imageTag)
      healthPath: '/status'
      port: 8001
      dependsOn: ['Deploy_uat1']
      approval: 'none'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'uat3'
      serviceName: 'kong'
      imageTag: $(imageTag)
      healthPath: '/status'
      port: 8001
      dependsOn: ['Deploy_uat2']
      approval: 'none'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'staging'
      serviceName: 'kong'
      imageTag: $(imageTag)
      healthPath: '/status'
      port: 8001
      dependsOn: ['Deploy_uat3']
      approval: 'none'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'prod'
      serviceName: 'kong'
      imageTag: $(imageTag)
      healthPath: '/status'
      port: 8001
      dependsOn: ['Deploy_staging']
      approval: 'manual'

  - template: ../templates/stages/deploy-to-aks.yml
    parameters:
      environment: 'live'
      serviceName: 'kong'
      imageTag: $(imageTag)
      healthPath: '/status'
      port: 8001
      dependsOn: ['Deploy_prod']
      approval: 'manual'
```

**Step 2: Create Envoy and monitoring pipelines** (similar pattern, different healthPath)

**Step 3: Create DB migrations pipeline**

```yaml
# infrastructure/azure-pipelines/infra/cd-db-migrations.yml
# CD pipeline for all database migrations
trigger: none

parameters:
  - name: environment
    type: string
    values: [dev, qa, uat1, uat2, uat3, staging, prod, live]
  - name: databases
    type: object
    default:
      - { name: 'mysql',         image: 'db-migrate-mysql',         tag: 'latest' }
      - { name: 'postgresql',    image: 'db-migrate-postgresql',    tag: 'latest' }
      - { name: 'mongodb',       image: 'db-migrate-mongodb',       tag: 'latest' }
      - { name: 'elasticsearch', image: 'db-migrate-elasticsearch', tag: 'latest' }
      - { name: 'kafka',         image: 'db-migrate-kafka',         tag: 'latest' }
      - { name: 'clickhouse',    image: 'db-migrate-clickhouse',    tag: 'latest' }
      - { name: 'scylladb',      image: 'db-migrate-scylladb',      tag: 'latest' }
      - { name: 'dynamodb',      image: 'db-migrate-dynamodb',      tag: 'latest' }

stages:
  - template: ../templates/stages/db-migrate.yml
    parameters:
      environment: ${{ parameters.environment }}
      databases: ${{ parameters.databases }}
```

**Step 4: Commit**

```bash
git add infrastructure/azure-pipelines/infra/
git commit -m "feat(cd): add CD pipelines for Kong, Envoy, monitoring, and DB migrations"
```

---

## Phase 6: Coordinated Deploy-All Pipeline

### Task 15: Create the deploy-all coordinated release pipeline

**Files:**
- Create: `infrastructure/azure-pipelines/coordinated/cd-deploy-all.yml`

**Context:** Manual trigger. Deploys all services in dependency order across 8 phases. Used for coordinated releases (e.g., major version bumps, cross-service breaking changes).

**Step 1: Create the pipeline**

```yaml
# infrastructure/azure-pipelines/coordinated/cd-deploy-all.yml
# Coordinated release: deploy all services in dependency order
trigger: none  # Manual trigger only

parameters:
  - name: environment
    type: string
    values: [dev, qa, uat1, uat2, uat3, staging, prod, live]
    displayName: 'Target environment'
  - name: imageTag
    type: string
    displayName: 'Image tag (applied to all services)'
  - name: skipDbMigrations
    type: boolean
    default: false
    displayName: 'Skip database migrations'
  - name: skipInfra
    type: boolean
    default: false
    displayName: 'Skip infrastructure (Kong, Envoy, monitoring)'

variables:
  - template: ../variables/${{ parameters.environment }}.yml

stages:
  # Phase 1: Database migrations (all 8 in parallel)
  - ${{ if not(parameters.skipDbMigrations) }}:
    - template: ../templates/stages/db-migrate.yml
      parameters:
        environment: ${{ parameters.environment }}
        databases:
          - { name: 'mysql',         image: 'db-migrate-mysql',         tag: '${{ parameters.imageTag }}' }
          - { name: 'postgresql',    image: 'db-migrate-postgresql',    tag: '${{ parameters.imageTag }}' }
          - { name: 'mongodb',       image: 'db-migrate-mongodb',       tag: '${{ parameters.imageTag }}' }
          - { name: 'elasticsearch', image: 'db-migrate-elasticsearch', tag: '${{ parameters.imageTag }}' }
          - { name: 'kafka',         image: 'db-migrate-kafka',         tag: '${{ parameters.imageTag }}' }
          - { name: 'clickhouse',    image: 'db-migrate-clickhouse',    tag: '${{ parameters.imageTag }}' }
          - { name: 'scylladb',      image: 'db-migrate-scylladb',      tag: '${{ parameters.imageTag }}' }
          - { name: 'dynamodb',      image: 'db-migrate-dynamodb',      tag: '${{ parameters.imageTag }}' }

  # Phase 2: Infrastructure (Kong, Envoy, monitoring)
  - ${{ if not(parameters.skipInfra) }}:
    - stage: Infra
      displayName: 'Phase 2: Infrastructure'
      ${{ if not(parameters.skipDbMigrations) }}:
        dependsOn: ['DBMigrate_${{ parameters.environment }}']
      jobs:
        - template: ../templates/jobs/helm-deploy.yml
          parameters:
            environment: ${{ parameters.environment }}
            serviceName: 'kong'
            imageTag: ${{ parameters.imageTag }}
        - template: ../templates/jobs/helm-deploy.yml
          parameters:
            environment: ${{ parameters.environment }}
            serviceName: 'envoy'
            imageTag: ${{ parameters.imageTag }}

  # Phase 3: Core services (auth, user, permission, workspace)
  - stage: CoreServices
    displayName: 'Phase 3: Core Services'
    dependsOn:
      - ${{ if not(parameters.skipInfra) }}:
        - Infra
      - ${{ if and(parameters.skipInfra, not(parameters.skipDbMigrations)) }}:
        - DBMigrate_${{ parameters.environment }}
    jobs:
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'auth-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'user-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'permission-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'workspace-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'security-service'
          imageTag: ${{ parameters.imageTag }}

  # Phase 4: Business services
  - stage: BusinessServices
    displayName: 'Phase 4: Business Services'
    dependsOn: ['CoreServices']
    jobs:
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'channel-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'message-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'thread-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'bookmark-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'search-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'file-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'media-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'attachment-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'cdn-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'reminder-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'admin-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'audit-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'export-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'integration-service'
          imageTag: ${{ parameters.imageTag }}

  # Phase 5: Real-time & notification services
  - stage: RealtimeServices
    displayName: 'Phase 5: Realtime & Notification Services'
    dependsOn: ['BusinessServices']
    jobs:
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'realtime-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'presence-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'call-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'huddle-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'event-broadcast-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'notification-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'notification-orchestrator'
          imageTag: ${{ parameters.imageTag }}

  # Phase 6: AI/ML services
  - stage: AIServices
    displayName: 'Phase 6: AI/ML Services'
    dependsOn: ['BusinessServices']
    jobs:
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'ml-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'sentiment-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'smart-reply-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'moderation-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'analytics-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'insights-service'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'spark-etl'
          imageTag: ${{ parameters.imageTag }}

  # Phase 7: Gateway & frontend
  - stage: GatewayFrontend
    displayName: 'Phase 7: Gateways & Frontends'
    dependsOn: ['RealtimeServices', 'AIServices']
    jobs:
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'backend-gateway'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'go-bff'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'web'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'admin'
          imageTag: ${{ parameters.imageTag }}
      - template: ../templates/jobs/helm-deploy.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'docs'
          imageTag: ${{ parameters.imageTag }}

  # Phase 8: Cross-service smoke tests
  - stage: CrossServiceSmoke
    displayName: 'Phase 8: Cross-Service Smoke Tests'
    dependsOn: ['GatewayFrontend']
    jobs:
      - job: CrossServiceTests
        displayName: 'Cross-service integration tests'
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - template: ../templates/steps/aks-credentials.yml
            parameters:
              environment: ${{ parameters.environment }}

          - bash: |
              NAMESPACE="${{ parameters.environment }}"
              FAILED=0

              # Test core service chain
              SERVICES=(
                "auth-service:/api/v1/auth/actuator/health"
                "user-service:/api/v1/user/actuator/health"
                "permission-service:/api/v1/permission/actuator/health"
                "workspace-service:/health"
                "channel-service:/health"
                "message-service:/health"
                "go-bff:/health"
                "kong:/status"
              )

              for entry in "${SERVICES[@]}"; do
                SERVICE="${entry%%:*}"
                PATH="${entry#*:}"

                echo "Testing $SERVICE$PATH..."
                kubectl run smoke-$SERVICE-$(date +%s) \
                  --namespace "$NAMESPACE" \
                  --image=curlimages/curl:latest \
                  --restart=Never --rm --attach --timeout=30s \
                  -- curl -sf "http://$SERVICE$PATH" && {
                    echo "  PASS"
                } || {
                    echo "  FAIL"
                    FAILED=$((FAILED + 1))
                }
              done

              if [ $FAILED -gt 0 ]; then
                echo "##vso[task.logissue type=error]$FAILED cross-service tests failed"
                exit 1
              fi
              echo "All cross-service smoke tests passed"
            displayName: 'Cross-service health checks'
```

**Step 2: Validate YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('infrastructure/azure-pipelines/coordinated/cd-deploy-all.yml'))"`
Expected: No errors

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/coordinated/cd-deploy-all.yml
git commit -m "feat(cd): add coordinated deploy-all pipeline with 8-phase dependency ordering"
```

---

## Phase 7: GitHub Actions CI — Webhook Trigger

### Task 16: Add webhook trigger to GitHub Actions CI workflow

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/trigger-azure-cd.yml`

**Context:** After GitHub Actions CI successfully builds and pushes a Docker image to ACR, it triggers the corresponding Azure Pipelines CD pipeline via webhook. This is the bridge between CI (GitHub) and CD (Azure).

**Step 1: Create the webhook trigger workflow**

```yaml
# .github/workflows/trigger-azure-cd.yml
# Trigger Azure Pipelines CD after successful CI build
name: Trigger Azure CD

on:
  workflow_call:
    inputs:
      service_name:
        required: true
        type: string
      image_tag:
        required: true
        type: string
    secrets:
      AZURE_DEVOPS_PAT:
        required: true
      AZURE_DEVOPS_ORG:
        required: true

jobs:
  trigger-cd:
    name: Trigger Azure Pipelines CD
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Azure Pipeline for ${{ inputs.service_name }}
        run: |
          SERVICE="${{ inputs.service_name }}"
          IMAGE_TAG="${{ inputs.image_tag }}"
          ORG="${{ secrets.AZURE_DEVOPS_ORG }}"
          PAT="${{ secrets.AZURE_DEVOPS_PAT }}"
          PROJECT="QuckApp"

          # Pipeline name convention: cd-{service-name}
          PIPELINE_NAME="cd-${SERVICE}"

          echo "Triggering Azure Pipeline: $PIPELINE_NAME"
          echo "  Service: $SERVICE"
          echo "  Image Tag: $IMAGE_TAG"

          # Get pipeline ID by name
          PIPELINE_ID=$(curl -sf \
            -u ":$PAT" \
            "https://dev.azure.com/$ORG/$PROJECT/_apis/pipelines?api-version=7.0" \
            | jq -r ".value[] | select(.name == \"$PIPELINE_NAME\") | .id")

          if [ -z "$PIPELINE_ID" ] || [ "$PIPELINE_ID" = "null" ]; then
            echo "::warning::Pipeline '$PIPELINE_NAME' not found in Azure DevOps. Skipping CD trigger."
            exit 0
          fi

          echo "Found pipeline ID: $PIPELINE_ID"

          # Trigger the pipeline
          curl -sf -X POST \
            -u ":$PAT" \
            -H "Content-Type: application/json" \
            "https://dev.azure.com/$ORG/$PROJECT/_apis/pipelines/$PIPELINE_ID/runs?api-version=7.0" \
            -d "{
              \"templateParameters\": {
                \"imageTag\": \"$IMAGE_TAG\"
              },
              \"resources\": {
                \"repositories\": {
                  \"self\": {
                    \"refName\": \"refs/heads/main\"
                  }
                }
              }
            }"

          echo "Azure Pipeline triggered successfully"
```

**Step 2: Update the existing docker-build.yml to call trigger-azure-cd**

Read `docker-build.yml` first, then add a job at the end that calls `trigger-azure-cd.yml` after successful Docker push:

```yaml
  # Add this job after the existing build job
  trigger-cd:
    name: Trigger Azure CD
    needs: [build]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    uses: ./.github/workflows/trigger-azure-cd.yml
    with:
      service_name: ${{ inputs.service }}
      image_tag: ${{ needs.build.outputs.image_tag }}
    secrets:
      AZURE_DEVOPS_PAT: ${{ secrets.AZURE_DEVOPS_PAT }}
      AZURE_DEVOPS_ORG: ${{ secrets.AZURE_DEVOPS_ORG }}
```

**Step 3: Commit**

```bash
git add .github/workflows/trigger-azure-cd.yml
git add .github/workflows/docker-build.yml
git commit -m "feat(ci): add GitHub Actions → Azure Pipelines CD webhook trigger"
```

---

## Phase 8: Terraform AKS Cluster Configuration

### Task 17: Create AKS Terraform module for 3 clusters

**Files:**
- Modify: `infrastructure/terraform/modules/aks/main.tf` (extend existing module)
- Create: `infrastructure/terraform/environments/aks-nonprod.tfvars`
- Create: `infrastructure/terraform/environments/aks-staging.tfvars`
- Create: `infrastructure/terraform/environments/aks-prod.tfvars`

**Context:** The AKS module already exists. We need to ensure it supports the 3-cluster design: AKS-NONPROD (5 namespaces), AKS-STAGING (1 namespace), AKS-PROD (2 namespaces).

**Step 1: Read the existing AKS module**

Run: `cat infrastructure/terraform/modules/aks/main.tf`
Understand existing variables and resources.

**Step 2: Create AKS-NONPROD tfvars**

```hcl
# infrastructure/terraform/environments/aks-nonprod.tfvars
# AKS-NONPROD: dev, qa, uat1, uat2, uat3 namespaces
cluster_name    = "aks-nonprod"
resource_group  = "quckapp-nonprod-rg"
location        = "eastus2"
kubernetes_version = "1.28"

# Node pools
default_node_pool = {
  name       = "system"
  vm_size    = "Standard_D4s_v3"
  node_count = 3
  min_count  = 2
  max_count  = 6
  os_disk_size_gb = 128
}

workload_node_pools = [
  {
    name       = "goservices"
    vm_size    = "Standard_D4s_v3"
    min_count  = 2
    max_count  = 8
    labels     = { "workload" = "go" }
    taints     = []
  },
  {
    name       = "javaservices"
    vm_size    = "Standard_D4s_v3"
    min_count  = 2
    max_count  = 6
    labels     = { "workload" = "java" }
    taints     = []
  },
  {
    name       = "elixirservices"
    vm_size    = "Standard_D4s_v3"
    min_count  = 1
    max_count  = 4
    labels     = { "workload" = "elixir" }
    taints     = []
  },
  {
    name       = "pythonservices"
    vm_size    = "Standard_D4s_v3"
    min_count  = 1
    max_count  = 4
    labels     = { "workload" = "python" }
    taints     = []
  }
]

namespaces = ["dev", "qa", "uat1", "uat2", "uat3"]

# Networking
network_plugin    = "azure"
network_policy    = "calico"
service_cidr      = "10.0.0.0/16"
dns_service_ip    = "10.0.0.10"

# Monitoring
log_analytics_enabled = true
container_insights    = true

tags = {
  Environment = "nonprod"
  ManagedBy   = "terraform"
  Project     = "quckapp"
}
```

**Step 3: Create AKS-STAGING tfvars** (similar, 1 namespace: staging, Standard_D8s_v3)

**Step 4: Create AKS-PROD tfvars** (2 namespaces: prod/live, Standard_D8s_v3, HPA/PDB, multi-AZ)

**Step 5: Validate Terraform**

Run: `cd infrastructure/terraform && terraform validate`
Expected: "Success! The configuration is valid."

**Step 6: Commit**

```bash
git add infrastructure/terraform/environments/aks-*.tfvars
git commit -m "feat(infra): add Terraform tfvars for AKS-NONPROD, AKS-STAGING, AKS-PROD clusters"
```

---

### Task 18: Add Terraform workflow for AKS cluster provisioning

**Files:**
- Create: `.github/workflows/terraform-aks.yml`

**Context:** GitHub Actions workflow to plan/apply Terraform for the 3 AKS clusters. Separate from service deployment.

**Step 1: Create the workflow**

```yaml
# .github/workflows/terraform-aks.yml
name: Terraform AKS Clusters

on:
  workflow_dispatch:
    inputs:
      cluster:
        description: 'AKS cluster to manage'
        required: true
        type: choice
        options:
          - aks-nonprod
          - aks-staging
          - aks-prod
      action:
        description: 'Terraform action'
        required: true
        type: choice
        options:
          - plan
          - apply

permissions:
  id-token: write
  contents: read

jobs:
  terraform:
    name: Terraform ${{ inputs.action }} (${{ inputs.cluster }})
    runs-on: ubuntu-latest
    environment: ${{ inputs.cluster }}
    defaults:
      run:
        working-directory: infrastructure/terraform
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: '1.6'

      - name: Azure Login
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Terraform Init
        run: |
          terraform init \
            -backend-config="key=${{ inputs.cluster }}.tfstate"

      - name: Terraform Plan
        run: |
          terraform plan \
            -var-file="environments/${{ inputs.cluster }}.tfvars" \
            -out=tfplan

      - name: Terraform Apply
        if: inputs.action == 'apply'
        run: terraform apply tfplan
```

**Step 2: Commit**

```bash
git add .github/workflows/terraform-aks.yml
git commit -m "feat(infra): add Terraform workflow for AKS cluster provisioning"
```

---

## Phase 9: K8s Namespace & RBAC Setup

### Task 19: Add K8s overlay for live environment

**Files:**
- Create: `infrastructure/k8s/overlays/live/kustomization.yaml`

**Context:** The `live` namespace overlay is missing from the existing Kustomize structure. Dev, qa, staging, prod overlays exist. We add live.

**Step 1: Create the overlay**

```yaml
# infrastructure/k8s/overlays/live/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: live

resources:
  - ../../base

patches:
  - target:
      kind: ConfigMap
      name: quckapp-config
    patch: |
      - op: replace
        path: /data/ENVIRONMENT
        value: live
      - op: replace
        path: /data/LOG_LEVEL
        value: warn

images:
  - name: quckappacr.azurecr.io/quckapp/*
    newTag: live
```

**Step 2: Create UAT overlays** (uat1, uat2, uat3 — check if they exist first)

Run: `ls infrastructure/k8s/overlays/` to verify which exist

If missing, create `uat1/kustomization.yaml`, `uat2/kustomization.yaml`, `uat3/kustomization.yaml`.

**Step 3: Commit**

```bash
git add infrastructure/k8s/overlays/
git commit -m "feat(k8s): add Kustomize overlays for live and UAT environments"
```

---

## Phase 10: Documentation & Validation

### Task 20: Update variable-groups.yml documentation

**Files:**
- Modify: `infrastructure/azure-pipelines/variable-groups.yml`

**Context:** Update the variable groups documentation to reflect the new pipeline structure and all required Azure DevOps service connections.

**Step 1: Read existing file**

Run: `cat infrastructure/azure-pipelines/variable-groups.yml`

**Step 2: Add new sections for**:
- Per-environment variable groups (quckapp-dev through quckapp-live)
- Required service connections (QuckApp-Azure, QuckApp-ACR, GitHubWebhook, AppCenter-QuckApp)
- Required Azure DevOps environments (quckapp-dev through quckapp-live with approval policies)

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/variable-groups.yml
git commit -m "docs(cd): update Azure DevOps variable groups and service connections reference"
```

---

### Task 21: Validate all generated pipelines

**Files:**
- Create: `scripts/validate-pipelines.sh`

**Context:** A script that validates all Azure Pipelines YAML files have correct syntax and required parameters.

**Step 1: Create validation script**

```bash
#!/usr/bin/env bash
# Validate all Azure Pipelines YAML files
set -euo pipefail

ERRORS=0
CHECKED=0

echo "Validating Azure Pipelines YAML files..."
echo "========================================="

for yml in $(find infrastructure/azure-pipelines -name "*.yml" -type f); do
  CHECKED=$((CHECKED + 1))
  if python3 -c "import yaml; yaml.safe_load(open('$yml'))" 2>/dev/null; then
    echo "  PASS: $yml"
  else
    echo "  FAIL: $yml"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "========================================="
echo "Checked: $CHECKED files"
echo "Passed:  $((CHECKED - ERRORS))"
echo "Failed:  $ERRORS"

if [ $ERRORS -gt 0 ]; then
  echo "VALIDATION FAILED"
  exit 1
fi
echo "ALL PASSED"
```

**Step 2: Run validation**

Run: `bash scripts/validate-pipelines.sh`
Expected: "ALL PASSED"

**Step 3: Commit**

```bash
git add scripts/validate-pipelines.sh
git commit -m "feat(scripts): add pipeline YAML validation script"
```

---

## Phase 11: Per-Database Migration CD Pipelines

### Existing Database Infrastructure (DO NOT recreate)

Each of the 8 database submodules already has these files in `database/quckapp-{db}/`:

| Database | Dockerfile | K8s Job | Entrypoint | Migration Tool | Services |
|----------|-----------|---------|------------|----------------|----------|
| quckapp-mysql | `Dockerfile` (flyway:10.6) | `k8s/migration-job.yaml` | `docker-entrypoint.sh` | Flyway | 11 services (admin, auth, audit, permission, security, user, channel, thread, workspace, notification, bookmark) |
| quckapp-postgresql | `Dockerfile` (flyway:10.6 + psql) | `k8s/migration-job.yaml` | `docker-entrypoint.sh` | Flyway + psql | 2 services (realtime, go-bff) + core-schema |
| quckapp-mongodb | `Dockerfile` (node:20 + migrate-mongo) | `k8s/migration-job.yaml` | `docker-entrypoint.sh` | migrate-mongo | 11 services (attachment, backend-gateway, call, event-broadcast, file, huddle, media, message, notification-orchestrator, presence, reminder) |
| quckapp-elasticsearch | `Dockerfile` (alpine + curl/jq) | `k8s/migration-job.yaml` | `docker-entrypoint.sh` | REST API (curl) | indices, templates, ILM policies |
| quckapp-kafka | `Dockerfile` (cp-kafka:7.5.0) | `k8s/migration-job.yaml` | `docker-entrypoint.sh` | kafka-topics.sh | topics, schemas, consumer-groups |
| quckapp-clickhouse | `Dockerfile` (clickhouse-client:23.8) | `k8s/migration-job.yaml` | `docker-entrypoint.sh` | clickhouse-client | analytics |
| quckapp-scylladb | `Dockerfile` (cassandra:4.1) | `k8s/migration-job.yaml` | `docker-entrypoint.sh` | cqlsh | go-bff |
| quckapp-dynamodb | `Dockerfile` (terraform:1.7 + aws-cli) | `k8s/migration-job.yaml` | `docker-entrypoint.sh` | Terraform | 6 tables (media-metadata, user-sessions, notifications, export-jobs, rate-limiting, conversations) |

Each also has:
- `shared/promotion-gate/` — promotion tracking table (separate Flyway history to avoid version conflicts)
- `environments/{dev,qa,staging,production}.env` — per-environment configs
- `.github/workflows/` and `.azure-pipelines/` — existing CI/CD (kept as-is)
- `tools/docker-compose.yml` + `migrate.sh` — local dev tools

---

### Task 22: Create per-database Azure Pipelines CD pipelines

**Files:**
- Create: `infrastructure/azure-pipelines/per-database/cd-mysql-migrations.yml`
- Create: `infrastructure/azure-pipelines/per-database/cd-postgresql-migrations.yml`
- Create: `infrastructure/azure-pipelines/per-database/cd-mongodb-migrations.yml`
- Create: `infrastructure/azure-pipelines/per-database/cd-elasticsearch-migrations.yml`
- Create: `infrastructure/azure-pipelines/per-database/cd-kafka-migrations.yml`
- Create: `infrastructure/azure-pipelines/per-database/cd-clickhouse-migrations.yml`
- Create: `infrastructure/azure-pipelines/per-database/cd-scylladb-migrations.yml`
- Create: `infrastructure/azure-pipelines/per-database/cd-dynamodb-migrations.yml`

**Context:** Each database gets its own CD pipeline that builds the migration Docker image, pushes to ACR, then runs the K8s Job migration through all 8 environments. These are triggered by webhook from the existing `db-migrate.yml` GitHub Actions workflow, or manually via Azure DevOps.

**Step 1: Create MySQL migrations pipeline**

```yaml
# infrastructure/azure-pipelines/per-database/cd-mysql-migrations.yml
# CD pipeline for MySQL database migrations (Flyway)
# Covers 11 services: admin, auth, audit, permission, security, user,
#   channel, thread, workspace, notification, bookmark
# Plus shared promotion-gate (separate Flyway history table)
trigger: none  # Triggered by GitHub Actions db-migrate.yml or manual

resources:
  webhooks:
    - webhook: github_db_migrate_mysql
      connection: GitHubWebhook
      filters:
        - path: database
          value: mysql

parameters:
  - name: imageTag
    type: string
    displayName: 'Migration image tag'
    default: 'latest'
  - name: service
    type: string
    displayName: 'Specific service to migrate (or "all")'
    default: 'all'
    values:
      - all
      - admin-service
      - auth-service
      - audit-service
      - permission-service
      - security-service
      - user-service
      - channel-service
      - thread-service
      - workspace-service
      - notification-service
      - bookmark-service
  - name: dryRun
    type: boolean
    displayName: 'Dry run (validate only, no apply)'
    default: false

variables:
  - name: imageTag
    value: ${{ parameters.imageTag }}
  - name: acrName
    value: 'quckappacr'
  - name: imageName
    value: 'quckapp/db-migrate-mysql'

stages:
  # Dev
  - stage: Migrate_MySQL_dev
    displayName: 'MySQL Migrations → dev'
    jobs:
      - template: ../templates/jobs/run-db-migration.yml
        parameters:
          environment: 'dev'
          database: 'mysql'
          imageTag: $(imageTag)
          service: ${{ parameters.service }}
          dryRun: ${{ parameters.dryRun }}
          secretName: 'quckapp-mysql-credentials'

  # QA
  - stage: Migrate_MySQL_qa
    displayName: 'MySQL Migrations → qa'
    dependsOn: ['Migrate_MySQL_dev']
    jobs:
      - template: ../templates/jobs/run-db-migration.yml
        parameters:
          environment: 'qa'
          database: 'mysql'
          imageTag: $(imageTag)
          service: ${{ parameters.service }}
          dryRun: ${{ parameters.dryRun }}
          secretName: 'quckapp-mysql-credentials'

  # UAT1
  - stage: Migrate_MySQL_uat1
    displayName: 'MySQL Migrations → uat1'
    dependsOn: ['Migrate_MySQL_qa']
    jobs:
      - template: ../templates/jobs/run-db-migration.yml
        parameters:
          environment: 'uat1'
          database: 'mysql'
          imageTag: $(imageTag)
          service: ${{ parameters.service }}
          dryRun: ${{ parameters.dryRun }}
          secretName: 'quckapp-mysql-credentials'

  # UAT2
  - stage: Migrate_MySQL_uat2
    displayName: 'MySQL Migrations → uat2'
    dependsOn: ['Migrate_MySQL_uat1']
    jobs:
      - template: ../templates/jobs/run-db-migration.yml
        parameters:
          environment: 'uat2'
          database: 'mysql'
          imageTag: $(imageTag)
          service: ${{ parameters.service }}
          dryRun: ${{ parameters.dryRun }}
          secretName: 'quckapp-mysql-credentials'

  # UAT3
  - stage: Migrate_MySQL_uat3
    displayName: 'MySQL Migrations → uat3'
    dependsOn: ['Migrate_MySQL_uat2']
    jobs:
      - template: ../templates/jobs/run-db-migration.yml
        parameters:
          environment: 'uat3'
          database: 'mysql'
          imageTag: $(imageTag)
          service: ${{ parameters.service }}
          dryRun: ${{ parameters.dryRun }}
          secretName: 'quckapp-mysql-credentials'

  # Staging
  - stage: Migrate_MySQL_staging
    displayName: 'MySQL Migrations → staging'
    dependsOn: ['Migrate_MySQL_uat3']
    jobs:
      - template: ../templates/jobs/run-db-migration.yml
        parameters:
          environment: 'staging'
          database: 'mysql'
          imageTag: $(imageTag)
          service: ${{ parameters.service }}
          dryRun: ${{ parameters.dryRun }}
          secretName: 'quckapp-mysql-credentials'

  # Production (manual approval)
  - stage: Migrate_MySQL_prod
    displayName: 'MySQL Migrations → prod'
    dependsOn: ['Migrate_MySQL_staging']
    jobs:
      - deployment: Approve_MySQL_prod
        displayName: 'Approve MySQL migration to prod'
        environment: 'quckapp-prod'
        strategy:
          runOnce:
            deploy:
              steps:
                - bash: echo "MySQL migration approved for prod"
      - template: ../templates/jobs/run-db-migration.yml
        parameters:
          environment: 'prod'
          database: 'mysql'
          imageTag: $(imageTag)
          service: ${{ parameters.service }}
          dryRun: ${{ parameters.dryRun }}
          secretName: 'quckapp-mysql-credentials'

  # Live (manual approval)
  - stage: Migrate_MySQL_live
    displayName: 'MySQL Migrations → live'
    dependsOn: ['Migrate_MySQL_prod']
    jobs:
      - deployment: Approve_MySQL_live
        displayName: 'Approve MySQL migration to live'
        environment: 'quckapp-live'
        strategy:
          runOnce:
            deploy:
              steps:
                - bash: echo "MySQL migration approved for live"
      - template: ../templates/jobs/run-db-migration.yml
        parameters:
          environment: 'live'
          database: 'mysql'
          imageTag: $(imageTag)
          service: ${{ parameters.service }}
          dryRun: ${{ parameters.dryRun }}
          secretName: 'quckapp-mysql-credentials'
```

**Step 2: Create remaining 7 database pipelines**

Use the same structure for each, adjusting:

| Database | secretName | service parameter values |
|----------|-----------|------------------------|
| postgresql | `quckapp-postgres-credentials` | all, realtime-service, go-bff, core-schema |
| mongodb | `quckapp-mongodb-credentials` | all, attachment-service, backend-gateway, call-service, event-broadcast-service, file-service, huddle-service, media-service, message-service, notification-orchestrator, presence-service, reminder-service |
| elasticsearch | `quckapp-elasticsearch-credentials` | all, indices, templates, policies |
| kafka | `quckapp-kafka-credentials` | all, topics, schemas |
| clickhouse | `quckapp-clickhouse-credentials` | all, analytics |
| scylladb | `quckapp-scylladb-credentials` | all, go-bff |
| dynamodb | `quckapp-dynamodb-credentials` | all (Terraform-based, no per-service split) |

**Step 3: Validate all 8 pipelines**

Run: `for f in infrastructure/azure-pipelines/per-database/*.yml; do echo "Checking $f..."; python -c "import yaml; yaml.safe_load(open('$f'))"; done`
Expected: No errors

**Step 4: Commit**

```bash
git add infrastructure/azure-pipelines/per-database/
git commit -m "feat(cd): add per-database CD pipelines for all 8 database migration types"
```

---

### Task 23: Create reusable run-db-migration job template

**Files:**
- Create: `infrastructure/azure-pipelines/templates/jobs/run-db-migration.yml`

**Context:** Reusable job template used by all per-database pipelines. Gets AKS credentials, applies the K8s migration Job from the database submodule's `k8s/migration-job.yaml` manifest, waits for completion, and captures logs.

**Step 1: Create the job template**

```yaml
# infrastructure/azure-pipelines/templates/jobs/run-db-migration.yml
# Reusable job: Run a database migration as a K8s Job
parameters:
  - name: environment
    type: string
  - name: database
    type: string  # mysql, postgresql, mongodb, elasticsearch, kafka, clickhouse, scylladb, dynamodb
  - name: imageTag
    type: string
    default: 'latest'
  - name: service
    type: string
    default: 'all'
  - name: dryRun
    type: boolean
    default: false
  - name: secretName
    type: string
  - name: timeout
    type: number
    default: 600
  - name: azureSubscription
    type: string
    default: 'QuckApp-Azure'
  - name: acrName
    type: string
    default: 'quckappacr'
  - name: resourceGroup
    type: string
    default: 'quckapp-rg'

jobs:
  - job: Migrate_${{ parameters.database }}_${{ parameters.environment }}
    displayName: 'Migrate ${{ parameters.database }} (${{ parameters.environment }})'
    pool:
      vmImage: 'ubuntu-latest'
    steps:
      # ACR login
      - template: ../steps/acr-login.yml
        parameters:
          azureSubscription: ${{ parameters.azureSubscription }}
          acrName: ${{ parameters.acrName }}

      # AKS credentials
      - template: ../steps/aks-credentials.yml
        parameters:
          environment: ${{ parameters.environment }}
          azureSubscription: ${{ parameters.azureSubscription }}
          resourceGroup: ${{ parameters.resourceGroup }}

      # Run migration
      - bash: |
          set -euo pipefail

          NAMESPACE="${{ parameters.environment }}"
          DATABASE="${{ parameters.database }}"
          IMAGE="${{ parameters.acrName }}.azurecr.io/quckapp/db-migrate-$DATABASE:${{ parameters.imageTag }}"
          SECRET="${{ parameters.secretName }}"
          SERVICE="${{ parameters.service }}"
          DRY_RUN="${{ parameters.dryRun }}"
          TIMEOUT=${{ parameters.timeout }}
          JOB_NAME="db-migrate-$DATABASE-$(date +%s)"

          echo "=============================="
          echo "Database Migration"
          echo "=============================="
          echo "Database:    $DATABASE"
          echo "Environment: $NAMESPACE"
          echo "Image:       $IMAGE"
          echo "Service:     $SERVICE"
          echo "Dry Run:     $DRY_RUN"
          echo "Timeout:     ${TIMEOUT}s"
          echo "=============================="

          # Build environment variables
          ENV_VARS=""
          ENV_VARS="$ENV_VARS --env ENVIRONMENT=$NAMESPACE"
          ENV_VARS="$ENV_VARS --env TARGET_SERVICE=$SERVICE"

          if [ "$DRY_RUN" = "True" ] || [ "$DRY_RUN" = "true" ]; then
            ENV_VARS="$ENV_VARS --env DRY_RUN=true"
            echo "DRY RUN MODE: Migrations will be validated but not applied"
          fi

          # Create K8s Job manifest
          cat <<MANIFEST | kubectl apply -n "$NAMESPACE" -f -
          apiVersion: batch/v1
          kind: Job
          metadata:
            name: $JOB_NAME
            namespace: $NAMESPACE
            labels:
              app: db-migration
              database: $DATABASE
              environment: $NAMESPACE
              service: $SERVICE
          spec:
            backoffLimit: 0
            activeDeadlineSeconds: $TIMEOUT
            ttlSecondsAfterFinished: 3600
            template:
              metadata:
                labels:
                  app: db-migration
                  database: $DATABASE
              spec:
                restartPolicy: Never
                containers:
                  - name: migrate
                    image: $IMAGE
                    imagePullPolicy: Always
                    envFrom:
                      - secretRef:
                          name: $SECRET
                    env:
                      - name: ENVIRONMENT
                        value: "$NAMESPACE"
                      - name: TARGET_SERVICE
                        value: "$SERVICE"
                    resources:
                      requests:
                        memory: "128Mi"
                        cpu: "125m"
                      limits:
                        memory: "256Mi"
                        cpu: "250m"
          MANIFEST

          echo "Migration job '$JOB_NAME' created. Waiting for completion..."

          # Wait for job completion
          if kubectl wait --for=condition=complete \
            job/$JOB_NAME \
            --namespace "$NAMESPACE" \
            --timeout=${TIMEOUT}s 2>/dev/null; then
            echo ""
            echo "Migration SUCCEEDED"
            echo "Logs:"
            kubectl logs job/$JOB_NAME --namespace "$NAMESPACE" --tail=100
          else
            echo ""
            echo "##vso[task.logissue type=error]Migration FAILED for $DATABASE in $NAMESPACE"
            echo "Logs (last 100 lines):"
            kubectl logs job/$JOB_NAME --namespace "$NAMESPACE" --tail=100 || true

            # Check if job failed vs timed out
            JOB_STATUS=$(kubectl get job/$JOB_NAME --namespace "$NAMESPACE" -o jsonpath='{.status.conditions[0].type}' 2>/dev/null || echo "Unknown")
            echo "Job status: $JOB_STATUS"

            exit 1
          fi
        displayName: 'Run ${{ parameters.database }} migration (${{ parameters.environment }})'

      # Notify on failure
      - template: ../steps/notify.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'db-migrate-${{ parameters.database }}'
          status: 'failure'
        condition: failed()

      # Notify on success (staging+ only)
      - template: ../steps/notify.yml
        parameters:
          environment: ${{ parameters.environment }}
          serviceName: 'db-migrate-${{ parameters.database }}'
          status: 'success'
        condition: |
          and(
            succeeded(),
            or(
              eq('${{ parameters.environment }}', 'staging'),
              eq('${{ parameters.environment }}', 'prod'),
              eq('${{ parameters.environment }}', 'live')
            )
          )
```

**Step 2: Validate YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('infrastructure/azure-pipelines/templates/jobs/run-db-migration.yml'))"`
Expected: No errors

**Step 3: Commit**

```bash
git add infrastructure/azure-pipelines/templates/jobs/run-db-migration.yml
git commit -m "feat(cd): add reusable run-db-migration job template for K8s migration jobs"
```

---

### Task 24: Create database migration generator script

**Files:**
- Modify: `scripts/gen-cd-pipelines.py` (add database pipeline generation)

**Context:** Extend the existing generator to also produce the 8 per-database CD pipelines, so they stay consistent with the service pipelines.

**Step 1: Add database registry to the generator**

Add this to the bottom of `scripts/gen-cd-pipelines.py`:

```python
# Database registry: name → { secretName, services }
DATABASES = {
    'mysql': {
        'secretName': 'quckapp-mysql-credentials',
        'services': ['all', 'admin-service', 'auth-service', 'audit-service',
                     'permission-service', 'security-service', 'user-service',
                     'channel-service', 'thread-service', 'workspace-service',
                     'notification-service', 'bookmark-service'],
    },
    'postgresql': {
        'secretName': 'quckapp-postgres-credentials',
        'services': ['all', 'realtime-service', 'go-bff', 'core-schema'],
    },
    'mongodb': {
        'secretName': 'quckapp-mongodb-credentials',
        'services': ['all', 'attachment-service', 'backend-gateway',
                     'call-service', 'event-broadcast-service', 'file-service',
                     'huddle-service', 'media-service', 'message-service',
                     'notification-orchestrator', 'presence-service',
                     'reminder-service'],
    },
    'elasticsearch': {
        'secretName': 'quckapp-elasticsearch-credentials',
        'services': ['all', 'indices', 'templates', 'policies'],
    },
    'kafka': {
        'secretName': 'quckapp-kafka-credentials',
        'services': ['all', 'topics', 'schemas'],
    },
    'clickhouse': {
        'secretName': 'quckapp-clickhouse-credentials',
        'services': ['all', 'analytics'],
    },
    'scylladb': {
        'secretName': 'quckapp-scylladb-credentials',
        'services': ['all', 'go-bff'],
    },
    'dynamodb': {
        'secretName': 'quckapp-dynamodb-credentials',
        'services': ['all'],
    },
}

DB_OUTPUT_DIR = 'infrastructure/azure-pipelines/per-database'


def generate_db_pipeline(db_name, db_info):
    """Generate a CD pipeline YAML for a single database migration."""
    secret = db_info['secretName']
    services = db_info['services']
    services_yaml = '\n'.join(f'      - {s}' for s in services)

    envs = [
        ('dev', [], 'none'),
        ('qa', [f'Migrate_{db_name}_dev'], 'none'),
        ('uat1', [f'Migrate_{db_name}_qa'], 'none'),
        ('uat2', [f'Migrate_{db_name}_uat1'], 'none'),
        ('uat3', [f'Migrate_{db_name}_uat2'], 'none'),
        ('staging', [f'Migrate_{db_name}_uat3'], 'none'),
        ('prod', [f'Migrate_{db_name}_staging'], 'manual'),
        ('live', [f'Migrate_{db_name}_prod'], 'manual'),
    ]

    pipeline = f"""# Auto-generated CD pipeline for {db_name} database migrations
# Do not edit manually — regenerate with: python scripts/gen-cd-pipelines.py

trigger: none

resources:
  webhooks:
    - webhook: github_db_migrate_{db_name}
      connection: GitHubWebhook
      filters:
        - path: database
          value: {db_name}

parameters:
  - name: imageTag
    type: string
    displayName: 'Migration image tag'
    default: 'latest'
  - name: service
    type: string
    displayName: 'Service to migrate (or "all")'
    default: 'all'
    values:
{services_yaml}
  - name: dryRun
    type: boolean
    displayName: 'Dry run (validate only)'
    default: false

variables:
  - name: imageTag
    value: ${{{{ parameters.imageTag }}}}

stages:
"""
    for env_name, depends_on, approval in envs:
        depends_block = ''
        if depends_on:
            depends_block = f"\n    dependsOn: {depends_on}"

        approval_block = ''
        if approval == 'manual':
            approval_block = f"""
      - deployment: Approve_{db_name}_{env_name}
        displayName: 'Approve {db_name} migration to {env_name}'
        environment: 'quckapp-{env_name}'
        strategy:
          runOnce:
            deploy:
              steps:
                - bash: echo "{db_name} migration approved for {env_name}"
"""
        pipeline += f"""  - stage: Migrate_{db_name}_{env_name}
    displayName: '{db_name} Migrations → {env_name}'{depends_block}
    jobs:{approval_block}
      - template: ../templates/jobs/run-db-migration.yml
        parameters:
          environment: '{env_name}'
          database: '{db_name}'
          imageTag: $(imageTag)
          service: ${{{{ parameters.service }}}}
          dryRun: ${{{{ parameters.dryRun }}}}
          secretName: '{secret}'

"""
    return pipeline


# Add to main():
def generate_all():
    """Generate all CD pipelines (services + databases)."""
    # Services (existing)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for service_name, service_info in sorted(BACKEND_SERVICES.items()):
        filename = f"cd-{service_name}.yml"
        filepath = os.path.join(OUTPUT_DIR, filename)
        content = generate_pipeline(service_name, service_info)
        with open(filepath, 'w', newline='\n') as f:
            f.write(content)
        print(f"Generated: {filepath}")
    print(f"Generated {len(BACKEND_SERVICES)} service CD pipelines")

    # Databases
    os.makedirs(DB_OUTPUT_DIR, exist_ok=True)
    for db_name, db_info in sorted(DATABASES.items()):
        filename = f"cd-{db_name}-migrations.yml"
        filepath = os.path.join(DB_OUTPUT_DIR, filename)
        content = generate_db_pipeline(db_name, db_info)
        with open(filepath, 'w', newline='\n') as f:
            f.write(content)
        print(f"Generated: {filepath}")
    print(f"Generated {len(DATABASES)} database CD pipelines")
```

**Step 2: Run the updated generator**

Run: `cd /d/Learning/QuckApp && python scripts/gen-cd-pipelines.py`
Expected: "Generated 35 service CD pipelines" and "Generated 8 database CD pipelines"

**Step 3: Validate all database pipelines**

Run: `for f in infrastructure/azure-pipelines/per-database/*.yml; do echo "Checking $f..."; python -c "import yaml; yaml.safe_load(open('$f'))"; done`
Expected: No errors for all 8 files

**Step 4: Commit**

```bash
git add scripts/gen-cd-pipelines.py infrastructure/azure-pipelines/per-database/
git commit -m "feat(cd): generate per-database CD pipelines for all 8 database types"
```

---

### Task 25: Add database migrations to deploy-all coordinated pipeline

**Files:**
- Modify: `infrastructure/azure-pipelines/coordinated/cd-deploy-all.yml`

**Context:** The deploy-all pipeline (Task 15) already has Phase 1 for DB migrations but uses the generic db-migrate stage template. Update it to reference the new per-database job template for fine-grained control, and add the service parameter.

**Step 1: Verify Phase 1 in deploy-all already covers all 8 databases**

Read `infrastructure/azure-pipelines/coordinated/cd-deploy-all.yml` and verify the `databases` parameter in Phase 1 includes all 8 types: mysql, postgresql, mongodb, elasticsearch, kafka, clickhouse, scylladb, dynamodb.

The current deploy-all Phase 1 (from Task 15) already includes all 8 databases running in parallel:
```yaml
  # Phase 1: Database migrations (all 8 in parallel)
  - template: ../templates/stages/db-migrate.yml
    parameters:
      environment: ${{ parameters.environment }}
      databases:
        - { name: 'mysql', ... }
        - { name: 'postgresql', ... }
        - { name: 'mongodb', ... }
        - { name: 'elasticsearch', ... }
        - { name: 'kafka', ... }
        - { name: 'clickhouse', ... }
        - { name: 'scylladb', ... }
        - { name: 'dynamodb', ... }
```

This is correct. No changes needed — Phase 1 of deploy-all already runs all 8 DB migrations in parallel before any service deployment begins.

**Step 2: Commit** (no changes if already correct)

---

### Task 26: Update GitHub Actions db-migrate.yml to trigger Azure Pipelines

**Files:**
- Modify: `.github/workflows/db-migrate.yml`

**Context:** The existing `db-migrate.yml` GitHub workflow builds migration Docker images and runs K8s Jobs directly. Add a step that also triggers the corresponding Azure Pipelines per-database CD pipeline via webhook, so migrations flow through the full environment promotion (dev → qa → uat1-3 → staging → prod → live).

**Step 1: Read the existing db-migrate.yml**

Run: `cat .github/workflows/db-migrate.yml`

**Step 2: Add webhook trigger step after the build job**

Add a new job `trigger-azure-cd` that runs after `build` succeeds. For each database that was built, trigger the corresponding Azure Pipeline:

```yaml
  trigger-azure-cd:
    name: Trigger Azure CD
    needs: [build]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        database: ${{ fromJson(needs.prepare.outputs.databases) }}
    steps:
      - name: Trigger Azure Pipeline for ${{ matrix.database }}
        env:
          AZURE_DEVOPS_PAT: ${{ secrets.AZURE_DEVOPS_PAT }}
          AZURE_DEVOPS_ORG: ${{ secrets.AZURE_DEVOPS_ORG }}
        run: |
          DATABASE="${{ matrix.database }}"
          IMAGE_TAG="${{ needs.build.outputs.image_tag }}"
          PIPELINE_NAME="cd-${DATABASE}-migrations"

          echo "Triggering Azure Pipeline: $PIPELINE_NAME (tag: $IMAGE_TAG)"

          PIPELINE_ID=$(curl -sf \
            -u ":$AZURE_DEVOPS_PAT" \
            "https://dev.azure.com/$AZURE_DEVOPS_ORG/QuckApp/_apis/pipelines?api-version=7.0" \
            | jq -r ".value[] | select(.name == \"$PIPELINE_NAME\") | .id")

          if [ -z "$PIPELINE_ID" ] || [ "$PIPELINE_ID" = "null" ]; then
            echo "::warning::Pipeline '$PIPELINE_NAME' not found. Skipping."
            exit 0
          fi

          curl -sf -X POST \
            -u ":$AZURE_DEVOPS_PAT" \
            -H "Content-Type: application/json" \
            "https://dev.azure.com/$AZURE_DEVOPS_ORG/QuckApp/_apis/pipelines/$PIPELINE_ID/runs?api-version=7.0" \
            -d "{
              \"templateParameters\": {
                \"imageTag\": \"$IMAGE_TAG\",
                \"service\": \"all\"
              }
            }"

          echo "Triggered $PIPELINE_NAME successfully"
```

**Step 3: Commit**

```bash
git add .github/workflows/db-migrate.yml
git commit -m "feat(ci): add Azure Pipelines CD trigger for database migrations"
```

---

## Summary

| Phase | Tasks | Files Created | Description |
|-------|-------|--------------|-------------|
| 1 | 1-9 | 9 templates | Azure Pipelines reusable templates (steps, jobs, stages) |
| 2 | 10 | 8 variable files | Per-environment variable configurations |
| 3 | 11 | 35 pipelines + generator | Per-service CD pipelines for all backend services |
| 4 | 12-13 | 5 pipelines | Frontend and mobile app CD pipelines |
| 5 | 14 | 4 pipelines | Infrastructure CD pipelines (Kong, Envoy, monitoring, DB) |
| 6 | 15 | 1 pipeline | Coordinated deploy-all with 8-phase ordering |
| 7 | 16 | 2 workflows | GitHub Actions → Azure Pipelines webhook bridge |
| 8 | 17-18 | 4 files | Terraform AKS cluster configs + workflow |
| 9 | 19 | 4 overlays | K8s Kustomize overlays for UAT/live environments |
| 10 | 20-21 | 2 files | Documentation and validation |
| 11 | 22-26 | 9 pipelines + 1 job template | Per-database CD pipelines for all 8 migration types |

**Total: ~80 new files, 26 tasks**

**Database migration promotion flow:**
```
GitHub push (database/) → db-migrate.yml CI (build image + Trivy scan)
  → webhook → Azure CD Pipeline (cd-{db}-migrations.yml)
    → dev (auto) → qa (auto) → uat1 (auto) → uat2 (auto) → uat3 (auto)
    → staging (auto) → prod (manual approval) → live (manual approval)
```

**Coordinated release flow (deploy-all):**
```
Manual trigger → Phase 1: All 8 DB migrations (parallel)
  → Phase 2: Infrastructure (Kong, Envoy)
  → Phase 3: Core services (auth, user, permission, workspace, security)
  → Phase 4: Business services (channel, message, thread, etc.)
  → Phase 5: Realtime & notifications
  → Phase 6: AI/ML services
  → Phase 7: Gateways & frontends (go-bff, web, admin, docs)
  → Phase 8: Cross-service smoke tests
```

**Full component coverage (55 deployables):**
- 35 backend services (per-service CD pipelines)
- 4 frontend/mobile apps (3 AKS + 2 App Center CD pipelines)
- 5 infrastructure components (Kong, Envoy, monitoring, service-urls, docs)
- 8 database migrations (per-database CD pipelines)
- 15 shared packages (CI only, no deploy)
