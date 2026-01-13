---
sidebar_position: 2
---

# Azure DevOps CD

Azure DevOps Pipelines handles all Continuous Deployment (CD) tasks with multi-stage deployments across 8 environments with approval gates and governance controls.

## CD Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Azure DevOps CD Pipeline                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Trigger: GitHub Actions → ACR Image Push → Azure DevOps Webhook                │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                        ENVIRONMENT PROGRESSION                             │ │
│  │                                                                            │ │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐                 │ │
│  │  │  Local  │    │   Dev   │    │   QA    │    │  UAT1   │                 │ │
│  │  │  Mock   │───▶│         │───▶│         │───▶│         │                 │ │
│  │  │         │    │  Auto   │    │ QA Lead │    │ Product │                 │ │
│  │  │ Manual  │    │         │    │ Approve │    │ Owner   │                 │ │
│  │  └─────────┘    └─────────┘    └─────────┘    └─────────┘                 │ │
│  │                                                     │                      │ │
│  │                                                     ▼                      │ │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐                 │ │
│  │  │  Live   │◀───│ Staging │◀───│  UAT3   │◀───│  UAT2   │                 │ │
│  │  │         │    │         │    │         │    │         │                 │ │
│  │  │   CAB   │    │ Release │    │ PO +    │    │ Product │                 │ │
│  │  │ Approve │    │ Manager │    │ Security│    │ Owner   │                 │ │
│  │  └─────────┘    └─────────┘    └─────────┘    └─────────┘                 │ │
│  │                                                                            │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  Each Stage:                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Pre-Gate │→ │  Deploy  │→ │  Smoke   │→ │ Health   │→ │ Post-Gate│          │
│  │ Approval │  │   AKS    │  │  Tests   │  │  Check   │  │ Approval │          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Environment Configuration

### Environment Matrix

| Environment | Cluster | Namespace | Replicas | Resources | Auto Scale |
|-------------|---------|-----------|----------|-----------|------------|
| **Local/Mock** | local | quikapp-mock | 1 | 256Mi/0.25CPU | No |
| **Dev** | aks-dev | quikapp-dev | 2 | 512Mi/0.5CPU | No |
| **QA** | aks-qa | quikapp-qa | 2 | 512Mi/0.5CPU | No |
| **UAT1** | aks-uat | quikapp-uat1 | 2 | 1Gi/1CPU | No |
| **UAT2** | aks-uat | quikapp-uat2 | 2 | 1Gi/1CPU | No |
| **UAT3** | aks-uat | quikapp-uat3 | 3 | 1Gi/1CPU | No |
| **Staging** | aks-staging | quikapp-staging | 3 | 2Gi/2CPU | Yes (3-10) |
| **Live** | aks-prod | quikapp-prod | 5 | 4Gi/4CPU | Yes (5-50) |

### Approval Gates

| Environment | Pre-Deployment | Post-Deployment | Timeout |
|-------------|----------------|-----------------|---------|
| **Local/Mock** | None | None | N/A |
| **Dev** | None | None | N/A |
| **QA** | QA Lead | None | 24h |
| **UAT1** | Product Owner | None | 48h |
| **UAT2** | Product Owner | None | 48h |
| **UAT3** | Product Owner + Security | Security Sign-off | 72h |
| **Staging** | Release Manager | Release Manager | 72h |
| **Live** | CAB + Release Manager | Ops Team | 1 week |

---

## Main CD Pipeline

### `azure-pipelines/cd-main.yml`

