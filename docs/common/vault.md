---
sidebar_position: 7
---

# Vault Integration

HashiCorp Vault for secrets management.

## Features

- Multiple auth methods (Token, AppRole, Kubernetes)
- KV v2 secrets engine
- Dynamic database credentials
- Transit encryption/decryption
- Secret caching

## Usage

```typescript
@Injectable()
export class SecretService {
  constructor(private vault: VaultService) {}

  async getDatabaseCredentials() {
    return this.vault.getDatabaseCredentials('QuckApp-role');
  }

  async encryptSensitiveData(data: string) {
    return this.vault.encrypt('QuckApp-key', data);
  }
}
```

## Secret Paths

```typescript
export const VAULT_PATHS = {
  APP_SECRETS: 'secret/data/QuckApp',
  DATABASE: 'secret/data/QuckApp/database',
  JWT: 'secret/data/QuckApp/jwt',
  FIREBASE: 'secret/data/QuckApp/firebase',
  SMTP: 'secret/data/QuckApp/smtp',
};
```
