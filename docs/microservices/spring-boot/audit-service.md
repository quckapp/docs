---
sidebar_position: 4
---

# Audit Service

Spring Boot service for comprehensive audit logging and compliance tracking.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 8084 |
| **Database** | MySQL |
| **Framework** | Spring Boot 3.x |
| **Language** | Java 21 |

## Features

- Comprehensive audit logging
- Event categorization by severity
- Search and filtering
- Data retention policies
- Compliance reporting (GDPR, SOC 2)
- Real-time alerts for critical events

## API Endpoints

```http
GET  /api/audit/logs
GET  /api/audit/logs/{id}
GET  /api/audit/logs/user/{userId}
GET  /api/audit/logs/search
GET  /api/audit/reports/compliance
POST /api/audit/export
```

## Audit Event Types

```java
public enum AuditAction {
    // Authentication
    LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT,
    TWO_FACTOR_ENABLED, TWO_FACTOR_DISABLED,
    PASSWORD_CHANGED, PASSWORD_RESET,

    // User Management
    USER_CREATED, USER_UPDATED, USER_DELETED,
    USER_BANNED, USER_UNBANNED,
    ROLE_CHANGED, PERMISSIONS_CHANGED,

    // Security
    SUSPICIOUS_ACTIVITY, BRUTE_FORCE_DETECTED,
    UNAUTHORIZED_ACCESS, RATE_LIMIT_EXCEEDED,

    // Data
    DATA_EXPORTED, DATA_DELETED,
    GDPR_REQUEST, DATA_ACCESS_REQUEST
}

public enum AuditSeverity {
    LOW, MEDIUM, HIGH, CRITICAL
}
```

## Kafka Consumer

```java
@KafkaListener(topics = "QuckApp.audit.events")
public void handleAuditEvent(AuditEvent event) {
    AuditLog log = AuditLog.builder()
        .action(event.getAction())
        .severity(event.getSeverity())
        .userId(event.getUserId())
        .ip(event.getIp())
        .details(event.getDetails())
        .timestamp(event.getTimestamp())
        .build();

    auditLogRepository.save(log);

    if (event.getSeverity() == AuditSeverity.CRITICAL) {
        alertService.sendAlert(event);
    }
}
```

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:8084/swagger-ui.html
- **OpenAPI Spec (JSON):** http://localhost:8084/v3/api-docs
- **OpenAPI Spec (YAML):** http://localhost:8084/v3/api-docs.yaml

### SpringDoc Configuration

The audit-service uses SpringDoc OpenAPI for API documentation:

```java
@OpenAPIDefinition(
    info = @Info(
        title = "QuckApp Audit Service API",
        version = "1.0.0",
        description = "Comprehensive audit logging and compliance tracking"
    ),
    servers = {
        @Server(url = "http://localhost:8084", description = "Local Development"),
        @Server(url = "https://api.quckapp.com/audit", description = "Production")
    }
)
@SecuritySchemes({
    @SecurityScheme(name = "bearerAuth", type = HTTP, scheme = "bearer", bearerFormat = "JWT"),
    @SecurityScheme(name = "apiKey", type = APIKEY, in = HEADER, parameterName = "X-API-Key")
})
public class OpenApiConfig { }
```

### API Tags

| Tag | Description |
|-----|-------------|
| Audit Logs | Query and retrieve audit logs |
| Search | Search audit logs with filters |
| Reports | Generate compliance reports |
| Export | Export audit data for compliance |

### Security

- **Admin access:** JWT Bearer token with `ADMIN` role required
- **Internal calls:** Use `X-API-Key` header for service-to-service communication
- All audit endpoints are read-only (logs are written via Kafka events)