```yaml
# Azure DevOps Multi-Stage CD Pipeline
# Deploys to: Local/Mock → Dev → QA → UAT1 → UAT2 → UAT3 → Staging → Live

trigger: none

resources:
  webhooks:
    - webhook: GitHubActionsWebhook
      connection: GitHubServiceConnection
      filters:
        - path: action
          value: completed

parameters:
  - name: serviceName
    type: string
    displayName: 'Service Name'
  - name: imageTag
    type: string
    displayName: 'Image Tag (Git SHA)'
  - name: techStack
    type: string
    displayName: 'Technology Stack'
    values:
      - spring-boot
      - nestjs
      - elixir
      - go
      - python
  - name: deployToEnvironments
    type: object
    default:
      - local
      - dev
      - qa
      - uat1
      - uat2
      - uat3
      - staging
      - live

variables:
  - group: QuikApp-Global-Variables
  - name: acrRegistry
    value: 'quikapp.azurecr.io'
  - name: imageRepository
    value: '${{ parameters.serviceName }}'
  - name: imageTag
    value: '${{ parameters.imageTag }}'

stages:
  # ============================================================================
  # LOCAL/MOCK ENVIRONMENT
  # ============================================================================
  - stage: Deploy_Local_Mock
    displayName: 'Deploy to Local/Mock'
    condition: contains('${{ parameters.deployToEnvironments }}', 'local')
    jobs:
      - deployment: DeployLocalMock
        displayName: 'Deploy to Local/Mock Environment'
        environment: 'quikapp-local-mock'
        pool:
          vmImage: 'ubuntu-latest'
        strategy:
          runOnce:
            deploy:
              steps:
                - template: templates/deploy-steps.yml
                  parameters:
                    environment: 'local'
                    namespace: 'quikapp-mock'
                    serviceName: '${{ parameters.serviceName }}'
                    imageTag: '${{ parameters.imageTag }}'
                    replicas: 1
                    memoryLimit: '256Mi'
                    cpuLimit: '250m'

  # ============================================================================
  # DEV ENVIRONMENT
  # ============================================================================
  - stage: Deploy_Dev
    displayName: 'Deploy to Dev'
    dependsOn: Deploy_Local_Mock
    condition: |
      and(
        succeeded(),
        contains('${{ parameters.deployToEnvironments }}', 'dev')
      )
    jobs:
      - deployment: DeployDev
        displayName: 'Deploy to Dev Environment'
        environment: 'quikapp-dev'
        pool:
          vmImage: 'ubuntu-latest'
        strategy:
          runOnce:
            deploy:
              steps:
                - template: templates/deploy-steps.yml
                  parameters:
                    environment: 'dev'
                    namespace: 'quikapp-dev'
                    serviceName: '${{ parameters.serviceName }}'
                    imageTag: '${{ parameters.imageTag }}'
                    replicas: 2
                    memoryLimit: '512Mi'
                    cpuLimit: '500m'
                    aksCluster: 'aks-dev'
                    resourceGroup: 'rg-quikapp-dev'

      - job: IntegrationTests
        displayName: 'Run Integration Tests'
        dependsOn: DeployDev
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - template: templates/integration-tests.yml
            parameters:
              environment: 'dev'
              serviceName: '${{ parameters.serviceName }}'

  # ============================================================================
  # QA ENVIRONMENT
  # ============================================================================
  - stage: Deploy_QA
    displayName: 'Deploy to QA'
    dependsOn: Deploy_Dev
    condition: |
      and(
        succeeded(),
        contains('${{ parameters.deployToEnvironments }}', 'qa')
      )
    jobs:
      - deployment: DeployQA
        displayName: 'Deploy to QA Environment'
        environment: 'quikapp-qa'
        pool:
          vmImage: 'ubuntu-latest'
        strategy:
          runOnce:
            preDeploy:
              steps:
                - task: ManualValidation@0
                  displayName: 'QA Lead Approval'
                  inputs:
                    notifyUsers: |
                      qa-lead@quikapp.com
                    instructions: 'Please review and approve deployment to QA environment'
                    timeoutInMinutes: 1440  # 24 hours
            deploy:
              steps:
                - template: templates/deploy-steps.yml
                  parameters:
                    environment: 'qa'
                    namespace: 'quikapp-qa'
                    serviceName: '${{ parameters.serviceName }}'
                    imageTag: '${{ parameters.imageTag }}'
                    replicas: 2
                    memoryLimit: '512Mi'
                    cpuLimit: '500m'
                    aksCluster: 'aks-qa'
                    resourceGroup: 'rg-quikapp-qa'

      - job: QATests
        displayName: 'Run QA Test Suite'
        dependsOn: DeployQA
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - template: templates/qa-tests.yml
            parameters:
              environment: 'qa'
              serviceName: '${{ parameters.serviceName }}'

  # ============================================================================
  # UAT1 ENVIRONMENT (Team A)
  # ============================================================================
  - stage: Deploy_UAT1
    displayName: 'Deploy to UAT1 (Team A)'
    dependsOn: Deploy_QA
    condition: |
      and(
        succeeded(),
        contains('${{ parameters.deployToEnvironments }}', 'uat1')
      )
    jobs:
      - deployment: DeployUAT1
        displayName: 'Deploy to UAT1 Environment'
        environment: 'quikapp-uat1'
        pool:
          vmImage: 'ubuntu-latest'
        strategy:
          runOnce:
            preDeploy:
              steps:
                - task: ManualValidation@0
                  displayName: 'Product Owner Approval (UAT1)'
                  inputs:
                    notifyUsers: |
                      product-owner@quikapp.com
                      team-a-lead@quikapp.com
                    instructions: 'Please approve deployment to UAT1 for Team A testing'
                    timeoutInMinutes: 2880  # 48 hours
            deploy:
              steps:
                - template: templates/deploy-steps.yml
                  parameters:
                    environment: 'uat1'
                    namespace: 'quikapp-uat1'
                    serviceName: '${{ parameters.serviceName }}'
                    imageTag: '${{ parameters.imageTag }}'
                    replicas: 2
                    memoryLimit: '1Gi'
                    cpuLimit: '1000m'
                    aksCluster: 'aks-uat'
                    resourceGroup: 'rg-quikapp-uat'

  # ============================================================================
  # UAT2 ENVIRONMENT (Team B)
  # ============================================================================
  - stage: Deploy_UAT2
    displayName: 'Deploy to UAT2 (Team B)'
    dependsOn: Deploy_UAT1
    condition: |
      and(
        succeeded(),
        contains('${{ parameters.deployToEnvironments }}', 'uat2')
      )
    jobs:
      - deployment: DeployUAT2
        displayName: 'Deploy to UAT2 Environment'
        environment: 'quikapp-uat2'
        pool:
          vmImage: 'ubuntu-latest'
        strategy:
          runOnce:
            preDeploy:
              steps:
                - task: ManualValidation@0
                  displayName: 'Product Owner Approval (UAT2)'
                  inputs:
                    notifyUsers: |
                      product-owner@quikapp.com
                      team-b-lead@quikapp.com
                    instructions: 'Please approve deployment to UAT2 for Team B testing'
                    timeoutInMinutes: 2880  # 48 hours
            deploy:
              steps:
                - template: templates/deploy-steps.yml
                  parameters:
                    environment: 'uat2'
                    namespace: 'quikapp-uat2'
                    serviceName: '${{ parameters.serviceName }}'
                    imageTag: '${{ parameters.imageTag }}'
                    replicas: 2
                    memoryLimit: '1Gi'
                    cpuLimit: '1000m'
                    aksCluster: 'aks-uat'
                    resourceGroup: 'rg-quikapp-uat'

  # ============================================================================
  # UAT3 ENVIRONMENT (External/Security)
  # ============================================================================
  - stage: Deploy_UAT3
    displayName: 'Deploy to UAT3 (External)'
    dependsOn: Deploy_UAT2
    condition: |
      and(
        succeeded(),
        contains('${{ parameters.deployToEnvironments }}', 'uat3')
      )
    jobs:
      - deployment: DeployUAT3
        displayName: 'Deploy to UAT3 Environment'
        environment: 'quikapp-uat3'
        pool:
          vmImage: 'ubuntu-latest'
        strategy:
          runOnce:
            preDeploy:
              steps:
                - task: ManualValidation@0
                  displayName: 'Product Owner + Security Approval (UAT3)'
                  inputs:
                    notifyUsers: |
                      product-owner@quikapp.com
                      security-team@quikapp.com
                      external-testers@quikapp.com
                    instructions: |
                      UAT3 requires dual approval:
                      1. Product Owner sign-off
                      2. Security team sign-off

                      Please review security scan results and approve deployment.
                    timeoutInMinutes: 4320  # 72 hours
            deploy:
              steps:
                - template: templates/deploy-steps.yml
                  parameters:
                    environment: 'uat3'
                    namespace: 'quikapp-uat3'
                    serviceName: '${{ parameters.serviceName }}'
                    imageTag: '${{ parameters.imageTag }}'
                    replicas: 3
                    memoryLimit: '1Gi'
                    cpuLimit: '1000m'
                    aksCluster: 'aks-uat'
                    resourceGroup: 'rg-quikapp-uat'

      - job: SecurityTests
        displayName: 'Run Security Tests'
        dependsOn: DeployUAT3
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - template: templates/security-tests.yml
            parameters:
              environment: 'uat3'
              serviceName: '${{ parameters.serviceName }}'

      - job: PenetrationTests
        displayName: 'Run Penetration Tests'
        dependsOn: DeployUAT3
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - template: templates/pentest.yml
            parameters:
              environment: 'uat3'
              serviceName: '${{ parameters.serviceName }}'

  # ============================================================================
  # STAGING ENVIRONMENT
  # ============================================================================
  - stage: Deploy_Staging
    displayName: 'Deploy to Staging'
    dependsOn: Deploy_UAT3
    condition: |
      and(
        succeeded(),
        contains('${{ parameters.deployToEnvironments }}', 'staging')
      )
    jobs:
      - deployment: DeployStaging
        displayName: 'Deploy to Staging Environment'
        environment: 'quikapp-staging'
        pool:
          vmImage: 'ubuntu-latest'
        strategy:
          runOnce:
            preDeploy:
              steps:
                - task: ManualValidation@0
                  displayName: 'Release Manager Approval'
                  inputs:
                    notifyUsers: |
                      release-manager@quikapp.com
                      devops-team@quikapp.com
                    instructions: |
                      Pre-Production Deployment

                      Please verify:
                      - All UAT sign-offs completed
                      - Security scans passed
                      - Performance benchmarks met
                      - Rollback plan documented
                    timeoutInMinutes: 4320  # 72 hours
            deploy:
              steps:
                - template: templates/deploy-steps.yml
                  parameters:
                    environment: 'staging'
                    namespace: 'quikapp-staging'
                    serviceName: '${{ parameters.serviceName }}'
                    imageTag: '${{ parameters.imageTag }}'
                    replicas: 3
                    memoryLimit: '2Gi'
                    cpuLimit: '2000m'
                    aksCluster: 'aks-staging'
                    resourceGroup: 'rg-quikapp-staging'
                    enableAutoScale: true
                    minReplicas: 3
                    maxReplicas: 10

      - job: PerformanceTests
        displayName: 'Run Performance Tests'
        dependsOn: DeployStaging
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - template: templates/performance-tests.yml
            parameters:
              environment: 'staging'
              serviceName: '${{ parameters.serviceName }}'

      - job: LoadTests
        displayName: 'Run Load Tests'
        dependsOn: DeployStaging
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - template: templates/load-tests.yml
            parameters:
              environment: 'staging'
              serviceName: '${{ parameters.serviceName }}'
              targetRPS: 1000
              duration: '10m'

  # ============================================================================
  # LIVE/PRODUCTION ENVIRONMENT
  # ============================================================================
  - stage: Deploy_Live
    displayName: 'Deploy to Live (Production)'
    dependsOn: Deploy_Staging
    condition: |
      and(
        succeeded(),
        contains('${{ parameters.deployToEnvironments }}', 'live')
      )
    jobs:
      - deployment: DeployLive
        displayName: 'Deploy to Production'
        environment: 'quikapp-production'
        pool:
          vmImage: 'ubuntu-latest'
        strategy:
          runOnce:
            preDeploy:
              steps:
                - task: ManualValidation@0
                  displayName: 'CAB + Release Manager Approval'
                  inputs:
                    notifyUsers: |
                      cab@quikapp.com
                      release-manager@quikapp.com
                      cto@quikapp.com
                      ops-team@quikapp.com
                    instructions: |
                      PRODUCTION DEPLOYMENT APPROVAL

                      Change Advisory Board (CAB) Review Required

                      Checklist:
                      □ All environment sign-offs completed
                      □ Security assessment passed
                      □ Performance benchmarks verified
                      □ Rollback plan approved
                      □ Communication plan ready
                      □ On-call team notified
                      □ Maintenance window confirmed

                      Risk Assessment: [LOW/MEDIUM/HIGH]
                      Rollback Time: < 5 minutes
                    timeoutInMinutes: 10080  # 1 week
            deploy:
              steps:
                - template: templates/deploy-canary.yml
                  parameters:
                    environment: 'live'
                    namespace: 'quikapp-prod'
                    serviceName: '${{ parameters.serviceName }}'
                    imageTag: '${{ parameters.imageTag }}'
                    replicas: 5
                    memoryLimit: '4Gi'
                    cpuLimit: '4000m'
                    aksCluster: 'aks-prod'
                    resourceGroup: 'rg-quikapp-prod'
                    enableAutoScale: true
                    minReplicas: 5
                    maxReplicas: 50
                    canaryPercentage: 10
            postRouteTraffic:
              steps:
                - task: AzureCLI@2
                  displayName: 'Monitor Canary Metrics'
                  inputs:
                    azureSubscription: 'QuikApp-Production'
                    scriptType: 'bash'
                    scriptLocation: 'inlineScript'
                    inlineScript: |
                      # Monitor error rate, latency, and success rate
                      ./scripts/monitor-canary.sh \
                        --service ${{ parameters.serviceName }} \
                        --duration 15m \
                        --error-threshold 1% \
                        --latency-threshold 200ms
            on:
              failure:
                steps:
                  - template: templates/rollback.yml
                    parameters:
                      environment: 'live'
                      serviceName: '${{ parameters.serviceName }}'
              success:
                steps:
                  - task: ManualValidation@0
                    displayName: 'Ops Team Post-Deployment Verification'
                    inputs:
                      notifyUsers: |
                        ops-team@quikapp.com
                      instructions: |
                        Post-Deployment Verification

                        Please verify:
                        - Service health checks passing
                        - No increase in error rates
                        - Latency within acceptable range
                        - User feedback monitored
                      timeoutInMinutes: 60

      - job: SmokeTests
        displayName: 'Production Smoke Tests'
        dependsOn: DeployLive
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - template: templates/smoke-tests.yml
            parameters:
              environment: 'live'
              serviceName: '${{ parameters.serviceName }}'

      - job: NotifyStakeholders
        displayName: 'Notify Stakeholders'
        dependsOn: SmokeTests
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - task: SendEmail@1
            displayName: 'Send Deployment Notification'
            inputs:
              To: 'stakeholders@quikapp.com'
              Subject: 'QuikApp Deployment: ${{ parameters.serviceName }} deployed to Production'
              Body: |
                Deployment Complete

                Service: ${{ parameters.serviceName }}
                Version: ${{ parameters.imageTag }}
                Environment: Production
                Status: Success

                Release Notes: $(releaseNotesUrl)
```

