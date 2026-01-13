---
sidebar_position: 13
---

# HashiCorp Vault

QuikApp uses HashiCorp Vault for centralized secrets management, providing secure storage for API keys, database credentials, encryption keys, and certificates.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vault Cluster                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Vault Node 1  │  │   Vault Node 2  │  │   Vault Node 3  │  │
│  │    (Active)     │◄─│   (Standby)     │◄─│   (Standby)     │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┴────────────────────┘           │
│                              │                                   │
│                      ┌───────┴───────┐                          │
│                      │  Consul Backend│                          │
│                      │   (Storage)    │                          │
│                      └───────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
                               │
    ┌──────────────────────────┼──────────────────────────────────┐
    │              │           │           │                      │
    ▼              ▼           ▼           ▼                      ▼
┌────────┐   ┌────────┐  ┌────────┐  ┌────────┐            ┌────────┐
│  Auth  │   │  User  │  │ Backend│  │   Go   │    ...     │ Python │
│Service │   │Service │  │Gateway │  │Services│            │Services│
└────────┘   └────────┘  └────────┘  └────────┘            └────────┘
```

## Secret Types

| Secret Type | Path | Purpose |
|-------------|------|---------|
| Database credentials | `secret/data/database/*` | PostgreSQL, MySQL, MongoDB, Redis |
| API keys | `secret/data/api-keys/*` | Third-party service keys |
| JWT secrets | `secret/data/jwt/*` | Token signing keys |
| Encryption keys | `secret/data/encryption/*` | Data encryption at rest |
| OAuth credentials | `secret/data/oauth/*` | Google, GitHub, Microsoft |
| SMTP credentials | `secret/data/smtp/*` | Email service configuration |
| Cloud credentials | `secret/data/cloud/*` | AWS, GCP, Azure keys |

## Docker Configuration

```yaml
# docker-compose.yml
services:
  vault:
    image: hashicorp/vault:1.15
    container_name: QuikApp-vault
    ports:
      - "8200:8200"
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: ${VAULT_TOKEN:-dev-root-token}
      VAULT_DEV_LISTEN_ADDRESS: 0.0.0.0:8200
      VAULT_ADDR: http://127.0.0.1:8200
    cap_add:
      - IPC_LOCK
    volumes:
      - vault_data:/vault/data
      - ./config/vault:/vault/config
    networks:
      - QuikApp-network
    healthcheck:
      test: ["CMD", "vault", "status"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  vault_data:
```

### Production Configuration

```yaml
# docker-compose.vault-ha.yml
services:
  vault-1:
    image: hashicorp/vault:1.15
    command: vault server -config=/vault/config/vault.hcl
    environment:
      VAULT_ADDR: http://127.0.0.1:8200
      VAULT_API_ADDR: http://vault-1:8200
      VAULT_CLUSTER_ADDR: https://vault-1:8201
    volumes:
      - ./config/vault/vault.hcl:/vault/config/vault.hcl
      - vault1_data:/vault/data
    cap_add:
      - IPC_LOCK
    networks:
      - QuikApp-network

  vault-2:
    image: hashicorp/vault:1.15
    command: vault server -config=/vault/config/vault.hcl
    environment:
      VAULT_ADDR: http://127.0.0.1:8200
      VAULT_API_ADDR: http://vault-2:8200
      VAULT_CLUSTER_ADDR: https://vault-2:8201
    volumes:
      - ./config/vault/vault.hcl:/vault/config/vault.hcl
      - vault2_data:/vault/data
    cap_add:
      - IPC_LOCK
    networks:
      - QuikApp-network

volumes:
  vault1_data:
  vault2_data:
```

### Vault Server Configuration

```hcl
# config/vault/vault.hcl
ui = true

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 0
  tls_cert_file = "/vault/certs/vault.crt"
  tls_key_file  = "/vault/certs/vault.key"
}

storage "consul" {
  address = "consul:8500"
  path    = "vault/"
  token   = "consul-acl-token"
}

api_addr = "https://vault.QuikApp.dev:8200"
cluster_addr = "https://vault.QuikApp.dev:8201"

seal "awskms" {
  region     = "us-east-1"
  kms_key_id = "alias/QuikApp-vault-unseal"
}

telemetry {
  prometheus_retention_time = "30s"
  disable_hostname = true
}
```

## Secret Structure

### Database Secrets

```bash
# PostgreSQL
vault kv put secret/database/postgres \
  host=postgres.QuikApp.internal \
  port=5432 \
  username=QuikApp \
  password=super-secret-password \
  database=QuikApp

# MySQL
vault kv put secret/database/mysql \
  host=mysql.QuikApp.internal \
  port=3306 \
  username=QuikApp \
  password=super-secret-password \
  database=QuikApp_auth

# MongoDB
vault kv put secret/database/mongodb \
  uri="mongodb://QuikApp:password@mongodb:27017/QuikApp?authSource=admin"

# Redis
vault kv put secret/database/redis \
  host=redis.QuikApp.internal \
  port=6379 \
  password=redis-secret-password
```

### API Keys

```bash
# JWT Secrets
vault kv put secret/jwt \
  access_secret=your-access-token-secret-key \
  refresh_secret=your-refresh-token-secret-key \
  access_ttl=900 \
  refresh_ttl=604800

# OAuth Providers
vault kv put secret/oauth/google \
  client_id=google-client-id \
  client_secret=google-client-secret

vault kv put secret/oauth/github \
  client_id=github-client-id \
  client_secret=github-client-secret

# Third-party APIs
vault kv put secret/api-keys/sendgrid \
  api_key=SG.xxxxxxxxxxxxx

vault kv put secret/api-keys/twilio \
  account_sid=ACxxxxxxxx \
  auth_token=xxxxxxxx

vault kv put secret/api-keys/aws \
  access_key_id=AKIAXXXXXXXX \
  secret_access_key=xxxxxxxxxxxxxxxx
```

## Authentication Methods

### AppRole (Recommended for Services)

```bash
# Enable AppRole auth
vault auth enable approle

# Create policy for auth-service
vault policy write auth-service - <<EOF
path "secret/data/database/mysql" {
  capabilities = ["read"]
}
path "secret/data/jwt" {
  capabilities = ["read"]
}
path "secret/data/oauth/*" {
  capabilities = ["read"]
}
EOF

# Create AppRole
vault write auth/approle/role/auth-service \
  token_policies="auth-service" \
  token_ttl=1h \
  token_max_ttl=4h \
  secret_id_ttl=24h

# Get Role ID and Secret ID
vault read auth/approle/role/auth-service/role-id
vault write -f auth/approle/role/auth-service/secret-id
```

### Kubernetes Auth

```bash
# Enable Kubernetes auth
vault auth enable kubernetes

# Configure Kubernetes auth
vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc:443" \
  kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt

# Create role for services
vault write auth/kubernetes/role/backend-service \
  bound_service_account_names=backend-service \
  bound_service_account_namespaces=QuikApp \
  policies=backend-policy \
  ttl=1h
```

## Client Integration

### Spring Boot

```yaml
# application.yml
spring:
  cloud:
    vault:
      uri: ${VAULT_ADDR:http://localhost:8200}
      authentication: APPROLE
      app-role:
        role-id: ${VAULT_ROLE_ID}
        secret-id: ${VAULT_SECRET_ID}
      kv:
        enabled: true
        backend: secret
        default-context: database/mysql
```

```java
// VaultConfig.java
@Configuration
public class VaultConfig {

    @Value("${database.username}")
    private String dbUsername;

    @Value("${database.password}")
    private String dbPassword;

    @Bean
    public DataSource dataSource() {
        return DataSourceBuilder.create()
            .username(dbUsername)
            .password(dbPassword)
            .build();
    }
}
```

### NestJS

```typescript
// vault.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import Vault from 'node-vault';

@Injectable()
export class VaultService implements OnModuleInit {
  private vault: Vault.client;
  private secrets: Map<string, any> = new Map();

  async onModuleInit() {
    this.vault = Vault({
      apiVersion: 'v1',
      endpoint: process.env.VAULT_ADDR || 'http://localhost:8200',
    });

    // Login with AppRole
    const loginResult = await this.vault.approleLogin({
      role_id: process.env.VAULT_ROLE_ID,
      secret_id: process.env.VAULT_SECRET_ID,
    });

    this.vault.token = loginResult.auth.client_token;

    // Pre-load common secrets
    await this.loadSecrets();
  }

  private async loadSecrets() {
    const paths = ['database/postgres', 'jwt', 'api-keys/sendgrid'];

    for (const path of paths) {
      try {
        const result = await this.vault.read(`secret/data/${path}`);
        this.secrets.set(path, result.data.data);
      } catch (error) {
        console.error(`Failed to load secret: ${path}`, error);
      }
    }
  }

  get<T>(path: string): T | undefined {
    return this.secrets.get(path) as T;
  }

  async refresh(path: string): Promise<any> {
    const result = await this.vault.read(`secret/data/${path}`);
    this.secrets.set(path, result.data.data);
    return result.data.data;
  }
}
```

### Go

```go
// vault/client.go
package vault

import (
    "context"
    "fmt"

    "github.com/hashicorp/vault/api"
    "github.com/hashicorp/vault/api/auth/approle"
)

type Client struct {
    client *api.Client
}

func NewClient(addr, roleID, secretID string) (*Client, error) {
    config := api.DefaultConfig()
    config.Address = addr

    client, err := api.NewClient(config)
    if err != nil {
        return nil, err
    }

    // AppRole authentication
    appRoleAuth, err := approle.NewAppRoleAuth(
        roleID,
        &approle.SecretID{FromString: secretID},
    )
    if err != nil {
        return nil, err
    }

    authInfo, err := client.Auth().Login(context.Background(), appRoleAuth)
    if err != nil {
        return nil, err
    }

    if authInfo == nil {
        return nil, fmt.Errorf("no auth info returned")
    }

    return &Client{client: client}, nil
}

func (c *Client) GetSecret(path string) (map[string]interface{}, error) {
    secret, err := c.client.KVv2("secret").Get(context.Background(), path)
    if err != nil {
        return nil, err
    }
    return secret.Data, nil
}

func (c *Client) GetDatabaseCredentials(dbType string) (*DBCredentials, error) {
    data, err := c.GetSecret(fmt.Sprintf("database/%s", dbType))
    if err != nil {
        return nil, err
    }

    return &DBCredentials{
        Host:     data["host"].(string),
        Port:     data["port"].(string),
        Username: data["username"].(string),
        Password: data["password"].(string),
        Database: data["database"].(string),
    }, nil
}
```

### Python

```python
# vault_client.py
import hvac
import os

class VaultClient:
    def __init__(self):
        self.client = hvac.Client(
            url=os.getenv('VAULT_ADDR', 'http://localhost:8200')
        )

        # AppRole authentication
        self.client.auth.approle.login(
            role_id=os.getenv('VAULT_ROLE_ID'),
            secret_id=os.getenv('VAULT_SECRET_ID')
        )

        self._cache = {}

    def get_secret(self, path: str, use_cache: bool = True) -> dict:
        if use_cache and path in self._cache:
            return self._cache[path]

        response = self.client.secrets.kv.v2.read_secret_version(
            path=path,
            mount_point='secret'
        )
        secret = response['data']['data']

        if use_cache:
            self._cache[path] = secret

        return secret

    def get_database_url(self, db_type: str) -> str:
        creds = self.get_secret(f'database/{db_type}')

        if db_type == 'postgres':
            return f"postgresql://{creds['username']}:{creds['password']}@{creds['host']}:{creds['port']}/{creds['database']}"
        elif db_type == 'mysql':
            return f"mysql+pymysql://{creds['username']}:{creds['password']}@{creds['host']}:{creds['port']}/{creds['database']}"
        elif db_type == 'mongodb':
            return creds['uri']

        raise ValueError(f"Unknown database type: {db_type}")

# Usage
vault = VaultClient()
postgres_url = vault.get_database_url('postgres')
jwt_secrets = vault.get_secret('jwt')
```

## Dynamic Secrets

### Database Dynamic Credentials

```bash
# Enable database secrets engine
vault secrets enable database

# Configure PostgreSQL connection
vault write database/config/postgres \
  plugin_name=postgresql-database-plugin \
  connection_url="postgresql://{{username}}:{{password}}@postgres:5432/QuikApp" \
  allowed_roles="readonly,readwrite" \
  username="vault_admin" \
  password="vault_admin_password"

# Create readonly role
vault write database/roles/readonly \
  db_name=postgres \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"

# Create readwrite role
vault write database/roles/readwrite \
  db_name=postgres \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"

# Get dynamic credentials
vault read database/creds/readonly
```

## Policies

### Service Policies

```hcl
# policies/backend-service.hcl
path "secret/data/database/postgres" {
  capabilities = ["read"]
}

path "secret/data/redis" {
  capabilities = ["read"]
}

path "secret/data/jwt" {
  capabilities = ["read"]
}

path "secret/data/api-keys/*" {
  capabilities = ["read"]
}

# Dynamic database credentials
path "database/creds/readwrite" {
  capabilities = ["read"]
}
```

```hcl
# policies/auth-service.hcl
path "secret/data/database/mysql" {
  capabilities = ["read"]
}

path "secret/data/jwt" {
  capabilities = ["read"]
}

path "secret/data/oauth/*" {
  capabilities = ["read"]
}

path "secret/data/smtp" {
  capabilities = ["read"]
}

# Transit encryption
path "transit/encrypt/user-data" {
  capabilities = ["update"]
}

path "transit/decrypt/user-data" {
  capabilities = ["update"]
}
```

## Transit Encryption

```bash
# Enable transit secrets engine
vault secrets enable transit

# Create encryption key
vault write -f transit/keys/user-data

# Encrypt data
vault write transit/encrypt/user-data \
  plaintext=$(echo "sensitive-data" | base64)

# Decrypt data
vault write transit/decrypt/user-data \
  ciphertext="vault:v1:xxxxx"
```

## Monitoring

### Prometheus Metrics

```yaml
# Vault exposes metrics at /v1/sys/metrics
scrape_configs:
  - job_name: 'vault'
    metrics_path: '/v1/sys/metrics'
    params:
      format: ['prometheus']
    bearer_token: 'vault-token-with-metrics-access'
    static_configs:
      - targets: ['vault:8200']
```

### Audit Logging

```bash
# Enable file audit
vault audit enable file file_path=/vault/logs/audit.log

# Enable syslog audit
vault audit enable syslog tag="vault" facility="AUTH"
```

## Backup & Recovery

```bash
#!/bin/bash
# scripts/backup-vault.sh

BACKUP_DIR="/backups/vault"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create snapshot (Enterprise feature)
vault operator raft snapshot save "$BACKUP_DIR/vault_${TIMESTAMP}.snap"

# Export secrets (for disaster recovery)
vault kv get -format=json secret/data/database/postgres > "$BACKUP_DIR/postgres_${TIMESTAMP}.json"

# Encrypt backup
gpg --encrypt --recipient backup@QuikApp.dev "$BACKUP_DIR/vault_${TIMESTAMP}.snap"

# Upload to S3
aws s3 cp "$BACKUP_DIR/vault_${TIMESTAMP}.snap.gpg" s3://QuikApp-backups/vault/
```
