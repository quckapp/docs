---
sidebar_position: 1
---

# Authentication API

## Login

```http
POST /api/auth/login
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",
  "refreshToken": "dGhpcyBpcyBhIHJlZnJl...",
  "expiresIn": 900,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "displayName": "John Doe"
  }
}
```

## Refresh Token

```http
POST /api/auth/refresh
```

**Request:**
```json
{
  "refreshToken": "dGhpcyBpcyBhIHJlZnJl..."
}
```

## Logout

```http
POST /api/auth/logout
Authorization: Bearer <access_token>
```

## Send OTP

```http
POST /api/auth/otp/send
```

**Request:**
```json
{
  "email": "user@example.com",
  "type": "email" // or "sms"
}
```

## Enable 2FA

```http
POST /api/auth/2fa/enable
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "otpauth://totp/QuikApp:user@example.com?secret=..."
}
```

## OAuth Login

```http
GET /api/auth/oauth/google
GET /api/auth/oauth/github
GET /api/auth/oauth/microsoft
```

Redirects to OAuth provider. After authorization, redirects back to callback URL with authorization code.