---

## Deployment Templates

### `azure-pipelines/templates/deploy-steps.yml`

```yaml
parameters:
  - name: environment
    type: string
  - name: namespace
    type: string
  - name: serviceName
    type: string
  - name: imageTag
    type: string
  - name: replicas
    type: number
    default: 2
  - name: memoryLimit
    type: string
    default: '512Mi'
  - name: cpuLimit
    type: string
    default: '500m'
  - name: aksCluster
    type: string
    default: ''
  - name: resourceGroup
    type: string
    default: ''
  - name: enableAutoScale
    type: boolean
    default: false
  - name: minReplicas
    type: number
    default: 2
  - name: maxReplicas
    type: number
    default: 10

steps:
  - task: DownloadPipelineArtifact@2
    displayName: 'Download Kubernetes Manifests'
    inputs:
      artifact: 'k8s-manifests'
      path: '$(Pipeline.Workspace)/manifests'

  - task: AzureCLI@2
    displayName: 'Login to AKS Cluster'
    inputs:
      azureSubscription: 'QuikApp-${{ parameters.environment }}'
      scriptType: 'bash'
      scriptLocation: 'inlineScript'
      inlineScript: |
        az aks get-credentials \
          --resource-group ${{ parameters.resourceGroup }} \
          --name ${{ parameters.aksCluster }} \
          --overwrite-existing

  - task: KubernetesManifest@0
    displayName: 'Create/Update ConfigMap'
    inputs:
      action: 'createSecret'
      namespace: '${{ parameters.namespace }}'
      secretType: 'generic'
      secretName: '${{ parameters.serviceName }}-config'
      secretArguments: '--from-env-file=$(Pipeline.Workspace)/configs/${{ parameters.environment }}.env'

  - task: KubernetesManifest@0
    displayName: 'Deploy to Kubernetes'
    inputs:
      action: 'deploy'
      namespace: '${{ parameters.namespace }}'
      manifests: |
        $(Pipeline.Workspace)/manifests/deployment.yaml
        $(Pipeline.Workspace)/manifests/service.yaml
        $(Pipeline.Workspace)/manifests/ingress.yaml
      containers: |
        $(acrRegistry)/${{ parameters.serviceName }}:${{ parameters.imageTag }}
      imagePullSecrets: |
        acr-secret

  - task: Kubernetes@1
    displayName: 'Scale Deployment'
    inputs:
      connectionType: 'Azure Resource Manager'
      azureSubscriptionEndpoint: 'QuikApp-${{ parameters.environment }}'
      azureResourceGroup: '${{ parameters.resourceGroup }}'
      kubernetesCluster: '${{ parameters.aksCluster }}'
      namespace: '${{ parameters.namespace }}'
      command: 'scale'
      arguments: 'deployment/${{ parameters.serviceName }} --replicas=${{ parameters.replicas }}'

  - ${{ if eq(parameters.enableAutoScale, true) }}:
    - task: Kubernetes@1
      displayName: 'Configure Horizontal Pod Autoscaler'
      inputs:
        connectionType: 'Azure Resource Manager'
        azureSubscriptionEndpoint: 'QuikApp-${{ parameters.environment }}'
        azureResourceGroup: '${{ parameters.resourceGroup }}'
        kubernetesCluster: '${{ parameters.aksCluster }}'
        namespace: '${{ parameters.namespace }}'
        command: 'apply'
        arguments: '-f $(Pipeline.Workspace)/manifests/hpa.yaml'

  - task: Kubernetes@1
    displayName: 'Wait for Rollout'
    inputs:
      connectionType: 'Azure Resource Manager'
      azureSubscriptionEndpoint: 'QuikApp-${{ parameters.environment }}'
      azureResourceGroup: '${{ parameters.resourceGroup }}'
      kubernetesCluster: '${{ parameters.aksCluster }}'
      namespace: '${{ parameters.namespace }}'
      command: 'rollout'
      arguments: 'status deployment/${{ parameters.serviceName }} --timeout=300s'

  - task: AzureCLI@2
    displayName: 'Health Check'
    inputs:
      azureSubscription: 'QuikApp-${{ parameters.environment }}'
      scriptType: 'bash'
      scriptLocation: 'inlineScript'
      inlineScript: |
        SERVICE_URL="https://${{ parameters.serviceName }}.${{ parameters.environment }}.quikapp.dev"

        for i in {1..10}; do
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health")
          if [ "$HTTP_STATUS" = "200" ]; then
            echo "Health check passed!"
            exit 0
          fi
          echo "Attempt $i: Health check returned $HTTP_STATUS"
          sleep 10
        done

        echo "Health check failed after 10 attempts"
        exit 1
```

