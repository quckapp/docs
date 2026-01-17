---
sidebar_position: 6
---

# Sentiment Service

Python service for message sentiment analysis.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5017 |
| **Database** | Databricks |
| **Framework** | FastAPI |
| **Language** | Python 3.11 |

## API Documentation

### Swagger UI & OpenAPI

- **Swagger UI:** http://localhost:5017/docs
- **ReDoc:** http://localhost:5017/redoc
- **OpenAPI Spec:** http://localhost:5017/openapi.json

### FastAPI Configuration

```python
app = FastAPI(
    title="QuckApp Sentiment Service API",
    version="1.0.0",
    description="Message sentiment analysis using ML"
)
```

### API Tags

| Tag | Description |
|-----|-------------|
| Analysis | Sentiment analysis operations |
| Batch | Batch analysis processing |
| Models | ML model management |

### Security

- **Authentication:** API Key for service-to-service communication
