---
sidebar_position: 1
---

# Auth Service

Spring Boot authentication and authorization microservice handling JWT, OAuth2, 2FA, phone OTP, session management, and comprehensive user security.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 8081 |
| **Context Path** | `/api/auth` |
| **Database** | MySQL 8.0 |
| **Cache** | Redis 7 |
| **Message Queue** | Apache Kafka |
| **Framework** | Spring Boot 3.2.0 |
| **Language** | Java 21 |
| **API Docs** | SpringDoc OpenAPI 2.3.0 |

## Features

- Email/Password authentication with BCrypt hashing
- Phone-based OTP authentication via SMS
- OAuth2 social login (Google, Apple, Facebook, GitHub, Microsoft)
- Two-Factor Authentication (TOTP) with backup codes
- JWT token management with refresh token rotation
- Multi-device session management
- Device trust and linking
- FCM token management for push notifications
- User blocking functionality
- Role-Based Access Control (RBAC)
- Comprehensive login history with anomaly detection
- Rate limiting with sliding window algorithm
- Data migration support from MongoDB

## Architecture

### Package Structure

```
com.quckapp.auth/
├── audit/              # Audit logging
├── config/             # Configuration classes
├── controller/         # REST API controllers
│   ├── AuthController
│   ├── UserProfileController
│   ├── PhoneAuthController
│   ├── OAuth2Controller
│   └── MigrationController
├── domain/
│   ├── entity/         # JPA entities (28 entities)
│   └── repository/     # Data access layer (18 repositories)
├── dto/                # Data transfer objects
├── kafka/              # Event publishing
├── security/           # Security implementation
│   ├── jwt/            # JWT services
│   ├── oauth2/         # OAuth2 handlers
│   └── ratelimit/      # Rate limiting
└── service/            # Business logic (15+ services)
    └── impl/           # Service implementations
```

## Domain Entities

### Core Authentication

| Entity | Description |
|--------|-------------|
| `AuthUser` | Core authentication record with email, password hash, 2FA settings |
| `UserProfile` | Complete user profile (1:1 with AuthUser) |
| `RefreshToken` | Token rotation and revocation tracking |
| `PhoneOtp` | One-time passwords for phone authentication |

### Session & Activity

| Entity | Description |
|--------|-------------|
| `ActiveSession` | Tracks user sessions across devices with geolocation |
| `SessionActivity` | Logs activities within a session |
| `LoginHistory` | Records all login attempts with device/geo data |
| `LoginAnomaly` | Tracks suspicious login activities |

### OAuth2 & Security

| Entity | Description |
|--------|-------------|
| `OAuthConnection` | Links OAuth providers to users |
| `TrustedDevice` | Devices marked as trusted |
| `LinkedDevice` | Connected user devices with FCM tokens |
| `ApiKey` | Service-to-service API keys |

### RBAC (Role-Based Access Control)

| Entity | Description |
|--------|-------------|
| `Role` | Defines roles with priority and system flags |
| `Permission` | Granular permissions (resource:action format) |
| `RolePermission` | Many-to-many role-permission mapping |
| `UserRoleAssignment` | User-to-role assignment with expiry |

### User Preferences

| Entity | Description |
|--------|-------------|
| `UserSettings` | User preferences (appearance, notifications, privacy) |
| `UserSecurityPreferences` | Security settings (2FA, session limits, IP whitelist) |
| `UserNotificationPreferences` | Notification channels and quiet hours |

### Enums

| Enum | Values |
|------|--------|
| `UserStatus` | ONLINE, OFFLINE, AWAY, DO_NOT_DISTURB |
| `UserRole` | USER, MODERATOR, ADMIN, SUPER_ADMIN |
| `DeviceType` | MOBILE, TABLET, WEB, DESKTOP |
| `LoginStatus` | SUCCESS, FAILED, BLOCKED, PENDING_2FA |
| `LoginMethod` | PASSWORD, OAUTH2, PHONE_OTP, 2FA |
| `AnomalyType` | VPN_DETECTED, TOR_DETECTED, NEW_COUNTRY, NEW_DEVICE, etc. |
| `AnomalySeverity` | LOW, MEDIUM, HIGH, CRITICAL |
| `VisibilityLevel` | EVERYONE, FOLLOWERS_ONLY, PRIVATE |

## Services

### Core Services

| Service | Responsibilities |
|---------|------------------|
| `AuthService` | Registration, login, logout, password management, OAuth |
| `TwoFactorService` | 2FA setup, enable/disable, backup codes |
| `PhoneOtpService` | OTP generation, verification, phone login |
| `SessionManagementService` | Session lifecycle, activity logging |
| `LoginHistoryService` | Login tracking, anomaly detection |

### User Services