### `azure-pipelines/templates/deploy-canary.yml`

```yaml
parameters:
  - name: environment
    type: string
  - name: namespace
    type: string
  - name: serviceName
    type: string
  - name: imageTag
    type: string
  - name: replicas
    type: number
  - name: memoryLimit
    type: string
  - name: cpuLimit
    type: string
  - name: aksCluster
    type: string
  - name: resourceGroup
    type: string
  - name: enableAutoScale
    type: boolean
  - name: minReplicas
    type: number
  - name: maxReplicas
    type: number
  - name: canaryPercentage
    type: number
    default: 10

steps:
  - task: AzureCLI@2
    displayName: 'Login to AKS Cluster'
    inputs:
      azureSubscription: 'QuikApp-${{ parameters.environment }}'
      scriptType: 'bash'
      scriptLocation: 'inlineScript'
      inlineScript: |
        az aks get-credentials \
          --resource-group ${{ parameters.resourceGroup }} \
          --name ${{ parameters.aksCluster }} \
          --overwrite-existing

  # Deploy canary version
  - task: KubernetesManifest@0
    displayName: 'Deploy Canary'
    inputs:
      action: 'deploy'
      namespace: '${{ parameters.namespace }}'
      manifests: |
        $(Pipeline.Workspace)/manifests/deployment-canary.yaml
      containers: |
        $(acrRegistry)/${{ parameters.serviceName }}:${{ parameters.imageTag }}
      strategy: 'canary'
      percentage: ${{ parameters.canaryPercentage }}

  # Monitor canary for errors
  - task: AzureCLI@2
    displayName: 'Monitor Canary (5 minutes)'
    inputs:
      azureSubscription: 'QuikApp-${{ parameters.environment }}'
      scriptType: 'bash'
      scriptLocation: 'inlineScript'
      inlineScript: |
        echo "Monitoring canary deployment for 5 minutes..."

        END_TIME=$(($(date +%s) + 300))

        while [ $(date +%s) -lt $END_TIME ]; do
          ERROR_RATE=$(az monitor metrics list \
            --resource "/subscriptions/.../providers/Microsoft.ContainerService/managedClusters/${{ parameters.aksCluster }}" \
            --metric "PodRestartCount" \
            --query "value[0].timeseries[0].data[-1].total" -o tsv)

          if [ "$ERROR_RATE" -gt 5 ]; then
            echo "Error rate exceeded threshold. Rolling back canary..."
            kubectl rollout undo deployment/${{ parameters.serviceName }}-canary -n ${{ parameters.namespace }}
            exit 1
          fi

          sleep 30
        done

        echo "Canary monitoring passed!"

  # Promote canary to stable
  - task: KubernetesManifest@0
    displayName: 'Promote Canary to Stable'
    inputs:
      action: 'promote'
      namespace: '${{ parameters.namespace }}'
      manifests: |
        $(Pipeline.Workspace)/manifests/deployment.yaml
      containers: |
        $(acrRegistry)/${{ parameters.serviceName }}:${{ parameters.imageTag }}
      strategy: 'canary'

  # Clean up canary
  - task: KubernetesManifest@0
    displayName: 'Clean Up Canary'
    inputs:
      action: 'reject'
      namespace: '${{ parameters.namespace }}'
      manifests: |
        $(Pipeline.Workspace)/manifests/deployment-canary.yaml
      strategy: 'canary'
```

