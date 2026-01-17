---
sidebar_position: 2
---

# Moderation Service

Python service for content moderation.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5014 |
| **Database** | MySQL |
| **Framework** | FastAPI |
| **Language** | Python 3.11 |

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5014/docs
- **ReDoc:** http://localhost:5014/redoc
- **OpenAPI Spec:** http://localhost:5014/openapi.json

### FastAPI Configuration

The moderation-service uses FastAPI's built-in OpenAPI support:

```python
from fastapi import FastAPI

app = FastAPI(
    title="QuckApp Moderation Service API",
    version="1.0.0",
    description="Content moderation and safety service",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)
```

### API Tags

| Tag | Description |
|-----|-------------|
| Content | Content moderation operations |
| Reports | User report handling |
| Actions | Moderation actions (warn, mute, ban) |

### Security

- **Authentication:** JWT Bearer token or API Key for service-to-service
- **Internal:** Service mesh authentication
