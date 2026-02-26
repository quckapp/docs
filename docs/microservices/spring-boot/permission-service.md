---
sidebar_position: 3
---

# Permission Service

Spring Boot RBAC service using Casbin for role-based and attribute-based access control.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 8083 |
| **Database** | MySQL |
| **Framework** | Spring Boot 3.x + Casbin |
| **Language** | Java 21 |

## Features

- Role-based access control (RBAC)
- Domain-based multi-tenancy
- Dynamic policy management
- Role hierarchy
- Permission caching

## API Endpoints

```http
# Permission checks
POST /api/v1/permissions/check
POST /api/v1/permissions/batch-check

# Role management
GET    /api/v1/roles
POST   /api/v1/roles
GET    /api/v1/roles/{roleId}
PUT    /api/v1/roles/{roleId}
DELETE /api/v1/roles/{roleId}

# User roles
GET    /api/v1/users/{userId}/roles
POST   /api/v1/users/{userId}/roles
DELETE /api/v1/users/{userId}/roles/{roleId}

# Policies
GET    /api/v1/policies
POST   /api/v1/policies
DELETE /api/v1/policies/{policyId}
```

## Casbin Model

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
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && keyMatch2(r.obj, p.obj) && r.act == p.act || r.sub == "super_admin"
```

## Default Policies

```java
// User permissions
{ "user", "*", "messages", "read", "allow" }
{ "user", "*", "messages", "create", "allow" }
{ "user", "*", "profile", "read", "allow" }
{ "user", "*", "profile", "update", "allow" }

// Moderator permissions
{ "moderator", "*", "messages/*", "delete", "allow" }
{ "moderator", "*", "reports", "read", "allow" }
{ "moderator", "*", "users/*", "warn", "allow" }

// Admin permissions
{ "admin", "*", "users/*", "ban", "allow" }
{ "admin", "*", "analytics", "read", "allow" }
{ "admin", "*", "settings", "update", "allow" }
```

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:8083/swagger-ui.html
- **OpenAPI Spec (JSON):** http://localhost:8083/v3/api/v1-docs
- **OpenAPI Spec (YAML):** http://localhost:8083/v3/api/v1-docs.yaml

### SpringDoc Configuration

The permission-service uses SpringDoc OpenAPI for API documentation:

```java
@OpenAPIDefinition(
    info = @Info(
        title = "QuckApp Permission Service API",
        version = "1.0.0",
        description = "RBAC service using Casbin for role-based and attribute-based access control"
    ),
    servers = {
        @Server(url = "http://localhost:8083", description = "Local Development"),
        @Server(url = "https://api.quckapp.com/permissions", description = "Production")
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
| Permission Checks | Check user permissions for resources |
| Role Management | CRUD operations for roles |
| User Roles | Assign and revoke user roles |
| Policies | Manage Casbin policies |

### Security

- **Internal calls:** Use `X-API-Key` header for service-to-service communication
- **External calls:** JWT Bearer token with appropriate permissions
