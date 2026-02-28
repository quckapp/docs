# Seed Infrastructure Data into service-urls MySQL Database

**Date:** 2026-02-28
**Status:** Approved

## Goal

Populate the `service-urls-api` MySQL database with all service URLs, infrastructure configs, and Firebase configs for every environment (local, development, qa, uat1, uat2, uat3, staging, production, live) by replacing the minimal `01-seed.sql` with a comprehensive seed file.

## Data Sources

- `infrastructure/docker/.env.local` through `.env.production`
- `packages/service-urls/src/services.ts` (31 service definitions)
- `infrastructure/docker/.env.*` port mappings
- Kong gateway routing (`kong/kong.yml`)

## Tables Seeded

### 1. `service_urls` (~280 rows)
- 31 services x 9 environments
- Local: `http://localhost:{PORT}`, Remote: `http://{service}.quckapp.internal:{PORT}`
- Categories: auth, user, workspace, messaging, realtime, media, notification, analytics, ai, data, bff

### 2. `infrastructure_configs` (~90 rows)
- 10 components x 9 environments: PostgreSQL, MongoDB, Redis, Elasticsearch, ClickHouse, Kafka, MinIO/S3, SMTP, OTEL, Jaeger
- Local uses real defaults, remote uses `${PLACEHOLDER}` for secrets

### 3. `firebase_configs` (9 rows)
- Per-environment Firebase project settings
- Local is disabled (empty values)

## Approach

Single comprehensive `01-seed.sql` file using `INSERT IGNORE` for idempotency.

## File Changed

- `packages/service-urls/docker/init/01-seed.sql` — replaced with comprehensive seed
