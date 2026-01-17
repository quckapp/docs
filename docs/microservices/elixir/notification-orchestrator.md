---
sidebar_position: 4
---

# Notification Orchestrator

Elixir service for real-time notification delivery and routing.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 4004 |
| **Database** | MongoDB |
| **Framework** | Phoenix 1.7 |
| **Language** | Elixir 1.15 |

## Features

- Real-time notification delivery
- Online/offline user routing
- Notification batching
- Deduplication
- Priority queuing

## Routing Logic

```elixir
def route_notification(notification) do
  user_presence = Presence.get_user(notification.user_id)

  case user_presence do
    %{status: :online} ->
      deliver_realtime(notification)

    _ ->
      queue_for_push(notification)
  end
end
```

## API Documentation

### OpenAPI Spec

- **OpenAPI Spec (JSON):** http://localhost:4004/api/openapi
- **OpenAPI Spec (YAML):** http://localhost:4004/api/openapi.yaml

### OpenApiSpex Configuration

The notification-orchestrator uses [OpenApiSpex](https://github.com/open-api-spex/open_api_spex) for OpenAPI documentation:

```elixir
defmodule NotificationOrchestratorWeb.ApiSpec do
  alias OpenApiSpex.{Info, OpenApi, Paths, Server}

  @behaviour OpenApi

  @impl OpenApi
  def spec do
    %OpenApi{
      info: %Info{
        title: "QuckApp Notification Orchestrator API",
        version: "1.0.0",
        description: "Real-time notification delivery and routing"
      },
      servers: [
        %Server{url: "http://localhost:4004", description: "Local Development"},
        %Server{url: "https://api.quckapp.com/notifications", description: "Production"}
      ],
      paths: Paths.from_router(NotificationOrchestratorWeb.Router)
    }
    |> OpenApiSpex.resolve_schema_modules()
  end
end
```

### API Tags

| Tag | Description |
|-----|-------------|
| Notifications | Notification delivery and management |
| Routing | Notification routing rules |
| Batching | Batch notification operations |

### Security

- **Authentication:** JWT Bearer token or API Key for service-to-service
- **Rate Limiting:** Per-user notification limits
