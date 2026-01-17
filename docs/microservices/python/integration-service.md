---
sidebar_position: 4
---

# Integration Service

Python service for third-party integrations.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5016 |
| **Database** | MySQL |
| **Framework** | FastAPI |
| **Language** | Python 3.11 |

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5016/docs
- **ReDoc:** http://localhost:5016/redoc
- **OpenAPI Spec:** http://localhost:5016/openapi.json

### FastAPI Configuration

```python
app = FastAPI(
    title="QuckApp Integration Service API",
    version="1.0.0",
    description="Third-party integrations service"
)
```

### API Tags

| Tag | Description |
|-----|-------------|
| Integrations | Integration management |
| Webhooks | Webhook configuration |
| OAuth | OAuth flow for third-party apps |

### Security

- **Authentication:** JWT Bearer token or OAuth tokens
- **Webhooks:** HMAC signature verification
