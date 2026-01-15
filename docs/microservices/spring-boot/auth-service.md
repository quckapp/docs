---
sidebar_position: 1
---

# Auth Service

Spring Boot authentication service handling JWT, OAuth, 2FA, and session management.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 8081 |
| **Database** | MySQL |
| **Framework** | Spring Boot 3.x |
| **Language** | Java 21 |

## Features

- JWT token generation and validation
- OAuth 2.0 (Google, GitHub, Microsoft, Apple)
- Two-factor authentication (TOTP, SMS, Email)
- OTP verification
- Session management
- Password reset flow
- Account lockout protection

## API Endpoints

### Authentication

```http
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
POST /api/auth/validate
```

### OTP

```http
POST /api/auth/otp/send
POST /api/auth/otp/verify
```

### Two-Factor Authentication

```http
POST /api/auth/2fa/enable
POST /api/auth/2fa/disable
POST /api/auth/2fa/verify
GET  /api/auth/2fa/backup-codes
```

### OAuth

```http
GET  /api/auth/oauth/{provider}
GET  /api/auth/oauth/{provider}/callback
POST /api/auth/oauth/link
DELETE /api/auth/oauth/unlink/{provider}
```

### Sessions

```http
GET    /api/auth/sessions
DELETE /api/auth/sessions/{sessionId}
DELETE /api/auth/sessions/all
```

### Password

```http
POST /api/auth/password/change
POST /api/auth/password/reset/request
POST /api/auth/password/reset/confirm
```

## Data Models

### User Credentials

```java
@Entity
@Table(name = "user_credentials")
public class UserCredentials {
    @Id
    private String userId;

    @Column(unique = true)
    private String email;

    private String passwordHash;

    private boolean twoFactorEnabled;
    private String twoFactorSecret;

    private int failedLoginAttempts;
    private LocalDateTime lockoutUntil;

    private LocalDateTime lastLoginAt;
    private LocalDateTime passwordChangedAt;

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
```

### Session

```java
@Entity
@Table(name = "sessions")
public class Session {
    @Id
    private String id;

    private String userId;
    private String refreshToken;

    private String ipAddress;
    private String userAgent;
    private String deviceId;

    private LocalDateTime expiresAt;
    private LocalDateTime lastActiveAt;

    @CreatedDate
    private LocalDateTime createdAt;
}
```

### OAuth Connection

```java
@Entity
@Table(name = "oauth_connections")
public class OAuthConnection {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String userId;

    @Enumerated(EnumType.STRING)
    private OAuthProvider provider;

    private String providerUserId;
    private String accessToken;
    private String refreshToken;

    private LocalDateTime tokenExpiresAt;

    @CreatedDate
    private LocalDateTime createdAt;
}
```

## Configuration

### application.yml

```yaml
server:
  port: 8081

spring:
  datasource:
    url: jdbc:mysql://${MYSQL_HOST:localhost}:3306/QuckApp_auth
    username: ${MYSQL_USER:root}
    password: ${MYSQL_PASSWORD:password}

  jpa:
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        dialect: org.hibernate.dialect.MySQL8Dialect

jwt:
  secret: ${JWT_SECRET}
  access-token-expiry: 15m
  refresh-token-expiry: 7d
  issuer: QuckApp-auth

oauth:
  google:
    client-id: ${GOOGLE_CLIENT_ID}
    client-secret: ${GOOGLE_CLIENT_SECRET}
  github:
    client-id: ${GITHUB_CLIENT_ID}
    client-secret: ${GITHUB_CLIENT_SECRET}

otp:
  length: 6
  expiry: 5m
  max-attempts: 3

security:
  lockout:
    max-attempts: 5
    duration: 30m
```

## Security Implementation

### JWT Generation