### `azure-pipelines/templates/rollback.yml`

```yaml
parameters:
  - name: environment
    type: string
  - name: serviceName
    type: string

steps:
  - task: AzureCLI@2
    displayName: 'Emergency Rollback'
    inputs:
      azureSubscription: 'QuikApp-${{ parameters.environment }}'
      scriptType: 'bash'
      scriptLocation: 'inlineScript'
      inlineScript: |
        echo "Initiating emergency rollback for ${{ parameters.serviceName }}..."

        kubectl rollout undo deployment/${{ parameters.serviceName }} \
          -n quikapp-${{ parameters.environment }}

        kubectl rollout status deployment/${{ parameters.serviceName }} \
          -n quikapp-${{ parameters.environment }} \
          --timeout=300s

        echo "Rollback completed!"

  - task: SendEmail@1
    displayName: 'Send Rollback Alert'
    inputs:
      To: 'ops-team@quikapp.com;release-manager@quikapp.com'
      Subject: 'ALERT: Rollback Triggered for ${{ parameters.serviceName }}'
      Body: |
        Emergency Rollback Triggered

        Service: ${{ parameters.serviceName }}
        Environment: ${{ parameters.environment }}
        Time: $(Build.SourceVersion)

        The deployment was automatically rolled back due to health check failures.
        Please investigate immediately.
```

