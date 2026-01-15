# QuckApp API Documentation

This directory contains the OpenAPI 3.1.0 specification for the QuckApp API, along with tools for viewing and testing the API.

## Quick Start

### Local Development Server (Node.js)

```bash
# From project root
make docs

# Or directly
node docs/openapi/serve.js
```

Then open http://localhost:3030

### Docker (Swagger UI)

```bash
# Start Swagger UI
make docs-docker

# Or use docker-compose directly
docker-compose -f docs/openapi/docker-compose.yaml up -d swagger-ui
```

Then open http://localhost:8080

## Available Services

| Service | Port | URL | Description |
|---------|------|-----|-------------|
| Swagger UI | 8080 | http://localhost:8080 | Interactive API documentation |
| Redoc | 8081 | http://localhost:8081 | Alternative documentation UI |
| Prism Mock | 4010 | http://localhost:4010 | Mock API server |

### Start All Services

```bash
make docs-all
```

### Stop All Services

```bash
make docs-stop
```

## Directory Structure

```
docs/openapi/
├── openapi.yaml           # Main OpenAPI specification
├── index.html             # Standalone Swagger UI HTML
├── serve.js               # Local development server
├── Dockerfile             # Custom Swagger UI image
├── docker-compose.yaml    # Docker services configuration
├── README.md              # This file
├── paths/                 # API endpoint definitions
│   ├── _index.yaml        # Path reference index
│   ├── auth.yaml          # Authentication endpoints
│   ├── users.yaml         # User management
│   ├── workspaces.yaml    # Workspace management
│   ├── channels.yaml      # Channel management
│   ├── messages.yaml      # Messaging
│   ├── threads.yaml       # Thread discussions
│   ├── files.yaml         # File management
│   ├── calls.yaml         # Voice/video calls
│   ├── huddles.yaml       # Quick audio huddles
│   ├── search.yaml        # Search functionality
│   ├── notifications.yaml # Notifications
│   └── presence.yaml      # User presence
└── schemas/               # Data model definitions
    ├── _index.yaml        # Schema reference index
    ├── common.yaml        # Common definitions
    ├── error.yaml         # Error schemas
    ├── auth.yaml          # Authentication schemas
    ├── user.yaml          # User schemas
    ├── workspace.yaml     # Workspace schemas
    ├── channel.yaml       # Channel schemas
    ├── message.yaml       # Message schemas
    ├── thread.yaml        # Thread schemas
    ├── call.yaml          # Call schemas
    ├── huddle.yaml        # Huddle schemas
    ├── file.yaml          # File schemas
    ├── notification.yaml  # Notification schemas
    ├── search.yaml        # Search schemas
    └── presence.yaml      # Presence schemas
```

## Makefile Commands

```bash
# View all available documentation commands
make help | grep docs

# Individual commands
make docs          # Start local server (Node.js)
make docs-docker   # Start Swagger UI (Docker)
make docs-redoc    # Start Redoc (Docker)
make docs-mock     # Start mock API server
make docs-all      # Start all services
make docs-stop     # Stop all services
make docs-build    # Build custom Swagger UI image
make docs-lint     # Validate OpenAPI spec
make docs-bundle   # Bundle spec into single file
```

## Validating the Specification

```bash
# Using Docker
make docs-lint

# Or directly with Redocly CLI
docker run --rm -v $(pwd)/docs/openapi:/spec redocly/cli lint /spec/openapi.yaml
```

## Bundling the Specification

To create a single bundled file (useful for import into other tools):

```bash
make docs-bundle
```

This creates `bundled-openapi.yaml` with all references resolved.

## Mock Server

The Prism mock server auto-generates responses based on the OpenAPI spec:

```bash
# Start mock server
make docs-mock

# Test an endpoint
curl http://localhost:4010/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'
```

## Kubernetes Deployment

Swagger UI is included in the Helm chart and can be enabled in `values.yaml`:

```yaml
swaggerUi:
  enabled: true
  replicas: 1
  ingress:
    enabled: true
    hosts:
      - host: api.quckapp.local
        paths:
          - path: /docs
            pathType: Prefix
```

Then deploy with:

```bash
helm upgrade --install quckapp ./helm/quckapp
```

Access at: https://api.quckapp.local/docs

## API Overview

### Authentication
- JWT Bearer tokens for user authentication
- API keys for service-to-service communication
- OAuth2 support (Google, GitHub, Microsoft, Apple)
- MFA with TOTP

### Core Resources
- **Users**: Profile management, preferences, status
- **Workspaces**: Organization containers with membership
- **Channels**: Public/private channels, DMs, group DMs
- **Messages**: Rich text, attachments, reactions, threads
- **Files**: Upload, sharing, storage management

### Real-time Features
- **Calls**: Audio/video calls with recording
- **Huddles**: Lightweight audio conversations
- **Presence**: Online status, typing indicators

### Additional Features
- **Search**: Full-text search across all content
- **Notifications**: Push, email, in-app notifications
- **Threads**: Discussion threads on messages

## Rate Limits

| Endpoint Type | Limit |
|--------------|-------|
| Standard | 1000 req/min |
| Auth | 20 req/min |
| Upload | 100 req/min |

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ],
    "requestId": "req_abc123"
  }
}
```

## Contributing

When adding new endpoints:

1. Add path definition in `paths/` directory
2. Add schema definitions in `schemas/` directory
3. Update references in `openapi.yaml`
4. Validate with `make docs-lint`
5. Test with mock server `make docs-mock`
