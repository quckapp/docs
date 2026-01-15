---
sidebar_position: 7
---

# Files API

## Upload File

```http
POST /api/v1/files/upload
Content-Type: multipart/form-data
```

**Response:**
```json
{
  "id": "file-uuid",
  "filename": "document.pdf",
  "url": "https://cdn.quckapp.dev/files/...",
  "size": 1024000,
  "mimeType": "application/pdf"
}
```

## Get File

```http
GET /api/v1/files/{id}
```

## Delete File

```http
DELETE /api/v1/files/{id}
```
