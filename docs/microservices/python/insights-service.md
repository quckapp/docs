---
sidebar_position: 7
---

# Insights Service

Python service for business insights and trends.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5018 |
| **Database** | Databricks |
| **Framework** | FastAPI |
| **Language** | Python 3.11 |

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5018/docs
- **ReDoc:** http://localhost:5018/redoc
- **OpenAPI Spec:** http://localhost:5018/openapi.json

### FastAPI Configuration

```python
app = FastAPI(
    title="QuckApp Insights Service API",
    version="1.0.0",
    description="Business insights and trends analysis"
)
```

### API Tags

| Tag | Description |
|-----|-------------|
| Insights | Business insights and trends |
| Dashboards | Dashboard data |
| Reports | Automated report generation |

### Security

- **Authentication:** JWT Bearer token with admin role
