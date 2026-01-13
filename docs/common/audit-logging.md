---
sidebar_position: 5
---

# Audit Logging

Comprehensive audit logging service.

## Audit Actions

```typescript
export enum AuditAction {
  // Authentication
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  TWO_FACTOR_ENABLED = 'TWO_FACTOR_ENABLED',

  // User Management
  USER_CREATED = 'USER_CREATED',
  USER_BANNED = 'USER_BANNED',
  ROLE_CHANGED = 'ROLE_CHANGED',

  // Security
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  BRUTE_FORCE_DETECTED = 'BRUTE_FORCE_DETECTED',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
}
```

## Usage

```typescript
@Injectable()
export class AuthService {
  constructor(private audit: AuditService) {}

  async login(credentials: LoginDto) {
    try {
      const user = await this.validateUser(credentials);
      this.audit.loginSuccess(user.id, credentials.ip, credentials.userAgent);
      return this.generateTokens(user);
    } catch (error) {
      this.audit.loginFailed(credentials.email, credentials.ip, error.message);
      throw error;
    }
  }
}
```
