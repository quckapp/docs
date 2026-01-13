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
POST /api/permissions/check
POST /api/permissions/batch-check

# Role management
GET    /api/roles
POST   /api/roles
GET    /api/roles/{roleId}
PUT    /api/roles/{roleId}
DELETE /api/roles/{roleId}

# User roles
GET    /api/users/{userId}/roles
POST   /api/users/{userId}/roles
DELETE /api/users/{userId}/roles/{roleId}

# Policies
GET    /api/policies
POST   /api/policies
DELETE /api/policies/{policyId}
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