| Service | Responsibilities |
|---------|------------------|
| `UserProfileService` | Profile CRUD, search, admin operations |
| `UserSettingsService` | Settings management, user blocking |
| `LinkedDeviceService` | Device linking, FCM token management |
| `UserPreferencesService` | Security and notification preferences |

### Security Services

| Service | Responsibilities |
|---------|------------------|
| `JwtService` | JWT generation, validation, claims extraction |
| `RateLimitService` | Sliding window rate limiting with Redis |
| `TokenBlacklistService` | Redis-based token revocation |
| `PermissionService` | Permission CRUD and assignment |
| `RoleService` | Role CRUD and user assignment |

### Integration Services

| Service | Responsibilities |
|---------|------------------|
| `SmsService` / `KafkaSmsService` | SMS delivery via Kafka |
| `MigrationService` | MongoDB to MySQL data migration |
| `UserEventPublisher` | Kafka event publishing |

## API Endpoints

**Base URL:** `http://localhost:8081/api/auth`

### Authentication (`/v1`)

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| `POST` | `/register` | Register new user | 5/hour |
| `POST` | `/login` | Login with email/password | Custom |
| `POST` | `/login/2fa` | Complete 2FA verification | 5/5min |
| `POST` | `/logout` | Logout and revoke tokens | - |

### Token Management (`/v1/token`)

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| `POST` | `/refresh` | Refresh access token | 30/min |
| `POST` | `/validate` | Validate JWT token | 100/min |
| `POST` | `/revoke` | Revoke specific token | 10/min/user |
| `POST` | `/revoke-all` | Revoke all user tokens | 5/5min/user |

### Password Management (`/v1/password`)

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| `POST` | `/forgot` | Request password reset | 3/hour |
| `POST` | `/reset` | Reset password with token | 5/hour |
| `POST` | `/change` | Change password (authenticated) | 5/hour/user |

### Two-Factor Authentication (`/v1/2fa`)

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| `POST` | `/setup` | Setup 2FA - get QR code | 10/hour/user |
| `POST` | `/enable` | Enable 2FA after verification | 5/5min/user |
| `POST` | `/disable` | Disable 2FA | 3/hour/user |
| `POST` | `/backup-codes` | Generate backup codes | 3/hour/user |

### Phone Authentication (`/v1/auth/phone`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/request-otp` | Request OTP via SMS |
| `POST` | `/verify-otp` | Verify OTP code |
| `POST` | `/login` | Login/register with OTP |
| `POST` | `/resend-otp` | Resend OTP |

### OAuth2 (`/v1/oauth` & `/v1/oauth2`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/oauth2/providers` | Get available OAuth providers |
| `GET` | `/oauth2/authorize/{provider}` | Get authorization URL |
| `GET` | `/oauth2/linked` | Get linked providers for user |
| `POST` | `/oauth/{provider}` | Login/register with OAuth |
| `POST` | `/oauth/{provider}/link` | Link OAuth to account |
| `DELETE` | `/oauth/{provider}/unlink` | Unlink OAuth provider |

### Sessions (`/v1/sessions`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Get active sessions |
| `DELETE` | `/` | Terminate all other sessions |
| `DELETE` | `/{sessionId}` | Terminate specific session |

### User Profiles (`/v1/users`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/me` | Get current user profile |
| `PUT` | `/me` | Update current user profile |
| `PUT` | `/me/status` | Update user status |
| `GET` | `/me/settings` | Get user settings |
| `PUT` | `/me/settings` | Update user settings |
| `GET` | `/{userId}` | Get profile by ID |
| `GET` | `/by-username/{username}` | Get profile by username |
| `GET` | `/by-phone/{phoneNumber}` | Get profile by phone |
| `GET` | `/by-external-id/{externalId}` | Get profile by external ID |
| `GET` | `/batch` | Get multiple profiles by IDs |
| `GET` | `/batch/external` | Get profiles by external IDs |
| `GET` | `/search` | Search users |

### Devices (`/v1/users/me/devices`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Get linked devices |
| `POST` | `/` | Link a device |
| `DELETE` | `/{deviceId}` | Unlink a device |
| `PUT` | `/{deviceId}/fcm-token` | Update FCM token |
| `PUT` | `/{deviceId}/activity` | Update device activity |

### Blocked Users (`/v1/users/me/blocked-users`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Get blocked users |
| `POST` | `/` | Block a user |
| `DELETE` | `/{blockedUserId}` | Unblock a user |

### Admin (`/v1/users/admin`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/ban` | Ban a user |
| `POST` | `/unban/{userId}` | Unban a user |
| `POST` | `/role` | Update user role |
| `POST` | `/permissions` | Update user permissions |
| `GET` | `/statistics` | Get user statistics |

### Internal APIs (`/v1/users/internal`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/fcm-tokens/{userId}` | Get FCM tokens for user |
| `POST` | `/fcm-tokens/batch` | Get FCM tokens batch |
| `GET` | `/check-blocked` | Check if users are blocked |

