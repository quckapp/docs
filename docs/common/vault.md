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
    return this.vault.getDatabaseCredentials('QuikApp-role');
  }

  async encryptSensitiveData(data: string) {
    return this.vault.encrypt('QuikApp-key', data);
  }
}
```

## Secret Paths

```typescript
export const VAULT_PATHS = {
  APP_SECRETS: 'secret/data/QuikApp',
  DATABASE: 'secret/data/QuikApp/database',
  JWT: 'secret/data/QuikApp/jwt',
  FIREBASE: 'secret/data/QuikApp/firebase',
  SMTP: 'secret/data/QuikApp/smtp',
};
```
