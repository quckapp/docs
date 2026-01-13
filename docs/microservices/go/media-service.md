---
sidebar_position: 7
---

# Media Service

Go service for media processing and transcoding.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5001 |
| **Database** | MongoDB |
| **Framework** | Gin |
| **Language** | Go 1.21 |

## Features

- Image resizing/compression
- Video transcoding
- Thumbnail generation
- Format conversion
- Metadata extraction

## API Endpoints

```http
POST /api/media/upload
GET  /api/media/{id}
GET  /api/media/{id}/thumbnail
DELETE /api/media/{id}
```
