---
sidebar_position: 4
---

# Security Architecture

Comprehensive security implementation across all layers of QuikApp.

## Security Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Layer 1: NETWORK SECURITY                                      │
│  ├── TLS 1.3 encryption                                         │
│  ├── Rate limiting (Nginx)                                      │
│  ├── DDoS protection                                            │
│  └── IP whitelisting                                            │
│                                                                  │
│  Layer 2: APPLICATION SECURITY                                  │
│  ├── JWT authentication                                         │
│  ├── OAuth 2.0 / OpenID Connect                                 │
│  ├── RBAC (Role-Based Access Control)                           │
│  └── API key management                                         │
│                                                                  │
│  Layer 3: DATA SECURITY                                         │
│  ├── Encryption at rest (AES-256)                               │
│  ├── Field-level encryption                                     │
│  ├── Data masking                                               │
│  └── Secure key management (Vault)                              │
│                                                                  │
│  Layer 4: AUDIT & COMPLIANCE                                    │
│  ├── Comprehensive audit logging                                │
│  ├── GDPR compliance                                            │
│  ├── SOC 2 controls                                             │
│  └── Data retention policies                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Authentication

### JWT Token Structure

```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user-uuid",
    "email": "user@example.com",
    "role": "user",
    "permissions": ["read:messages", "write:messages"],
    "workspaceId": "workspace-uuid",
    "iat": 1699900000,
    "exp": 1699903600,
    "iss": "QuikApp-auth",
    "aud": "QuikApp-api"
  }
}
```

### Token Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOKEN LIFECYCLE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Access Token                                                   │
│  ├── Lifetime: 15 minutes                                       │
│  ├── Storage: Memory only                                       │
│  └── Refresh: Via refresh token                                 │
│                                                                  │
│  Refresh Token                                                  │
│  ├── Lifetime: 7 days                                           │
│  ├── Storage: HttpOnly cookie                                   │
│  ├── Rotation: On each use                                      │
│  └── Revocation: Stored in Redis                                │
│                                                                  │
│  Session Token (2FA)                                            │
│  ├── Lifetime: 5 minutes                                        │
│  ├── Purpose: Intermediate auth step                            │
│  └── Invalidation: After 2FA verification                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-Factor Authentication

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Login   │────▶│ Verify   │────▶│  2FA     │────▶│  Issue   │
│ Request  │     │ Password │     │ Challenge│     │  Tokens  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                       │
                                       ▼
                              ┌────────────────┐
                              │ 2FA Methods    │
                              ├────────────────┤
                              │ • TOTP (App)   │
                              │ • SMS OTP      │
                              │ • Email OTP    │
                              │ • WebAuthn     │
                              └────────────────┘
```

### OAuth 2.0 Integration

```typescript
// Supported OAuth Providers
const oauthProviders = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['openid', 'email', 'profile'],
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['user:email'],
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['openid', 'email', 'profile'],
  },
};
```

## Authorization (RBAC)

### Role Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROLE HIERARCHY                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                     ┌─────────────┐                             │
│                     │ super_admin │                             │
│                     └──────┬──────┘                             │
│                            │ inherits                           │
│                     ┌──────▼──────┐                             │
│                     │    admin    │                             │
│                     └──────┬──────┘                             │
│                            │ inherits                           │
│                     ┌──────▼──────┐                             │
│                     │  moderator  │                             │
│                     └──────┬──────┘                             │
│                            │ inherits                           │
│                     ┌──────▼──────┐                             │
│                     │    user     │                             │
│                     └─────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Casbin Policy Model

```ini
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act, eft

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && keyMatch2(r.obj, p.obj) && r.act == p.act
```

### Permission Examples

```typescript
// Permission definitions
const permissions = {
  // User permissions
  user: [
    { resource: 'messages', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'channels', actions: ['read', 'join', 'leave'] },
    { resource: 'profile', actions: ['read', 'update'] },
  ],

  // Moderator permissions (includes user)
  moderator: [
    { resource: 'messages/*', actions: ['delete'] },
    { resource: 'users/*', actions: ['read', 'warn'] },
    { resource: 'reports', actions: ['read', 'resolve'] },
  ],

  // Admin permissions (includes moderator)
  admin: [
    { resource: 'users/*', actions: ['ban', 'unban'] },
    { resource: 'channels', actions: ['create', 'delete'] },
    { resource: 'analytics', actions: ['read'] },
  ],
};
```

## Rate Limiting

### Configuration

```typescript
// Rate limit configuration
const rateLimits = {
  // General API
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                  // requests per window
  },

  // Authentication (stricter)
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 10,
  },

  // OTP/SMS (very strict)
  otp: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
  },

  // File uploads
  upload: {
    windowMs: 60 * 60 * 1000,
    max: 50,
  },
};
```

### Nginx Rate Limiting

```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/s;

# Apply rate limits
location /api/v1 {
    limit_req zone=api_limit burst=50 nodelay;
}

location /api/auth {
    limit_req zone=auth_limit burst=20 nodelay;
}
```

## Encryption

### Data at Rest

```yaml
# Database encryption
postgresql:
  ssl: true
  ssl_cert_file: /etc/ssl/certs/server.crt
  ssl_key_file: /etc/ssl/private/server.key

mongodb:
  security:
    enableEncryption: true
    encryptionKeyFile: /etc/mongodb/encryption-key
```

### Field-Level Encryption

```typescript
// Sensitive field encryption
@Entity()
export class User {
  @Column()
  id: string;

  @Column()
  email: string;

  @Column({ transformer: new EncryptionTransformer() })
  phoneNumber: string; // Encrypted at rest

  @Column({ transformer: new EncryptionTransformer() })
  ssn: string; // Encrypted at rest
}
```

### Transit Encryption (Vault)

```typescript
// Encrypt sensitive data via Vault Transit
async encryptSensitiveData(data: string): Promise<string> {
  const result = await this.vaultService.encrypt('QuikApp-key', data);
  return result; // vault:v1:encrypted-data
}

async decryptSensitiveData(ciphertext: string): Promise<string> {
  return await this.vaultService.decrypt('QuikApp-key', ciphertext);
}
```

## Audit Logging

### Audit Events

```typescript
enum AuditAction {
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

  // Data
  DATA_EXPORTED = 'DATA_EXPORTED',
  DATA_DELETED = 'DATA_DELETED',
}
```

### Audit Log Structure

```typescript
interface AuditLog {
  id: string;
  action: AuditAction;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  targetUserId?: string;
  ip: string;
  userAgent: string;
  resource?: string;
  details?: Record<string, any>;
  success: boolean;
  timestamp: Date;
  requestId: string;
}
```

## Security Headers

```typescript
// Helmet configuration
const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'wss:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
};
```

## Security Checklist

### Authentication
- [x] JWT with RS256 signing
- [x] Refresh token rotation
- [x] Multi-factor authentication
- [x] OAuth 2.0 integration
- [x] Session management
- [x] Brute force protection

### Authorization
- [x] Role-based access control
- [x] Permission-based access control
- [x] Resource-level permissions
- [x] Workspace isolation

### Data Protection
- [x] TLS 1.3 in transit
- [x] AES-256 at rest
- [x] Field-level encryption
- [x] Secure key management

### Monitoring
- [x] Audit logging
- [x] Security alerts
- [x] Rate limit monitoring
- [x] Failed login tracking