### Migration (`/v1/migration`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/users/batch` | Batch import users |
| `POST` | `/settings/batch` | Batch import settings |
| `GET` | `/status` | Get migration status |
| `POST` | `/validate` | Validate migration |

## Security Configuration

### JWT Configuration

```yaml
jwt:
  secret: ${JWT_SECRET}  # Min 32 characters
  access-token-expiry: 900000    # 15 minutes
  refresh-token-expiry: 604800000 # 7 days
  issuer: QuckApp

# Token claims include:
# - userId, email, externalId
# - 2fa flag, sessionId
# - Token type (access, refresh, password_reset, etc.)
```

### OAuth2 Providers

```yaml
oauth:
  google:
    client-id: ${GOOGLE_CLIENT_ID}
    client-secret: ${GOOGLE_CLIENT_SECRET}
  apple:
    client-id: ${APPLE_CLIENT_ID}
    client-secret: ${APPLE_CLIENT_SECRET}
  facebook:
    client-id: ${FACEBOOK_CLIENT_ID}
    client-secret: ${FACEBOOK_CLIENT_SECRET}
  github:
    client-id: ${GITHUB_CLIENT_ID}
    client-secret: ${GITHUB_CLIENT_SECRET}
```

### Rate Limiting

```java
// Sliding window algorithm with Redis
// Configuration per endpoint:

@RateLimit(key = "login", maxRequests = 5, windowSeconds = 300)
public AuthResponse login(LoginRequest request) { ... }

// Default limits:
// - Login: 5 attempts per 5 minutes, 15-minute block
// - API: 100 requests per minute per user
// - Registration: 5 per hour
// - Password reset: 3 per hour
```

### Security Features

| Feature | Implementation |
|---------|----------------|
| Password Hashing | BCrypt with strength 12 |
| 2FA | TOTP with 6-digit codes, 30-second window |
| Session Limits | Max 5 concurrent sessions (configurable) |
| Login Anomaly Detection | VPN/Tor/Proxy detection, impossible travel |
| Account Lockout | After 5 failed attempts, 15-minute lockout |
| IP Blocking | Automatic after repeated failed attempts |

## Kafka Events

### Published Topics

| Topic | Event Types |
|-------|-------------|
| `user.registered` | USER_REGISTERED |
| `user.password.reset.requested` | PASSWORD_RESET_REQUESTED |
| `user.password.changed` | PASSWORD_CHANGED |
| `user.profile.created` | PROFILE_CREATED |
| `user.profile.updated` | PROFILE_UPDATED |
| `user.status.changed` | STATUS_CHANGED |
| `user.banned` | USER_BANNED |
| `user.unbanned` | USER_UNBANNED |
| `user.role.changed` | ROLE_CHANGED |
| `user.device.linked` | DEVICE_LINKED |
| `user.device.unlinked` | DEVICE_UNLINKED |
| `user.settings.updated` | SETTINGS_UPDATED |
| `notification.sms.otp` | OTP SMS requests |

### Event Payload Structure

```json
{
  "eventType": "USER_REGISTERED",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "externalId": "optional-external-id",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Database Migrations (Flyway)

| Version | Description |
|---------|-------------|
| V1 | Initial schema: auth_users, oauth_connections, refresh_tokens, api_keys |
| V2 | User profiles: user_profiles, linked_devices, user_settings |
| V3 | Phone OTP: phone_otps table with indexes |
| V4 | RBAC & Sessions: roles, permissions, active_sessions, login_history |
| V5 | OAuth2 enhancements: additional fields for profile data |
| V6 | Security preferences fixes |
| V7 | Session activities column fix |
| V8 | Trusted devices created_at timestamp |

## Request/Response Examples

### Register

```bash
curl -X POST http://localhost:8081/api/auth/v1/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

### Login

```bash
curl -X POST http://localhost:8081/api/auth/v1/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "deviceId": "device-123",
    "deviceName": "My Phone"
  }'
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
  },
  "requiresTwoFactor": false
}
```

### Phone OTP Login

```bash
# Request OTP
curl -X POST http://localhost:8081/api/auth/v1/auth/phone/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'

# Login with OTP
curl -X POST http://localhost:8081/api/auth/v1/auth/phone/login \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+1234567890",
    "code": "123456"
  }'
```

### Refresh Token

