---
sidebar_position: 6
---

# Event Broadcast Service

Elixir service for SSE/WebSocket event distribution.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 4006 |
| **Database** | MongoDB |
| **Framework** | Phoenix 1.7 |
| **Language** | Elixir 1.15 |

## Features

- Server-Sent Events (SSE)
- WebSocket broadcasting
- Event filtering
- Fan-out distribution

## API Documentation

### OpenAPI Spec

- **OpenAPI Spec (JSON):** http://localhost:4006/api/openapi
- **OpenAPI Spec (YAML):** http://localhost:4006/api/openapi.yaml

### OpenApiSpex Configuration

The event-broadcast-service uses [OpenApiSpex](https://github.com/open-api-spex/open_api_spex) for OpenAPI documentation:

```elixir
defmodule EventBroadcastServiceWeb.ApiSpec do
  alias OpenApiSpex.{Info, OpenApi, Paths, Server}

  @behaviour OpenApi

  @impl OpenApi
  def spec do
    %OpenApi{
      info: %Info{
        title: "QuckApp Event Broadcast Service API",
        version: "1.0.0",
        description: "SSE/WebSocket event distribution service"
      },
      servers: [
        %Server{url: "http://localhost:4006", description: "Local Development"},
        %Server{url: "https://api.quckapp.com/events", description: "Production"}
      ],
      paths: Paths.from_router(EventBroadcastServiceWeb.Router)
    }
    |> OpenApiSpex.resolve_schema_modules()
  end
end
```

### API Tags

| Tag | Description |
|-----|-------------|
| Events | Event subscription and management |
| SSE | Server-Sent Events endpoints |
| WebSocket | WebSocket connection management |

### Security

- **Authentication:** JWT Bearer token via `Authorization` header
- **WebSocket:** Token-based authentication on connect
