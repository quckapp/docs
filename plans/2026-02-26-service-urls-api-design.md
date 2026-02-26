# Service-URLs Go API Backend — Design Document

**Date:** 2026-02-26
**Status:** Approved

## Overview

Create the missing `service-urls/api/v1` Go backend that the `docker-compose.configloader.yml` references. This API serves as a centralized configuration store, providing service URLs and infrastructure config to all QuckApp microservices at startup.

## Two Audiences

| Path prefix | Auth method | Consumer |
|---|---|---|
| `GET /api/v1/config/...` | `X-API-Key` header | go-configloader, fetch-config.sh |
| `/api/v1/admin/service-urls/...` | `Bearer JWT` header | service-urls React frontend |
| `POST /api/v1/auth/login` | None | service-urls React frontend |
| `GET /api/v1/admin/profile` | `Bearer JWT` header | service-urls React frontend |

## Tech Stack

- **Framework:** Gin-gonic (consistent with workspace-service, bookmark-service)
- **ORM:** GORM with MySQL driver (consistent with bookmark-service)
- **Logging:** Logrus (JSON formatter)
- **Port:** 8085
- **Go version:** 1.21+

## MySQL Schema

### `service_urls`

| Column | Type | Constraints |
|---|---|---|
| id | CHAR(36) PK | UUID |
| environment | VARCHAR(20) | NOT NULL, indexed |
| service_key | VARCHAR(100) | NOT NULL, unique per env |
| category | ENUM('SPRING','NESTJS','ELIXIR','GO','PYTHON') | NOT NULL |
| url | VARCHAR(500) | NOT NULL |
| description | TEXT | |
| is_active | BOOLEAN | DEFAULT true |
| updated_by | VARCHAR(100) | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

Unique index: `(environment, service_key)`

### `infrastructure_configs`

| Column | Type | Constraints |
|---|---|---|
| id | CHAR(36) PK | UUID |
| environment | VARCHAR(20) | NOT NULL, indexed |
| infra_key | VARCHAR(100) | NOT NULL, unique per env |
| host | VARCHAR(255) | NOT NULL |
| port | INT | NOT NULL |
| username | VARCHAR(100) | |
| connection_string | VARCHAR(500) | |
| is_active | BOOLEAN | DEFAULT true |
| updated_by | VARCHAR(100) | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

Unique index: `(environment, infra_key)`

### `firebase_configs`

| Column | Type | Constraints |
|---|---|---|
| id | CHAR(36) PK | UUID |
| environment | VARCHAR(20) | UNIQUE, NOT NULL |
| project_id | VARCHAR(100) | NOT NULL |
| client_email | VARCHAR(255) | NOT NULL |
| private_key | TEXT | Encrypted at rest |
| storage_bucket | VARCHAR(255) | |
| is_active | BOOLEAN | DEFAULT true |
| updated_at | DATETIME | |

### `api_keys`

| Column | Type | Constraints |
|---|---|---|
| id | CHAR(36) PK | UUID |
| key_hash | VARCHAR(64) | NOT NULL, indexed |
| name | VARCHAR(100) | NOT NULL |
| environment | VARCHAR(20) | NULL = all envs |
| is_active | BOOLEAN | DEFAULT true |
| created_at | DATETIME | |

## API Endpoints

### Config Reader (go-configloader)

- `GET /api/v1/config/{env}/env-file` — All active configs as KEY=VALUE text
- `GET /api/v1/config/{env}/json` — All active configs as flat JSON object
- `GET /api/v1/config/{env}/service/{key}` — Single value as plain text
- `GET /api/v1/config/{env}/docker-compose` — YAML env block
- `GET /api/v1/config/{env}/kong` — Kong-compatible config

Auth: `X-API-Key` header, validated against `api_keys` table (SHA-256 hash comparison).

### Config Flattening Logic

Service URLs become: `{SERVICE_KEY}={url}` (e.g., `AUTH_SERVICE_URL=http://auth:8081`)

Infrastructure becomes:
- `{INFRA_KEY}_HOST={host}`
- `{INFRA_KEY}_PORT={port}`
- `{INFRA_KEY}_USERNAME={username}` (if set)
- `{INFRA_KEY}_CONNECTION_STRING={connectionString}` (if set)

Firebase becomes: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET`

### Admin CRUD (frontend)

**Summaries:**
- `GET /api/v1/admin/service-urls/summary`

**Services:**
- `GET /api/v1/admin/service-urls/{env}/services?category=GO`
- `POST /api/v1/admin/service-urls/{env}/services`
- `PUT /api/v1/admin/service-urls/{env}/services/{serviceKey}`
- `DELETE /api/v1/admin/service-urls/{env}/services/{serviceKey}`

**Infrastructure:**
- `GET /api/v1/admin/service-urls/{env}/infrastructure`
- `POST /api/v1/admin/service-urls/{env}/infrastructure`
- `PUT /api/v1/admin/service-urls/{env}/infrastructure/{infraKey}`
- `DELETE /api/v1/admin/service-urls/{env}/infrastructure/{infraKey}`

**Firebase:**
- `GET /api/v1/admin/service-urls/{env}/firebase`
- `PUT /api/v1/admin/service-urls/{env}/firebase` (upsert)

**Bulk Operations:**
- `GET /api/v1/admin/service-urls/{env}/export`
- `POST /api/v1/admin/service-urls/{env}/import`
- `POST /api/v1/admin/service-urls/clone`

### Auth

- `POST /api/v1/auth/login` — Returns JWT (validates phone+password against local users or proxies to auth-service)
- `GET /api/v1/admin/profile` — Returns current user from JWT

## Project Structure

```
service-urls/
├── api/v1/
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── config/config.go
│   │   ├── model/
│   │   │   ├── service_url.go
│   │   │   ├── infrastructure.go
│   │   │   ├── firebase.go
│   │   │   └── api_key.go
│   │   ├── repository/
│   │   │   ├── service_url_repo.go
│   │   │   ├── infrastructure_repo.go
│   │   │   ├── firebase_repo.go
│   │   │   └── api_key_repo.go
│   │   ├── service/
│   │   │   ├── config_service.go        (flattening + export logic)
│   │   │   ├── service_url_service.go
│   │   │   ├── infrastructure_service.go
│   │   │   ├── firebase_service.go
│   │   │   └── auth_service.go
│   │   ├── handler/
│   │   │   ├── config_handler.go        (reader endpoints)
│   │   │   ├── admin_handler.go         (CRUD endpoints)
│   │   │   └── auth_handler.go
│   │   └── middleware/
│   │       ├── api_key.go
│   │       ├── jwt.go
│   │       └── cors.go
│   ├── Dockerfile
│   ├── go.mod
│   └── .env.example
├── docker/
│   └── init/
│       └── 01-seed.sql                  (dev API key + sample data)
```

## Dockerfile

Multi-stage build (Go 1.21 alpine builder + alpine 3.19 runtime), non-root user, health check on `/health`, consistent with existing services.

## Seed Data

The `docker/init/01-seed.sql` seeds:
- Default API key: `qk_dev_masterkey_2024` (SHA-256 hashed)
- Sample development environment service URLs matching existing docker-compose services