```bash
curl -X POST http://localhost:8081/api/auth/v1/token/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "your-refresh-token"}'
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 8081 |
| `DB_HOST` | MySQL host | localhost |
| `DB_PORT` | MySQL port | 3306 |
| `DB_NAME` | Database name | quckapp_auth |
| `DB_USERNAME` | Database username | root |
| `DB_PASSWORD` | Database password | - |
| `REDIS_HOST` | Redis host | localhost |
| `REDIS_PORT` | Redis port | 6379 |
| `REDIS_PASSWORD` | Redis password | - |
| `KAFKA_BROKERS` | Kafka bootstrap servers | localhost:9092 |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | - |
| `ENCRYPTION_KEY` | Data encryption key (32 chars) | - |

### Docker Compose

```yaml
auth-service:
  build: .
  ports:
    - "8081:8081"
  environment:
    - PORT=8081
    - DB_HOST=mysql
    - DB_PORT=3306
    - DB_NAME=quckapp_auth
    - DB_USERNAME=root
    - DB_PASSWORD=root_secret
    - REDIS_HOST=redis
    - REDIS_PORT=6379
    - KAFKA_BROKERS=kafka:9092
    - JWT_SECRET=${JWT_SECRET}
  depends_on:
    mysql:
      condition: service_healthy
    redis:
      condition: service_healthy
    kafka:
      condition: service_healthy
```

## Monitoring

### Health Check

```bash
curl http://localhost:8081/api/auth/actuator/health
```

### Metrics

Prometheus metrics available at: `http://localhost:8081/api/auth/actuator/prometheus`

### API Documentation

- **Swagger UI:** http://localhost:8081/api/auth/swagger-ui.html
- **OpenAPI Spec (JSON):** http://localhost:8081/api/auth/v3/api-docs
- **OpenAPI Spec (YAML):** http://localhost:8081/api/auth/v3/api-docs.yaml
- **Full API Reference:** [Authentication API](/docs/api/rest/authentication)

#### Swagger Configuration

The auth-service uses SpringDoc OpenAPI with comprehensive configuration in `OpenApiConfig.java`:

```java
@OpenAPIDefinition(
    info = @Info(
        title = "QuckApp Auth Service API",
        version = "1.0.0",
        description = "Authentication & Authorization Service..."
    ),
    servers = {
        @Server(url = "/api/auth", description = "Auth Service Base Path"),
        @Server(url = "http://localhost:8081/api/auth", description = "Local Development"),
        @Server(url = "https://api.quckapp.com/auth", description = "Production")
    }
)
@SecuritySchemes({
    @SecurityScheme(name = "bearerAuth", type = HTTP, scheme = "bearer", bearerFormat = "JWT"),
    @SecurityScheme(name = "apiKey", type = APIKEY, in = HEADER, parameterName = "X-API-Key")
})
public class OpenApiConfig { ... }
```

#### API Groups

The Swagger UI organizes endpoints into logical groups:

| Group | Endpoints | Description |
|-------|-----------|-------------|
| **0. All Endpoints** | `/v1/**` | Complete API view |
| **1. Public** | `/v1/register`, `/v1/login`, `/v1/oauth/**`, `/v1/auth/phone/**` | No authentication required |
| **2. Authenticated** | `/v1/logout`, `/v1/2fa/**`, `/v1/sessions/**`, `/v1/users/me/**` | Requires JWT Bearer token |
| **3. User Management** | `/v1/users/**` (excluding me, admin, internal) | User lookup and search |
| **4. Admin** | `/v1/users/admin/**` | Admin-only operations |
| **5. Internal** | `/v1/users/internal/**`, `/v1/migration/**` | Service-to-service APIs |

#### Security Schemes

| Scheme | Type | Usage |
|--------|------|-------|
| `bearerAuth` | JWT Bearer | Most authenticated endpoints |
| `apiKey` | X-API-Key Header | Internal service communication |

#### Swagger UI Features

- **Grouped APIs** - Endpoints organized by Public, Authenticated, User Management, Admin, and Internal
- **Try It Out** - Interactive API testing directly from the browser
- **Authorization** - Persistent Bearer token storage for testing authenticated endpoints
- **Request/Response Examples** - Full request and response schema documentation
- **Rate Limit Headers** - All responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

#### API Tags

| Tag | Description |
|-----|-------------|
| Authentication | Login, registration, password management |
| Token Management | JWT refresh, validate, revoke |
| Two-Factor Authentication | 2FA setup and verification |
| Phone Authentication | SMS OTP login |
| OAuth2 | Social login providers |
| Sessions | Session management |
| User Profiles | Profile CRUD |
| Devices | Device and FCM token management |
| Blocked Users | User blocking |
| Admin | Administrative operations |
| Migration | Data migration (internal) |
| Internal | Service-to-service endpoints |

## Testing

```bash
# Run all tests
./mvnw test

# Run with coverage
./mvnw test jacoco:report

# Run specific test class
./mvnw test -Dtest=AuthControllerTest
```

## Port Mapping (Development)

| Service | Port |
|---------|------|
| Auth Service | 8081 |
| MySQL | 3308 |
| Redis | 6379 |
| Kafka | 9092, 29092 |
| Zookeeper | 2181 |
