---
sidebar_position: 6
---

# Custom Exceptions

Standardized exception types.

## Exception Types

```typescript
// Authentication
export class InvalidCredentialsException extends AppException {
  constructor(message = 'Invalid credentials') {
    super(message, HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS');
  }
}

export class TokenExpiredException extends AppException {
  constructor() {
    super('Token has expired', HttpStatus.UNAUTHORIZED, 'TOKEN_EXPIRED');
  }
}

export class TwoFactorRequiredException extends AppException {
  constructor() {
    super('2FA required', HttpStatus.UNAUTHORIZED, 'TWO_FACTOR_REQUIRED');
  }
}

// Resource
export class ResourceNotFoundException extends AppException {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with ID '${id}' not found` : `${resource} not found`,
      HttpStatus.NOT_FOUND,
      'RESOURCE_NOT_FOUND'
    );
  }
}

// User
export class UserBannedException extends AppException {
  constructor() {
    super('Your account has been banned', HttpStatus.FORBIDDEN, 'USER_BANNED');
  }
}
```
