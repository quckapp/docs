---
sidebar_position: 1
---

# Authentication API

The Authentication API provides comprehensive endpoints for user authentication, authorization, and session management.

**Base URL:** `http://localhost:8081/api/auth`

**API Documentation:**
- **Swagger UI:** http://localhost:8081/api/auth/swagger-ui.html
- **OpenAPI Spec:** http://localhost:8081/api/auth/v3/api-docs

## Authentication Methods

| Method | Description |
|--------|-------------|
| JWT Bearer Token | Primary authentication method - include in Authorization header |
| API Key | Service-to-service authentication via X-API-Key header |

```http
Authorization: Bearer <access_token>
X-API-Key: <api_key>
```

---

## Registration & Login

### Register New User

```http
POST /v1/register
```

**Rate Limit:** 5 requests per hour per IP

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2g...",
  "expiresIn": 900,
  "tokenType": "Bearer",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "twoFactorEnabled": false
  }
}
```

### Login with Email/Password

```http
POST /v1/login
```

**Rate Limit:** 5 attempts per 5 minutes, 15-minute block after exceeded

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "deviceId": "device-uuid-123",
  "deviceName": "iPhone 15 Pro"
}
```

**Response (Success):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2g...",
  "expiresIn": 900,
  "tokenType": "Bearer",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "twoFactorEnabled": false
  },
  "requiresTwoFactor": false
}
```

**Response (2FA Required):**
```json
{
  "requiresTwoFactor": true,
  "twoFactorToken": "temp-token-for-2fa",
  "message": "Two-factor authentication required"
}
```

### Complete Login with 2FA

```http
POST /v1/login/2fa
```

**Rate Limit:** 5 attempts per 5 minutes per IP

**Request:**
```json
{
  "twoFactorToken": "temp-token-from-login",
  "code": "123456"
}
```

### Logout

```http
POST /v1/logout
Authorization: Bearer <access_token>
```

---

## Token Management

### Refresh Access Token

```http
POST /v1/token/refresh
```

**Rate Limit:** 30 requests per minute per IP

**Request:**
```json
{
  "refreshToken": "your-refresh-token"
}
```

**Response:**
```json
{
  "accessToken": "new-access-token",
  "refreshToken": "new-refresh-token",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

:::info Token Rotation
Refresh tokens are rotated on each use. The old refresh token becomes invalid after a new one is issued.
:::

### Validate Token

```http
POST /v1/token/validate
```

**Rate Limit:** 100 requests per minute per IP

**Request:**
```json
{
  "token": "jwt-token-to-validate"
}
```

**Response:**
```json
{
  "valid": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "expiresAt": "2024-01-15T11:30:00Z"
}
```

### Revoke Token

```http
POST /v1/token/revoke
Authorization: Bearer <access_token>
```

**Rate Limit:** 10 requests per minute per user

**Request:**
```json
{
  "token": "token-to-revoke"
}
```

### Revoke All Tokens

```http
POST /v1/token/revoke-all
Authorization: Bearer <access_token>
```

**Rate Limit:** 5 requests per 5 minutes per user

Revokes all tokens for the authenticated user (except the current token).

---

## Password Management

### Forgot Password

```http
POST /v1/password/forgot
```

**Rate Limit:** 3 requests per hour per IP

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "message": "Password reset email sent if account exists"
}
```

:::note Security
Always returns success to prevent email enumeration attacks.
:::

### Reset Password

```http
POST /v1/password/reset
```

**Rate Limit:** 5 requests per hour per IP

**Request:**
```json
{
  "token": "reset-token-from-email",
  "password": "NewSecurePassword123!"
}
```

### Change Password

```http
POST /v1/password/change
Authorization: Bearer <access_token>
```

**Rate Limit:** 5 requests per hour per user

**Request:**
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewSecurePassword123!"
}
```

---

## Two-Factor Authentication (2FA)

### Setup 2FA