---

## Service-Specific CD Pipelines

### Spring Boot CD Pipeline

```yaml
# azure-pipelines/spring-boot-cd.yml
trigger: none

resources:
  pipelines:
    - pipeline: SpringBootCI
      source: 'Spring Boot CI'
      trigger:
        branches:
          include:
            - main
            - develop

extends:
  template: cd-main.yml
  parameters:
    techStack: 'spring-boot'
    serviceName: $(SERVICE_NAME)
    imageTag: $(IMAGE_TAG)
    deployToEnvironments:
      - local
      - dev
      - qa
      - uat1
      - uat2
      - uat3
      - staging
      - live
```

### Elixir CD Pipeline

```yaml
# azure-pipelines/elixir-cd.yml
trigger: none

resources:
  pipelines:
    - pipeline: ElixirCI
      source: 'Elixir CI'
      trigger:
        branches:
          include:
            - main
            - develop

extends:
  template: cd-main.yml
  parameters:
    techStack: 'elixir'
    serviceName: $(SERVICE_NAME)
    imageTag: $(IMAGE_TAG)
    deployToEnvironments:
      - local
      - dev
      - qa
      - uat1
      - uat2
      - uat3
      - staging
      - live
```

---

## Variable Groups

### Global Variables

```yaml
# Variable Group: QuikApp-Global-Variables
variables:
  acrRegistry: 'quikapp.azurecr.io'
  aksSubscription: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
  keyVaultName: 'kv-quikapp'
  appInsightsKey: '$(APP_INSIGHTS_KEY)'
```

