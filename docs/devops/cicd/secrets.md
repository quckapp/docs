---
sidebar_position: 3
---

# Secrets Management

QuckApp uses a multi-layer secrets management strategy with Azure Key Vault, GitHub Secrets, and Azure DevOps Variable Groups.

## Secrets Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Secrets Management Architecture                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Azure Key Vault (Primary)                       │   │
│  │                                                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │  Database   │  │    API      │  │   OAuth     │  │  Encryption │ │   │
│  │  │ Credentials │  │    Keys     │  │   Secrets   │  │    Keys     │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                    ┌───────────────┼───────────────┐                       │
│                    │               │               │                       │
│                    ▼               ▼               ▼                       │
│  ┌─────────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐  │
│  │   GitHub Secrets    │ │ Azure DevOps    │ │    Kubernetes Secrets   │  │
│  │   (CI Pipeline)     │ │ Variable Groups │ │    (Runtime)            │  │
│  │                     │ │ (CD Pipeline)   │ │                         │  │
│  │ • ACR Credentials   │ │ • DB Conn Str   │ │ • Mounted from KV       │  │
│  │ • Sonar Token       │ │ • API Keys      │ │ • CSI Driver            │  │
│  │ • Snyk Token        │ │ • Cert Thumbs   │ │ • Auto-rotation         │  │
│  └─────────────────────┘ └─────────────────┘ └─────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Azure Key Vault Configuration

### Key Vault Per Environment

| Environment | Key Vault Name | Resource Group | Access Policy |
|-------------|----------------|----------------|---------------|
| Dev | `kv-quckapp` | `rg-quckapp` | Dev Team + CI/CD |
| QA | `kv-quckapp-qa` | `rg-quckapp-qa` | QA Team + CI/CD |
| UAT | `kv-quckapp-uat` | `rg-quckapp-uat` | UAT Team + CI/CD |
| Staging | `kv-quckapp-staging` | `rg-quckapp-staging` | Ops + CI/CD |
| Production | `kv-quckapp-prod` | `rg-quckapp-prod` | Ops Only (RBAC) |

### Secret Categories

```
kv-quckapp-{env}/
├── databases/
│   ├── mysql-connection-string
│   ├── mysql-admin-password
│   ├── mongodb-connection-string
│   ├── redis-connection-string
│   └── elasticsearch-api-key
├── messaging/
│   ├── kafka-sasl-username
│   ├── kafka-sasl-password
│   └── rabbitmq-connection-string
├── external-apis/
│   ├── stripe-secret-key
│   ├── sendgrid-api-key
│   ├── twilio-auth-token
│   ├── aws-access-key
│   ├── aws-secret-key
│   └── google-service-account
├── auth/
│   ├── jwt-signing-key
│   ├── oauth-google-secret
│   ├── oauth-github-secret
│   ├── oauth-microsoft-secret
│   └── apns-auth-key
├── encryption/
│   ├── data-encryption-key
│   ├── backup-encryption-key
│   └── file-encryption-key
└── certificates/
    ├── ssl-certificate
    ├── ssl-private-key
    └── mtls-client-cert
```

### Key Vault Access with Managed Identity

```yaml
# Kubernetes SecretProviderClass
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: azure-kv-secrets
  namespace: quckapp-prod
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    useVMManagedIdentity: "true"
    userAssignedIdentityID: "<managed-identity-client-id>"
    keyvaultName: "kv-quckapp-prod"
    cloudName: "AzurePublicCloud"
    objects: |
      array:
        - |
          objectName: mysql-connection-string
          objectType: secret
          objectVersion: ""
        - |
          objectName: redis-connection-string
          objectType: secret
          objectVersion: ""
        - |
          objectName: jwt-signing-key
          objectType: secret
          objectVersion: ""
        - |
          objectName: stripe-secret-key
          objectType: secret
          objectVersion: ""
    tenantId: "<tenant-id>"
  secretObjects:
    - secretName: quckapp-secrets
      type: Opaque
      data:
        - objectName: mysql-connection-string
          key: DB_CONNECTION_STRING
        - objectName: redis-connection-string
          key: REDIS_URL
        - objectName: jwt-signing-key
          key: JWT_SECRET
        - objectName: stripe-secret-key
          key: STRIPE_SECRET_KEY
```

---

## GitHub Secrets (CI)

### Repository Secrets

