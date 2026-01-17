---
sidebar_position: 3
---

# Export Service

Python service for data export and GDPR compliance.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5015 |
| **Database** | MySQL |
| **Framework** | FastAPI |
| **Language** | Python 3.11 |

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5015/docs
- **ReDoc:** http://localhost:5015/redoc
- **OpenAPI Spec:** http://localhost:5015/openapi.json

### FastAPI Configuration

```python
app = FastAPI(
    title="QuckApp Export Service API",
    version="1.0.0",
    description="Data export and GDPR compliance service"
)
```

### API Tags

| Tag | Description |
|-----|-------------|
| Export | Data export operations |
| GDPR | GDPR compliance requests |
| Jobs | Export job management |

### Security

- **Authentication:** JWT Bearer token via `Authorization` header
