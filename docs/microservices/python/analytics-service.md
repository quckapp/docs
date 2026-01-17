---
sidebar_position: 1
---

# Analytics Service

Python/FastAPI service for usage analytics and metrics.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5007 |
| **Database** | MySQL |
| **Framework** | FastAPI |
| **Language** | Python 3.11 |

## Features

- Event tracking
- Usage metrics
- Dashboard data
- Custom reports
- Data aggregation

## API Endpoints

```http
GET  /api/analytics/events
POST /api/analytics/events
GET  /api/analytics/metrics
GET  /api/analytics/dashboard
GET  /api/analytics/reports
```

## Event Schema

```python
class AnalyticsEvent(BaseModel):
    event_type: str
    user_id: Optional[str]
    workspace_id: Optional[str]
    properties: Dict[str, Any]
    timestamp: datetime
```

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5007/docs
- **ReDoc:** http://localhost:5007/redoc
- **OpenAPI Spec:** http://localhost:5007/openapi.json

### FastAPI Configuration

The analytics-service uses FastAPI's built-in OpenAPI support:

```python
from fastapi import FastAPI

app = FastAPI(
    title="QuckApp Analytics Service API",
    version="1.0.0",
    description="Usage analytics and metrics service",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Security scheme
from fastapi.security import HTTPBearer
security = HTTPBearer()
```

### API Tags

| Tag | Description |
|-----|-------------|
| Events | Event tracking and retrieval |
| Metrics | Usage metrics and statistics |
| Dashboard | Dashboard data aggregation |
| Reports | Custom report generation |

### Security

- **Authentication:** JWT Bearer token via `Authorization` header
- **Rate Limiting:** 1000 requests/minute per API key