| Secret Name | Description | Rotation |
|-------------|-------------|----------|
| `ACR_USERNAME` | Azure Container Registry service principal | 90 days |
| `ACR_PASSWORD` | ACR service principal password | 90 days |
| `AZURE_DEVOPS_PAT` | Azure DevOps Personal Access Token | 30 days |
| `SONAR_TOKEN` | SonarCloud authentication token | 365 days |
| `SNYK_TOKEN` | Snyk security scanning token | 365 days |
| `CODECOV_TOKEN` | Codecov coverage upload token | Never |

### Environment Secrets

```yaml
# GitHub Environment: production
secrets:
  PROD_ACR_USERNAME: <from Key Vault>
  PROD_ACR_PASSWORD: <from Key Vault>
  PROD_DEPLOY_KEY: <from Key Vault>
```

### Accessing Secrets in Workflows

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Login to Azure ACR
        uses: azure/docker-login@v1
        with:
          login-server: quckapp.azurecr.io
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Build with Secrets
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        run: |
          # Secrets available as environment variables
          echo "Running SonarCloud analysis..."
```

---

## Azure DevOps Variable Groups (CD)

### Variable Group Structure

```yaml
# Variable Group: QuckApp-Secrets
variables:
  - name: DB_CONNECTION_STRING
    value: <linked from Key Vault>
    isSecret: true
  - name: REDIS_URL
    value: <linked from Key Vault>
    isSecret: true
  - name: JWT_SECRET
    value: <linked from Key Vault>
    isSecret: true

# Variable Group: QuckApp-Prod-Secrets
variables:
  - name: DB_CONNECTION_STRING
    value: <linked from Key Vault>
    isSecret: true
  - name: REDIS_URL
    value: <linked from Key Vault>
    isSecret: true
  - name: JWT_SECRET
    value: <linked from Key Vault>
    isSecret: true
  - name: STRIPE_SECRET_KEY
    value: <linked from Key Vault>
    isSecret: true
```

### Linking to Key Vault

```yaml
# azure-pipelines/variable-groups.yml
variables:
  - group: QuckApp-${{ parameters.environment }}-Secrets

steps:
  - task: AzureKeyVault@2
    inputs:
      azureSubscription: 'QuckApp-${{ parameters.environment }}'
      KeyVaultName: 'kv-quckapp-${{ parameters.environment }}'
      SecretsFilter: '*'
      RunAsPreJob: true

  - script: |
      echo "Secrets loaded from Key Vault"
      # Secrets available as $(mysql-connection-string), $(jwt-signing-key), etc.
    displayName: 'Use Secrets'
```

---

## Kubernetes Secrets

### Secret Store CSI Driver

```yaml
# Install Azure Key Vault Provider
helm install csi-secrets-store \
  secrets-store-csi-driver/secrets-store-csi-driver \
  --namespace kube-system

helm install azure-kv-provider \
  azure/csi-secrets-store-provider-azure \
  --namespace kube-system
```

### Pod Secret Mount

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: auth-service
  namespace: quckapp-prod
spec:
  containers:
    - name: auth-service
      image: quckapp.azurecr.io/auth-service:latest
      volumeMounts:
        - name: secrets-store
          mountPath: "/mnt/secrets"
          readOnly: true
      env:
        - name: DB_CONNECTION_STRING
          valueFrom:
            secretKeyRef:
              name: quckapp-secrets
              key: DB_CONNECTION_STRING
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: quckapp-secrets
              key: JWT_SECRET
  volumes:
    - name: secrets-store
      csi:
        driver: secrets-store.csi.k8s.io
        readOnly: true
        volumeAttributes:
          secretProviderClass: azure-kv-secrets
```

---

## Secret Rotation

### Automatic Rotation Policy

| Secret Type | Rotation Period | Method |
|-------------|-----------------|--------|
| Database passwords | 30 days | Azure Key Vault rotation |
| API keys | 90 days | Manual with notification |
| JWT signing keys | 180 days | Dual-key rotation |
| SSL certificates | 365 days | Azure App Service managed |
| OAuth secrets | 365 days | Provider-specific |

### Rotation Workflow