```java
@Service
public class JwtService {

    public TokenPair generateTokens(User user) {
        String accessToken = Jwts.builder()
            .setSubject(user.getId())
            .claim("email", user.getEmail())
            .claim("role", user.getRole())
            .claim("permissions", user.getPermissions())
            .setIssuedAt(new Date())
            .setExpiration(Date.from(Instant.now().plus(15, ChronoUnit.MINUTES)))
            .setIssuer("QuckApp-auth")
            .signWith(privateKey, SignatureAlgorithm.RS256)
            .compact();

        String refreshToken = generateRefreshToken();

        return new TokenPair(accessToken, refreshToken);
    }
}
```

### Password Hashing

```java
@Service
public class PasswordService {

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);

    public String hash(String password) {
        return encoder.encode(password);
    }

    public boolean verify(String password, String hash) {
        return encoder.matches(password, hash);
    }
}
```

### TOTP Implementation

```java
@Service
public class TotpService {

    public String generateSecret() {
        return new DefaultSecretGenerator().generate();
    }

    public boolean verifyCode(String secret, String code) {
        TimeBasedOneTimePasswordGenerator totp = new TimeBasedOneTimePasswordGenerator();
        return totp.now(secret).equals(code);
    }

    public String generateQrCodeUri(String secret, String email) {
        return String.format(
            "otpauth://totp/QuckApp:%s?secret=%s&issuer=QuckApp",
            email, secret
        );
    }
}
```

## Kafka Events

### Published Events

```java
// Login events
@KafkaPublish(topic = "QuckApp.auth.events")
public class LoginSuccessEvent {
    private String userId;
    private String ip;
    private String userAgent;
    private LocalDateTime timestamp;
}

@KafkaPublish(topic = "QuckApp.auth.events")
public class LoginFailedEvent {
    private String email;
    private String ip;
    private String reason;
    private LocalDateTime timestamp;
}

// Security events
@KafkaPublish(topic = "QuckApp.security.events")
public class BruteForceDetectedEvent {
    private String ip;
    private String targetEmail;
    private int attemptCount;
}
```

## Rate Limiting

```java
@Configuration
public class RateLimitConfig {

    @Bean
    public RateLimiter loginRateLimiter() {
        return RateLimiter.of("login", RateLimiterConfig.custom()
            .limitRefreshPeriod(Duration.ofMinutes(15))
            .limitForPeriod(10)
            .timeoutDuration(Duration.ofMillis(500))
            .build());
    }

    @Bean
    public RateLimiter otpRateLimiter() {
        return RateLimiter.of("otp", RateLimiterConfig.custom()
            .limitRefreshPeriod(Duration.ofHours(1))
            .limitForPeriod(5)
            .build());
    }
}
```

## Health Check

```java
@RestController
@RequestMapping("/actuator")
public class HealthController {

    @GetMapping("/health")
    public ResponseEntity<HealthResponse> health() {
        return ResponseEntity.ok(HealthResponse.builder()
            .status("UP")
            .database(checkDatabase())
            .redis(checkRedis())
            .kafka(checkKafka())
            .build());
    }
}
```

## Docker

### Dockerfile

```dockerfile
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY target/auth-service.jar app.jar

EXPOSE 8081

ENTRYPOINT ["java", "-jar", "app.jar"]
```

### docker-compose.yml

```yaml
auth-service:
  build:
    context: ./services/auth-service
    dockerfile: Dockerfile
  ports:
    - "8081:8081"
  environment:
    - MYSQL_HOST=mysql
    - MYSQL_USER=root
    - MYSQL_PASSWORD=${MYSQL_PASSWORD}
    - JWT_SECRET=${JWT_SECRET}
    - REDIS_HOST=redis
    - KAFKA_BROKERS=kafka:9092
  depends_on:
    mysql:
      condition: service_healthy
    redis:
      condition: service_healthy
```

## Testing

```java
@SpringBootTest
@AutoConfigureMockMvc
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void login_WithValidCredentials_ReturnsTokens() throws Exception {
        mockMvc.perform(post("/api/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {
                    "email": "test@example.com",
                    "password": "password123"
                }
                """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").exists())
            .andExpect(jsonPath("$.refreshToken").exists());
    }
}
```
