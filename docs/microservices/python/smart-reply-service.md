---
sidebar_position: 8
---

# Smart Reply Service

Python service for AI-powered reply suggestions.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5019 |
| **Database** | Databricks |
| **Framework** | FastAPI |
| **Language** | Python 3.11 |

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5019/docs
- **ReDoc:** http://localhost:5019/redoc
- **OpenAPI Spec:** http://localhost:5019/openapi.json

### FastAPI Configuration

```python
app = FastAPI(
    title="QuckApp Smart Reply Service API",
    version="1.0.0",
    description="AI-powered reply suggestions"
)
```

### API Tags

| Tag | Description |
|-----|-------------|
| Suggestions | Reply suggestion generation |
| Models | ML model management |
| Feedback | User feedback for model training |

### Security

- **Authentication:** API Key for service-to-service communication