```http
POST /v1/2fa/setup
Authorization: Bearer <access_token>
```

**Rate Limit:** 10 requests per hour per user

**Response:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCodeUri": "otpauth://totp/QuckApp:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=QuckApp",
  "qrCodeImage": "data:image/png;base64,..."
}
```

### Enable 2FA

```http
POST /v1/2fa/enable
Authorization: Bearer <access_token>
```

**Rate Limit:** 5 requests per 5 minutes per user

**Request:**
```json
{
  "code": "123456"
}
```

**Response:**
```json
{
  "enabled": true,
  "backupCodes": [
    "ABCD-EFGH-IJKL",
    "MNOP-QRST-UVWX",
    "..."
  ]
}
```

:::warning
Backup codes are only shown once. Store them securely!
:::

### Disable 2FA

```http
POST /v1/2fa/disable
Authorization: Bearer <access_token>
```

**Rate Limit:** 3 requests per hour per user

**Request:**
```json
{
  "code": "123456",
  "password": "YourPassword123!"
}
```

### Generate New Backup Codes

```http
POST /v1/2fa/backup-codes
Authorization: Bearer <access_token>
```

**Rate Limit:** 3 requests per hour per user

**Request:**
```json
{
  "code": "123456"
}
```

**Response:**
```json
{
  "backupCodes": [
    "ABCD-EFGH-IJKL",
    "MNOP-QRST-UVWX",
    "..."
  ]
}
```

---

## Phone OTP Authentication

### Request OTP

```http
POST /v1/auth/phone/request-otp
```

**Rate Limits:**
- 5 requests per day per phone number
- 10 requests per hour per IP

**Request:**
```json
{
  "phoneNumber": "+1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresInSeconds": 300
}
```

### Verify OTP

```http
POST /v1/auth/phone/verify-otp
```

**Request:**
```json
{
  "phoneNumber": "+1234567890",
  "code": "123456"
}
```

### Login with Phone OTP

```http
POST /v1/auth/phone/login
```

**Request:**
```json
{
  "phoneNumber": "+1234567890",
  "code": "123456",
  "deviceId": "device-uuid-123",
  "deviceName": "My Phone"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2g...",
  "expiresIn": 900,
  "tokenType": "Bearer",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "phoneNumber": "+1234567890"
  },
  "isNewUser": false
}
```

### Resend OTP

```http
POST /v1/auth/phone/resend-otp
```

**Rate Limit:** Cooldown of 60 seconds between resends

**Request:**
```json
{
  "phoneNumber": "+1234567890"
}
```

---

## OAuth2 Social Login

### Get Available Providers

```http
GET /v1/oauth2/providers
```

**Response:**
```json
{
  "providers": [
    {
      "name": "google",
      "displayName": "Google",
      "authorizationUrl": "/oauth2/authorize/google",
      "icon": "google"
    },
    {
      "name": "facebook",
      "displayName": "Facebook",
      "authorizationUrl": "/oauth2/authorize/facebook",
      "icon": "facebook"
    },
    {
      "name": "github",
      "displayName": "GitHub",
      "authorizationUrl": "/oauth2/authorize/github",
      "icon": "github"
    },
    {
      "name": "apple",
      "displayName": "Apple",
      "authorizationUrl": "/oauth2/authorize/apple",
      "icon": "apple"
    }
  ]
}
```

### Get Authorization URL

```http
GET /v1/oauth2/authorize/{provider}
```

**Path Parameters:**
- `provider`: `google`, `facebook`, `github`, `apple`

**Query Parameters:**
- `redirect_uri` (optional): Custom redirect URI
- `state` (optional): State parameter for CSRF protection

**Response:**
```json
{
  "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

### Login/Register with OAuth

```http
POST /v1/oauth/{provider}
```

**Rate Limit:** 10 requests per minute per IP

**Path Parameters:**
- `provider`: `google`, `facebook`, `github`, `apple`

**Request:**
```json
{
  "code": "authorization-code-from-provider",
  "redirectUri": "your-redirect-uri",
  "deviceId": "device-uuid-123",
  "deviceName": "My Device"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2g...",
  "expiresIn": 900,
  "tokenType": "Bearer",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "displayName": "John Doe",
    "avatarUrl": "https://..."
  },
  "isNewUser": true
}
```

### Get Linked Providers

```http
GET /v1/oauth2/linked
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "linkedProviders": ["google", "github"],
  "availableProviders": ["facebook", "apple"]
}
```

### Link OAuth Provider

```http
POST /v1/oauth/{provider}/link
Authorization: Bearer <access_token>
```

**Rate Limit:** 5 requests per hour per user

**Request:**
```json
{
  "code": "authorization-code-from-provider",
  "redirectUri": "your-redirect-uri"
}
```

### Unlink OAuth Provider

```http
DELETE /v1/oauth/{provider}/unlink
Authorization: Bearer <access_token>
```

**Rate Limit:** 5 requests per hour per user

:::warning
Cannot unlink the last authentication method. Ensure user has another login method (password or another provider) before unlinking.
:::

---

## Session Management

### Get Active Sessions

```http
GET /v1/sessions
Authorization: Bearer <access_token>
```

**Rate Limit:** 30 requests per minute per user

**Response:**
```json
{
  "sessions": [
    {
      "id": "session-uuid-123",
      "deviceName": "iPhone 15 Pro",
      "deviceType": "MOBILE",
      "ipAddress": "192.168.1.100",
      "location": "San Francisco, CA",
      "lastActive": "2024-01-15T10:30:00Z",
      "createdAt": "2024-01-10T08:00:00Z",
      "isCurrent": true
    },
    {
      "id": "session-uuid-456",
      "deviceName": "Chrome on MacBook",
      "deviceType": "WEB",
      "ipAddress": "192.168.1.101",
      "location": "San Francisco, CA",
      "lastActive": "2024-01-14T15:20:00Z",
      "createdAt": "2024-01-12T09:00:00Z",
      "isCurrent": false
    }
  ],
  "maxSessions": 5
}
```

### Terminate Specific Session

```http
DELETE /v1/sessions/{sessionId}
Authorization: Bearer <access_token>
```

**Rate Limit:** 10 requests per minute per user

### Terminate All Other Sessions

```http
DELETE /v1/sessions
Authorization: Bearer <access_token>
```

**Rate Limit:** 5 requests per 5 minutes per user

Terminates all sessions except the current one.

---

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "timestamp": "2024-01-15T10:30:00Z",
  "path": "/v1/login"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_CREDENTIALS` | 401 | Email or password incorrect |
| `ACCOUNT_LOCKED` | 423 | Account locked due to too many failed attempts |
| `ACCOUNT_DISABLED` | 403 | Account has been disabled |
| `TOKEN_EXPIRED` | 401 | JWT token has expired |
| `TOKEN_INVALID` | 401 | JWT token is invalid or malformed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `TWO_FACTOR_REQUIRED` | 428 | 2FA code required to complete login |
| `INVALID_2FA_CODE` | 400 | 2FA code is incorrect |
| `OTP_EXPIRED` | 400 | OTP code has expired |
| `OTP_INVALID` | 400 | OTP code is incorrect |
| `OAUTH_ERROR` | 400 | OAuth authentication failed |
| `VALIDATION_ERROR` | 400 | Request validation failed |

### Rate Limit Headers

When rate limited, responses include:

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705317000
Retry-After: 300
```

---

## Security Considerations

### Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character

### Token Lifetimes

| Token Type | Lifetime |
|------------|----------|
| Access Token | 15 minutes |
| Refresh Token | 7 days |
| Password Reset Token | 1 hour |
| 2FA Setup Token | 10 minutes |
| Phone OTP | 5 minutes |

### Security Headers

All responses include:

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```