```yaml
# azure-pipelines/secret-rotation.yml
trigger:
  - none

schedules:
  - cron: '0 2 1 * *'  # Monthly at 2 AM on 1st
    displayName: 'Monthly Secret Rotation'
    branches:
      include:
        - main

stages:
  - stage: RotateSecrets
    jobs:
      - job: RotateDatabasePasswords
        steps:
          - task: AzureCLI@2
            displayName: 'Rotate MySQL Password'
            inputs:
              azureSubscription: 'QuckApp-Production'
              scriptType: 'bash'
              scriptLocation: 'inlineScript'
              inlineScript: |
                # Generate new password
                NEW_PASSWORD=$(openssl rand -base64 32)

                # Update MySQL user password
                az mysql flexible-server update \
                  --resource-group rg-quckapp-prod \
                  --name mysql-quckapp-prod \
                  --admin-password "$NEW_PASSWORD"

                # Update Key Vault secret
                az keyvault secret set \
                  --vault-name kv-quckapp-prod \
                  --name mysql-admin-password \
                  --value "$NEW_PASSWORD"

                # Trigger rolling restart of pods
                kubectl rollout restart deployment -n quckapp-prod \
                  -l uses-mysql=true

      - job: RotateJWTKeys
        steps:
          - task: AzureCLI@2
            displayName: 'Rotate JWT Signing Key'
            inputs:
              azureSubscription: 'QuckApp-Production'
              scriptType: 'bash'
              scriptLocation: 'inlineScript'
              inlineScript: |
                # JWT rotation uses dual-key strategy
                # 1. Generate new key
                NEW_KEY=$(openssl rand -base64 64)

                # 2. Store as jwt-signing-key-new
                az keyvault secret set \
                  --vault-name kv-quckapp-prod \
                  --name jwt-signing-key-new \
                  --value "$NEW_KEY"

                # 3. Application reads both keys for validation
                # 4. After grace period, promote new key to primary
```

### Dual-Key JWT Rotation

```elixir
# Application code for dual-key JWT validation
defmodule QuckApp.Auth.JWTValidator do
  def validate_token(token) do
    primary_key = get_secret("jwt-signing-key")
    secondary_key = get_secret("jwt-signing-key-old")

    case JOSE.JWT.verify(primary_key, token) do
      {:ok, claims} -> {:ok, claims}
      {:error, _} ->
        # Try secondary key during rotation window
        case JOSE.JWT.verify(secondary_key, token) do
          {:ok, claims} -> {:ok, claims}
          {:error, reason} -> {:error, reason}
        end
    end
  end
end
```

---

## Security Best Practices

### Access Control

```yaml
# Azure Key Vault RBAC
roles:
  - name: Key Vault Administrator
    principals:
      - security-team@quckapp.com
    scope: /subscriptions/.../resourceGroups/rg-quckapp-prod/providers/Microsoft.KeyVault/vaults/kv-quckapp-prod

  - name: Key Vault Secrets User
    principals:
      - aks-prod-managed-identity
      - ci-cd-service-principal
    scope: /subscriptions/.../resourceGroups/rg-quckapp-prod/providers/Microsoft.KeyVault/vaults/kv-quckapp-prod
```

### Audit Logging

```yaml
# Key Vault Diagnostic Settings
diagnosticSettings:
  - name: kv-audit-logs
    logs:
      - category: AuditEvent
        enabled: true
        retentionPolicy:
          enabled: true
          days: 365
    metrics:
      - category: AllMetrics
        enabled: true
    workspaceId: /subscriptions/.../workspaces/law-quckapp-security
```

### Secret Scanning

```yaml
# GitHub Secret Scanning (enabled by default for public repos)
# For private repos, enable in repository settings

# Pre-commit hook for local scanning
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

### Emergency Secret Revocation

```bash
#!/bin/bash
# scripts/emergency-secret-revocation.sh

SECRET_NAME=$1
ENVIRONMENT=$2

echo "Emergency revocation of $SECRET_NAME in $ENVIRONMENT"

# 1. Disable the secret in Key Vault
az keyvault secret set-attributes \
  --vault-name "kv-quckapp-$ENVIRONMENT" \
  --name "$SECRET_NAME" \
  --enabled false

# 2. Generate and set new secret
NEW_VALUE=$(openssl rand -base64 32)
az keyvault secret set \
  --vault-name "kv-quckapp-$ENVIRONMENT" \
  --name "$SECRET_NAME" \
  --value "$NEW_VALUE"

# 3. Trigger pod restart to pick up new secret
kubectl rollout restart deployment -n "quckapp-$ENVIRONMENT" --all

# 4. Send alert
curl -X POST "$PAGERDUTY_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"Emergency secret revocation: $SECRET_NAME in $ENVIRONMENT\"}"

echo "Secret revoked and rotated. New value stored in Key Vault."
```
