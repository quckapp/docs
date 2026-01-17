---
sidebar_position: 5
---

# Huddle Service

Elixir service for audio rooms and live discussions.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 4005 |
| **Database** | MongoDB |
| **Framework** | Phoenix 1.7 |
| **Language** | Elixir 1.15 |

## Features

- Audio-only rooms
- Speaker management
- Hand raising
- Room scheduling
- Recording support

## API Documentation

### OpenAPI Spec

- **OpenAPI Spec (JSON):** http://localhost:4005/api/openapi
- **OpenAPI Spec (YAML):** http://localhost:4005/api/openapi.yaml

### OpenApiSpex Configuration

The huddle-service uses [OpenApiSpex](https://github.com/open-api-spex/open_api_spex) for OpenAPI documentation:

```elixir
defmodule HuddleServiceWeb.ApiSpec do
  alias OpenApiSpex.{Info, OpenApi, Paths, Server}

  @behaviour OpenApi

  @impl OpenApi
  def spec do
    %OpenApi{
      info: %Info{
        title: "QuckApp Huddle Service API",
        version: "1.0.0",
        description: "Audio rooms and live discussions"
      },
      servers: [
        %Server{url: "http://localhost:4005", description: "Local Development"},
        %Server{url: "https://api.quckapp.com/huddles", description: "Production"}
      ],
      paths: Paths.from_router(HuddleServiceWeb.Router)
    }
    |> OpenApiSpex.resolve_schema_modules()
  end
end
```

### API Tags

| Tag | Description |
|-----|-------------|
| Huddles | Huddle room CRUD operations |
| Participants | Participant management |
| Speakers | Speaker queue and management |
| Recording | Recording start/stop/retrieve |

### Security

- **Authentication:** JWT Bearer token via `Authorization` header
- **WebRTC:** Secure audio streaming