### Environment-Specific Variables

```yaml
# Variable Group: QuikApp-Dev-Variables
variables:
  aksCluster: 'aks-dev'
  resourceGroup: 'rg-quikapp-dev'
  namespace: 'quikapp-dev'
  dbConnectionString: '$(DEV_DB_CONNECTION)'
  redisHost: 'redis-dev.quikapp.internal'
  kafkaBrokers: 'kafka-dev.quikapp.internal:9092'

# Variable Group: QuikApp-Live-Variables
variables:
  aksCluster: 'aks-prod'
  resourceGroup: 'rg-quikapp-prod'
  namespace: 'quikapp-prod'
  dbConnectionString: '$(PROD_DB_CONNECTION)'
  redisHost: 'redis-prod.quikapp.internal'
  kafkaBrokers: 'kafka-prod.quikapp.internal:9092'
```

---

## Service Connections

Required Azure DevOps Service Connections:

| Connection | Type | Scope |
|------------|------|-------|
| `QuikApp-local` | Azure Resource Manager | Local subscription |
| `QuikApp-dev` | Azure Resource Manager | Dev subscription |
| `QuikApp-qa` | Azure Resource Manager | QA subscription |
| `QuikApp-uat` | Azure Resource Manager | UAT subscription |
| `QuikApp-staging` | Azure Resource Manager | Staging subscription |
| `QuikApp-production` | Azure Resource Manager | Production subscription |
| `GitHubServiceConnection` | GitHub | Repository access |
| `ACR-ServiceConnection` | Docker Registry | ACR access |

---

## Environments Configuration

Configure environments in Azure DevOps with appropriate checks:

### Production Environment Checks

```yaml
# quikapp-production environment configuration
checks:
  - type: approvals
    settings:
      approvers:
        - cab@quikapp.com
        - release-manager@quikapp.com
      minApprovers: 2
      timeout: 10080  # 1 week
      instructions: 'CAB approval required for production deployment'

  - type: businessHours
    settings:
      timeZone: 'UTC'
      businessDays: [Monday, Tuesday, Wednesday, Thursday]
      startTime: '09:00'
      endTime: '17:00'
      excludeDates:
        - '2024-12-25'
        - '2024-01-01'

  - type: exclusiveLock
    settings:
      timeout: 60

  - type: invokeAzureFunction
    settings:
      function: 'https://quikapp-gates.azurewebsites.net/api/check-incident'
      key: '$(GATE_FUNCTION_KEY)'
      successCriteria: 'eq(root[''hasActiveIncidents''], false)'
```
