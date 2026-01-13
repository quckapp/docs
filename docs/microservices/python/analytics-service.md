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
